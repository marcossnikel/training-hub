import { exec, many, one } from "./helpers";
import type { OwnerContext } from "../owner-context";
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
 * `metricsVersion` is the precision ladder documented in `src/lib/stream-metrics.ts`:
 * 1 = the 400-point downsample, 2 = full resolution fetched before the grade
 * channel existed, 3 = full resolution including it.
 *
 * `hrZoneSecs` and `paceZoneSecs` depend on athlete parameters. R19 clears just
 * those columns whenever an effective parameter changes, preserving unrelated
 * full-resolution metrics (`np_w`, EF, GAP) while ensuring no stale zone split
 * is shown as current. Readers then calculate a live split only when a valid,
 * accepted parameter is available.
 */
export interface StoredActivityMetrics extends ActivityMetrics {
  /** What the numbers were computed from; see the ladder above. */
  metricsVersion: number;
}

interface MetricsRow {
  ef: number | null;
  decoupling_pct: number | null;
  np_w: number | null;
  hr_zone_secs: string | null;
  pace_zone_secs: string | null;
  avg_gap_s_per_km: number | null;
  metrics_version: number;
}

function decodeMetrics(row: MetricsRow): StoredActivityMetrics {
  return {
    ef: row.ef,
    decouplingPct: row.decoupling_pct,
    npW: row.np_w,
    hrZoneSecs: parseZoneSecs(row.hr_zone_secs),
    paceZoneSecs: parseZoneSecs(row.pace_zone_secs),
    avgGapSPerKm: row.avg_gap_s_per_km,
    metricsVersion: row.metrics_version,
  };
}

/** An activity's stored metrics, or null when nothing has been computed for it. */
export async function getActivityMetrics(
  owner: OwnerContext,
  activityId: number
): Promise<StoredActivityMetrics | null> {
  const row = await one<MetricsRow>(
    `SELECT ef, decoupling_pct, np_w, hr_zone_secs, pace_zone_secs, avg_gap_s_per_km,
            metrics_version
     FROM activity_metrics m JOIN activities a ON a.id = m.activity_id
     WHERE m.activity_id = ? AND a.user_id = ?`,
    [activityId, owner.userId]
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
  owner: OwnerContext,
  activityId: number,
  metrics: ActivityMetrics,
  metricsVersion: number
): Promise<void> {
  if (
    !(await one("SELECT 1 FROM activities WHERE id = ? AND user_id = ?", [
      activityId,
      owner.userId,
    ]))
  )
    return;
  await exec(
    `INSERT INTO activity_metrics
       (activity_id, ef, decoupling_pct, np_w, hr_zone_secs, pace_zone_secs,
        avg_gap_s_per_km, metrics_version, computed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(activity_id) DO UPDATE SET
       ef = excluded.ef,
       decoupling_pct = excluded.decoupling_pct,
       np_w = excluded.np_w,
       hr_zone_secs = excluded.hr_zone_secs,
       pace_zone_secs = excluded.pace_zone_secs,
       avg_gap_s_per_km = excluded.avg_gap_s_per_km,
       metrics_version = excluded.metrics_version,
       computed_at = excluded.computed_at`,
    [
      activityId,
      metrics.ef,
      metrics.decouplingPct,
      metrics.npW,
      serializeZoneSecs(metrics.hrZoneSecs),
      serializeZoneSecs(metrics.paceZoneSecs),
      metrics.avgGapSPerKm,
      metricsVersion,
      new Date().toISOString(),
    ]
  );
}

interface MetricsActivityRow {
  sport_type: string | null;
  distance_km: number | null;
  moving_time_s: number | null;
  avg_pace_s_per_km: number | null;
  avg_hr: number | null;
  raw_json: string | null;
}

/**
 * The whole-activity figures the metrics are computed alongside the stream.
 * Read from the row rather than taken from the caller so the fetch-time hook
 * computes the same numbers no matter how thin the activity object its caller
 * happened to be holding.
 */
export async function getMetricsActivity(
  owner: OwnerContext,
  activityId: number
): Promise<MetricsActivity | null> {
  const row = await one<MetricsActivityRow>(
    `SELECT sport_type, distance_km, moving_time_s, avg_pace_s_per_km, avg_hr, raw_json
       FROM activities WHERE id = ? AND user_id = ?`,
    [activityId, owner.userId]
  );
  return row ? metricsActivityOf(row) : null;
}

/** One cached stream plus everything needed to derive that activity's metrics. */
export interface StreamedActivity {
  id: number;
  sport_type: string | null;
  distance_km: number | null;
  moving_time_s: number | null;
  avg_pace_s_per_km: number | null;
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
export async function listStreamedActivities(
  owner: OwnerContext,
  page: {
    afterId: number;
    limit: number;
  }
): Promise<StreamedActivity[]> {
  return many<StreamedActivity>(
    `SELECT a.id, a.sport_type, a.distance_km, a.moving_time_s, a.avg_pace_s_per_km,
            a.avg_hr, a.raw_json, s.json, m.metrics_version
     FROM activity_streams s
     JOIN activities a ON a.id = s.activity_id
     LEFT JOIN activity_metrics m ON m.activity_id = a.id
     WHERE a.user_id = ? AND s.json != 'null' AND a.id > ?
     ORDER BY a.id ASC
     LIMIT ?`,
    [owner.userId, page.afterId, page.limit]
  );
}
