import { exec, many, one } from "./helpers";
import {
  metricsActivityOf,
  parseZoneSecs,
  serializeZoneSecs,
  type ActivityMetrics,
  type MetricsActivity,
} from "../stream-metrics";

// Reads and writes of `activity_metrics`: the derived numbers a stream is boiled
// down to once (src/lib/stream-metrics.ts computes them). Every reader here hands
// back decoded values — zone seconds as arrays, not JSON text — so no consumer
// re-implements the parse.

/**
 * One stored row, decoded.
 *
 * `hrZoneSecs` and `paceZoneSecs` are the two fields that depend on the
 * athlete's thresholds, and they are frozen at the thresholds in force when the
 * row was written. Nothing invalidates them when thresholds change:
 * `saveAthleteThresholds` recomputes `activity_load` but not this table, and
 * `scripts/backfill-metrics.ts` skips any activity that already has a row unless
 * it is run with `--recompute` — which refreshes version-1 rows only, since
 * recomputing a version-2 row from the cached downsample would drop the `np_w`
 * only a full-resolution fetch can produce. Every reader that prefers a stored
 * split over computing one is therefore showing the zones of the day the stream
 * was fetched. Plan task T25 owns the explicit in-app recompute action, and an
 * automatic invalidation hook belongs there rather than on the save path.
 */
export interface StoredActivityMetrics extends ActivityMetrics {
  /** 1 = from the 400-point downsample, 2 = from the full-resolution stream. */
  metricsVersion: number;
}

interface MetricsRow {
  ef: number | null;
  decoupling_pct: number | null;
  np_w: number | null;
  hr_zone_secs: string | null;
  pace_zone_secs: string | null;
  metrics_version: number;
}

function decodeMetrics(row: MetricsRow): StoredActivityMetrics {
  return {
    ef: row.ef,
    decouplingPct: row.decoupling_pct,
    npW: row.np_w,
    hrZoneSecs: parseZoneSecs(row.hr_zone_secs),
    paceZoneSecs: parseZoneSecs(row.pace_zone_secs),
    metricsVersion: row.metrics_version,
  };
}

/** An activity's stored metrics, or null when nothing has been computed for it. */
export async function getActivityMetrics(
  activityId: number
): Promise<StoredActivityMetrics | null> {
  const row = await one<MetricsRow>(
    `SELECT ef, decoupling_pct, np_w, hr_zone_secs, pace_zone_secs, metrics_version
     FROM activity_metrics WHERE activity_id = ?`,
    [activityId]
  );
  return row ? decodeMetrics(row) : null;
}

/**
 * Stores one activity's metrics, replacing whatever was there. The PRIMARY KEY is
 * the upsert key, so re-computing an activity rewrites its row in place; the
 * version travels with the numbers, because a value's worth depends entirely on
 * the resolution it came from.
 */
export async function upsertActivityMetrics(
  activityId: number,
  metrics: ActivityMetrics,
  metricsVersion: number
): Promise<void> {
  await exec(
    `INSERT INTO activity_metrics
       (activity_id, ef, decoupling_pct, np_w, hr_zone_secs, pace_zone_secs,
        metrics_version, computed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(activity_id) DO UPDATE SET
       ef = excluded.ef,
       decoupling_pct = excluded.decoupling_pct,
       np_w = excluded.np_w,
       hr_zone_secs = excluded.hr_zone_secs,
       pace_zone_secs = excluded.pace_zone_secs,
       metrics_version = excluded.metrics_version,
       computed_at = excluded.computed_at`,
    [
      activityId,
      metrics.ef,
      metrics.decouplingPct,
      metrics.npW,
      serializeZoneSecs(metrics.hrZoneSecs),
      serializeZoneSecs(metrics.paceZoneSecs),
      metricsVersion,
      new Date().toISOString(),
    ]
  );
}

interface MetricsActivityRow {
  sport_type: string | null;
  distance_km: number | null;
  moving_time_s: number | null;
  avg_hr: number | null;
  raw_json: string | null;
}

/**
 * The whole-activity figures the metrics are computed alongside the stream.
 * Read from the row rather than taken from the caller so the fetch-time hook
 * computes the same numbers no matter how thin the activity object its caller
 * happened to be holding.
 */
export async function getMetricsActivity(activityId: number): Promise<MetricsActivity | null> {
  const row = await one<MetricsActivityRow>(
    "SELECT sport_type, distance_km, moving_time_s, avg_hr, raw_json FROM activities WHERE id = ?",
    [activityId]
  );
  return row ? metricsActivityOf(row) : null;
}

/** One cached stream plus everything needed to derive that activity's metrics. */
export interface StreamedActivity {
  id: number;
  sport_type: string | null;
  distance_km: number | null;
  moving_time_s: number | null;
  avg_hr: number | null;
  raw_json: string | null;
  /** The cached 400-point stream, as stored JSON. */
  json: string;
  /** Version of the already-stored metrics row, or null when there is none. */
  metrics_version: number | null;
}

/**
 * Activities carrying a usable cached stream, one bounded page at a time, with
 * the version of any metrics already stored for them. `json = 'null'` is the
 * negative marker `ensureActivityStreams` caches for a streamless activity, so
 * those rows are filtered out here rather than parsed and discarded downstream.
 */
export async function listStreamedActivities(page: {
  afterId: number;
  limit: number;
}): Promise<StreamedActivity[]> {
  return many<StreamedActivity>(
    `SELECT a.id, a.sport_type, a.distance_km, a.moving_time_s, a.avg_hr, a.raw_json,
            s.json, m.metrics_version
     FROM activity_streams s
     JOIN activities a ON a.id = s.activity_id
     LEFT JOIN activity_metrics m ON m.activity_id = a.id
     WHERE s.json != 'null' AND a.id > ?
     ORDER BY a.id ASC
     LIMIT ?`,
    [page.afterId, page.limit]
  );
}
