// Pure fitness engine: per-activity training load (TSS), the Performance
// Management Chart (CTL/ATL/TSB) and Friel training zones. No DB imports — the
// data layer feeds these functions and persists their output.
import { isRideSport, rideMetrics } from "./cycling";
import { eachDay, localDateInputValue, mondayOf, parseLocalDate } from "./format";
import { sportCategory } from "./sports";
import { isRunSport } from "./validate";

export interface AthleteThresholds {
  maxHr: number;
  restingHr: number;
  lthr: number;
  thresholdPaceSPerKm: number;
  ftpW: number;
  restingHrEstimated: boolean;
  ftpProvisional: boolean;
  updatedAt: string | null;
}

/**
 * Accepted stored threshold-pace range in s/km — the bounds saveThresholdsAction
 * enforces. Shared so the Performance page's "apply suggested pace" control can
 * suppress an apply that the save would reject (a slow race can imply a pace
 * above the ceiling) instead of offering a button that always fails validation.
 */
export const THRESHOLD_PACE_RANGE = { min: 120, max: 600 } as const;

/** Which signal a TSS value was derived from, best (power) to weakest (rpe). */
export type LoadMethod = "power" | "pace" | "hr" | "rpe";

/**
 * How an hrTSS was measured. The heart-rate method is the only one with two
 * readings of the same activity:
 *
 * - `stream` — the per-sample integral of the cached heart-rate trace.
 * - `avg` — the whole-activity average heart rate, one intensity for the
 *   session.
 *
 * They are not interchangeable. Karvonen intensity is affine in heart rate, so
 * the average of the per-sample intensities IS the intensity of the average
 * heart rate — but TSS squares it, and the mean of the squares is never below
 * the square of the mean. WHERE THE TWO READINGS SEE THE SAME MEAN HEART RATE,
 * an interval session therefore scores at least as high from its stream as from
 * its average, and exactly the same when the heart rate never moved. That gap is
 * the systematic error this variant exists to record: 897 of the 1234 stored
 * loads were measured the flat way.
 *
 * They do not always see the same mean, so the inequality is a property of the
 * spread rather than a guarantee about the two stored numbers. The trace is
 * sampled on the ELAPSED clock: its stopped samples (a red light, a bag drop)
 * are averaged in and pull its time-weighted mean below the moving-time `avg_hr`
 * Strava reports, and {@link computeLoad}'s rescale onto moving time then charges
 * that lower mean for the whole session. A steady ride can therefore come back
 * slightly BELOW its average reading — activity 71 (elapsed/moving 1.22)
 * integrates a 115.0 bpm mean against a stored 116.1 and lands 35.0 → 34.7 TSS.
 * The stream is still the truer reading of the two; it is simply not an
 * upper bound.
 *
 * Null on the other three methods, which have a single definition each.
 */
export type LoadVariant = "stream" | "avg";

export interface ActivityLoad {
  tss: number;
  method: LoadMethod;
  intensityFactor: number | null;
  /** Which hrTSS reading this is; null for power, pace and RPE. */
  variant: LoadVariant | null;
}

/**
 * An activity's cached heart-rate trace, index-aligned, as the load engine reads
 * it. Both channels are nullable exactly as `ActivityStreams` stores them —
 * dropping the null samples up front would slide the two arrays out of alignment
 * and credit each heart rate to the wrong moment.
 */
export interface HrStream {
  hr: readonly (number | null)[];
  timeS: readonly (number | null)[];
}

/** The minimal activity shape the load engine reads. */
export interface LoadActivity {
  sport_type: string | null;
  moving_time_s: number | null;
  distance_km: number | null;
  avg_hr: number | null;
  avg_pace_s_per_km: number | null;
  rpe: number | null;
  raw_json: string | null;
  /**
   * The heart-rate stream, when the caller has one cached. Optional because
   * `computeLoad` is pure and synchronous with no way to load it: every caller
   * that wants the stream reading has to hand the trace over (see
   * {@link computeHrTssFromStream}). Absent or unusable, the heart-rate method
   * falls back to the average — the same number it has always produced.
   */
  hrStream?: HrStream | null;
}

export interface LoadOptions {
  /** Skip the power method even for rides (e.g. flaky trainer wattage). */
  ignorePower?: boolean;
}

// Intensity-factor clamps per method: power can exceed threshold further than
// pace/HR before the quadratic TSS runs away.
const IF_CLAMP_POWER = 1.6;
const IF_CLAMP_PACE = 1.5;
const IF_CLAMP_HR = 1.5;

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// TSS is scaled so that one hour (SECONDS_PER_HOUR) at threshold (IF = 1.0)
// scores 100 points.
const SECONDS_PER_HOUR = 3600;
const TSS_SCALE = 100;

// Session-RPE fallback load = sRPE * minutes * factor. The factor is set so an
// RPE 10 for 60 min ≈ 150 TSS, in line with a maximal one-hour effort.
const SECONDS_PER_MINUTE = 60;
const RPE_TSS_FACTOR = 0.25;

/** Quadratic TSS from an intensity factor over a duration in seconds. */
function tssFrom(movingS: number, intensity: number): number {
  return (movingS / SECONDS_PER_HOUR) * intensity * intensity * TSS_SCALE;
}

/**
 * Karvonen heart-rate intensity: where a heart rate sits between resting and
 * threshold, clamped to the hrTSS range. The single definition, read once per
 * activity by the average method below and once per sample by
 * {@link computeHrTssFromStream}, so the two readings of an activity can only
 * differ in HOW they average, never in what they measure.
 *
 * Null when the thresholds cannot support the question (a resting heart rate at
 * or above threshold leaves no range to place a beat in) or the beat is absent.
 */
function hrIntensity(hr: number, thresholds: AthleteThresholds): number | null {
  if (hr <= 0 || thresholds.lthr <= thresholds.restingHr) return null;
  return clamp(
    (hr - thresholds.restingHr) / (thresholds.lthr - thresholds.restingHr),
    0,
    IF_CLAMP_HR
  );
}

/** A heart-rate trace's integrated load, and the span it was integrated over. */
export interface StreamHrTss {
  /** `Σ dt/3600 · IF² · 100` over `coveredS` seconds of stream. */
  tss: number;
  /** Seconds of stream that carried a usable heart rate. */
  coveredS: number;
}

/**
 * Stream-integrated hrTSS: the training load of a heart-rate trace read sample
 * by sample rather than as one session-long average.
 *
 * Each sample's intensity ({@link hrIntensity}) is credited for the span to the
 * NEXT sample — the same forward-credit convention {@link zoneSeconds} uses, so
 * an activity's zone seconds and its hrTSS describe the same partition of the
 * clock, and a 400-point downsample scores the same as the trace it came from.
 *
 * The two figures come back together because neither is usable alone. The
 * integral runs on the STREAM's clock, which is elapsed time: it includes the
 * stops that `moving_time_s` excludes (across the cached streams, elapsed runs 0
 * to 22% longer than moving) and it stops early wherever the strap dropped out.
 * A caller that wants a load comparable with the average method — which charges
 * moving time — must rescale onto its own clock, and needs `coveredS` to do it.
 * See {@link computeLoad}.
 *
 * Null when no pair of samples carries both a time and a heart rate, which is
 * the caller's signal to fall back rather than to store a zero.
 */
export function computeHrTssFromStream(
  hr: readonly (number | null)[],
  timeS: readonly (number | null)[],
  thresholds: AthleteThresholds
): StreamHrTss | null {
  let tss = 0;
  let coveredS = 0;
  const n = Math.min(hr.length, timeS.length);
  for (let i = 0; i + 1 < n; i++) {
    const t0 = timeS[i];
    const t1 = timeS[i + 1];
    const beat = hr[i];
    if (t0 == null || t1 == null || beat == null) continue;
    const dt = t1 - t0;
    if (dt <= 0) continue;
    const intensity = hrIntensity(beat, thresholds);
    if (intensity == null) continue;
    tss += tssFrom(dt, intensity);
    coveredS += dt;
  }
  return coveredS > 0 ? { tss, coveredS } : null;
}

/**
 * Least share of an activity's moving time a heart-rate trace has to cover
 * before {@link computeLoad} extrapolates its integral across the whole session.
 *
 * The rescale below charges the covered window's intensity for every moving
 * second. That is right for a complete trace and badly wrong for a truncated
 * one: a strap that records the first 10 minutes of a 60-minute ride at 176 bpm
 * would score the whole hour at 176 bpm — 100 TSS against the average reading's
 * 41 — and the number goes straight into CTL. Below the floor the average heart
 * rate is the honest reading: it is weak, but it describes the entire session.
 *
 * Set well clear of real data rather than tight: every cached stream today
 * covers at least 99.7% of its moving time, so this is a guard against dropouts
 * and truncated files, not a filter the current history trips.
 */
export const MIN_HR_STREAM_COVERAGE = 0.8;

/**
 * Best-available training load for one activity. Picks the strongest signal
 * present in priority order (power → pace → HR → RPE) and returns null when
 * none apply. TSS is rounded to 1 decimal, intensity factor to 3.
 */
export function computeLoad(
  activity: LoadActivity,
  thresholds: AthleteThresholds,
  opts: LoadOptions = {}
): ActivityLoad | null {
  const time = activity.moving_time_s ?? 0;
  if (time <= 0) return null;

  // 1. Power (rides with a real power meter, a normalized/average wattage and
  // an FTP). Strava's *estimated* wattage (device_watts false/absent) is not
  // trustworthy enough for a power TSS, so it falls through to the HR method.
  if (!opts.ignorePower && isRideSport(activity.sport_type) && thresholds.ftpW > 0) {
    const metrics = rideMetrics({ sport_type: activity.sport_type, raw_json: activity.raw_json });
    const power = metrics.normalizedPower ?? metrics.avgPower;
    if (metrics.hasRealPower && power != null && power > 0) {
      const intensity = clamp(power / thresholds.ftpW, 0, IF_CLAMP_POWER);
      return {
        tss: round1(tssFrom(time, intensity)),
        method: "power",
        intensityFactor: round3(intensity),
        variant: null,
      };
    }
  }

  // 2. Pace (rTSS for runs with an average pace and a threshold pace).
  const pace = activity.avg_pace_s_per_km ?? 0;
  if (isRunSport(activity.sport_type) && pace > 0 && thresholds.thresholdPaceSPerKm > 0) {
    const intensity = clamp(thresholds.thresholdPaceSPerKm / pace, 0, IF_CLAMP_PACE);
    return {
      tss: round1(tssFrom(time, intensity)),
      method: "pace",
      intensityFactor: round3(intensity),
      variant: null,
    };
  }

  // 3. Heart rate (hrTSS, works for any sport with an average HR). Two readings
  // of the same signal, preferring the stream when the caller supplied one.
  const hr = activity.avg_hr ?? 0;
  const avgIntensity = hrIntensity(hr, thresholds);
  if (avgIntensity != null) {
    const stream = activity.hrStream
      ? computeHrTssFromStream(activity.hrStream.hr, activity.hrStream.timeS, thresholds)
      : null;
    // A trace that stops early says nothing about the minutes it missed, so it
    // is only extrapolated once it covers most of them (MIN_HR_STREAM_COVERAGE).
    if (stream && stream.coveredS >= time * MIN_HR_STREAM_COVERAGE) {
      // Rescale the stream's integral from its own elapsed clock onto MOVING
      // time, which is the duration every other method here charges. Only the
      // intensity comes from the stream, the duration stays the activity's, so
      // the two readings differ by exactly the variance of the heart rate and
      // by nothing else: no activity gains load merely for having stood at a
      // traffic light, and a constant-heart-rate stream reproduces the average
      // method's number identically whatever the two clocks did.
      const tss = stream.tss * (time / stream.coveredS);
      // The steady intensity that would have cost the same, so the stored IF
      // stays the number the tile has always shown: TSS = h · IF² · 100.
      const intensity = Math.sqrt(tss / ((time / SECONDS_PER_HOUR) * TSS_SCALE));
      return {
        tss: round1(tss),
        method: "hr",
        intensityFactor: round3(intensity),
        variant: "stream",
      };
    }
    return {
      tss: round1(tssFrom(time, avgIntensity)),
      method: "hr",
      intensityFactor: round3(avgIntensity),
      variant: "avg",
    };
  }

  // 4. RPE (subjective fallback; RPE 10 for 60 min ≈ 150 TSS).
  if (activity.rpe != null) {
    const tss = round1(activity.rpe * (time / SECONDS_PER_MINUTE) * RPE_TSS_FACTOR);
    return { tss, method: "rpe", intensityFactor: null, variant: null };
  }

  return null;
}

export interface PmcPoint {
  date: string;
  load: number;
  ctl: number;
  atl: number;
  tsb: number;
  /** ctl[i] - ctl[i-7], the 7-day fitness ramp; null for the first 7 days. */
  rampRate: number | null;
}

/**
 * Bucket persisted training loads into a gap-filled ascending daily series
 * (local calendar days) spanning the earliest load day through today, ready to
 * feed straight into computePmc. Empty when there are no loads.
 */
export function dailyLoadSeries(
  loads: { started_at: string; tss: number }[]
): { date: string; load: number }[] {
  const byDay = new Map<string, number>();
  for (const load of loads) {
    const key = localDateInputValue(new Date(load.started_at));
    byDay.set(key, (byDay.get(key) ?? 0) + load.tss);
  }
  if (byDay.size === 0) return [];
  const dayKeys = [...byDay.keys()].sort();
  const today = localDateInputValue(new Date());
  const lastDay = dayKeys[dayKeys.length - 1] > today ? dayKeys[dayKeys.length - 1] : today;
  return eachDay(dayKeys[0], lastDay).map((date) => ({ date, load: byDay.get(date) ?? 0 }));
}

/**
 * Sport buckets the weekly load bars stack. Runs and rides are the two that
 * carry meaningful load volume for this athlete; strength, walks, elliptical
 * and swims fold into "other".
 */
export type LoadSport = "run" | "bike" | "other";

/** Stacking / legend order, bottom segment first. */
export const LOAD_SPORTS: readonly LoadSport[] = ["run", "bike", "other"];

export interface WeeklySportLoad {
  /** Monday of the week, YYYY-MM-DD local. */
  date: string;
  load: Record<LoadSport, number>;
}

/** Buckets a raw Strava sport_type into the load sport it stacks / filters under. */
export function loadSport(sport: string | null | undefined): LoadSport {
  const category = sportCategory(sport);
  return category === "run" || category === "bike" ? category : "other";
}

/**
 * The load sports (in LOAD_SPORTS order) that a set of load rows actually
 * carries positive load for. Rows whose tss is zero are ignored, so a sport
 * present in the data but contributing nothing is not offered as a filter and
 * can never produce an all-zero view.
 */
export function availableLoadSports(
  loads: { tss: number; sport_type?: string | null }[]
): LoadSport[] {
  const withLoad = new Set<LoadSport>();
  for (const load of loads) {
    if (load.tss > 0) withLoad.add(loadSport(load.sport_type));
  }
  return LOAD_SPORTS.filter((sport) => withLoad.has(sport));
}

/** A week's total load, i.e. the height of its stacked bar. */
export function weeklyLoadTotal(week: WeeklySportLoad): number {
  return LOAD_SPORTS.reduce((sum, sport) => sum + week.load[sport], 0);
}

/**
 * Weekly (Monday-keyed) training load split by sport, over an inclusive
 * local-date range. Weeks with no activities are kept as zero stacks so the
 * bars stay evenly spaced in time. Uses the same started_at -> local-day
 * conversion as dailyLoadSeries, so each stack sums to exactly the total that
 * series produces for the same week.
 */
export function weeklySportLoad(
  loads: { started_at: string; tss: number; sport_type?: string | null }[],
  range: { from: string; to: string }
): WeeklySportLoad[] {
  const weeks = new Map<string, Record<LoadSport, number>>();
  const cursor = mondayOf(parseLocalDate(range.from));
  while (localDateInputValue(cursor) <= range.to) {
    weeks.set(localDateInputValue(cursor), { run: 0, bike: 0, other: 0 });
    cursor.setDate(cursor.getDate() + 7);
  }
  for (const load of loads) {
    const day = localDateInputValue(new Date(load.started_at));
    if (day < range.from || day > range.to) continue;
    const week = weeks.get(localDateInputValue(mondayOf(parseLocalDate(day))));
    if (week) week[loadSport(load.sport_type)] += load.tss;
  }
  // Map insertion order is the ascending week cursor above.
  return [...weeks.entries()].map(([date, load]) => ({ date, load }));
}

// Exponentially-weighted decay constants: fitness over ~42 days, fatigue ~7.
const CTL_ALPHA = 1 / 42;
const ATL_ALPHA = 1 / 7;

/**
 * Performance Management Chart from gap-filled daily loads (ascending, zero
 * days included by the caller). CTL and ATL are EWMAs seeded at 0; each day's
 * form (TSB) is the prior day's fitness minus fatigue, and 0 on the first day.
 */
export function computePmc(dailyLoads: { date: string; load: number }[]): PmcPoint[] {
  const out: PmcPoint[] = [];
  let ctl = 0;
  let atl = 0;
  for (let i = 0; i < dailyLoads.length; i++) {
    const { date, load } = dailyLoads[i];
    const prevCtl = ctl;
    const prevAtl = atl;
    ctl = prevCtl + CTL_ALPHA * (load - prevCtl);
    atl = prevAtl + ATL_ALPHA * (load - prevAtl);
    const tsb = i === 0 ? 0 : prevCtl - prevAtl;
    const roundedCtl = round1(ctl);
    const rampRate = i < 7 ? null : round1(roundedCtl - out[i - 7].ctl);
    out.push({
      date,
      load,
      ctl: roundedCtl,
      atl: round1(atl),
      tsb: round1(tsb),
      rampRate,
    });
  }
  return out;
}

/** One activity's stored load beside the load a recompute would give it. */
export interface LoadChange {
  started_at: string;
  /** The stored TSS, or null when the activity has no load row yet. */
  before: number | null;
  /** What the recompute would store, or null when it would write nothing. */
  after: number | null;
}

/**
 * What a bulk load recompute would do, measured before anything is written.
 *
 * Deltas below {@link CHANGE_EPSILON} are not changes: both sides are already
 * rounded to a tenth of a TSS point, so anything smaller is the rounding itself.
 * A missing side counts as zero load — an activity gaining its first load row
 * is a change of its whole TSS.
 *
 * The CTL pair is the number that matters. TSS is the input to a 42-day EWMA, so
 * a rewrite of history moves today's fitness, and "how far" is the only honest
 * summary of a thousand individually plausible edits. Both figures come from the
 * same {@link dailyLoadSeries} + {@link computePmc} path the fitness page runs,
 * so the "before" CTL printed here is the CTL currently on that page.
 */
export interface LoadRecomputeSummary {
  /** Activities whose stored TSS would move. */
  changed: number;
  /** Mean signed delta across the changed activities, TSS. */
  meanDelta: number;
  /** The largest single delta by magnitude, signed. */
  maxDelta: number;
  /** Today's CTL as stored, and as the recompute would leave it. */
  ctlBefore: number;
  ctlAfter: number;
}

/** Smallest TSS difference that is a real change rather than stored rounding. */
const CHANGE_EPSILON = 0.05;

export function summarizeLoadRecompute(changes: LoadChange[]): LoadRecomputeSummary {
  let changed = 0;
  let total = 0;
  let maxDelta = 0;
  for (const change of changes) {
    const delta = (change.after ?? 0) - (change.before ?? 0);
    if (Math.abs(delta) < CHANGE_EPSILON) continue;
    changed += 1;
    total += delta;
    if (Math.abs(delta) > Math.abs(maxDelta)) maxDelta = delta;
  }
  const ctlOf = (pick: (change: LoadChange) => number | null): number => {
    const series = computePmc(
      dailyLoadSeries(
        changes
          .map((change) => ({ started_at: change.started_at, tss: pick(change) ?? 0 }))
          .filter((load) => load.tss !== 0)
      )
    );
    return series.length > 0 ? series[series.length - 1].ctl : 0;
  };
  return {
    changed,
    meanDelta: changed > 0 ? round1(total / changed) : 0,
    maxDelta: round1(maxDelta),
    ctlBefore: ctlOf((change) => change.before),
    ctlAfter: ctlOf((change) => change.after),
  };
}

/**
 * The two figures an apply is checked against before it writes.
 *
 * A preview and its apply are separate requests against a database that keeps
 * moving underneath them — a sync lands, a history fetch caches another stream,
 * an activity is confirmed — so the second one has to prove it is about to write
 * the plan the athlete read. Only these two travel back from the client: they
 * are a fingerprint OF the plan, never the plan itself, so every number that
 * actually lands is still computed server-side from the database.
 */
export interface LoadRecomputeExpectation {
  changed: number;
  ctlAfter: number;
}

/**
 * Largest CTL move (TSS) between a preview and its apply that is still the same
 * plan. Both figures are rounded to a tenth, so at half of that it is the
 * rounding rather than a changed history.
 */
const CTL_DRIFT_TOLERANCE = 0.05;

/**
 * Whether a freshly planned recompute has moved away from the previewed one.
 *
 * `changed` has to match exactly: it counts rows, and a different count is a
 * different set of edits regardless of how little CTL happens to move.
 */
export function loadPlanDrifted(
  expected: LoadRecomputeExpectation,
  actual: LoadRecomputeSummary
): boolean {
  return (
    expected.changed !== actual.changed ||
    Math.abs(expected.ctlAfter - actual.ctlAfter) > CTL_DRIFT_TOLERANCE
  );
}

/**
 * Extend a PMC past its last historical day under a constant daily load, using
 * the exact same EWMA recurrence as computePmc. Two closed-form scenarios answer
 * the taper question without any planned-workout system: dailyLoad = 0 (full
 * rest) and dailyLoad = the trailing daily mean (steady training).
 *
 * Returns `days` points starting the day AFTER `last.date`, so the first one's
 * TSB continues the historical series (last.ctl - last.atl). The 7-day ramp
 * lookback only exists once it falls inside the projection itself, so the first
 * seven projected points carry a null rampRate.
 */
export function projectPmc(last: PmcPoint, days: number, dailyLoad: number): PmcPoint[] {
  const out: PmcPoint[] = [];
  let ctl = last.ctl;
  let atl = last.atl;
  const cursor = parseLocalDate(last.date);
  for (let i = 0; i < days; i++) {
    cursor.setDate(cursor.getDate() + 1);
    const prevCtl = ctl;
    const prevAtl = atl;
    ctl = prevCtl + CTL_ALPHA * (dailyLoad - prevCtl);
    atl = prevAtl + ATL_ALPHA * (dailyLoad - prevAtl);
    const roundedCtl = round1(ctl);
    out.push({
      date: localDateInputValue(cursor),
      load: dailyLoad,
      ctl: roundedCtl,
      atl: round1(atl),
      tsb: round1(prevCtl - prevAtl),
      rampRate: i < 7 ? null : round1(roundedCtl - out[i - 7].ctl),
    });
  }
  return out;
}

/** Arithmetic mean, or null for an empty list. */
function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Acute:chronic workload ratio from gap-filled daily loads: acute = mean of
 * the last up-to-7 available days, chronic = mean of the last up-to-28
 * available days. Replicates the exact prior semantics of the private math in
 * src/lib/db/readiness.ts loadState() — null ONLY when the chronic mean is 0
 * (not merely for under 28 days of history, which would change behavior for
 * every athlete with a short training history).
 */
export function computeAcwr(daily: { date: string; load: number }[]): number | null {
  const acute = mean(daily.slice(-7).map((d) => d.load)) ?? 0;
  const chronic = mean(daily.slice(-28).map((d) => d.load)) ?? 0;
  return chronic > 0 ? acute / chronic : null;
}

/** Foster monotony and strain over the trailing training week. */
export interface WeeklyMonotony {
  /** 7-day mean load / population stddev; null when the week is too flat or too sparse to mean anything. */
  monotony: number | null;
  /** 7-day total load scaled by monotony; null whenever monotony is. */
  strain: number | null;
  /** Total load over the trailing 7 days. Always available. */
  load7d: number;
}

// Below this spread (in TSS) the stddev divisor is small enough that monotony
// explodes into a meaningless number, and a week needs some rest/hard contrast
// at all before its evenness says anything.
const MONOTONY_MIN_STDDEV = 1;
const MONOTONY_MIN_ACTIVE_DAYS = 4;

/**
 * Foster monotony and strain from gap-filled daily loads: monotony is the
 * trailing week's mean load divided by its population standard deviation (a
 * week of identical days scores high), strain is that week's total load scaled
 * by monotony. Caution above 2.0, warning above 2.5.
 *
 * Uses the last up-to-7 available days, matching computeAcwr. Values are raw;
 * rounding is the caller's business.
 */
export function weeklyMonotony(daily: { date: string; load: number }[]): WeeklyMonotony {
  const week = daily.slice(-7).map((d) => d.load);
  const load7d = week.reduce((a, b) => a + b, 0);
  const avg = mean(week);
  const activeDays = week.filter((load) => load > 0).length;
  const flat = { monotony: null, strain: null, load7d };
  if (avg == null || activeDays < MONOTONY_MIN_ACTIVE_DAYS) return flat;
  const stddev = Math.sqrt(mean(week.map((load) => (load - avg) ** 2)) ?? 0);
  if (stddev < MONOTONY_MIN_STDDEV) return flat;
  const monotony = avg / stddev;
  return { monotony, strain: load7d * monotony, load7d };
}

/** This week's training load so far, against the weeks that came before it. */
export interface WeekLoadComparison {
  /** Load from Monday of the series' last day through that day (a partial week). */
  thisWeek: number;
  /**
   * Mean total load of the complete weeks immediately before this one, together
   * with how many of them it covers (at most `weeks`); null when the series
   * covers none. The two travel as one value so a caller can never label an
   * average with a week count it was not computed from.
   */
  trailing: { avg: number; weeks: number } | null;
}

const TRAILING_WEEKS = 4;
const DAYS_PER_WEEK = 7;

/** Shift a local YYYY-MM-DD day key by whole days. */
function shiftDay(key: string, days: number): string {
  const date = parseLocalDate(key);
  date.setDate(date.getDate() + days);
  return localDateInputValue(date);
}

/**
 * This week's load-to-date against the mean of the preceding complete weeks (the
 * `weeks` most recent of them at most), from gap-filled daily loads whose last
 * entry is today. Weeks are Monday-keyed, the same grouping the training log
 * uses. A preceding week only counts when the series covers all seven of its
 * days, so a short history averages fewer weeks (or none) rather than being
 * dragged down by days that were never recorded. Rest days inside a covered week
 * count as the zero load they are.
 */
export function weekLoadVsTrailing(
  daily: { date: string; load: number }[],
  weeks = TRAILING_WEEKS
): WeekLoadComparison {
  if (daily.length === 0) return { thisWeek: 0, trailing: null };
  const first = daily[0].date;
  const last = daily[daily.length - 1].date;
  const byDay = new Map(daily.map((d) => [d.date, d.load]));
  const total = (from: string, to: string) =>
    eachDay(from, to).reduce((sum, day) => sum + (byDay.get(day) ?? 0), 0);

  const monday = localDateInputValue(mondayOf(parseLocalDate(last)));
  const previous: number[] = [];
  for (let k = 1; k <= weeks; k++) {
    const start = shiftDay(monday, -DAYS_PER_WEEK * k);
    if (start < first) break;
    previous.push(total(start, shiftDay(start, DAYS_PER_WEEK - 1)));
  }
  const avg = mean(previous);
  return {
    thisWeek: total(monday, last),
    trailing: avg == null ? null : { avg, weeks: previous.length },
  };
}

/** Days of trailing CTL the training log's form-strip sparkline covers. */
export const FORM_TREND_DAYS = 14;

/** Today's form and fitness, as the training log's form strip renders them. */
export interface FormSnapshot {
  /** Today's form (TSB) and fitness (CTL), raw. */
  tsb: number;
  ctl: number;
  /** Trailing CTL values, oldest first, up to `trendDays` of them. */
  ctlTrend: number[];
}

/**
 * The last day of a PMC plus its trailing CTL window, so the selection the form
 * strip depends on is unit-tested instead of inlined in the page. Null for an
 * empty PMC, which is the page's signal to render no strip at all.
 */
export function formSnapshot(pmc: PmcPoint[], trendDays = FORM_TREND_DAYS): FormSnapshot | null {
  const today = pmc[pmc.length - 1];
  if (!today) return null;
  return {
    tsb: today.tsb,
    ctl: today.ctl,
    ctlTrend: pmc.slice(-trendDays).map((point) => point.ctl),
  };
}

export type FormStateKey = "transition" | "fresh" | "neutral" | "productive" | "fatigued";

// Form (TSB) band edges: above +20 is transition (tapered too long / detraining
// risk), above +5 is fresh/tapered, down to -10 is neutral, down to -30 is the
// productive training zone, and below that is deep fatigue.
export const TSB_TRANSITION_ABOVE = 20;
export const TSB_FRESH_ABOVE = 5;
export const TSB_NEUTRAL_FLOOR = -10;
export const TSB_PRODUCTIVE_FLOOR = -30;

/**
 * Buckets a TSB value into a form state. Above +20 is transition (form has
 * drifted past useful freshness), above +5 is fresh (tapered), the -10..+5
 * band is neutral, -30..-10 is the productive training zone, and anything
 * below -30 is deep fatigue.
 */
export function formState(tsb: number): { key: FormStateKey } {
  if (tsb > TSB_TRANSITION_ABOVE) return { key: "transition" };
  if (tsb > TSB_FRESH_ABOVE) return { key: "fresh" };
  if (tsb >= TSB_NEUTRAL_FLOOR) return { key: "neutral" };
  if (tsb >= TSB_PRODUCTIVE_FLOOR) return { key: "productive" };
  return { key: "fatigued" };
}

/**
 * A single training zone. Bounds are inclusive of `min`, exclusive of `max`;
 * a null bound is open-ended. For HR the units are bpm (min < max). For pace
 * the units are seconds per km, where a smaller number is faster, so `min` is
 * the fastest pace in the zone and `max` the slowest.
 */
export interface Zone {
  zone: 1 | 2 | 3 | 4 | 5;
  min: number | null;
  max: number | null;
}

// Friel five-zone cut points, as fractions of the threshold value.
const ZONE_FRACTIONS = [0.81, 0.9, 0.94, 1.0] as const;

/**
 * Friel heart-rate zones as a percentage of LTHR: Z1 <81%, Z2 81–89%,
 * Z3 90–93%, Z4 94–99%, Z5 ≥100%. Bounds are bpm.
 */
export function hrZones(thresholds: AthleteThresholds): Zone[] {
  const [b1, b2, b3, b4] = ZONE_FRACTIONS.map((f) => Math.round(f * thresholds.lthr));
  return [
    { zone: 1, min: null, max: b1 },
    { zone: 2, min: b1, max: b2 },
    { zone: 3, min: b2, max: b3 },
    { zone: 4, min: b3, max: b4 },
    { zone: 5, min: b4, max: null },
  ];
}

/**
 * Running pace zones as multiples of threshold-pace speed, mirroring the HR
 * fractions. A speed fraction f maps to a pace of thresholdPace / f, so the
 * faster (higher) zones carry the smaller pace numbers. Bounds are s/km.
 */
export function paceZones(thresholds: AthleteThresholds): Zone[] {
  const [p1, p2, p3, p4] = ZONE_FRACTIONS.map((f) =>
    Math.round(thresholds.thresholdPaceSPerKm / f)
  );
  return [
    { zone: 1, min: p1, max: null },
    { zone: 2, min: p2, max: p1 },
    { zone: 3, min: p3, max: p2 },
    { zone: 4, min: p4, max: p3 },
    { zone: 5, min: null, max: p4 },
  ];
}

// Power cut points as fractions of FTP, collapsed to the same five-zone shape
// as the HR and pace zones: recovery, endurance, tempo, threshold, above.
const POWER_ZONE_FRACTIONS = [0.55, 0.75, 0.9, 1.05] as const;

/**
 * Cycling power zones as a percentage of FTP: Z1 <55%, Z2 55–74%, Z3 75–89%,
 * Z4 90–104%, Z5 ≥105%. Bounds are watts. Only meaningful for rides recorded
 * with a real power meter.
 */
export function powerZones(thresholds: AthleteThresholds): Zone[] {
  const [b1, b2, b3, b4] = POWER_ZONE_FRACTIONS.map((f) => Math.round(f * thresholds.ftpW));
  return [
    { zone: 1, min: null, max: b1 },
    { zone: 2, min: b1, max: b2 },
    { zone: 3, min: b2, max: b3 },
    { zone: 4, min: b3, max: b4 },
    { zone: 5, min: b4, max: null },
  ];
}

/**
 * Index (0–4) of the zone a value falls in, or -1 when it fits none. Bounds
 * follow `Zone`: min inclusive, max exclusive, a null bound open-ended. Works
 * for HR and power (min below max) as well as pace, where min is the fastest
 * bound of the zone.
 */
export function zoneIndexOf(value: number, zones: Zone[]): number {
  for (let i = 0; i < zones.length; i++) {
    const { min, max } = zones[i];
    if ((min == null || value >= min) && (max == null || value < max)) return i;
  }
  return -1;
}

/** The four inner boundaries of a five-zone set, in zone order. */
export type ZoneBounds = [number, number, number, number];

/**
 * The four inner boundaries of a five-zone set, in zone order: entry i is the
 * value where zone i+1 ends and zone i+2 begins. Read off the `Zone` bound that
 * faces the next higher zone, which is `max` where a bigger number is a higher
 * zone (heart rate, power) and `min` where a smaller one is (`descending`: pace
 * in s/km). So the list ascends for heart rate and descends for pace, and in
 * both cases a later entry always belongs to a higher zone. Classification
 * itself stays with `zoneIndexOf`; these are for drawing the boundaries.
 *
 * Null unless `zones` is a five-zone set whose four inner bounds are all set.
 * The tuple return is the point: a caller can never be handed a short list and
 * silently shade or label every zone one slot off.
 */
export function zoneBoundsOf(zones: Zone[], descending: boolean): ZoneBounds | null {
  if (zones.length !== 5) return null;
  const [b1, b2, b3, b4] = zones.slice(0, -1).map((z) => (descending ? z.min : z.max));
  if (b1 == null || b2 == null || b3 == null || b4 == null) return null;
  return [b1, b2, b3, b4];
}

/**
 * Seconds spent in each zone along a time-indexed sample series (a cached
 * activity stream, or a full-resolution one). Each interval's duration
 * (`timeS[i + 1] - timeS[i]`) is attributed to the zone of its leading sample;
 * samples with no value, no timestamp or no matching zone contribute nothing, so
 * gaps (a dropped HR strap, a stopped GPS pace) shrink the total rather than
 * landing in a wrong zone.
 *
 * Returns null when nothing could be attributed, which lets callers hide a bar
 * instead of drawing an all-zero one.
 */
export function zoneSeconds(
  timeS: readonly (number | null)[],
  values: readonly (number | null)[],
  zones: Zone[]
): number[] | null {
  const out = new Array<number>(zones.length).fill(0);
  const n = Math.min(timeS.length, values.length);
  let any = false;
  for (let i = 0; i < n - 1; i++) {
    const t0 = timeS[i];
    const t1 = timeS[i + 1];
    const value = values[i];
    if (t0 == null || t1 == null || value == null) continue;
    const dt = t1 - t0;
    if (dt <= 0) continue;
    const zi = zoneIndexOf(value, zones);
    if (zi < 0) continue;
    out[zi] += dt;
    any = true;
  }
  return any ? out.map((s) => Math.round(s)) : null;
}

/**
 * Easy (Z1-2) versus hard (Z3-5) share of a zone-seconds distribution, in whole
 * percent — the same split blocks.ts uses for polarization. The two always sum
 * to 100. Null when the distribution is empty.
 */
export function easyHardPct(zoneSec: number[]): { easyPct: number; hardPct: number } | null {
  const total = zoneSec.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  const easyPct = Math.round(((zoneSec[0] + zoneSec[1]) / total) * 100);
  return { easyPct, hardPct: 100 - easyPct };
}
