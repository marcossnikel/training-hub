/**
 * Backfill script: fills `activity_best_efforts` from the Strava detail payloads
 * already cached in `activities.detail_json`. A LOCAL RE-PARSE — it makes ZERO
 * Strava API calls, so it costs nothing and is free to re-run.
 *
 * Dry run by default: it prints what it would write and inserts nothing.
 *
 *   npm run backfill:best-efforts              # dry run
 *   npm run backfill:best-efforts -- --write   # actually upsert
 *
 * Against the shared Turso database, load the env and opt in explicitly:
 *
 *   set -a; . ./.env.local; set +a; ALLOW_REMOTE_DB=1 npx tsx scripts/backfill-best-efforts.ts
 *   set -a; . ./.env.local; set +a; ALLOW_REMOTE_DB=1 npx tsx scripts/backfill-best-efforts.ts --write
 *
 * Idempotent and resumable: writes are upserts on UNIQUE(activity_id, name), and
 * activities whose rows are already stored are skipped, so an interrupted run
 * resumes where it stopped. The only write a dry run can cause is `ensureMigrated`
 * applying pending ADDITIVE migrations (here: creating the table it reads).
 */
import {
  ensureMigrated,
  listActivitiesWithDetailJson,
  listBestEffortCounts,
  upsertActivityBestEfforts,
} from "../src/lib/db";
import { bestEffortRows, type BestEffortRow } from "../src/lib/best-efforts";
import { parseActivityDetail } from "../src/lib/strava";

/** Sample rows printed so the writer can eyeball the shape before committing. */
const SAMPLE_ROWS = 3;

/**
 * Guard against backfilling a remote (shared/prod Turso) database. Resolves the DB
 * URL exactly like src/lib/db/client.ts (TURSO_DATABASE_URL → DATABASE_URL → local
 * file). A file: URL (local dev) runs normally; a remote URL refuses unless the
 * writer explicitly opts in with ALLOW_REMOTE_DB=1.
 */
function assertLocalDb(): void {
  const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || "file:data/app.db";
  if (url.startsWith("file:")) return;
  if (process.env.ALLOW_REMOTE_DB === "1") return;
  let host = url;
  try {
    host = new URL(url).host || url;
  } catch {
    // Not a parseable URL; fall back to showing the raw value.
  }
  console.error(
    `Refusing to backfill a remote database (${host}). This protects the shared/prod DB. ` +
      `Re-run with ALLOW_REMOTE_DB=1 to override.`
  );
  process.exit(1);
}

/** One activity's parsed rows, awaiting (or skipped by) the write pass. */
interface PendingActivity {
  activityId: number;
  rows: BestEffortRow[];
}

function formatRow(activityId: number, row: BestEffortRow): string {
  const pr = row.pr_rank === null ? "—" : `#${row.pr_rank}`;
  return (
    `  activity ${activityId}  ${row.name.padEnd(14)} ${row.distance_m} m  ` +
    `moving ${row.moving_time_s}s  elapsed ${row.elapsed_time_s}s  pr ${pr}`
  );
}

async function main() {
  const write = process.argv.includes("--write");
  assertLocalDb();
  await ensureMigrated();

  const activities = await listActivitiesWithDetailJson();
  const stored = new Map(
    (await listBestEffortCounts()).map((row): [number, number] => [row.activity_id, row.n])
  );

  const pending: PendingActivity[] = [];
  const skipped: PendingActivity[] = [];
  let parsedRows = 0;
  let prRows = 0;

  for (const activity of activities) {
    const detail = parseActivityDetail(activity.detail_json);
    const rows = bestEffortRows(detail?.best_efforts);
    if (rows.length === 0) continue;
    parsedRows += rows.length;
    prRows += rows.filter((row) => row.pr_rank !== null).length;
    // The payload is an immutable cache, so a matching stored count means this
    // activity is already done — that is what makes the run resumable.
    const target = (stored.get(activity.id) ?? 0) >= rows.length ? skipped : pending;
    target.push({ activityId: activity.id, rows });
  }

  const activitiesWithEfforts = pending.length + skipped.length;
  const pendingRows = pending.reduce((sum, item) => sum + item.rows.length, 0);

  console.log(write ? "Best-effort backfill (WRITE)." : "Best-effort backfill (dry run).");
  console.log(`  activities with a cached detail payload: ${activities.length}`);
  console.log(`  of those, with best efforts:            ${activitiesWithEfforts}`);
  console.log(`  effort rows parsed:                     ${parsedRows} (${prRows} with a PR rank)`);
  console.log(`  already stored, skipping:               ${skipped.length} activities`);
  console.log(
    `  ${write ? "upserting" : "would upsert"}: ${pendingRows} rows across ${pending.length} activities`
  );

  const samplesFrom = pending.length > 0 ? pending : skipped;
  const samples = samplesFrom.flatMap((item) =>
    item.rows.map((row) => formatRow(item.activityId, row))
  );
  if (samples.length > 0) {
    console.log(`Sample rows (${Math.min(SAMPLE_ROWS, samples.length)} of ${samples.length}):`);
    for (const line of samples.slice(0, SAMPLE_ROWS)) console.log(line);
  }

  if (!write) {
    console.log("Nothing written. Re-run with --write to apply.");
    return;
  }

  let writtenRows = 0;
  for (const item of pending) {
    await upsertActivityBestEfforts(item.activityId, item.rows);
    writtenRows += item.rows.length;
    console.log(`  wrote activity ${item.activityId}: ${item.rows.length} rows`);
  }

  const after = await listBestEffortCounts();
  const total = after.reduce((sum, row) => sum + row.n, 0);
  console.log(
    `Wrote ${writtenRows} rows across ${pending.length} activities. ` +
      `Table now holds ${total} rows across ${after.length} activities.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
