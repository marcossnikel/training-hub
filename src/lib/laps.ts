// Places a Strava activity's laps on the clock its cached stream is plotted
// against, so a lap can be drawn over the stream chart instead of living in a
// table that shares no axis with it. Pure (no DB, no UI): the activity page
// builds the windows server-side and the chart maps them through its x-scale.

import type { StravaLap } from "./strava";

/**
 * One lap as a half-open window of elapsed seconds since the activity started,
 * which is exactly what `ActivityStreams.timeS` counts. `label` is the lap's own
 * number, rendered next to a translated "Lap" word rather than carrying one.
 */
export interface LapWindow {
  label: string;
  startS: number;
  endS: number;
}

/** A lap's own duration in seconds; elapsed time, since the stream clock runs through pauses. */
function durationOf(lap: StravaLap): number | null {
  const elapsed = lap.elapsed_time ?? 0;
  if (elapsed > 0) return elapsed;
  const moving = lap.moving_time ?? 0;
  return moving > 0 ? moving : null;
}

/** Epoch seconds of a lap's start instant, or null when Strava sent no parseable date. */
function startedAt(lap: StravaLap | undefined): number | null {
  if (!lap?.start_date) return null;
  const ms = Date.parse(lap.start_date);
  return Number.isFinite(ms) ? ms / 1000 : null;
}

/**
 * The epoch second the stream's clock reads zero at, taken from the first lap
 * that carries a usable date and rolled back past the durations of the laps
 * before it.
 *
 * Reading the base off `laps[0]` alone meant a single missing or unparseable
 * `start_date` at the head of the list silently disabled date-based placement
 * for the whole activity, reinstating exactly the drift documented below even
 * though every later lap was dated.
 */
function clockBase(laps: StravaLap[]): number | null {
  let before = 0;
  for (const lap of laps) {
    const started = startedAt(lap);
    if (started != null) return started - before;
    // A lap with no duration is dropped from the windows as well, so this
    // cursor stays in step with the one `lapWindows` walks the laps with.
    before += durationOf(lap) ?? 0;
  }
  return null;
}

/**
 * Lap windows on the stream's clock, in lap order, dropping any lap whose
 * duration Strava never reported.
 *
 * A lap's start is its `start_date` offset from the clock base whenever the date
 * parses, and only otherwise the sum of the durations before it. That order is
 * deliberate: consecutive laps do not quite abut in the source fields, because
 * Strava truncates `start_date` and `elapsed_time` to whole seconds
 * independently, so lap i's start plus its elapsed time usually lands a second
 * short of lap i+1's start. Measured across all 248 cached laps, 217 of the 227
 * inter-lap gaps are 0 to 2 s and only one is a genuine device pause (61 s, on
 * activity 17) — the everyday gap is rounding, not auto-pause. It still
 * accumulates at roughly a second a lap: on activity 1246 the summed durations
 * end 15 s short of the 52-minute session's last sample (3123 s vs 3138 s) while
 * the date offsets land within a second of it — enough drift to visibly shift
 * the last laps of an interval session away from the intervals they mark.
 *
 * Starts are forced to run forward: a lap can never begin before the previous
 * one ended, so the windows never overlap however rounded the source dates are
 * (5 of those 227 gaps are negative).
 */
export function lapWindows(laps: StravaLap[]): LapWindow[] {
  const base = clockBase(laps);
  const windows: LapWindow[] = [];
  let cursor = 0;
  for (let i = 0; i < laps.length; i++) {
    const lap = laps[i];
    const duration = durationOf(lap);
    if (duration == null) continue;
    const started = startedAt(lap);
    const offset = base != null && started != null ? Math.max(0, started - base) : null;
    const startS = Math.max(offset ?? cursor, cursor);
    const endS = startS + duration;
    windows.push({ label: String(lap.lap_index ?? i + 1), startS, endS });
    cursor = endS;
  }
  return windows;
}

/**
 * The cumulative distance a stream had covered at `atS` seconds, interpolated
 * between the two samples that bracket it — the conversion a lap window needs to
 * be drawn on the chart's distance axis. Times outside the stream's own range
 * clamp to its first or last distance (a lap's last second can sit a rounding
 * error past the final sample). Null when the stream has no sample carrying both
 * a time and a distance.
 */
export function distanceAtTime(
  timeS: (number | null)[],
  distanceKm: (number | null)[],
  atS: number
): number | null {
  // The last sample strictly before atS; null until one is seen, which also
  // means the first valid sample at or after atS is the clamp for an early time.
  let prevT: number | null = null;
  let prevD = 0;
  for (let i = 0; i < timeS.length; i++) {
    const t = timeS[i];
    const d = distanceKm[i];
    if (t == null || d == null) continue;
    if (t >= atS) {
      if (prevT == null) return d;
      return prevD + ((d - prevD) * (atS - prevT)) / (t - prevT);
    }
    prevT = t;
    prevD = d;
  }
  return prevT == null ? null : prevD;
}
