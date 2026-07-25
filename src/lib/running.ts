// Running form metrics read out of the cached Strava payload, the run-side
// counterpart to cycling.ts's rideMetrics. Pure and null-safe: a manual entry
// with no recording simply yields nulls and the tiles disappear.

import type { Activity } from "./types";

export interface RunMetrics {
  /**
   * Strava's `average_cadence`: one leg's revolutions per minute, the same field
   * a bike fills with rpm. `fmtStepRate` doubles it into steps per minute, the
   * convention the laps table already renders with.
   */
  avgCadence: number | null;
  /** Metres covered per step at the session's average speed. */
  strideM: number | null;
}

interface RawRun {
  average_cadence?: number;
}

const SECONDS_PER_MINUTE = 60;
const METRES_PER_KM = 1000;
/** One leg's revolution is two steps. */
const STEPS_PER_REVOLUTION = 2;

export function runMetrics(
  activity: Pick<Activity, "raw_json" | "distance_km" | "moving_time_s">
): RunMetrics {
  let raw: RawRun = {};
  if (activity.raw_json) {
    try {
      raw = JSON.parse(activity.raw_json) as RawRun;
    } catch {
      raw = {};
    }
  }
  const cadence = raw.average_cadence ?? 0;
  const avgCadence = cadence > 0 ? cadence : null;
  const distanceKm = activity.distance_km ?? 0;
  const movingTimeS = activity.moving_time_s ?? 0;
  if (avgCadence == null || distanceKm <= 0 || movingTimeS <= 0) {
    return { avgCadence, strideM: null };
  }
  const metresPerSecond = (distanceKm * METRES_PER_KM) / movingTimeS;
  const stepsPerSecond = (avgCadence * STEPS_PER_REVOLUTION) / SECONDS_PER_MINUTE;
  return { avgCadence, strideM: metresPerSecond / stepsPerSecond };
}
