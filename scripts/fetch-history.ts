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
 *   set -a; . ./.env.local; set +a; npx tsx scripts/fetch-history.ts --limit=45
 *   set -a; . ./.env.local; set +a; npx tsx scripts/fetch-history.ts
 *
 * `--dry-run` makes NO Strava call and writes no fetched data, but it is not
 * inert: reading the work list opens the database, and every query goes through
 * `ensureMigrated`, so a dry run DOES apply any pending additive migration
 * (scripts/backfill-metrics.ts says the same about itself).
 *
 * Budget: Strava allows roughly 100 reads per 15 minutes and 1000 per day. Every
 * request that leaves the process is booked (see RateBudget), and the ceilings
 * below sit under Strava's with room for the retries and token refresh a single
 * booked call can turn into. Cost is one call per missing endpoint, not per
 * activity, so it depends on what is already cached: measured against the live
 * database on 26 Jul 2026, `--limit=45` costs 83 calls (38 details + 45 streams)
 * and finishes without ever sleeping, while `--limit=50` costs 93 and fills the
 * window, so it sleeps ~15 minutes partway through. The whole work list is 1227
 * activities / 2438 calls, about three daily runs. The dry run prints the exact
 * figure for the queue you asked for; trust that over these numbers, which age.
 *
 * Safe to interrupt at any point (Ctrl-C between activities loses nothing) and
 * safe to re-run: each pass re-reads what is still missing, so already-populated
 * activities are skipped and the run resumes where the last one stopped.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listActivitiesMissingStravaData } from "../src/lib/db";
import {
  ensureActivityDetail,
  ensureActivityStreams,
  observeStravaRequests,
  type StravaRequestEvent,
} from "../src/lib/strava";

/** Rolling request window Strava enforces, and the ceiling we keep under it. */
const WINDOW_MS = 15 * 60 * 1000;
/**
 * 15 under Strava's ~100, because two things spend from their window without
 * passing through a slot check here: the extra requests one booked call can turn
 * into (a token refresh plus up to two 429 retries, all booked but only after
 * the check), and the running app, whose own syncs share the same Strava quota
 * and not this ledger.
 */
const MAX_CALLS_PER_WINDOW = 85;
/** Hard stop for one run, under the ~1000 per day allowance. */
const MAX_CALLS_PER_RUN = 900;
/** Upper bound on the work list read up front; far above the call budget. */
const MAX_ACTIVITIES = 5000;
/**
 * Consecutive activities whose fetch FAILED before the run gives up. A failure
 * means Strava did not answer usefully — no response, 401, 429, 5xx — which no
 * amount of continuing will fix. An activity that answers with nothing to fetch
 * (404, or an empty payload, which is most of the WeightTraining / Workout /
 * Elliptical majority of the work list) is not a failure and never trips this.
 */
const MAX_CONSECUTIVE_FAILURES = 5;

/**
 * Where the rolling window is kept so that two runs, or a run started minutes
 * after another finished, share one window instead of each starting with a clean
 * 85. Per machine, in the OS temp directory: it is throwaway state, and losing it
 * (a reboot, a temp sweep) only means the next run starts with an empty window.
 */
const LEDGER_PATH = path.join(os.tmpdir(), "training-hub-strava-window.json");

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
 * The rolling-window throttle, booked from what actually left the process rather
 * than from what this script intended to send: `record` is driven by
 * `observeStravaRequests`, so a token refresh and every 429 retry are counted
 * like any other request. `awaitSlot` waits, before a request, until the window
 * has room; the window itself lives in a small file shared by every run on this
 * machine, so a second run cannot spend a fresh 85 alongside the first.
 */
class RateBudget {
  private times: number[] = [];
  private spent = 0;
  private ledgerBroken = false;

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

  /** The shared window, pruned to the last 15 minutes. */
  private load(now: number): number[] {
    if (!this.ledgerBroken) {
      try {
        const raw: unknown = JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8"));
        if (Array.isArray(raw)) {
          this.times = raw.filter((t): t is number => typeof t === "number");
        }
      } catch (error) {
        // A missing file is the normal first run; anything else means the shared
        // window is unusable, so fall back to a process-local one and say so.
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          this.ledgerBroken = true;
          console.warn(
            `  warning: rate window ledger unusable (${String(error)}). ` +
              "Counting this run's requests only — do not run two passes at once."
          );
        }
      }
    }
    this.times = this.times.filter((t) => now - t < WINDOW_MS);
    return this.times;
  }

  private persist(): void {
    if (this.ledgerBroken) return;
    try {
      // Write-then-rename so a concurrent reader never sees a half-written file.
      const tmp = `${LEDGER_PATH}.${process.pid}`;
      fs.writeFileSync(tmp, JSON.stringify(this.times));
      fs.renameSync(tmp, LEDGER_PATH);
    } catch (error) {
      this.ledgerBroken = true;
      console.warn(`  warning: could not write the rate window ledger (${String(error)}).`);
    }
  }

  /** Books one request that has just been sent. */
  record(): void {
    const now = Date.now();
    this.load(now).push(now);
    this.persist();
    this.spent += 1;
  }

  /** Waits until one more request fits in the rolling window. */
  async awaitSlot(): Promise<void> {
    for (;;) {
      const now = Date.now();
      const times = this.load(now);
      if (times.length < MAX_CALLS_PER_WINDOW) return;
      const waitMs = WINDOW_MS - (now - times[0]) + 1_000;
      console.log(
        `  rate window full (${times.length} in 15 min), sleeping ${Math.ceil(waitMs / 1000)}s`
      );
      await sleep(waitMs);
    }
  }
}

/**
 * What one attempt at one endpoint did. "empty" is Strava answering that there
 * is nothing there (a 404, or a 200 whose payload holds no usable stream) —
 * permanent, and the right outcome for most of the work list. "failed" is Strava
 * not answering: no response, a rejected token, a rate limit, a server error.
 */
type Attempt = "ok" | "empty" | "failed";

function classifyAttempt(got: boolean, events: StravaRequestEvent[]): Attempt {
  if (got) return "ok";
  const api = events.filter((event) => event.kind === "api");
  // Nothing left the process: no strava_id, not connected, or not configured.
  if (api.length === 0) return "failed";
  const last = api[api.length - 1];
  if (last.status === null) return "failed";
  if (last.status === 404 || (last.status >= 200 && last.status < 300)) return "empty";
  return "failed";
}

/** The status the last failing request came back with, for the abort message. */
function failureReason(events: StravaRequestEvent[]): string {
  const api = events.filter((event) => event.kind === "api");
  if (api.length === 0) return "no request was sent (Strava not connected or not configured)";
  const last = api[api.length - 1];
  return last.status === null ? "no response (network or timeout)" : `HTTP ${last.status}`;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const limit = parseLimit();

  const missing = await listActivitiesMissingStravaData(MAX_ACTIVITIES);
  const callsFor = (list: typeof missing) =>
    list.reduce((sum, a) => sum + a.needs_detail + a.needs_streams, 0);
  const queue = limit === null ? missing : missing.slice(0, limit);

  console.log(dryRun ? "Historical fetch pass (dry run)." : "Historical fetch pass.");
  console.log(`  activities missing detail or streams: ${missing.length}`);
  console.log(`  API calls needed to finish:           ${callsFor(missing)}`);
  console.log(
    `  budget this run:                      ${MAX_CALLS_PER_RUN} calls, ${MAX_CALLS_PER_WINDOW} per 15 min`
  );
  if (limit !== null) {
    console.log(`  limited to the newest ${limit} activities`);
    console.log(`  API calls for this queue:             ${callsFor(queue)}`);
  }

  if (dryRun) {
    for (const activity of queue.slice(0, 3)) {
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
    console.log(
      "Nothing fetched and no Strava call made. Reading the work list did open the " +
        "database, so any pending additive migration has been applied. " +
        "Re-run without --dry-run to start."
    );
    return;
  }

  const budget = new RateBudget();
  // Every request that leaves the process books itself here — including the ones
  // this loop never asked for (a token refresh, a 429 retry) — and the events of
  // the attempt in flight are collected so its outcome can be read off them.
  let attemptEvents: StravaRequestEvent[] = [];
  observeStravaRequests((event) => {
    budget.record();
    attemptEvents.push(event);
  });

  let processed = 0;
  let detailFetched = 0;
  let streamsFetched = 0;
  let emptyActivities = 0;
  let consecutiveFailures = 0;

  try {
    for (const activity of queue) {
      const calls = activity.needs_detail + activity.needs_streams;
      if (!budget.fits(calls)) {
        console.log(`Stopping: the ${MAX_CALLS_PER_RUN}-call budget for this run is spent.`);
        break;
      }

      const attempts: Attempt[] = [];
      const failures: StravaRequestEvent[] = [];
      const runAttempt = async (fetchOne: () => Promise<unknown>) => {
        await budget.awaitSlot();
        attemptEvents = [];
        const result = await fetchOne();
        const outcome = classifyAttempt(result !== null, attemptEvents);
        attempts.push(outcome);
        if (outcome === "failed") failures.push(...attemptEvents);
        return outcome;
      };

      if (activity.needs_detail) {
        const outcome = await runAttempt(() =>
          ensureActivityDetail({
            id: activity.id,
            strava_id: activity.strava_id,
            detail_json: null,
          })
        );
        if (outcome === "ok") detailFetched += 1;
      }
      if (activity.needs_streams) {
        // Writes the stream cache AND, through the fetch-time hook, this
        // activity's full-resolution metrics row.
        const outcome = await runAttempt(() =>
          ensureActivityStreams({ id: activity.id, strava_id: activity.strava_id })
        );
        if (outcome === "ok") streamsFetched += 1;
      }

      processed += 1;
      const failed = attempts.includes("failed");
      const gotSomething = attempts.includes("ok");
      if (!failed && !gotSomething) emptyActivities += 1;
      consecutiveFailures = failed && !gotSomething ? consecutiveFailures + 1 : 0;

      const status = gotSomething
        ? "ok"
        : failed
          ? `fetch failed — ${failureReason(failures)}`
          : "nothing to fetch (Strava has no data for it)";
      console.log(
        `  [${processed}/${queue.length}] ${activity.started_at.slice(0, 10)} #${activity.id} ` +
          `${activity.name ?? "—"} — ${status} (calls ${budget.used}/${MAX_CALLS_PER_RUN})`
      );

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.error(
          `Stopping: ${MAX_CONSECUTIVE_FAILURES} activities in a row could not be fetched ` +
            `(last: ${failureReason(failures)}). Strava is refusing or unreachable — ` +
            "check the token and the rate limit, then re-run."
        );
        break;
      }
      if (budget.exhausted) {
        console.log(`Stopping: the ${MAX_CALLS_PER_RUN}-call budget for this run is spent.`);
        break;
      }
    }
  } finally {
    observeStravaRequests(null);
  }

  const remaining = await listActivitiesMissingStravaData(MAX_ACTIVITIES);
  console.log(
    `Processed ${processed} activities using ${budget.used} calls ` +
      `(${detailFetched} details, ${streamsFetched} streams).`
  );
  if (emptyActivities > 0) {
    console.log(
      `  ${emptyActivities} had nothing to fetch. They stay on the work list and will be ` +
        "asked for again on the next run."
    );
  }
  console.log(`  activities still missing detail or streams: ${remaining.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
