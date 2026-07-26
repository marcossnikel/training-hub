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
 * fetch pass (scripts/fetch-history.ts) touches get the full-resolution version,
 * computed from the stream as recorded. Re-fetching the handful of
 * already-cached activities just to upgrade them is not worth the API calls.
 *
 * Dry run by default: it prints what it would write and inserts nothing.
 *
 *   npm run backfill:metrics                        # dry run
 *   npm run backfill:metrics -- --write             # actually upsert
 *   npm run backfill:metrics -- --recompute         # dry run, version-1 rows too
 *   npm run backfill:metrics -- --recompute --write # rewrite version-1 rows
 *
 * `--recompute` exists because the stored zone seconds are FROZEN at whatever
 * thresholds were in force when they were computed. Change LTHR or threshold
 * pace (Settings, or the zones agent applying a suggestion) and every stored
 * `hr_zone_secs` / `pace_zone_secs` still describes the old zones, while the
 * activity page and buildBlock prefer the stored array unconditionally. Without
 * this flag there is no way to refresh them: the normal pass skips any activity
 * that already has a row.
 *
 * It refreshes VERSION-1 ROWS ONLY. A full-resolution row is left exactly as it
 * is, because everything this script can compute comes from the 400-point
 * downsample: rewriting one would replace a full-resolution row with a
 * downsampled one and drop its `np_w`, which is now ride-only (Strava's
 * `device_watts` is set on runs too, so only real meters qualify) and therefore
 * rare. Nothing here can regenerate it — only another full-resolution fetch can,
 * and that costs a Strava call against a ~100/15 min budget AND requires
 * deleting the cached `activity_streams` row first, since `ensureActivityStreams`
 * returns the cache and never re-fetches over it. A routine threshold change
 * must not spend that.
 *
 * `--allow-downgrade` (only meaningful with `--recompute`) opts into the
 * destructive behaviour: full-resolution rows are recomputed too, landing as
 * version-1 rows with `np_w` dropped. Use it when a correct zone split matters
 * more than keeping normalized power on those activities.
 *
 * These flags are the manual stopgap. Plan task T25 owns the in-app recompute
 * action, and an automatic invalidation hook on saveAthleteThresholds belongs
 * there, with it — not bolted onto the save path here.
 *
 * Against the shared Turso database, load the env and opt in explicitly:
 *
 *   set -a; . ./.env.local; set +a; ALLOW_REMOTE_DB=1 npx tsx scripts/backfill-metrics.ts
 *   set -a; . ./.env.local; set +a; ALLOW_REMOTE_DB=1 npx tsx scripts/backfill-metrics.ts --write
 *
 * Idempotent and resumable: without `--recompute`, an activity that already has
 * a metrics row is skipped whatever its version, so an interrupted run resumes
 * where it stopped. A full-resolution row is never overwritten with a downsampled one
 * unless `--allow-downgrade` says so. The only write a dry run can cause is
 * `ensureMigrated` applying pending ADDITIVE migrations (here: creating the
 * table it reads).
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
  /** Version of the row this one replaces, or null when there is none. */
  replacesVersion: number | null;
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
    `gap ${fmtNumber(metrics.avgGapSPerKm, 0).padStart(4)}  ` +
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
  const recompute = process.argv.includes("--recompute");
  const allowDowngrade = process.argv.includes("--allow-downgrade");
  // --force is deliberately NOT accepted here: the real run is gated by --write, and
  // ALLOW_REMOTE_DB=1 stays the only way to reach a remote database.
  assertLocalDb();
  if (allowDowngrade && !recompute) {
    console.log("  --allow-downgrade does nothing without --recompute; ignoring it.");
  }
  await ensureMigrated();

  const thresholds = await getAthleteThresholds();

  const pending: PendingActivity[] = [];
  let scanned = 0;
  let alreadyStored = 0;
  let fullResKept = 0;
  let unparseable = 0;
  let nothingToStore = 0;

  for await (const activity of eachStreamedActivity()) {
    scanned += 1;
    // Any stored row means this activity is done: the full-resolution rows the fetch
    // pass writes are strictly better than anything computable here. Unless the
    // caller asked for a recompute, which is the only way to pick up a
    // threshold change in already-stored zone seconds.
    if (activity.metrics_version !== null && !recompute) {
      alreadyStored += 1;
      continue;
    }
    // A recompute still refuses to touch a full-resolution row: everything below
    // is derived from the 400-point downsample, so rewriting one would trade its
    // np_w — unrecoverable without another Strava fetch — for a zone split this
    // script cannot compute any better than the row already has it.
    if (
      recompute &&
      activity.metrics_version !== null &&
      activity.metrics_version !== METRICS_VERSION_DOWNSAMPLED &&
      !allowDowngrade
    ) {
      fullResKept += 1;
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
    pending.push({
      activityId: activity.id,
      sportType: activity.sport_type,
      metrics,
      replacesVersion: activity.metrics_version,
    });
  }

  const mode =
    `${write ? "WRITE" : "dry run"}${recompute ? ", RECOMPUTE" : ""}` +
    `${recompute && allowDowngrade ? ", ALLOW DOWNGRADE" : ""}`;
  console.log(`Derived-metrics backfill (${mode}).`);
  console.log(`  activities with a cached stream:        ${scanned}`);
  console.log(`  of those, metrics already stored:       ${alreadyStored}`);
  if (recompute) {
    console.log(`  of those, full-resolution rows left as they are: ${fullResKept}`);
    if (fullResKept > 0) {
      console.log(
        "  Their zone seconds are stale too, and this script cannot refresh them without " +
          "dropping np_w. To refresh one: delete its activity_streams row (so the cache " +
          "stops short-circuiting the fetch) and re-run scripts/fetch-history.ts, which " +
          "rewrites it at full resolution. Or pass --allow-downgrade to accept the loss."
      );
    }
  }
  console.log(`  of those, unparseable stream (skipped): ${unparseable}`);
  console.log(`  of those, nothing computable:           ${nothingToStore}`);
  console.log(
    `  ${write ? "upserting" : "would upsert"}: ${pending.length} rows ` +
      `at metrics_version ${METRICS_VERSION_DOWNSAMPLED}`
  );
  // The buckets above partition everything scanned; anything else is a bug in
  // the loop, and a dry run whose numbers do not add up must say so.
  const accounted = alreadyStored + fullResKept + unparseable + nothingToStore + pending.length;
  if (accounted !== scanned) {
    console.warn(`  warning: ${scanned - accounted} scanned activities are unaccounted for`);
  }
  if (recompute) {
    const replaced = pending.filter((p) => p.replacesVersion !== null);
    const downgraded = replaced.filter((p) => p.replacesVersion !== METRICS_VERSION_DOWNSAMPLED);
    console.log(`  of those, rewriting an existing row:    ${replaced.length}`);
    if (allowDowngrade) {
      console.log(`  of those, downgraded from full resolution: ${downgraded.length}`);
      if (downgraded.length > 0) {
        console.log(
          "  NOTE: a downgraded row is re-integrated from the 400-point downsample " +
            "and loses its np_w. Only re-fetching the full-resolution stream restores it."
        );
      }
    }
  }

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
