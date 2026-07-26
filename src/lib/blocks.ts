// Pure block-analysis engine: turns a training block's activities into weekly
// buckets, an estimated time-in-zone distribution and polarization, plus a
// race-day execution breakdown read from the per-second streams. No DB or
// network imports — the data layer feeds these functions, mirroring fitness.ts.
import { hrZones, zoneIndexOf, type AthleteThresholds } from "./fitness";
import type { ActivityStreams } from "./streams";
import { isRunSport } from "./validate";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/** The minimal activity shape the block engine reads. */
export interface BlockActivity {
  started_at: string;
  sport_type: string | null;
  distance_km: number | null;
  moving_time_s: number | null;
  avg_hr: number | null;
  avg_pace_s_per_km: number | null;
  /**
   * Seconds actually spent in each heart-rate zone, from this activity's
   * persisted stream metrics, measured on the STREAM-ELAPSED clock. Absent for
   * activities whose stream was never fetched, which is what the average-HR
   * estimate below covers.
   *
   * STALE AFTER A THRESHOLD CHANGE: the split was frozen at the LTHR in force
   * when the stream was fetched and nothing invalidates it, so after new zones
   * are applied these seconds still describe the old ones.
   * `scripts/backfill-metrics.ts --recompute --write` refreshes version-1 rows;
   * a version-2 one keeps its stale split unless it is re-fetched. Still closer
   * than the avg-HR fallback below, which drops a whole session into one zone —
   * which is exactly why this site must NOT simply discard a stale row, and part
   * of why there is still no automatic invalidation (see StoredActivityMetrics
   * in src/lib/db/metrics.ts for the rest).
   */
  hrZoneSec?: number[] | null;
}

export interface WeekBucket {
  weekIndex: number; // -N..-1, -1 = race week
  km: number;
  runKm: number;
  hours: number;
  sessions: number;
  runs: number;
  longestRunKm: number;
}

export interface BlockSummary {
  weeks: number;
  totalKm: number;
  runKm: number;
  totalHours: number;
  sessions: number;
  runs: number;
  weekly: WeekBucket[]; // length = weeks, oldest first
  zoneSec: number[]; // length 5, block-wide time-in-HR-zone from each activity's avg HR
  easySec: number; // Z1-2
  hardSec: number; // Z3-5
  polarization: number | null; // easy / hard
  qualityRuns: number; // runs whose avg HR >= Z3 lower bound
}

/**
 * Buckets a block's activities into weekly totals aligned to the race and sums
 * block-wide time-in-zone. The window is [raceStart − weeks*7d, raceStart); an
 * activity's week is floor((start − blockStart) / 7d) clamped to [0, weeks-1].
 * weekly[0] is the oldest week (weekIndex −weeks); weekly[weeks-1] is the race
 * week (weekIndex −1).
 *
 * Zone time comes from the activity's persisted per-sample distribution when
 * there is one, and otherwise from the old estimate: the whole session dropped
 * into the single zone of its average heart rate. That estimate is what an
 * interval session breaks — an average landing in Z2 hides every hard rep — so a
 * block reads truer as stream coverage grows, without waiting for all of it.
 * Activities with neither still count toward volume totals but add nothing to
 * zone time.
 *
 * Both sources are put on ONE clock — moving time — so `zoneSec`, `totalHours`
 * and `polarization` stay comparable no matter which activities in the block
 * have streams (see the rescale below). Persisted seconds are stream-elapsed as
 * stored, and the two clocks differ by a few percent.
 */
export function buildBlock(
  activities: BlockActivity[],
  raceStartIso: string,
  weeks: number,
  thresholds: AthleteThresholds
): BlockSummary {
  const raceStart = Date.parse(raceStartIso);
  const blockStart = raceStart - weeks * WEEK_MS;
  const zones = hrZones(thresholds);
  const z3Min = zones[2].min; // Z3 lower bound = quality threshold (~90% LTHR)

  const weekly: WeekBucket[] = Array.from({ length: weeks }, (_, i) => ({
    weekIndex: i - weeks,
    km: 0,
    runKm: 0,
    hours: 0,
    sessions: 0,
    runs: 0,
    longestRunKm: 0,
  }));

  const zoneSec = [0, 0, 0, 0, 0];
  let qualityRuns = 0;

  for (const a of activities) {
    const start = Date.parse(a.started_at);
    if (!Number.isFinite(start)) continue;
    let bucket = Math.floor((start - blockStart) / WEEK_MS);
    if (bucket < 0) bucket = 0;
    if (bucket > weeks - 1) bucket = weeks - 1;
    const week = weekly[bucket];

    const km = a.distance_km ?? 0;
    const secs = a.moving_time_s ?? 0;
    const run = isRunSport(a.sport_type);

    week.km += km;
    week.hours += secs / 3600;
    week.sessions += 1;
    if (run) {
      week.runs += 1;
      week.runKm += km;
      if (km > week.longestRunKm) week.longestRunKm = km;
    }

    const persisted = a.hrZoneSec;
    if (persisted && persisted.length === zoneSec.length) {
      // Persisted zone seconds are integrated over STREAM-ELAPSED time, which
      // includes whatever the watch kept recording while stopped; every other
      // total here (week.hours, totalHours) is moving time. Left as they come,
      // one block's zone total and its hours would run on two different clocks
      // (measured divergence on real activities: 0-3.8%) and polarization would
      // mix them. So the distribution is rescaled onto the moving clock: the
      // SHAPE is what the persisted array is for, and the shape is preserved
      // exactly, while the total it sums to is the same one the volume tiles
      // report. An activity with no moving time keeps its raw seconds.
      const streamSec = persisted.reduce((sum, s) => sum + s, 0);
      const toMovingClock = streamSec > 0 && secs > 0 ? secs / streamSec : 1;
      for (let i = 0; i < zoneSec.length; i++) zoneSec[i] += persisted[i] * toMovingClock;
    } else if (a.avg_hr != null) {
      const zi = zoneIndexOf(a.avg_hr, zones);
      if (zi >= 0) zoneSec[zi] += secs;
    }
    // A quality run is still judged on the session's average: it asks whether the
    // run as a whole was hard, which per-zone seconds do not answer.
    if (run && a.avg_hr != null && (z3Min == null || a.avg_hr >= z3Min)) qualityRuns += 1;
  }

  // Whole seconds: the rescale above is fractional, and a zone bar labelled in
  // minutes has no use for the remainder.
  for (let i = 0; i < zoneSec.length; i++) zoneSec[i] = Math.round(zoneSec[i]);

  const totalKm = weekly.reduce((s, w) => s + w.km, 0);
  const runKm = weekly.reduce((s, w) => s + w.runKm, 0);
  const totalHours = weekly.reduce((s, w) => s + w.hours, 0);
  const sessions = weekly.reduce((s, w) => s + w.sessions, 0);
  const runs = weekly.reduce((s, w) => s + w.runs, 0);

  const easySec = zoneSec[0] + zoneSec[1];
  const hardSec = zoneSec[2] + zoneSec[3] + zoneSec[4];
  const polarization = hardSec > 0 ? easySec / hardSec : null;

  return {
    weeks,
    totalKm,
    runKm,
    totalHours,
    sessions,
    runs,
    weekly,
    zoneSec,
    easySec,
    hardSec,
    polarization,
    qualityRuns,
  };
}

export interface RaceAnalysis {
  goalPaceSPerKm: number | null;
  actualPaceSPerKm: number | null;
  movingS: number;
  distanceKm: number;
  avgHr: number | null;
  firstHalfPaceSPerKm: number | null;
  secondHalfPaceSPerKm: number | null;
  splitDeltaS: number | null; // +ve = positive split (slowed in the second half)
  fadePct: number | null; // final quarter vs first three quarters pace, % slower
  inRaceZoneSec: number[] | null; // length 5 from the HR stream, null if absent
  atGoalSec: number | null; // within ±3 s/km of goal
  aboveGoalSec: number | null; // slower than goal
  belowGoalSec: number | null; // faster than goal
  longestAtGoalSec: number | null; // longest contiguous at-goal stretch
}

/** Last non-null value of a (monotonic) stream, or null when it is all empty. */
function lastValue(arr: (number | null)[]): number | null {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] != null) return arr[i];
  }
  return null;
}

/**
 * Elapsed time (s) at a target cumulative distance (km), linearly interpolated
 * between the two samples that straddle it. Returns the last known time when
 * the target sits beyond the final sample, or null when the grid is unusable.
 */
function timeAtDistance(
  distanceKm: (number | null)[],
  timeS: (number | null)[],
  targetKm: number
): number | null {
  let prevD: number | null = null;
  let prevT: number | null = null;
  for (let i = 0; i < distanceKm.length; i++) {
    const d = distanceKm[i];
    const t = timeS[i];
    if (d == null || t == null) continue;
    if (d >= targetKm) {
      if (prevD == null || d === prevD) return t;
      const frac = (targetKm - prevD) / (d - prevD);
      return prevT! + frac * (t - prevT!);
    }
    prevD = d;
    prevT = t;
  }
  return prevT;
}

/**
 * Race-day execution from the activity's summary plus its per-second streams.
 * Splits and fade come from the distance/time grid; time-in-zone from the HR
 * stream; the goal-pace breakdown from the pace stream against the goal pace.
 * Every stream-derived metric stays null when its source stream is missing, so
 * a race with no cached streams still returns goal/actual pace, time and HR.
 */
export function analyzeRace(
  race: {
    goal_pace_s_per_km: number | null;
    avg_pace_s_per_km: number | null;
    moving_time_s: number | null;
    distance_km: number | null;
    avg_hr: number | null;
  },
  streams: ActivityStreams | null,
  thresholds: AthleteThresholds
): RaceAnalysis {
  const goal = race.goal_pace_s_per_km;
  const result: RaceAnalysis = {
    goalPaceSPerKm: goal,
    actualPaceSPerKm: race.avg_pace_s_per_km,
    movingS: race.moving_time_s ?? 0,
    distanceKm: race.distance_km ?? 0,
    avgHr: race.avg_hr,
    firstHalfPaceSPerKm: null,
    secondHalfPaceSPerKm: null,
    splitDeltaS: null,
    fadePct: null,
    inRaceZoneSec: null,
    atGoalSec: null,
    aboveGoalSec: null,
    belowGoalSec: null,
    longestAtGoalSec: null,
  };

  if (!streams) return result;

  const { distanceKm, timeS, heartrate, paceSPerKm, n } = streams;
  const totalDist = lastValue(distanceKm);
  const totalTime = lastValue(timeS);

  // Splits and fade need a usable distance/time grid.
  if (totalDist != null && totalDist > 0 && totalTime != null && totalTime > 0) {
    const halfDist = totalDist / 2;
    const tHalf = timeAtDistance(distanceKm, timeS, halfDist);
    if (tHalf != null && tHalf > 0 && tHalf < totalTime) {
      const first = tHalf / halfDist;
      const second = (totalTime - tHalf) / (totalDist - halfDist);
      result.firstHalfPaceSPerKm = Math.round(first);
      result.secondHalfPaceSPerKm = Math.round(second);
      result.splitDeltaS = Math.round(second - first);
    }
    const q3Dist = totalDist * 0.75;
    const tQ3 = timeAtDistance(distanceKm, timeS, q3Dist);
    if (tQ3 != null && tQ3 > 0 && tQ3 < totalTime) {
      const first75 = tQ3 / q3Dist;
      const last25 = (totalTime - tQ3) / (totalDist - q3Dist);
      if (first75 > 0) {
        result.fadePct = Math.round(((last25 - first75) / first75) * 1000) / 10;
      }
    }
  }

  // In-race time-in-zone: sum the time delta of each sample into its HR zone.
  if (heartrate) {
    const zones = hrZones(thresholds);
    const zoneSec = [0, 0, 0, 0, 0];
    let any = false;
    for (let i = 1; i < n; i++) {
      const t0 = timeS[i - 1];
      const t1 = timeS[i];
      const hr = heartrate[i];
      if (t0 == null || t1 == null || hr == null) continue;
      const dt = t1 - t0;
      if (dt <= 0) continue;
      const zi = zoneIndexOf(hr, zones);
      if (zi >= 0) {
        zoneSec[zi] += dt;
        any = true;
      }
    }
    if (any) result.inRaceZoneSec = zoneSec.map((s) => Math.round(s));
  }

  // Goal-pace breakdown: at goal = within ±3 s/km, below (faster) = pace <
  // goal−3, above (slower) = pace > goal+3. Longest at-goal is the longest
  // contiguous run of at-goal samples by summed time delta.
  if (paceSPerKm && goal != null) {
    let atGoal = 0;
    let aboveGoal = 0;
    let belowGoal = 0;
    let longestAt = 0;
    let currentAt = 0;
    let any = false;
    for (let i = 1; i < n; i++) {
      const t0 = timeS[i - 1];
      const t1 = timeS[i];
      const pace = paceSPerKm[i];
      if (t0 == null || t1 == null || pace == null) {
        currentAt = 0;
        continue;
      }
      const dt = t1 - t0;
      if (dt <= 0) continue;
      any = true;
      if (Math.abs(pace - goal) <= 3) {
        atGoal += dt;
        currentAt += dt;
        if (currentAt > longestAt) longestAt = currentAt;
      } else {
        currentAt = 0;
        if (pace < goal - 3) belowGoal += dt;
        else aboveGoal += dt;
      }
    }
    if (any) {
      result.atGoalSec = Math.round(atGoal);
      result.aboveGoalSec = Math.round(aboveGoal);
      result.belowGoalSec = Math.round(belowGoal);
      result.longestAtGoalSec = Math.round(longestAt);
    }
  }

  return result;
}
