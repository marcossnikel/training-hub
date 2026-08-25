// Derived-metric analysis for a single activity: aerobic quality (efficiency
// factor, heart-rate decoupling) and split-level grade-adjusted pace. Pure
// functions over whole-activity averages, the cached stream and per-split
// figures, kept free of DB and UI imports so a later persisted metrics pipeline
// can reuse them as-is. Sport gates live here rather than in the UI, so run-only
// math can never be applied to a walk or a swim.

import { isRideSport } from "./cycling";
import type { ActivityStreams } from "./streams";
import { isRunSport } from "./validate";

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
  | {
      basis: "speed";
      distanceKm: number | null;
      movingTimeS: number | null;
      avgHr: number | null;
      /**
       * Whole-activity grade-adjusted pace, s/km, when the stream carried enough
       * grade to derive one. Present, it replaces the raw pace, so a hilly run's
       * efficiency factor is measured against the flat-ground speed the same
       * effort would have produced instead of being marked down for the hills.
       */
      gapSPerKm?: number | null;
    };

const SECONDS_PER_MINUTE = 60;
const METRES_PER_KM = 1000;

/**
 * Which output signal an activity's aerobic quality can be measured against, or
 * null when it has none. Rides need a real power meter (`device_watts`); runs are
 * measured on speed. Every other sport — a walk, a swim, a lift, and a ride whose
 * wattage Strava merely estimated — gets no efficiency factor and no decoupling,
 * so the one place that decision is made lives here beside the two functions that
 * consume it rather than being restated by each caller.
 */
export function efBasisFor(sportType: string | null, hasRealPower: boolean): EfBasis | null {
  if (isRideSport(sportType)) return hasRealPower ? "power" : null;
  return isRunSport(sportType) ? "speed" : null;
}

/**
 * Efficiency factor: aerobic output per heartbeat — watts per bpm on a ride,
 * metres per minute per bpm on a run. Rising at the same pace or power means
 * aerobic fitness improving. Null when heart rate or the output is missing.
 *
 * On the speed basis the pace is the grade-adjusted one whenever the caller has
 * it, because the alternative is an efficiency factor that falls every time the
 * route goes uphill — which is the terrain talking, not the athlete's aerobic
 * fitness.
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
  const gap = input.gapSPerKm ?? 0;
  const paceSPerKm = gap > 0 ? gap : movingTimeS / distanceKm;
  const metresPerMinute = (METRES_PER_KM * SECONDS_PER_MINUTE) / paceSPerKm;
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

/** Mean heart rate and output per heartbeat for one half of the effort. */
function halfEf(half: Sample[]): { hr: number; ef: number } {
  const hr = mean(half.map((s) => s.hr));
  return { hr, ef: mean(half.map((s) => s.output)) / hr };
}

/**
 * The two halves an aerobic-decoupling reading is made of. The percentage alone
 * answers "did efficiency fall?"; the half heart rates answer "at what cost?",
 * which makes the reading interpretable for a long run.
 */
export interface DecouplingHalves {
  /** Mean heart rate of the first half, bpm. */
  firstHalfHr: number;
  /** Mean heart rate of the second half, bpm. */
  secondHalfHr: number;
  /** `(ef1 - ef2) * 100 / ef1`, unrounded. */
  driftPct: number;
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
  return computeDecouplingHalves(input)?.driftPct ?? null;
}

/**
 * The full reading behind {@link computeDecoupling}: the same split, the same
 * warm-up exclusion and the same null cases, plus each half's mean heart rate.
 * THE single decoupling implementation in the app — the activity page, the
 * persisted metrics pipeline all land here, so a change to the semantics cannot
 * move one surface without the others.
 */
export function computeDecouplingHalves(input: DecouplingInput): DecouplingHalves | null {
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

  const firstHalf = halfEf(first);
  const secondHalf = halfEf(second);
  if (!(firstHalf.ef > 0)) return null;
  return {
    firstHalfHr: firstHalf.hr,
    secondHalfHr: secondHalf.hr,
    driftPct: ((firstHalf.ef - secondHalf.ef) * 100) / firstHalf.ef,
  };
}

/** One split reduced to what grade adjustment needs. All figures nullable. */
interface SplitGapInput {
  /** Strava's own grade-adjusted speed for the split, m/s. The only source. */
  gradeAdjustedSpeedMPerS: number | null;
  /** The split's actual pace, s/km. */
  paceSPerKm: number | null;
  /** Split length, metres. */
  distanceM: number | null;
}

/**
 * Splits below this length get no GAP. Strava emits trailing fragments of a few
 * metres (3.8 m, 5.1 m, 9.8 m all appear in the live data), where a decimetre of
 * barometric noise reads as a multi-percent grade. Because the table's inline bar
 * scales by the fastest GAP, one such fragment would shrink every real
 * kilometre's bar. A tenth of a kilometre is the shortest piece whose grade
 * adjustment is a measurement rather than noise.
 */
const MIN_GAP_SPLIT_M = 100;

/**
 * Smallest adjustment worth printing, seconds per km. A grade adjustment under a
 * second per kilometre is at most a rounding tick in the m:ss the table shows, so
 * rendering it would print the same pace twice and imply an adjustment that never
 * happened — the flat outdoor case (activity 754: every split's grade-adjusted
 * speed equals its average speed) and the indoor case.
 */
const MIN_GAP_DELTA_S_PER_KM = 1;

/**
 * A grade-adjusted pace, or null when printing it would just reprint the pace
 * beside it. The single owner of that rule, applied at both scales it is needed
 * at: the splits table (below) and the activity page's whole-run GAP tile.
 *
 * Both render an m:ss next to the raw pace's m:ss, so both have the same failure
 * — on 14 of the 32 streamed runs here the whole-activity GAP rounds to exactly
 * the pace it sits next to, and printing it claims a terrain adjustment of
 * 0.02%. It also gates the efficiency-factor tooltip, so the tile cannot say the
 * EF was measured against grade-adjusted pace while no grade-adjusted pace is on
 * screen.
 */
export function meaningfulGap(
  gapSPerKm: number | null | undefined,
  paceSPerKm: number | null | undefined
): number | null {
  const gap = gapSPerKm ?? 0;
  const pace = paceSPerKm ?? 0;
  if (gap <= 0 || pace <= 0) return null;
  return Math.abs(gap - pace) < MIN_GAP_DELTA_S_PER_KM ? null : gap;
}

/**
 * Grade-adjusted pace for a split, seconds per km: the pace the same effort would
 * have produced on flat ground, so hilly kilometres compare honestly against flat
 * ones. Strava's own grade-adjusted speed is the source — the whole-activity GAP
 * this app computes itself is a per-sample integration of the stream
 * (`avgGapSPerKm` in stream-metrics.ts), which a split payload has nothing to
 * offer.
 *
 * Null whenever there is nothing to say: no usable raw pace to compare against,
 * no Strava value, a split too short to carry a real grade, or an adjustment so
 * small it would just reprint the raw pace.
 */
export function splitGap(input: SplitGapInput): number | null {
  const pace = input.paceSPerKm ?? 0;
  const distanceM = input.distanceM ?? 0;
  if (pace <= 0 || distanceM < MIN_GAP_SPLIT_M) return null;

  const gradeAdjusted = input.gradeAdjustedSpeedMPerS ?? 0;
  if (gradeAdjusted <= 0) return null;
  // A GAP that says nothing the raw pace does not already say is not a GAP.
  return meaningfulGap(METRES_PER_KM / gradeAdjusted, pace);
}
