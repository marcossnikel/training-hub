/**
 * Pure deterministic weekly-brief rules. Callers must supply activities already
 * authorized for one owner; this module intentionally has no owner identifier,
 * database import, or clock-dependent "current week" behaviour.
 */

export const WEEKLY_BRIEF_KINDS = [
  "training_time_change",
  "session_frequency_change",
  "sport_mix_change",
  "longest_session_concentration",
] as const;

export type WeeklyBriefKind = (typeof WEEKLY_BRIEF_KINDS)[number];

export interface WeeklyBriefActivity {
  id: string | number;
  /** Stored instant, used only when the local stamp was not recorded. */
  startedAt: string | null;
  /** Naive local timestamp stored with a Z suffix, matching the totals layer. */
  startedAtLocal?: string | null;
  sportType: string | null;
  movingTimeS: number | null;
  distanceKm?: number | null;
  confirmed: boolean;
}

export interface WeeklyBriefInput {
  /** Monday (YYYY-MM-DD) of a week the caller has already established is complete. */
  asOfWeekStart: string;
  activities: readonly WeeklyBriefActivity[];
}

export interface WeeklyBriefWindow {
  start: string;
  end: string;
}

export interface WeeklyBriefSource {
  id: string | number;
  date: string;
  sportType: string | null;
  movingTimeS: number;
  distanceKm: number | null;
}

interface BaseObservation {
  kind: WeeklyBriefKind;
  currentWindow: WeeklyBriefWindow;
  baselineWindow: WeeklyBriefWindow;
  baselineWeeksWithActivity: number;
  limitation: string | null;
  sources: { current: WeeklyBriefSource[]; baseline: WeeklyBriefSource[] };
  copy: string;
}

export interface TrainingTimeObservation extends BaseObservation {
  kind: "training_time_change";
  values: { currentMovingTimeS: number; baselineMedianMovingTimeS: number; changePercent: number };
}

export interface SessionFrequencyObservation extends BaseObservation {
  kind: "session_frequency_change";
  values: {
    currentSessions: number;
    baselineMedianSessions: number;
    changeCount: number;
    changePercent: number;
  };
}

export interface SportMixObservation extends BaseObservation {
  kind: "sport_mix_change";
  values: {
    sportType: string;
    currentSportMovingTimeS: number;
    currentShare: number;
    baselineSportMovingTimeS: number;
    baselineMovingTimeS: number;
    baselineShare: number;
    changePercentagePoints: number;
  };
}

export interface LongestSessionObservation extends BaseObservation {
  kind: "longest_session_concentration";
  values: {
    weeklyMovingTimeS: number;
    longestSessionMovingTimeS: number;
    longestSessionShare: number;
  };
}

export type WeeklyBriefObservation =
  | TrainingTimeObservation
  | SessionFrequencyObservation
  | SportMixObservation
  | LongestSessionObservation;

export type WeeklyBriefResult = {
  state: "observations" | "no_material_change" | "insufficient_history";
  currentWindow: WeeklyBriefWindow;
  baselineWindow: WeeklyBriefWindow;
  baselineWeeksWithActivity: number;
  observations: WeeklyBriefObservation[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const BASELINE_WEEKS = 4;
const MIN_BASELINE_WEEKS = 3;

function parseDay(day: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day ? null : date;
}

function dayAfter(day: string, days: number): string {
  const date = parseDay(day);
  if (!date) throw new Error(`Invalid local day: ${day}`);
  return new Date(date.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function window(start: string, weeks: number): WeeklyBriefWindow {
  return { start, end: dayAfter(start, weeks * 7) };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function localDay(activity: WeeklyBriefActivity): string | null {
  const stamp = activity.startedAtLocal ?? activity.startedAt;
  const day = stamp?.slice(0, 10);
  return day && parseDay(day) ? day : null;
}

function source(activity: ValidActivity): WeeklyBriefSource {
  return {
    id: activity.id,
    date: activity.day,
    sportType: activity.sportType,
    movingTimeS: activity.movingTimeS,
    distanceKm: activity.distanceKm,
  };
}

function sourceOrder(a: WeeklyBriefSource, b: WeeklyBriefSource): number {
  return a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id));
}

interface ValidActivity extends Omit<WeeklyBriefActivity, "movingTimeS" | "distanceKm"> {
  movingTimeS: number;
  distanceKm: number | null;
  day: string;
}

function validActivities(activities: readonly WeeklyBriefActivity[]): ValidActivity[] {
  return activities.flatMap((activity) => {
    const day = localDay(activity);
    const movingTimeS = activity.movingTimeS;
    if (
      !activity.confirmed ||
      !day ||
      !Number.isFinite(movingTimeS) ||
      movingTimeS === null ||
      movingTimeS <= 0
    )
      return [];
    return [{ ...activity, movingTimeS, distanceKm: activity.distanceKm ?? null, day }];
  });
}

function inWindow(activity: ValidActivity, range: WeeklyBriefWindow): boolean {
  return activity.day >= range.start && activity.day < range.end;
}

function rounded(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function percent(value: number, baseline: number): number {
  return rounded(((value - baseline) / baseline) * 100);
}

function hoursMinutes(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`
    : `${minutes}m`;
}

function signedPercent(value: number): string {
  return `${value > 0 ? "+" : ""}${Math.round(value)}%`;
}

function limitation(baselineWeeksWithActivity: number): string | null {
  return baselineWeeksWithActivity === MIN_BASELINE_WEEKS
    ? "Baseline has activity in 3 of the previous 4 completed weeks."
    : null;
}

const kindRank = new Map<WeeklyBriefKind, number>(
  WEEKLY_BRIEF_KINDS.map((kind, index) => [kind, index])
);

interface Candidate {
  observation: WeeklyBriefObservation;
  strength: number;
}

function earliestSource(observation: WeeklyBriefObservation): WeeklyBriefSource {
  return [...observation.sources.current, ...observation.sources.baseline].sort(sourceOrder)[0];
}

function select(candidates: Candidate[]): WeeklyBriefObservation[] {
  const ordered = candidates.sort((a, b) => {
    const sourceA = earliestSource(a.observation);
    const sourceB = earliestSource(b.observation);
    return (
      b.strength - a.strength ||
      kindRank.get(a.observation.kind)! - kindRank.get(b.observation.kind)! ||
      sourceOrder(sourceA, sourceB)
    );
  });
  const observations: WeeklyBriefObservation[] = [];
  let changeSelected = false;
  let contextSelected = false;
  for (const candidate of ordered) {
    const isChange =
      candidate.observation.kind === "training_time_change" ||
      candidate.observation.kind === "session_frequency_change";
    if ((isChange && changeSelected) || (!isChange && contextSelected)) continue;
    observations.push(candidate.observation);
    if (isChange) changeSelected = true;
    else contextSelected = true;
    if (observations.length === 3) break;
  }
  return observations;
}

/** Evaluates only the supplied completed week and the four preceding completed weeks. */
export function buildWeeklyBrief(input: WeeklyBriefInput): WeeklyBriefResult {
  const currentStart = parseDay(input.asOfWeekStart);
  if (!currentStart || currentStart.getUTCDay() !== 1) {
    throw new Error("asOfWeekStart must be a valid Monday in YYYY-MM-DD form");
  }
  const currentWindow = window(input.asOfWeekStart, 1);
  const baselineWindow = window(dayAfter(input.asOfWeekStart, -7 * BASELINE_WEEKS), BASELINE_WEEKS);
  const activities = validActivities(input.activities);
  const current = activities.filter((activity) => inWindow(activity, currentWindow));
  const baseline = activities.filter((activity) => inWindow(activity, baselineWindow));
  const baselineWeeks = Array.from({ length: BASELINE_WEEKS }, (_, index) =>
    window(dayAfter(input.asOfWeekStart, -7 * (BASELINE_WEEKS - index)), 1)
  );
  const baselineWeeksWithActivity = baselineWeeks.filter((week) =>
    baseline.some((activity) => inWindow(activity, week))
  ).length;
  const resultBase = { currentWindow, baselineWindow, baselineWeeksWithActivity };
  if (baselineWeeksWithActivity < MIN_BASELINE_WEEKS) {
    return { state: "insufficient_history", observations: [], ...resultBase };
  }

  const currentSeconds = current.reduce((sum, activity) => sum + activity.movingTimeS, 0);
  const currentSessions = current.length;
  const baselineSeconds = baselineWeeks.map((week) =>
    baseline
      .filter((activity) => inWindow(activity, week))
      .reduce((sum, activity) => sum + activity.movingTimeS, 0)
  );
  const baselineSessions = baselineWeeks.map(
    (week) => baseline.filter((activity) => inWindow(activity, week)).length
  );
  const baselineMedianSeconds = median(
    baselineSeconds.filter((_, index) =>
      baseline.some((activity) => inWindow(activity, baselineWeeks[index]))
    )
  );
  const baselineMedianSessions = median(
    baselineSessions.filter((_, index) =>
      baseline.some((activity) => inWindow(activity, baselineWeeks[index]))
    )
  );
  const sources = {
    current: current.map(source).sort(sourceOrder),
    baseline: baseline.map(source).sort(sourceOrder),
  };
  const common = { ...resultBase, limitation: limitation(baselineWeeksWithActivity), sources };
  const candidates: Candidate[] = [];

  if (currentSeconds >= 60 * 60 && baselineMedianSeconds > 0) {
    const changePercent = percent(currentSeconds, baselineMedianSeconds);
    if (Math.abs(changePercent) >= 20) {
      candidates.push({
        strength: Math.abs(changePercent) / 20,
        observation: {
          kind: "training_time_change",
          ...common,
          values: {
            currentMovingTimeS: currentSeconds,
            baselineMedianMovingTimeS: baselineMedianSeconds,
            changePercent,
          },
          copy: `Moving time was ${signedPercent(changePercent)} (${hoursMinutes(currentSeconds)} in ${currentWindow.start}–${dayAfter(currentWindow.end, -1)} versus a ${hoursMinutes(baselineMedianSeconds)} median across ${baselineWindow.start}–${dayAfter(baselineWindow.end, -1)}).`,
        },
      });
    }
  }

  if (currentSessions >= 2 && baselineMedianSessions > 0) {
    const changeCount = currentSessions - baselineMedianSessions;
    const changePercent = percent(currentSessions, baselineMedianSessions);
    if (Math.abs(changeCount) >= 1 && Math.abs(changePercent) >= 25) {
      candidates.push({
        strength: Math.max(Math.abs(changeCount), Math.abs(changePercent) / 25),
        observation: {
          kind: "session_frequency_change",
          ...common,
          values: { currentSessions, baselineMedianSessions, changeCount, changePercent },
          copy: `Confirmed sessions were ${currentSessions} in ${currentWindow.start}–${dayAfter(currentWindow.end, -1)}, ${signedPercent(changePercent)} versus the ${baselineMedianSessions}-session median across ${baselineWindow.start}–${dayAfter(baselineWindow.end, -1)}.`,
        },
      });
    }
  }

  const baselineTotalSeconds = baseline.reduce((sum, activity) => sum + activity.movingTimeS, 0);
  if (currentSeconds >= 90 * 60 && baselineTotalSeconds >= 90 * 60) {
    for (const sportType of [
      ...new Set(
        current
          .map((activity) => activity.sportType)
          .filter((sport): sport is string => Boolean(sport))
      ),
    ].sort()) {
      const currentSportSeconds = current
        .filter((activity) => activity.sportType === sportType)
        .reduce((sum, activity) => sum + activity.movingTimeS, 0);
      if (currentSportSeconds < 30 * 60) continue;
      const baselineSportSeconds = baseline
        .filter((activity) => activity.sportType === sportType)
        .reduce((sum, activity) => sum + activity.movingTimeS, 0);
      const currentShare = rounded(currentSportSeconds / currentSeconds);
      const baselineShare = rounded(baselineSportSeconds / baselineTotalSeconds);
      const changePercentagePoints = rounded((currentShare - baselineShare) * 100);
      if (Math.abs(changePercentagePoints) < 20) continue;
      candidates.push({
        strength: Math.abs(changePercentagePoints) / 20,
        observation: {
          kind: "sport_mix_change",
          ...common,
          values: {
            sportType,
            currentSportMovingTimeS: currentSportSeconds,
            currentShare,
            baselineSportMovingTimeS: baselineSportSeconds,
            baselineMovingTimeS: baselineTotalSeconds,
            baselineShare,
            changePercentagePoints,
          },
          copy: `${sportType} represented ${Math.round(currentShare * 100)}% of moving time in ${currentWindow.start}–${dayAfter(currentWindow.end, -1)}, compared with ${Math.round(baselineShare * 100)}% across ${baselineWindow.start}–${dayAfter(baselineWindow.end, -1)} (${signedPercent(changePercentagePoints)} percentage points).`,
        },
      });
    }
  }

  const longest = [...current].sort(
    (a, b) =>
      b.movingTimeS - a.movingTimeS ||
      a.day.localeCompare(b.day) ||
      String(a.id).localeCompare(String(b.id))
  )[0];
  if (longest && currentSeconds >= 120 * 60 && longest.movingTimeS >= 45 * 60) {
    const longestSessionShare = rounded(longest.movingTimeS / currentSeconds);
    if (longestSessionShare >= 0.4) {
      candidates.push({
        strength: longestSessionShare / 0.4,
        observation: {
          kind: "longest_session_concentration",
          ...common,
          values: {
            weeklyMovingTimeS: currentSeconds,
            longestSessionMovingTimeS: longest.movingTimeS,
            longestSessionShare,
          },
          copy: `The longest confirmed session was ${hoursMinutes(longest.movingTimeS)} on ${longest.day}, representing ${Math.round(longestSessionShare * 100)}% of ${hoursMinutes(currentSeconds)} in ${currentWindow.start}–${dayAfter(currentWindow.end, -1)}.`,
        },
      });
    }
  }

  const observations = select(candidates);
  return {
    state: observations.length === 0 ? "no_material_change" : "observations",
    observations,
    ...resultBase,
  };
}
