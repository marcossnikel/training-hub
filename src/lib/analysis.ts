// Aerobic-quality analysis: efficiency factor and heart-rate decoupling. Pure
// functions over whole-activity averages and the cached stream, kept free of DB
// and UI imports so a later persisted metrics pipeline can reuse them as-is.

import type { ActivityStreams } from "./streams";

/**
 * Which output signal aerobic quality is measured against. Power is for rides
 * with a real power meter only: Strava's estimated wattage and a watch's run
 * power are models of pace, so dividing them by heart rate would restate
 * speed/HR with extra error.
 */
export type EfBasis = "power" | "speed";

/**
 * The averages an efficiency factor divides by heart rate. A union rather than
 * one bag of optional numbers because the basis decides which output exists:
 * watts from the power meter, or distance over moving time.
 */
type EfInput =
  | { basis: "power"; watts: number | null; avgHr: number | null }
  | { basis: "speed"; distanceKm: number | null; movingTimeS: number | null; avgHr: number | null };

const SECONDS_PER_MINUTE = 60;
const METRES_PER_KM = 1000;

/**
 * Efficiency factor: aerobic output per heartbeat — watts per bpm on a ride,
 * metres per minute per bpm on a run. Rising at the same pace or power means
 * aerobic fitness improving. Null when heart rate or the output is missing.
 */
export function computeEf(input: EfInput): number | null {
  const hr = input.avgHr ?? 0;
  if (hr <= 0) return null;
  if (input.basis === "power") {
    const watts = input.watts ?? 0;
    return watts > 0 ? watts / hr : null;
  }
  const distanceKm = input.distanceKm ?? 0;
  const movingTimeS = input.movingTimeS ?? 0;
  if (distanceKm <= 0 || movingTimeS <= 0) return null;
  const metresPerMinute = (distanceKm * METRES_PER_KM) / (movingTimeS / SECONDS_PER_MINUTE);
  return metresPerMinute / hr;
}

/** Shorter efforts have no meaningful aerobic drift to measure. */
const MIN_DECOUPLING_MOVING_S = 40 * SECONDS_PER_MINUTE;
/**
 * Warm-up dropped before splitting. Heart rate lags effort for the first
 * minutes, which would show up as drift that never happened. This is a
 * deliberate deviation from intervals.icu, which splits the raw midpoint;
 * expect a point or two of difference against their number.
 */
const WARMUP_S = 5 * SECONDS_PER_MINUTE;

interface DecouplingInput {
  streams: ActivityStreams | null;
  basis: EfBasis;
  /** Activity moving time; efforts under 40 minutes get no reading. */
  movingTimeS: number | null;
}

/** One usable stream sample: elapsed second, output signal, heart rate. */
interface Sample {
  t: number;
  output: number;
  hr: number;
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Output per heartbeat for one half of the effort. */
function halfEf(half: Sample[]): number {
  return mean(half.map((s) => s.output)) / mean(half.map((s) => s.hr));
}

/**
 * Aerobic decoupling in percent: how much output per heartbeat fell from the
 * first half of the effort to the second. Under 5% is a well-supported aerobic
 * effort; a large positive number means the pace or the heat outran the
 * athlete's endurance. Negative means efficiency improved as the session went on.
 *
 * The warm-up is dropped first, then the remaining samples split at the
 * midpoint of their elapsed time. Null when the effort is too short, the stream
 * is absent, or heart rate / the output signal never recorded. The 400-point
 * cached stream is sampled evenly, so half averages are accurate enough.
 */
export function computeDecoupling(input: DecouplingInput): number | null {
  const { streams, basis } = input;
  if (!streams) return null;
  if ((input.movingTimeS ?? 0) < MIN_DECOUPLING_MOVING_S) return null;
  // Pace is the stored form of velocity; power comes straight from the meter.
  const output = basis === "power" ? streams.watts : streams.paceSPerKm;
  if (!output || !streams.heartrate) return null;

  const samples: Sample[] = [];
  for (let i = 0; i < streams.n; i++) {
    const t = streams.timeS[i];
    const hr = streams.heartrate[i];
    const raw = output[i];
    if (t == null || hr == null || hr <= 0 || raw == null || raw <= 0) continue;
    // Inverted so both bases read "more output is better".
    samples.push({ t, output: basis === "power" ? raw : METRES_PER_KM / raw, hr });
  }
  if (samples.length < 2) return null;

  const startedAt = samples[0].t;
  const kept = samples.filter((s) => s.t >= startedAt + WARMUP_S);
  if (kept.length < 2) return null;

  const midpoint = (kept[0].t + kept[kept.length - 1].t) / 2;
  const first = kept.filter((s) => s.t <= midpoint);
  const second = kept.filter((s) => s.t > midpoint);
  if (first.length === 0 || second.length === 0) return null;

  const ef1 = halfEf(first);
  if (!(ef1 > 0)) return null;
  return ((ef1 - halfEf(second)) * 100) / ef1;
}

/**
 * Grade-adjusted pace for one split, plus where the number came from. Strava
 * ships its own grade-adjusted speed on outdoor-run splits; the local
 * approximation below only fills the gaps, and the UI marks it so the two are
 * never confused.
 */
interface SplitGap {
  /** Grade-adjusted pace, seconds per km. */
  paceSPerKm: number;
  /** True when produced by the local approximation rather than by Strava. */
  approximate: boolean;
}

/** One split reduced to what grade adjustment needs. All fields nullable. */
interface SplitGapInput {
  /** Strava's own grade-adjusted speed for the split, m/s. Preferred whenever present. */
  gradeAdjustedSpeedMPerS: number | null;
  /** The split's actual pace, s/km. */
  paceSPerKm: number | null;
  /** Net elevation change across the split, metres, signed. */
  elevationDiffM: number | null;
  /** Split length, metres. */
  distanceM: number | null;
}

/**
 * APPROXIMATION — split-level only, superseded by real per-sample grade data
 * (plan task T26). A whole kilometre is collapsed to its net elevation change,
 * so a split that climbs 20 m and descends 20 m looks flat. Linear cost
 * coefficients: 3.3% pace credit per 1% of climb, 1.8% pace debit per 1% of
 * descent, grade clamped because the linear model breaks down on the steep.
 * Self-contained on purpose: delete this block and the fallback branch below
 * when stream grade lands.
 */
const MAX_ABS_GRADE_PCT = 10;
const UPHILL_CREDIT_PER_PCT = 0.033;
const DOWNHILL_DEBIT_PER_PCT = 0.018;

function approximateGapFactor(gradePct: number): number {
  const clamped = Math.max(-MAX_ABS_GRADE_PCT, Math.min(MAX_ABS_GRADE_PCT, gradePct));
  // Dividing pace by a factor above 1 makes it faster, which is what climbing
  // must do to a grade-adjusted pace; descending inverts it.
  return clamped > 0 ? 1 + UPHILL_CREDIT_PER_PCT * clamped : 1 + DOWNHILL_DEBIT_PER_PCT * clamped;
}

/**
 * Grade-adjusted pace for a split: the pace the same effort would have produced
 * on flat ground, so hilly kilometres compare honestly against flat ones. Uses
 * Strava's value when the split carries one, otherwise the approximation above.
 * Null for indoor splits, which have neither a grade-adjusted speed nor an
 * elevation change to work from.
 */
export function splitGap(input: SplitGapInput): SplitGap | null {
  const gradeAdjusted = input.gradeAdjustedSpeedMPerS ?? 0;
  if (gradeAdjusted > 0) {
    return { paceSPerKm: METRES_PER_KM / gradeAdjusted, approximate: false };
  }
  const pace = input.paceSPerKm ?? 0;
  const distanceM = input.distanceM ?? 0;
  if (pace <= 0 || distanceM <= 0 || input.elevationDiffM == null) return null;
  const gradePct = (input.elevationDiffM / distanceM) * 100;
  return { paceSPerKm: pace / approximateGapFactor(gradePct), approximate: true };
}
