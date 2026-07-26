/**
 * Historical fetch pass: walks confirmed activities NEWEST FIRST and, for each
 * one still missing it, fetches its Strava detail and its streams through the
 * app's own lazy paths (`ensureActivityDetail`, `ensureActivityStreams`). Those
 * are the same functions a page view calls, so this pass writes exactly what
 * viewing every activity by hand would: `detail_json`, `activity_best_efforts`,
 * `activity_streams`, and — via the fetch-time hook — a full-resolution
 * `activity_metrics` row per activity. Inserts only; nothing is rewritten.
 *
 * UNLIKE the backfill scripts, this one talks to Strava and is MEANT to write to
 * the shared database: it needs the real credentials in .env.local and there is
 * nothing to backfill locally.
 *
 *   set -a; . ./.env.local; set +a; npx tsx scripts/fetch-history.ts --dry-run
 *   set -a; . ./.env.local; set +a; npx tsx scripts/fetch-history.ts --limit=50
 *   set -a; . ./.env.local; set +a; npx tsx scripts/fetch-history.ts
 *
 * Budget: Strava allows roughly 100 reads per 15 minutes and 1000 per day, so
 * this pass throttles itself to 90 per rolling 15 minutes and stops after 900 in
 * one run, sleeping when the window fills. At up to 2 calls per activity, full
 * history (~1230 activities) is about three daily runs.
 *
 * Safe to interrupt at any point (Ctrl-C between activities loses nothing) and
 * safe to re-run: each pass re-reads what is still missing, so already-populated
 * activities are skipped and the run resumes where the last one stopped.
 */
import { listActivitiesMissingStravaData } from "../src/lib/db";
import { ensureActivityDetail, ensureActivityStreams } from "../src/lib/strava";

/** Rolling request window Strava enforces, and the ceiling we keep under it. */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_CALLS_PER_WINDOW = 90;
/** Hard stop for one run, under the ~1000 per day allowance. */
const MAX_CALLS_PER_RUN = 900;
/** Upper bound on the work list read up front; far above the call budget. */
const MAX_ACTIVITIES = 5000;
/**
 * Consecutive activities that fetched nothing before the run gives up. Both lazy
 * paths swallow their errors (a page view must not die because Strava did), so a
 * stalled run looks like a string of activities that produced no data — usually
 * an expired token or a rate limit no retry could clear.
 */
const MAX_CONSECUTIVE_FAILURES = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseLimit(): number | null {
  const flag = process.argv.find((arg) => arg.startsWith("--limit="));
  if (!flag) return null;
  const value = Number(flag.slice("--limit=".length));
  return Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * The rolling-window throttle. Records the timestamp of every request made and
 * waits, before a request that would breach the window, until the oldest one
 * ages out of it.
 */
class RateBudget {
  private readonly times: number[] = [];
  private spent = 0;

  get used(): number {
    return this.spent;
  }

  get exhausted(): boolean {
    return this.spent >= MAX_CALLS_PER_RUN;
  }

  /** True when `count` more requests still fit in this run's hard cap. */
  fits(count: number): boolean {
    return this.spent + count <= MAX_CALLS_PER_RUN;
  }

  /** Waits until one more request fits in the rolling window, then books it. */
  async take(): Promise<void> {
    for (;;) {
      const now = Date.now();
      while (this.times.length > 0 && now - this.times[0] >= WINDOW_MS) this.times.shift();
      if (this.times.length < MAX_CALLS_PER_WINDOW) break;
      const waitMs = WINDOW_MS - (now - this.times[0]) + 1_000;
      console.log(
        `  rate window full (${this.times.length} in 15 min), sleeping ${Math.ceil(waitMs / 1000)}s`
      );
      await sleep(waitMs);
    }
    this.times.push(Date.now());
    this.spent += 1;
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const limit = parseLimit();

  const missing = await listActivitiesMissingStravaData(MAX_ACTIVITIES);
  const plannedCalls = missing.reduce((sum, a) => sum + a.needs_detail + a.needs_streams, 0);

  console.log(dryRun ? "Historical fetch pass (dry run)." : "Historical fetch pass.");
  console.log(`  activities missing detail or streams: ${missing.length}`);
  console.log(`  API calls needed to finish:           ${plannedCalls}`);
  console.log(
    `  budget this run:                      ${MAX_CALLS_PER_RUN} calls, ${MAX_CALLS_PER_WINDOW} per 15 min`
  );
  if (limit !== null) console.log(`  limited to the newest ${limit} activities`);

  if (dryRun) {
    for (const activity of missing.slice(0, 3)) {
      const wants = [
        activity.needs_detail ? "detail" : null,
        activity.needs_streams ? "streams" : null,
      ]
        .filter(Boolean)
        .join(" + ");
      console.log(
        `  ${activity.started_at.slice(0, 10)}  #${activity.id}  ${activity.name ?? "—"}  → ${wants}`
      );
    }
    console.log("Nothing fetched. Re-run without --dry-run to start.");
    return;
  }

  const queue = limit === null ? missing : missing.slice(0, limit);
  const budget = new RateBudget();
  let processed = 0;
  let detailFetched = 0;
  let streamsFetched = 0;
  let consecutiveFailures = 0;

  for (const activity of queue) {
    const calls = activity.needs_detail + activity.needs_streams;
    if (!budget.fits(calls)) {
      console.log(`Stopping: the ${MAX_CALLS_PER_RUN}-call budget for this run is spent.`);
      break;
    }

    let gotSomething = false;
    if (activity.needs_detail) {
      await budget.take();
      const detail = await ensureActivityDetail({
        id: activity.id,
        strava_id: activity.strava_id,
        detail_json: null,
      });
      if (detail) {
        detailFetched += 1;
        gotSomething = true;
      }
    }
    if (activity.needs_streams) {
      await budget.take();
      // Writes the stream cache AND, through the fetch-time hook, this activity's
      // full-resolution metrics row.
      const streams = await ensureActivityStreams({
        id: activity.id,
        strava_id: activity.strava_id,
      });
      if (streams) {
        streamsFetched += 1;
        gotSomething = true;
      }
    }

    processed += 1;
    consecutiveFailures = gotSomething ? 0 : consecutiveFailures + 1;
    console.log(
      `  [${processed}/${queue.length}] ${activity.started_at.slice(0, 10)} #${activity.id} ` +
        `${activity.name ?? "—"} — ${gotSomething ? "ok" : "nothing returned"} ` +
        `(calls ${budget.used}/${MAX_CALLS_PER_RUN})`
    );

    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.error(
        `Stopping: ${MAX_CONSECUTIVE_FAILURES} activities in a row returned nothing. ` +
          "Check the Strava connection and the rate limit, then re-run."
      );
      break;
    }
    if (budget.exhausted) {
      console.log(`Stopping: the ${MAX_CALLS_PER_RUN}-call budget for this run is spent.`);
      break;
    }
  }

  const remaining = await listActivitiesMissingStravaData(MAX_ACTIVITIES);
  console.log(
    `Processed ${processed} activities using ${budget.used} calls ` +
      `(${detailFetched} details, ${streamsFetched} streams).`
  );
  console.log(`  activities still missing detail or streams: ${remaining.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
