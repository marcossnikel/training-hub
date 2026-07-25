// Aggregate metrics for one selected sub-range of a cached activity stream: the
// numbers a reader wants after dragging across an interval on the chart. Pure (no
// DB, no UI) so the chart stays presentation-only and the math is unit-tested
// here; a later persisted metrics pipeline can reuse it unchanged.
//
// Everything here is written for SHORT ranges — two or three samples of the
// 400-point downsample — because that is what a drag selects. Conventions that
// are harmless when integrating a whole activity (attributing an interval to its
// leading sample, dividing by wall clock, letting one outlier sample into a mean)
// are the entire answer at that scale, so each one is spelled out below.

import type { ActivityStreams } from "./streams";

/**
 * Slower than this and nobody is advancing: 20:00/km is 0.83 m/s, 3 km/h, under
 * half a walking pace. It does two jobs with one number — it decides which
 * intervals of a range count as moving, and, because the pace below is a mean of
 * per-interval paces that all passed it, it BOUNDS the result. A range with
 * nothing faster than this reports no pace at all rather than a number a reader
 * cannot tell from a stalled stream.
 */
const STOPPED_S_PER_KM = 1200;

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
  /** The range's moving pace, seconds per km: see `movingPace` for the method. */
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
 * recorded. Null when fewer than two samples carry a value, and null when the
 * series does not ADVANCE across the range — a stall (a treadmill pinned at the
 * same distance) and a stream running backwards both have nothing to report, and
 * reporting them as a zero the reader has to interpret is worse than omitting the
 * entry. One rule for both spans: duration used to be suppressed at zero while
 * distance printed "0.00 km" beside it.
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
  return diff > 0 ? diff : null;
}

/**
 * Visits every interval of the range between two consecutive samples the clock
 * recorded and the caller calls usable, in order, with the seconds between them.
 * A sample the caller rejects is bridged rather than ending the walk, so a few
 * dropped samples cost precision instead of truncating the range; an interval
 * whose clock does not advance is skipped, but still moves the walk on.
 */
function forEachInterval(
  timeS: readonly (number | null)[],
  lo: number,
  hi: number,
  usable: (i: number) => boolean,
  visit: (a: number, b: number, dt: number) => void
): void {
  let prev: number | null = null;
  for (let i = lo; i <= hi; i++) {
    const t = timeS[i];
    if (t == null || !usable(i)) continue;
    if (prev != null) {
      const dt = t - timeS[prev]!;
      if (dt > 0) visit(prev, i, dt);
    }
    prev = i;
  }
}

/**
 * Mean of a sample series over the range, weighted by time: each interval
 * contributes its own seconds at the mean of its two endpoints (the trapezoid
 * rule).
 *
 * Weighting by time matters because the 400-point downsample is laid out on the
 * distance stream, not the clock: a walk break packs many seconds into few
 * samples, which an unweighted mean would under-count. Falls back to the plain
 * mean when the range carries no usable timestamps at all (a treadmill stream
 * with distance only), which is the best available answer rather than no answer.
 *
 * The trapezoid rather than `zoneSeconds`'s convention of charging each interval
 * to its LEADING sample, because that convention gives the last sample of a range
 * no weight at all: negligible when integrating 400 samples of a whole activity
 * into zone buckets, but the whole answer over the two- and three-sample ranges
 * this readout exists for — a hill sprint selected as 140 then 190 bpm reported
 * an "average" of 140, under every sample but the first. `zoneSeconds` keeps its
 * step convention; it never sees a range this short.
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
  forEachInterval(
    timeS,
    lo,
    hi,
    (i) => values[i] != null,
    (a, b, dt) => {
      weight += dt;
      weighted += ((values[a]! + values[b]!) / 2) * dt;
    }
  );
  if (weight > 0) return weighted / weight;
  let count = 0;
  let total = 0;
  for (let i = lo; i <= hi; i++) {
    const v = values[i];
    if (v == null) continue;
    count += 1;
    total += v;
  }
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
 * The range's MOVING pace, seconds per km: the average of the very pace samples
 * the chart's pace panel plots above the strip, over the intervals of the range
 * where the athlete was actually advancing.
 *
 * Method. Walk the range's consecutive timestamped samples. An interval counts
 * when both of its pace samples are present (`streams.ts` nulls every
 * non-positive velocity, so a null end is the stream reporting a STOP, not a
 * dropped sample), when its own pace — the mean of those two samples — is faster
 * than STOPPED_S_PER_KM, and when the distance stream, wherever it covers the
 * interval, agrees that the ground actually covered implies a pace faster than
 * that too. The intervals that survive are combined the only way a rate may be:
 * the moving seconds over the distance those seconds imply, `sum(dt) /
 * sum(dt / pace)`, a harmonic mean weighted by time. Null when no interval
 * qualifies, which is the honest answer for a range the athlete stood still in.
 *
 * Why neither of the two obvious forms:
 * - The range's own duration over its own distance divides by WALL CLOCK, so a
 *   pause inside the selection prints a pace the panel directly above it
 *   contradicts — activity 12 samples 307 to 309 span 63 s of clock and 46 m of
 *   ground and read 22:50/km where the three pace samples plot 5:47, 5:42 and
 *   5:50. Worse, it has no answer at all where the distance stream stalls
 *   (activity 1245 samples 103 to 107, a lab treadmill pinned at 1.164 km for
 *   165 s of clock) and an absurd one a single sample later (1408:20/km at 103 to
 *   108, off 2 m of rounding) — a cliff between absent and nonsense.
 * - An arithmetic mean of the pace samples is dominated by the slowest of them,
 *   because pace is 1000/velocity and a crawling GPS sample reads in the
 *   thousands of seconds per km: 9:04/km over the whole of activity 1246, whose
 *   distance and duration say 5:55/km.
 * The form above has neither failure, and it cannot print an implausible number:
 * every interval in it passed STOPPED_S_PER_KM, so their mean is bounded by it.
 * Over every cached stream, the slowest pace any window of any length prints is
 * 19:52/km.
 *
 * Limits. Being a moving pace it does NOT equal the range's duration over its
 * distance once the range contains stopped time, and it is stricter than Strava's
 * moving time: whole-activity it reads 4:10/km on activity 1245 and 5:15/km on
 * 1246 where their summary rows say 5:01 and 5:42, because Strava counts seconds
 * at a velocity of zero that this gate does not. Those two are the ones with real
 * stopped time in them; the other nine cached streams land within 3 s/km of their
 * summary pace. And it is only as fine as the downsample: a two-sample range
 * reports one interval's mean pace.
 */
function movingPace(
  timeS: readonly (number | null)[],
  paceSPerKm: readonly (number | null)[] | null,
  distanceKm: readonly (number | null)[],
  lo: number,
  hi: number
): number | null {
  let movingS = 0;
  let movingKm = 0;
  forEachInterval(
    timeS,
    lo,
    hi,
    () => true,
    (a, b, dt) => {
      const d0 = distanceKm[a];
      const d1 = distanceKm[b];
      let pace: number;
      if (paceSPerKm) {
        const p0 = paceSPerKm[a];
        const p1 = paceSPerKm[b];
        if (p0 == null || p1 == null) return;
        pace = (p0 + p1) / 2;
      } else {
        // No velocity stream anywhere in this activity: the distance stream's own
        // rise is the only pace there is. A per-ACTIVITY fallback, never a
        // per-sample one, so widening a selection cannot switch methods.
        if (d0 == null || d1 == null || d1 <= d0) return;
        pace = dt / (d1 - d0);
      }
      if (pace <= 0 || pace > STOPPED_S_PER_KM) return;
      // Where the distance stream covers the interval it is the ground truth on
      // whether the athlete advanced: velocity_smooth reads a plausible pace on
      // both sides of a recording pause that the distance stream shows as almost
      // no ground at all (activity 12 samples 308 to 309: 18 m across 54 s).
      if (d0 != null && d1 != null && (d1 <= d0 || dt / (d1 - d0) > STOPPED_S_PER_KM)) return;
      movingS += dt;
      movingKm += dt / pace;
    }
  );
  return movingKm > 0 ? movingS / movingKm : null;
}

/**
 * Everything a selected range of a stream has to say, from the two sample
 * indices the selection spans (given in either order, clamped to the stream).
 * Returns all-null for an empty stream rather than throwing, so a caller never
 * has to guard the call.
 *
 * All-null too for a range that lands on ONE sample, which is an instant and not
 * a range: it has no duration, no distance and no interval to weight, and
 * relabelling that sample's instantaneous heart rate as an average (`Avg HR 200 /
 * Max HR 200`) would be a readout that agrees with the tooltip while claiming to
 * be something else.
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
  if (!range || range[0] === range[1]) return empty;
  const [lo, hi] = range;
  return {
    durationS: span(streams.timeS, lo, hi),
    distanceKm: span(streams.distanceKm, lo, hi),
    avgHr: timeWeightedMean(streams.timeS, streams.heartrate, lo, hi),
    maxHr: maxOf(streams.heartrate, lo, hi),
    avgPaceSPerKm: movingPace(streams.timeS, streams.paceSPerKm, streams.distanceKm, lo, hi),
    avgPowerW: timeWeightedMean(streams.timeS, streams.watts, lo, hi),
    elevationGainM: elevationGain(streams.altitudeM, lo, hi),
  };
}
