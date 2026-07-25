// Aggregate metrics for one selected sub-range of a cached activity stream: the
// numbers a reader wants after dragging across an interval on the chart. Pure (no
// DB, no UI) so the chart stays presentation-only and the math is unit-tested
// here; a later persisted metrics pipeline can reuse it unchanged.

import type { ActivityStreams } from "./streams";

/**
 * What a selected range of samples adds up to. Every figure is nullable and
 * independent: a range whose heart-rate strap dropped still reports its duration,
 * distance and elevation, and the UI hides only the metrics that came back null.
 */
export interface RangeMetrics {
  durationS: number | null;
  distanceKm: number | null;
  avgHr: number | null;
  maxHr: number | null;
  /** The range's own pace, seconds per km: see `avgPace` for how it is derived. */
  avgPaceSPerKm: number | null;
  avgPowerW: number | null;
  elevationGainM: number | null;
}

/** Half-open cursor pair normalized into an inclusive, in-bounds index range. */
function clampRange(n: number, a: number, b: number): [number, number] | null {
  if (n <= 0) return null;
  const lo = Math.max(0, Math.min(a, b));
  const hi = Math.min(n - 1, Math.max(a, b));
  return lo <= hi ? [lo, hi] : null;
}

/**
 * The rise of a cumulative series (elapsed time, cumulative distance) across the
 * range: its last value minus its first, skipping samples the stream never
 * recorded. Null when fewer than two samples carry a value, or when the series
 * runs backwards (a stream too broken to read a span off).
 */
function span(values: readonly (number | null)[] | null, lo: number, hi: number): number | null {
  if (!values) return null;
  let first: number | null = null;
  let last: number | null = null;
  let count = 0;
  for (let i = lo; i <= hi; i++) {
    const v = values[i];
    if (v == null) continue;
    if (first == null) first = v;
    last = v;
    count += 1;
  }
  if (count < 2 || first == null || last == null) return null;
  const diff = last - first;
  return diff >= 0 ? diff : null;
}

/**
 * Mean of a sample series over the range, weighted by how long each sample was
 * in force (`timeS[i + 1] - timeS[i]`, attributed to sample i — the same
 * convention `zoneSeconds` integrates with, so the last sample of a range carries
 * no weight of its own).
 *
 * Weighting matters because the 400-point downsample is laid out on the distance
 * stream, not the clock: a walk break packs many seconds into few samples, which
 * an unweighted mean would under-count. Falls back to the plain mean when the
 * range carries no usable timestamps at all (a treadmill stream with distance
 * only), which is the best available answer rather than no answer.
 */
function timeWeightedMean(
  timeS: readonly (number | null)[],
  values: readonly (number | null)[] | null,
  lo: number,
  hi: number
): number | null {
  if (!values) return null;
  let weight = 0;
  let weighted = 0;
  let count = 0;
  let total = 0;
  for (let i = lo; i <= hi; i++) {
    const v = values[i];
    if (v == null) continue;
    count += 1;
    total += v;
    const t0 = timeS[i];
    const t1 = i < hi ? timeS[i + 1] : null;
    const dt = t0 != null && t1 != null ? t1 - t0 : 0;
    if (dt > 0) {
      weight += dt;
      weighted += v * dt;
    }
  }
  if (weight > 0) return weighted / weight;
  return count > 0 ? total / count : null;
}

function maxOf(values: readonly (number | null)[] | null, lo: number, hi: number): number | null {
  if (!values) return null;
  let max: number | null = null;
  for (let i = lo; i <= hi; i++) {
    const v = values[i];
    if (v == null) continue;
    if (max == null || v > max) max = v;
  }
  return max;
}

/**
 * Climb across the range: the sum of the positive deltas between consecutive
 * recorded altitudes. Gaps are bridged rather than reset, so a few dropped
 * samples cost precision but never invent a climb.
 *
 * An approximation, not the activity's own elevation total: Strava smooths and
 * thresholds the barometer before summing, so raw deltas run higher — across the
 * cached streams a whole-activity range reads 90 m against Strava's 53 m on
 * activity 30 and 168 m against 147 m on activity 128. Fine for comparing one
 * selected climb with another, which is what the strip is for. Null when fewer
 * than two samples carry an altitude.
 */
function elevationGain(
  values: readonly (number | null)[] | null,
  lo: number,
  hi: number
): number | null {
  if (!values) return null;
  let prev: number | null = null;
  let gain = 0;
  let seen = 0;
  for (let i = lo; i <= hi; i++) {
    const v = values[i];
    if (v == null) continue;
    seen += 1;
    if (prev != null && v > prev) gain += v - prev;
    prev = v;
  }
  return seen >= 2 ? gain : null;
}

/**
 * The range's pace: its own duration over its own distance, so the strip that
 * prints all three is self-consistent (10:00 over 2.00 km reads 5:00/km, and a
 * reader can check it).
 *
 * The fallback is the time-weighted mean of the instantaneous pace samples, for a
 * range with no usable distance to divide by (a treadmill or pool stream). It is
 * only a fallback because a mean of `1000 / velocity` is dominated by the slowest
 * samples: across the cached streams it reads up to 9:04/km on a run whose
 * duration and distance say 5:55/km, because `streams.ts` leaves crawling GPS
 * samples at thousands of seconds per km. Where distance exists, dividing is both
 * exact and outlier-proof.
 *
 * Both forms measure against the stream's own clock, which runs through pauses,
 * so a range containing a stop reads slower than Strava's moving pace. That is
 * the honest answer for "what did this stretch of the chart do".
 */
function avgPace(
  timeS: readonly (number | null)[],
  paceSPerKm: readonly (number | null)[] | null,
  durationS: number | null,
  distanceKm: number | null,
  lo: number,
  hi: number
): number | null {
  if (durationS != null && durationS > 0 && distanceKm != null && distanceKm > 0)
    return durationS / distanceKm;
  return timeWeightedMean(timeS, paceSPerKm, lo, hi);
}

/**
 * Everything a selected range of a stream has to say, from the two sample
 * indices the selection spans (given in either order, clamped to the stream).
 * Returns all-null for an empty stream rather than throwing, so a caller never
 * has to guard the call.
 */
export function rangeMetrics(streams: ActivityStreams, a: number, b: number): RangeMetrics {
  const range = clampRange(streams.n, a, b);
  const empty: RangeMetrics = {
    durationS: null,
    distanceKm: null,
    avgHr: null,
    maxHr: null,
    avgPaceSPerKm: null,
    avgPowerW: null,
    elevationGainM: null,
  };
  if (!range) return empty;
  const [lo, hi] = range;
  const durationS = span(streams.timeS, lo, hi);
  const distanceKm = span(streams.distanceKm, lo, hi);
  return {
    durationS,
    distanceKm,
    avgHr: timeWeightedMean(streams.timeS, streams.heartrate, lo, hi),
    maxHr: maxOf(streams.heartrate, lo, hi),
    avgPaceSPerKm: avgPace(streams.timeS, streams.paceSPerKm, durationS, distanceKm, lo, hi),
    avgPowerW: timeWeightedMean(streams.timeS, streams.watts, lo, hi),
    elevationGainM: elevationGain(streams.altitudeM, lo, hi),
  };
}
