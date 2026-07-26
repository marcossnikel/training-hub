/**
 * Backfill script: seeds the RUN half of `activity_curve_points` from the best
 * efforts already stored in `activity_best_efforts`. A LOCAL RE-READ — it makes
 * ZERO Strava API calls, so it costs nothing and is free to re-run.
 *
 * It exists so the pace curve on /performance is useful on day one, before a
 * single full-resolution stream has been fetched. Strava's best efforts are
 * already exact sub-segments at 400 m, 1 km, 1 mile, 5 km, 10 km and the half
 * marathon, which is five of the six run buckets plus the sixth; efforts at any
 * other distance ("1/2 mile", "2 mile", "15K", "10 mile", "20K", "30K") have no
 * bucket and are dropped.
 *
 * The seeded pace is ELAPSED time over the effort's distance. Strava reports
 * `moving_time == elapsed_time` on every best-effort row, so that single number
 * is a WALL CLOCK reading including any standing inside the effort (activity 41's
 * 20K carries ~207 s of it). That is the honest reading of the effort, but it is
 * not a moving pace, and the panel's copy says so.
 *
 * Insert-only, never overwrite: a bucket already holding a value came either
 * from a previous run of this script or from a full-resolution stream scan at
 * fetch time, and the stream scan outranks anything derivable here. Ride power
 * buckets are NOT seeded — nothing but a stream can produce one.
 *
 * Dry run by default: it prints what it would write and inserts nothing.
 *
 *   npm run backfill:curve-points              # dry run
 *   npm run backfill:curve-points -- --write   # actually insert
 *
 * Against the shared Turso database, load the env and opt in explicitly:
 *
 *   set -a; . ./.env.local; set +a; ALLOW_REMOTE_DB=1 npx tsx scripts/backfill-curve-points.ts
 *   set -a; . ./.env.local; set +a; ALLOW_REMOTE_DB=1 npx tsx scripts/backfill-curve-points.ts --write
 *
 * Idempotent and resumable: a BUCKET that already holds a pace curve point is
 * skipped, and the inserts themselves are ON CONFLICT DO NOTHING, so an
 * interrupted run resumes where it stopped and a repeat run writes nothing. Per
 * bucket rather than per activity because `fetch-history.ts` fetches detail
 * before streams: for the activities still to come the stream scan lands first,
 * and skipping the whole activity would strand any bucket Strava reports that
 * the scan missed. The only write a dry run can cause is `ensureMigrated`
 * applying pending ADDITIVE migrations (here: creating the table it reads).
 */
import {
  ensureMigrated,
  listCurvePointBuckets,
  listSeedEfforts,
  saveActivityCurvePoints,
} from "../src/lib/db";
import { seedCurvePoints, type CurvePoint, type SeedEffort } from "../src/lib/curves";
import { fmtPaceShort } from "../src/lib/format";
import { assertLocalDb } from "./lib/assert-local-db";

/** Sample activities printed so the writer can eyeball the shape before committing. */
const SAMPLE_ROWS = 3;

/** One activity's seeded curve, awaiting (or skipped by) the write pass. */
interface PendingActivity {
  activityId: number;
  points: CurvePoint[];
}

// A sample row is the one thing a human is asked to eyeball before a production
// write, so its pace is written the way the app writes pace everywhere else.
// Decimal minutes here would print activity 12's 400 m (105 s) as "4.38 min/km",
// which reads as 4:38 and is 15 seconds per km off the 4:23 it actually is.
function formatRow({ activityId, points }: PendingActivity): string {
  const curve = points
    .map((point) => `${point.bucket} ${fmtPaceShort(point.value)} min/km`)
    .join("  ");
  return `  activity ${String(activityId).padEnd(5)} ${curve}`;
}

/** Key of one stored (activity, bucket) pair, for the per-bucket skip. */
function bucketKey(activityId: number, bucket: string): string {
  return `${activityId}:${bucket}`;
}

async function main() {
  const write = process.argv.includes("--write");
  // --force is deliberately NOT accepted: the real run is gated by --write, and
  // ALLOW_REMOTE_DB=1 stays the only way to reach a remote database.
  assertLocalDb();
  await ensureMigrated();

  const stored = new Set(
    (await listCurvePointBuckets("pace")).map((row) => bucketKey(row.activity_id, row.bucket))
  );

  // Grouped by activity, because a curve is a per-activity set of buckets and
  // the fastest duplicate within one activity has to win before anything is
  // stored.
  const byActivity = new Map<number, SeedEffort[]>();
  const rows = await listSeedEfforts();
  for (const row of rows) {
    const efforts = byActivity.get(row.activity_id);
    if (efforts) efforts.push(row);
    else byActivity.set(row.activity_id, [row]);
  }

  const pending: PendingActivity[] = [];
  let skipped = 0;
  let skippedBuckets = 0;
  let noBucket = 0;

  for (const [activityId, efforts] of byActivity) {
    const seeded = seedCurvePoints(efforts);
    // Every effort of this run sat at a distance no bucket covers (a warm-up
    // whose only effort was a 1/2 mile, say). Counted rather than hidden.
    if (seeded.length === 0) {
      noBucket += 1;
      continue;
    }
    const points = seeded.filter((point) => !stored.has(bucketKey(activityId, point.bucket)));
    skippedBuckets += seeded.length - points.length;
    if (points.length === 0) {
      skipped += 1;
      continue;
    }
    pending.push({ activityId, points });
  }

  const pendingPoints = pending.reduce((sum, item) => sum + item.points.length, 0);

  console.log(write ? "Pace-curve seed (WRITE)." : "Pace-curve seed (dry run).");
  console.log(`  best-effort rows read:                  ${rows.length}`);
  console.log(`  runs carrying them:                     ${byActivity.size}`);
  console.log(`  of those, no effort at a bucket distance: ${noBucket}`);
  console.log(`  of those, every bucket already stored:  ${skipped}`);
  console.log(`  individual buckets already stored:      ${skippedBuckets}`);
  console.log(
    `  ${write ? "inserting" : "would insert"}: ${pendingPoints} points across ${pending.length} activities`
  );

  const perBucket = new Map<string, number>();
  for (const item of pending) {
    for (const point of item.points) {
      perBucket.set(point.bucket, (perBucket.get(point.bucket) ?? 0) + 1);
    }
  }
  if (perBucket.size > 0) {
    console.log(
      `  per bucket: ${[...perBucket].map(([bucket, n]) => `${bucket} ${n}`).join("  ")}`
    );
  }

  const samples = pending.slice(0, SAMPLE_ROWS);
  if (samples.length > 0) {
    console.log(`Sample activities (${samples.length} of ${pending.length}):`);
    for (const sample of samples) console.log(formatRow(sample));
  }

  if (!write) {
    console.log("Nothing written. Re-run with --write to apply.");
    return;
  }

  for (const item of pending) {
    await saveActivityCurvePoints(item.activityId, item.points, { overwrite: false });
    console.log(`  wrote activity ${item.activityId}: ${item.points.length} points`);
  }
  console.log(`Wrote ${pendingPoints} points across ${pending.length} activities.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
