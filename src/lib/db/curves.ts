import { batchWrite, many, one } from "./helpers";
import type { CurveBucketBest, CurveKind, CurvePoint } from "../curves";
import type { OwnerContext } from "../owner-context";

// Reads and writes of `activity_curve_points`: one row per (activity, kind,
// bucket) holding that activity's best pace or power in that bucket. The pure
// engines live in src/lib/curves.ts (buckets, the best-effort seed) and
// src/lib/stream-metrics.ts (the stream scans); this file only stores and
// aggregates.

/**
 * Stores one activity's curve points.
 *
 * `overwrite` is what separates the table's two writers, and it is not a
 * preference — it is the precedence order between them. The fetch-time hook
 * passes true: it measures the effort from the stream itself, at every distance
 * rather than the handful Strava names, and it is the only writer that can
 * produce a power bucket at all. The best-effort seed passes false: it is a
 * stopgap that exists so the run curve is populated before any stream work, so
 * it must never land on top of a stream-derived row. Because the seed is
 * insert-only, the two can run in either order and converge on the same table:
 * db.curves.test.ts pins both orders, and strava.test.ts pins the fetch hook
 * that has to pass true for any of it to hold.
 *
 * The two are NOT a wall-clock/moving-time precision ladder: Strava reports
 * `moving_time == elapsed_time` on all 200 stored effort rows, so both readings
 * are wall clock. Measured against them, the scan runs 0 to 0.4% CONSERVATIVE,
 * so overwriting a seeded value can make a bucket marginally SLOWER. Immaterial
 * at that size, and the scan is still the better-founded number.
 */
export async function saveActivityCurvePoints(
  owner: OwnerContext,
  activityId: number,
  points: readonly CurvePoint[],
  { overwrite }: { overwrite: boolean }
): Promise<void> {
  if (points.length === 0) return;
  if (
    !(await one("SELECT 1 FROM activities WHERE id = ? AND user_id = ?", [
      activityId,
      owner.userId,
    ]))
  )
    return;
  const conflict = overwrite ? "DO UPDATE SET value = excluded.value" : "DO NOTHING";
  await batchWrite(
    points.map((point) => ({
      sql: `INSERT INTO activity_curve_points (activity_id, kind, bucket, value)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(activity_id, kind, bucket) ${conflict}`,
      args: [activityId, point.kind, point.bucket, point.value],
    }))
  );
}

interface CurveBestRow {
  bucket: string;
  value: number;
  activity_name: string | null;
  date: string | null;
}

/**
 * The athlete's curve for one kind: the best value in each bucket across every
 * activity dated on or after `since` (pass null for all-time), with the activity
 * that set it.
 *
 * "Best" is the kind's own direction — the lowest pace, the highest wattage —
 * and ROW_NUMBER rather than a bare MIN/MAX so the winning row's own activity
 * comes back for the tooltip and ties break deterministically on the lower
 * activity id (the same idiom as `listFastestBestEfforts`). Aggregated in SQL:
 * this is the whole point of persisting curve points, so a page render reads six
 * rows instead of a stream.
 *
 * Confirmed activities only, the same gate `listRunEfforts` and
 * `listFastestBestEfforts` apply: the curve is drawn inches below the distance
 * ladder on /performance, and an activity that is invisible to one of them must
 * not set a record in the other. The sport gate is implicit in `kind`, which
 * only the matching sport ever writes.
 */
export async function listCurveBests(
  owner: OwnerContext,
  kind: CurveKind,
  since: string | null
): Promise<CurveBucketBest[]> {
  // Not interpolated user input: the direction is derived from the kind union.
  const direction = kind === "pace" ? "ASC" : "DESC";
  const rows = await many<CurveBestRow>(
    `SELECT bucket, value, activity_name, date
     FROM (
       SELECT p.bucket, p.value, a.name AS activity_name,
              COALESCE(a.started_at_local, a.started_at) AS date,
              ROW_NUMBER() OVER (
                PARTITION BY p.bucket ORDER BY p.value ${direction}, p.activity_id ASC
              ) AS rn
       FROM activity_curve_points p
       JOIN activities a ON a.id = p.activity_id
       WHERE a.user_id = ? AND p.kind = ?
         AND a.status = 'confirmed'
         AND (? IS NULL OR COALESCE(a.started_at_local, a.started_at) >= ?)
     )
     WHERE rn = 1`,
    [owner.userId, kind, since, since]
  );
  return rows.map((row) => ({
    bucket: row.bucket,
    value: row.value,
    activityName: row.activity_name,
    date: row.date,
  }));
}

/**
 * How many distinct activities carry curve points of one kind. The power panel
 * hides below a floor of these: two rides make a "curve" that is really two
 * rides, and a duration curve drawn from them would read as a capability claim.
 */
export async function countCurveActivities(owner: OwnerContext, kind: CurveKind): Promise<number> {
  const row = await one<{ n: number }>(
    `SELECT COUNT(DISTINCT p.activity_id) AS n FROM activity_curve_points p
     JOIN activities a ON a.id = p.activity_id WHERE a.user_id = ? AND p.kind = ?`,
    [owner.userId, kind]
  );
  return row?.n ?? 0;
}

/** One stored curve point's identity, for the seed's resume check. */
export interface StoredCurveBucket {
  activity_id: number;
  bucket: string;
}

/**
 * Which (activity, bucket) pairs of one kind are already stored, so the seed can
 * skip exactly the buckets it (or a stream fetch) has already filled — that is
 * what makes it idempotent and resumable.
 *
 * Per BUCKET rather than per activity, because the two writers do not cover the
 * same buckets. `fetch-history.ts` fetches detail before streams, so for the
 * ~1170 activities still to come the stream scan lands first; skipping the whole
 * activity would permanently strand any bucket Strava reports and the scan
 * missed.
 */
export async function listCurvePointBuckets(
  owner: OwnerContext,
  kind: CurveKind
): Promise<StoredCurveBucket[]> {
  return many<StoredCurveBucket>(
    `SELECT activity_id, bucket
     FROM activity_curve_points p JOIN activities a ON a.id = p.activity_id
     WHERE a.user_id = ? AND p.kind = ?
     ORDER BY activity_id ASC`,
    [owner.userId, kind]
  );
}

/** A stored best-effort row with the activity it belongs to, for the seed. */
export interface SeedEffortRow {
  activity_id: number;
  distance_m: number;
  elapsed_time_s: number;
}

/**
 * Every usable best-effort row of a confirmed RUN, oldest activity first, for
 * the pace curve seed. The sport gate lives here because `cacheBestEfforts`
 * stores whatever a detail payload carries without checking it, and the review
 * gate matches `listCurveBests`: seeding a row the curve read would refuse to
 * show is work that produces nothing.
 *
 * Trail runs are deliberately NOT excluded, unlike the /performance distance
 * ladder: the curve takes the FASTEST value per bucket, so a trail effort can
 * only enter it by genuinely being the athlete's best pace over that distance.
 * Unbounded — 200 rows exist across 29 activities, and the seed reads the table
 * once.
 */
export async function listSeedEfforts(owner: OwnerContext): Promise<SeedEffortRow[]> {
  return many<SeedEffortRow>(
    `SELECT e.activity_id, e.distance_m, e.elapsed_time_s
     FROM activity_best_efforts e
     JOIN activities a ON a.id = e.activity_id
     WHERE a.user_id = ? AND e.distance_m > 0 AND e.elapsed_time_s > 0
       AND a.status = 'confirmed'
       AND LOWER(COALESCE(a.sport_type, '')) LIKE '%run%'
     ORDER BY e.activity_id ASC, e.distance_m ASC`,
    [owner.userId]
  );
}
