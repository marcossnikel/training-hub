// Running form metrics read out of the cached Strava payload, the run-side
// counterpart to cycling.ts's rideMetrics. Pure, sport-gated and null-safe: a
// non-run, or a manual entry with no recording, simply yields nulls and the
// tiles disappear.

import type { Activity } from "./types";
import { isRunSport } from "./validate";

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
  /** Metres per second, as Strava reports it. */
  average_speed?: number;
}

const SECONDS_PER_MINUTE = 60;
/** One leg's revolution is two steps. */
const STEPS_PER_REVOLUTION = 2;

/**
 * Cadence and the stride it implies, for runs only: doubling a walk's or a row's
 * cadence into steps per minute would invent a number, so every other sport
 * gets nulls.
 */
export function runMetrics(activity: Pick<Activity, "sport_type" | "raw_json">): RunMetrics {
  if (!isRunSport(activity.sport_type)) return { avgCadence: null, strideM: null };
  let raw: RawRun = {};
  if (activity.raw_json) {
    try {
      // Valid JSON is not necessarily an object: the string "null" parses fine
      // and then throws a TypeError on the first property read.
      const parsed: unknown = JSON.parse(activity.raw_json);
      if (parsed !== null && typeof parsed === "object") raw = parsed as RawRun;
    } catch {
      raw = {};
    }
  }
  const cadence = raw.average_cadence ?? 0;
  const avgCadence = cadence > 0 ? cadence : null;
  // Speed comes straight from the payload, like rideMetrics reads it; deriving it
  // from distance_km instead would use a distance ingest rounds to 2 decimals.
  const metresPerSecond = raw.average_speed ?? 0;
  if (avgCadence == null || metresPerSecond <= 0) {
    return { avgCadence, strideM: null };
  }
  const stepsPerSecond = (avgCadence * STEPS_PER_REVOLUTION) / SECONDS_PER_MINUTE;
  return { avgCadence, strideM: metresPerSecond / stepsPerSecond };
}
