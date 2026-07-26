// Mean-max curves: the fastest pace held over each standard distance (runs) and
// the highest average power held for each standard duration (rides). One point
// per (activity, kind, bucket) is persisted in `activity_curve_points`; the
// athlete's curve is the best of those inside a window.
//
// Pure: bucket definitions, the best-effort seed mapping, the window cutoff and
// the two-series shaping the panel draws. No DB, no network — src/lib/db/curves.ts
// stores and queries, src/lib/stream-metrics.ts computes from streams, and both
// take their bucket list from here so the writers and the reader can never
// disagree about which buckets exist.

/**
 * Which curve a point belongs to. The kind decides both the unit and the
 * direction of "best": a lower pace wins, a higher wattage wins.
 */
export type CurveKind = "pace" | "power";

/**
 * Run buckets: the fastest average pace, seconds per km, over exactly this much
 * ground. Fixed rather than continuous because the curve is stored per activity
 * and read back with a plain GROUP BY — six rows per run instead of a sampled
 * envelope. Mile and half-marathon carry their true metric lengths, so a stored
 * pace means the same thing whether it came from a stream scan or from Strava's
 * own best effort at that distance.
 */
export const PACE_BUCKETS = [
  { key: "400m", distanceM: 400 },
  { key: "1k", distanceM: 1000 },
  { key: "1mi", distanceM: 1609.34 },
  { key: "5k", distanceM: 5000 },
  { key: "10k", distanceM: 10000 },
  { key: "half", distanceM: 21097.5 },
] as const;

/**
 * Ride buckets: the highest average power, watts, held for exactly this long.
 * 5 s to 60 min is the span an FTP or critical-power fit reads from — short
 * enough for a sprint, long enough for a threshold effort.
 */
export const POWER_BUCKETS = [
  { key: "5s", durationS: 5 },
  { key: "1m", durationS: 60 },
  { key: "5m", durationS: 300 },
  { key: "8m", durationS: 480 },
  { key: "20m", durationS: 1200 },
  { key: "60m", durationS: 3600 },
] as const;

export type PaceBucketKey = (typeof PACE_BUCKETS)[number]["key"];
export type PowerBucketKey = (typeof POWER_BUCKETS)[number]["key"];
export type CurveBucketKey = PaceBucketKey | PowerBucketKey;

/** The bucket keys of one kind, in ascending distance / duration order. */
export function bucketKeys(kind: CurveKind): readonly CurveBucketKey[] {
  return kind === "pace"
    ? PACE_BUCKETS.map((bucket) => bucket.key)
    : POWER_BUCKETS.map((bucket) => bucket.key);
}

/**
 * Rides that must carry power curve points before the power panel is drawn. Two
 * rides make a "curve" that is really two rides, and a duration curve drawn from
 * them reads as a capability claim it cannot support. Exactly 2 rides have a real
 * meter today, so the panel stays hidden until that changes — which is the
 * correct behaviour, not a bug.
 *
 * Exported because the copy on /performance names the number: a caveat that
 * promises a gate has to promise the gate the code actually applies.
 */
export const MIN_POWER_CURVE_RIDES = 10;

/** Whether enough rides carry power points for the power panel to be a curve. */
export function showPowerCurve(rideCount: number): boolean {
  return rideCount >= MIN_POWER_CURVE_RIDES;
}

/** One activity's best value in one bucket, as stored. */
export interface CurvePoint {
  kind: CurveKind;
  bucket: CurveBucketKey;
  value: number;
}

/**
 * How far a best-effort row's distance may sit from a bucket's canonical length
 * and still count as that bucket, as a fraction. Strava rounds its effort
 * distances to whole metres (1609 for the mile, 21097 for the half), so an exact
 * match would silently drop both; 1% is far tighter than the gap to the nearest
 * neighbouring bucket, so no effort can land in the wrong one.
 */
const BUCKET_DISTANCE_TOLERANCE = 0.01;

/**
 * The run bucket a measured distance IS, or null when it is not a bucket
 * distance at all. Matching on the length rather than on Strava's effort name
 * keeps one distance table in this file: the names ("1K", "Half-Marathon") are
 * Strava's spelling of the same numbers, and the stream scan has no names at all.
 */
export function paceBucketForDistanceM(distanceM: number): PaceBucketKey | null {
  if (!Number.isFinite(distanceM) || distanceM <= 0) return null;
  for (const bucket of PACE_BUCKETS) {
    if (Math.abs(distanceM - bucket.distanceM) <= bucket.distanceM * BUCKET_DISTANCE_TOLERANCE) {
      return bucket.key;
    }
  }
  return null;
}

/** A stored best-effort row, reduced to what the seed reads off it. */
export interface SeedEffort {
  distance_m: number;
  elapsed_time_s: number;
}

/**
 * Run curve points seeded from one activity's Strava best efforts, so the pace
 * curve is populated before a single stream has been fetched. Efforts at a
 * non-bucket distance ("1/2 mile", "15K", "30K") are dropped; the fastest
 * survivor wins its bucket, since Strava can report the same length twice.
 *
 * The pace is ELAPSED time over the effort's own distance, which is what the
 * table holds: Strava reports `moving_time == elapsed_time` on every best-effort
 * row, so that single number is a WALL CLOCK reading and includes any standing
 * inside the effort (production activity 41's 20K carries ~207 s of it). It is
 * still the honest seed — an effort you stopped during was that slow — but it is
 * not a moving pace and the panel says so rather than implying otherwise.
 */
export function seedCurvePoints(efforts: readonly SeedEffort[]): CurvePoint[] {
  const best = new Map<PaceBucketKey, number>();
  for (const effort of efforts) {
    const bucket = paceBucketForDistanceM(effort.distance_m);
    if (bucket === null) continue;
    if (!Number.isFinite(effort.elapsed_time_s) || effort.elapsed_time_s <= 0) continue;
    const paceSPerKm = effort.elapsed_time_s / (effort.distance_m / 1000);
    const current = best.get(bucket);
    if (current === undefined || paceSPerKm < current) best.set(bucket, paceSPerKm);
  }
  // Emitted in bucket order rather than payload order, so a dry run's sample
  // rows read as a curve.
  return PACE_BUCKETS.filter((bucket) => best.has(bucket.key)).map((bucket) => ({
    kind: "pace" as const,
    bucket: bucket.key,
    value: best.get(bucket.key) as number,
  }));
}

/** The best value one bucket reached, and the activity that set it. */
export interface CurveBucketBest {
  bucket: string;
  value: number;
  activityName: string | null;
  /** The setting activity's local calendar stamp, for display. */
  date: string | null;
}

/** One plotted bucket: the selected window's best over the all-time best. */
export interface CurveSeriesPoint {
  bucket: CurveBucketKey;
  /** Best inside the selected window; null when the window holds no effort there. */
  windowed: CurveBucketBest | null;
  /** Best across all history. Never null for a plotted bucket. */
  allTime: CurveBucketBest;
}

/**
 * The two series a curve panel draws, in bucket order: the selected window over
 * all-time. A bucket nothing has ever reached is left out entirely rather than
 * plotted as a hole, so a curve that only spans 400 m to 5 km draws five points
 * and stops. The window series may still be missing at buckets all-time reached
 * — a distance you have not covered lately — and the panel breaks its line there.
 */
export function curveSeries(
  kind: CurveKind,
  windowed: readonly CurveBucketBest[],
  allTime: readonly CurveBucketBest[]
): CurveSeriesPoint[] {
  const windowedByBucket = new Map(windowed.map((best) => [best.bucket, best]));
  const allTimeByBucket = new Map(allTime.map((best) => [best.bucket, best]));
  const points: CurveSeriesPoint[] = [];
  for (const bucket of bucketKeys(kind)) {
    const all = allTimeByBucket.get(bucket);
    if (!all) continue;
    points.push({ bucket, windowed: windowedByBucket.get(bucket) ?? null, allTime: all });
  }
  return points;
}

const DAY_MS = 86_400_000;

/**
 * The ISO cutoff a windowed curve query compares activity dates against, or null
 * for an unbounded window. Compared as a string against
 * `COALESCE(started_at_local, started_at)`, which is ISO-8601 and therefore sorts
 * chronologically as text.
 */
export function curveWindowStart(days: number, now: Date): string | null {
  if (!Number.isFinite(days)) return null;
  return new Date(now.getTime() - days * DAY_MS).toISOString();
}
