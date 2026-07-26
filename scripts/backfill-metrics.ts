/**
 * Backfill script: fills `activity_metrics` for the activities whose streams are
 * ALREADY cached. A LOCAL RE-COMPUTE — it makes ZERO Strava API calls, so it
 * costs nothing and is free to re-run.
 *
 * The cached streams are the 400-point downsample, which is fine for the
 * efficiency factor, for half-versus-half decoupling and for integrating time in
 * zone, but not for normalized power: a 30-second rolling average has nothing
 * left to average once an hour is squeezed into 400 samples. So `np_w` stays null
 * here and these rows are stamped `metrics_version = 1`. The activities the
 * fetch pass (scripts/fetch-history.ts) touches get version 2, computed from the
 * full-resolution stream. Re-fetching the handful of already-cached activities
 * just to upgrade them is not worth the API calls.
 *
 * Dry run by default: it prints what it would write and inserts nothing.
 *
 *   npm run backfill:metrics              # dry run
 *   npm run backfill:metrics -- --write   # actually upsert
 *
 * Against the shared Turso database, load the env and opt in explicitly:
 *
 *   set -a; . ./.env.local; set +a; ALLOW_REMOTE_DB=1 npx tsx scripts/backfill-metrics.ts
 *   set -a; . ./.env.local; set +a; ALLOW_REMOTE_DB=1 npx tsx scripts/backfill-metrics.ts --write
 *
 * Idempotent and resumable: an activity that already has a metrics row is
 * skipped, whatever its version, so an interrupted run resumes where it stopped
 * and a version-2 row is never overwritten with a downsampled one. The only write
 * a dry run can cause is `ensureMigrated` applying pending ADDITIVE migrations
 * (here: creating the table it reads).
 */
import {
  ensureMigrated,
  getAthleteThresholds,
  listStreamedActivities,
  upsertActivityMetrics,
  type StreamedActivity,
} from "../src/lib/db";
import {
  computeStreamMetrics,
  hasAnyMetric,
  metricsActivityOf,
  METRICS_VERSION_DOWNSAMPLED,
  type ActivityMetrics,
} from "../src/lib/stream-metrics";
import type { ActivityStreams } from "../src/lib/streams";
import { assertLocalDb } from "./lib/assert-local-db";

/** Sample rows printed so the writer can eyeball the shape before committing. */
const SAMPLE_ROWS = 3;

/** Activities read per round trip; each row carries a ~12 KB stream payload. */
const PAGE_SIZE = 100;

/** One activity's computed metrics, awaiting (or skipped by) the write pass. */
interface PendingActivity {
  activityId: number;
  sportType: string | null;
  metrics: ActivityMetrics;
}

function fmtNumber(value: number | null, digits: number): string {
  return value === null ? "—" : value.toFixed(digits);
}

function fmtZones(zoneSecs: number[] | null): string {
  return zoneSecs === null ? "—" : zoneSecs.map((s) => Math.round(s)).join("/");
}

function formatRow({ activityId, sportType, metrics }: PendingActivity): string {
  return (
    `  activity ${String(activityId).padEnd(5)} ${(sportType ?? "?").padEnd(12)} ` +
    `ef ${fmtNumber(metrics.ef, 2).padStart(6)}  ` +
    `decoupling ${fmtNumber(metrics.decouplingPct, 1).padStart(6)}%  ` +
    `np ${fmtNumber(metrics.npW, 0).padStart(4)}  ` +
    `hr ${fmtZones(metrics.hrZoneSecs)}  pace ${fmtZones(metrics.paceZoneSecs)}`
  );
}

/** Every activity carrying a usable cached stream, one bounded page at a time. */
async function* eachStreamedActivity() {
  let afterId = 0;
  for (;;) {
    const page = await listStreamedActivities({ afterId, limit: PAGE_SIZE });
    if (page.length === 0) return;
    for (const activity of page) yield activity;
    afterId = page[page.length - 1].id;
  }
}

function parseStreams(activity: StreamedActivity): ActivityStreams | null {
  try {
    return JSON.parse(activity.json) as ActivityStreams | null;
  } catch {
    return null;
  }
}

async function main() {
  const write = process.argv.includes("--write");
  // --force is deliberately NOT accepted here: the real run is gated by --write, and
  // ALLOW_REMOTE_DB=1 stays the only way to reach a remote database.
  assertLocalDb();
  await ensureMigrated();

  const thresholds = await getAthleteThresholds();

  const pending: PendingActivity[] = [];
  let scanned = 0;
  let alreadyStored = 0;
  let unparseable = 0;
  let nothingToStore = 0;

  for await (const activity of eachStreamedActivity()) {
    scanned += 1;
    // Any stored row means this activity is done: the version-2 rows the fetch
    // pass writes are strictly better than anything computable here.
    if (activity.metrics_version !== null) {
      alreadyStored += 1;
      continue;
    }
    const streams = parseStreams(activity);
    // A stored stream that does not parse is a damaged cache entry, not a
    // streamless activity. Counted rather than hidden inside "nothing to store".
    if (!streams) {
      unparseable += 1;
      console.error(`  unparseable stream json on activity ${activity.id}, skipped`);
      continue;
    }
    const metrics = {
      ...computeStreamMetrics({ streams, activity: metricsActivityOf(activity) }, thresholds),
      // Normalized power is a full-resolution metric; the downsample cannot
      // produce an honest one, so version-1 rows never claim to have it.
      npW: null,
    };
    if (!hasAnyMetric(metrics)) {
      nothingToStore += 1;
      continue;
    }
    pending.push({ activityId: activity.id, sportType: activity.sport_type, metrics });
  }

  console.log(write ? "Derived-metrics backfill (WRITE)." : "Derived-metrics backfill (dry run).");
  console.log(`  activities with a cached stream:        ${scanned}`);
  console.log(`  of those, metrics already stored:       ${alreadyStored}`);
  console.log(`  of those, unparseable stream (skipped): ${unparseable}`);
  console.log(`  of those, nothing computable:           ${nothingToStore}`);
  console.log(
    `  ${write ? "upserting" : "would upsert"}: ${pending.length} rows ` +
      `at metrics_version ${METRICS_VERSION_DOWNSAMPLED}`
  );

  const samples = pending.slice(0, SAMPLE_ROWS);
  if (samples.length > 0) {
    console.log(`Sample rows (${samples.length} of ${pending.length}):`);
    for (const sample of samples) console.log(formatRow(sample));
  }

  if (!write) {
    console.log("Nothing written. Re-run with --write to apply.");
    return;
  }

  for (const item of pending) {
    await upsertActivityMetrics(item.activityId, item.metrics, METRICS_VERSION_DOWNSAMPLED);
    console.log(`  wrote activity ${item.activityId}`);
  }
  console.log(`Wrote ${pending.length} rows.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
