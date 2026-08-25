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
import { parseActivityDetail } from "../src/features/strava/server/enrichment";
import { assertLocalDb } from "./lib/assert-local-db";

function scriptOwner() {
  const userId = process.env.TRAINING_HUB_OWNER_ID;
  if (!userId)
    throw new Error("TRAINING_HUB_OWNER_ID is required; scripts never select a default owner.");
  return { userId };
}

/** Sample rows printed so the writer can eyeball the shape before committing. */
const SAMPLE_ROWS = 3;

/**
 * Activities read per round trip. A detail payload is a full Strava activity JSON,
 * so the scan is paged instead of loading every payload at once (~21 carry one
 * today, ~1230 once T24's fetch-history pass lands).
 */
const PAGE_SIZE = 200;

/** One activity's parsed rows, awaiting (or skipped by) the write pass. */
interface PendingActivity {
  activityId: number;
  rows: BestEffortRow[];
}

/** One printable sample: an effort row plus the activity it came from. */
interface Sample {
  activityId: number;
  row: BestEffortRow;
}

function formatRow(activityId: number, row: BestEffortRow): string {
  const pr = row.pr_rank === null ? "—" : `#${row.pr_rank}`;
  return (
    `  activity ${activityId}  ${row.name.padEnd(14)} ${row.distance_m} m  ` +
    `moving ${row.moving_time_s}s  elapsed ${row.elapsed_time_s}s  pr ${pr}`
  );
}

/**
 * The SAMPLE_ROWS lines an operator can actually validate the dry run with: one row
 * per activity (rather than three rows of the same run), and a PR-ranked row first
 * whenever the run parsed any — otherwise every sample shows `pr —` and `pr_rank`,
 * the one column the summary claims but nothing else displays, goes unchecked.
 */
function sampleLines(items: PendingActivity[]): string[] {
  const all: Sample[] = items.flatMap((item) =>
    item.rows.map((row) => ({ activityId: item.activityId, row }))
  );
  const withPr = all.find((sample) => sample.row.pr_rank !== null);
  const onePerActivity = items.map((item) => ({ activityId: item.activityId, row: item.rows[0] }));
  const picked = withPr
    ? [withPr, ...onePerActivity.filter((sample) => sample.row !== withPr.row)]
    : onePerActivity;
  return picked.slice(0, SAMPLE_ROWS).map((sample) => formatRow(sample.activityId, sample.row));
}

/** Every activity carrying a cached detail payload, one bounded page at a time. */
async function* eachActivityWithDetail(owner: { userId: string }) {
  let afterId = 0;
  for (;;) {
    const page = await listActivitiesWithDetailJson({ owner, afterId, limit: PAGE_SIZE });
    if (page.length === 0) return;
    for (const activity of page) yield activity;
    afterId = page[page.length - 1].id;
  }
}

async function main() {
  const write = process.argv.includes("--write");
  // --force is deliberately NOT accepted here: the real run is gated by --write, and
  // ALLOW_REMOTE_DB=1 stays the only way to reach a remote database.
  assertLocalDb();
  await ensureMigrated();
  const owner = scriptOwner();

  const stored = new Map(
    (await listBestEffortCounts(owner)).map((row): [number, number] => [row.activity_id, row.n])
  );

  const pending: PendingActivity[] = [];
  const skipped: PendingActivity[] = [];
  let scanned = 0;
  let unparseable = 0;
  let parsedRows = 0;
  let prRows = 0;

  for await (const activity of eachActivityWithDetail(owner)) {
    scanned += 1;
    const detail = parseActivityDetail(activity.detail_json);
    // A stored payload that does not parse into an object is a damaged cache entry,
    // NOT an effort-free activity. Skipping it is right (one bad row must not abort
    // the run), but it is counted and reported so it cannot hide inside "no efforts".
    if (detail === null) {
      unparseable += 1;
      console.error(`  unparseable detail_json on activity ${activity.id}, skipped`);
      continue;
    }
    const rows = bestEffortRows(detail.best_efforts);
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
  console.log(`  activities with a cached detail payload: ${scanned}`);
  console.log(`  of those, unparseable payload (skipped): ${unparseable}`);
  console.log(`  of those, with best efforts:            ${activitiesWithEfforts}`);
  console.log(`  effort rows parsed:                     ${parsedRows} (${prRows} with a PR rank)`);
  console.log(`  already stored, skipping:               ${skipped.length} activities`);
  console.log(
    `  ${write ? "upserting" : "would upsert"}: ${pendingRows} rows across ${pending.length} activities`
  );

  const samplesFrom = pending.length > 0 ? pending : skipped;
  const totalRows = samplesFrom.reduce((sum, item) => sum + item.rows.length, 0);
  const samples = sampleLines(samplesFrom);
  if (samples.length > 0) {
    console.log(`Sample rows (${samples.length} of ${totalRows}):`);
    for (const line of samples) console.log(line);
  }

  if (!write) {
    console.log("Nothing written. Re-run with --write to apply.");
    return;
  }

  let writtenRows = 0;
  for (const item of pending) {
    await upsertActivityBestEfforts(owner, item.activityId, item.rows);
    writtenRows += item.rows.length;
    console.log(`  wrote activity ${item.activityId}: ${item.rows.length} rows`);
  }

  const after = await listBestEffortCounts(owner);
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
