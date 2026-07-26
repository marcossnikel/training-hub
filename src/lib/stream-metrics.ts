// The derived metrics an activity's stream is worth keeping after the chart has
// taken its 400 points: efficiency factor, aerobic decoupling, normalized power
// and time in zone. Computed once — at fetch time from the full-resolution
// stream, or by the local backfill from the cached downsample — and persisted in
// `activity_metrics`, so pages read columns instead of re-integrating a stream on
// every render.
//
// Pure: no DB, no network. The efficiency factor and decoupling are the T12
// functions in analysis.ts, called with the same whole-activity inputs the
// activity page passes, so a persisted value and a freshly computed one are the
// same number. Only normalized power is new here, and only it needs full
// resolution.

import { computeDecoupling, computeEf, efBasisFor } from "./analysis";
import { isRideSport, rideMetrics } from "./cycling";
import { hrZones, paceZones, zoneSeconds, type AthleteThresholds } from "./fitness";
import type { ActivityStreams } from "./streams";
import type { Activity } from "./types";
import { isRunSport } from "./validate";

/**
 * What a stored row was computed FROM, which is the only thing that separates two
 * otherwise identical rows. Version 1 comes from the 400-point cached downsample:
 * good enough for half averages and zone integration, useless for a 30-second
 * rolling power window, so it never carries normalized power. Version 2 comes
 * from the full-resolution stream at fetch time and carries everything.
 */
export const METRICS_VERSION_DOWNSAMPLED = 1;
export const METRICS_VERSION_FULL_RES = 2;

/** The derived metrics of one activity. Every field is independently nullable. */
export interface ActivityMetrics {
  /** Efficiency factor: watts per bpm (rides with a meter) or m/min per bpm (runs). */
  ef: number | null;
  /** Aerobic decoupling, percent. */
  decouplingPct: number | null;
  /** Normalized power, watts. Rides with a real meter, at full resolution, only. */
  npW: number | null;
  /** Seconds in heart-rate zones Z1 to Z5. */
  hrZoneSecs: number[] | null;
  /** Seconds in pace zones Z1 to Z5. Runs only. */
  paceZoneSecs: number[] | null;
}

/**
 * The whole-activity figures the metrics read alongside the stream. Kept as one
 * group rather than five loose arguments because they describe a single thing —
 * the activity the stream belongs to — and because the efficiency factor is
 * defined on exactly these summary averages, not on stream integrals.
 */
export interface MetricsActivity {
  sportType: string | null;
  distanceKm: number | null;
  movingTimeS: number | null;
  avgHr: number | null;
  /** Average power from a real meter, watts. Null for every other sport. */
  powerW: number | null;
  /** Strava's `device_watts`: a real power meter recorded this activity. */
  hasRealPower: boolean;
}

/**
 * Reduces a stored activity row to the figures {@link computeStreamMetrics}
 * reads. One adapter so the fetch-time hook and the local backfill can never
 * disagree about which wattage counts as real or which average feeds the
 * efficiency factor.
 */
export function metricsActivityOf(
  activity: Pick<Activity, "sport_type" | "distance_km" | "moving_time_s" | "avg_hr" | "raw_json">
): MetricsActivity {
  const ride = rideMetrics(activity);
  return {
    sportType: activity.sport_type,
    distanceKm: activity.distance_km,
    movingTimeS: activity.moving_time_s,
    avgHr: activity.avg_hr,
    // Strava's weighted average is its own normalized power; it is the better
    // efficiency-factor numerator when present, and it is what the activity page
    // already divides by heart rate.
    powerW: ride.hasRealPower ? (ride.normalizedPower ?? ride.avgPower) : null,
    hasRealPower: ride.hasRealPower,
  };
}

/** Rolling window normalized power averages over, seconds. */
const NP_WINDOW_S = 30;

/**
 * The longest span a single sample's wattage may be credited for, seconds.
 *
 * A power trace samples every one to three seconds, so a longer step is not a
 * slow recording rate, it is a gap: auto-pause at a traffic light, a dropped
 * ANT+ connection, a tunnel. Holding the last recorded wattage across it would
 * charge the whole stop at the power going into it — a 300 W effort, a
 * 20-minute pause and a 100 W spin back home reads 287 W instead of the ~240 W
 * the recorded riding actually cost. Capped at the rolling window, so no single
 * sample can ever outweigh the window it feeds, and the trace either side of a
 * gap is spliced together rather than bridged.
 */
const MAX_SAMPLE_SPAN_S = NP_WINDOW_S;

/**
 * Normalized power: a 30-second rolling average of the power trace, then the
 * mean of those averages raised to the fourth, then the fourth root. The fourth
 * power is what makes it read as "the steady wattage that would have cost the
 * same", since physiological cost rises far faster than power does — a surging
 * ride normalizes well above its plain average, a perfectly steady one lands
 * exactly on it.
 *
 * Time-weighted rather than per-sample, so a stream with gaps or a non-1 Hz
 * recording rate is not silently mis-averaged, and no sample is credited for
 * more than {@link MAX_SAMPLE_SPAN_S} (see there). Null when the trace is
 * shorter than one window, which is why this can only be computed at full
 * resolution: the 400-point downsample of an hour-long ride steps ~9 seconds at
 * a time and would average away exactly the surges the metric exists to capture.
 */
export function normalizedPower(
  timeS: readonly (number | null)[],
  watts: readonly (number | null)[]
): number | null {
  const t: number[] = [];
  const w: number[] = [];
  const n = Math.min(timeS.length, watts.length);
  for (let i = 0; i < n; i++) {
    const time = timeS[i];
    const power = watts[i];
    if (time == null || power == null || power < 0) continue;
    // Time must advance for a segment to carry any duration.
    if (t.length > 0 && time <= t[t.length - 1]) continue;
    t.push(time);
    w.push(power);
  }
  if (t.length < 2) return null;

  // The clock the integration runs on: elapsed recorded time, with every step
  // capped at MAX_SAMPLE_SPAN_S so a recording gap is closed rather than filled
  // in at the last wattage. Identical to raw elapsed time on a stream that
  // recorded continuously, which is every stream without a pause or a dropout.
  const c: number[] = new Array(t.length);
  c[0] = 0;
  for (let i = 1; i < t.length; i++) {
    c[i] = c[i - 1] + Math.min(t[i] - t[i - 1], MAX_SAMPLE_SPAN_S);
  }
  if (c[c.length - 1] < NP_WINDOW_S) return null;

  // Sample i's power holds over [c[i], c[i+1]). `acc` is the integral of power
  // over the segments ending at or before the cursor, from c[lo] onwards; `lo`
  // trails just far enough back that the 30 s window starts inside segment lo.
  let acc = 0;
  let lo = 0;
  let quartic = 0;
  let weight = 0;
  for (let i = 1; i < c.length; i++) {
    acc += w[i - 1] * (c[i] - c[i - 1]);
    const windowStart = c[i] - NP_WINDOW_S;
    while (c[lo + 1] <= windowStart) {
      acc -= w[lo] * (c[lo + 1] - c[lo]);
      lo++;
    }
    if (windowStart < c[0]) continue;
    // Segment lo straddles the window start; drop only the part before it.
    const partial = w[lo] * (windowStart - c[lo]);
    const rolling = (acc - partial) / NP_WINDOW_S;
    const dt = c[i] - c[i - 1];
    // The fourth power and the matching fourth root ARE normalized power: a
    // square/square-root pair would be a root-mean-square and a 1/1 pair the
    // plain average, both of which under-read a surging ride. Pinned by the
    // exact-value tests in stream-metrics.test.ts.
    quartic += rolling ** 4 * dt;
    weight += dt;
  }
  if (weight <= 0) return null;
  return (quartic / weight) ** 0.25;
}

/**
 * Every derived metric of one activity, from its stream. Each is independently
 * gated, so a run with a dropped heart-rate strap still gets its pace zones and a
 * ride with no meter still gets its heart-rate zones.
 *
 * `streams` may be either resolution; pass the full-resolution stream when there
 * is one, because normalized power is the one metric that needs it (and is left
 * null when it cannot be trusted, never approximated from the downsample).
 */
export function computeStreamMetrics(
  source: { streams: ActivityStreams; activity: MetricsActivity },
  thresholds: AthleteThresholds
): ActivityMetrics {
  const { streams, activity } = source;
  const basis = efBasisFor(activity.sportType, activity.hasRealPower);

  const ef =
    basis === "power"
      ? computeEf({ basis: "power", watts: activity.powerW, avgHr: activity.avgHr })
      : basis === "speed"
        ? computeEf({
            basis: "speed",
            distanceKm: activity.distanceKm,
            movingTimeS: activity.movingTimeS,
            avgHr: activity.avgHr,
          })
        : null;

  return {
    ef,
    decouplingPct: basis
      ? computeDecoupling({ streams, basis, movingTimeS: activity.movingTimeS })
      : null,
    // Rides with a real meter only, the same gate `efBasisFor` applies to power.
    // `hasRealPower` alone is not that gate: Strava sets `device_watts` on runs
    // too (266 of them here), where the wattage is a watch's run-power model of
    // pace, not a meter reading. Normalizing it would produce a number that
    // looks like a ride's NP, is stored beside real ones, and means nothing.
    npW:
      isRideSport(activity.sportType) && activity.hasRealPower && streams.watts
        ? normalizedPower(streams.timeS, streams.watts)
        : null,
    hrZoneSecs:
      streams.heartrate && thresholds.lthr > 0
        ? zoneSeconds(streams.timeS, streams.heartrate, hrZones(thresholds))
        : null,
    paceZoneSecs:
      isRunSport(activity.sportType) && streams.paceSPerKm && thresholds.thresholdPaceSPerKm > 0
        ? zoneSeconds(streams.timeS, streams.paceSPerKm, paceZones(thresholds))
        : null,
  };
}

/**
 * True when a computed set says anything at all. An all-null row is not a
 * finding, it is an activity whose stream carried nothing usable (no heart rate,
 * no pace, no power), so storing one would only add a row every reader has to
 * fall through anyway.
 */
export function hasAnyMetric(metrics: ActivityMetrics): boolean {
  return (
    metrics.ef !== null ||
    metrics.decouplingPct !== null ||
    metrics.npW !== null ||
    metrics.hrZoneSecs !== null ||
    metrics.paceZoneSecs !== null
  );
}

/** Zone-second arrays are stored as JSON; five slots, Z1 to Z5. */
const ZONE_COUNT = 5;

/** Serializes a zone-seconds array for storage; null stays null. */
export function serializeZoneSecs(zoneSecs: number[] | null): string | null {
  return zoneSecs === null ? null : JSON.stringify(zoneSecs);
}

/**
 * Reads a stored zone-seconds array back, returning null for anything that is not
 * five finite numbers. A malformed or short array must not reach a stacked bar,
 * where it would silently shade the wrong zones; falling back to on-the-fly
 * computation is always available to the callers.
 */
export function parseZoneSecs(json: string | null): number[] | null {
  if (!json) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed) || parsed.length !== ZONE_COUNT) return null;
    if (!parsed.every((value) => typeof value === "number" && Number.isFinite(value))) return null;
    return parsed as number[];
  } catch {
    return null;
  }
}
