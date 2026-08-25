import { isRideSport } from "./cycling";
import { isRunSport } from "./validate";

/** The entire input boundary for D-015's comparable-prior-activity rule. */
export interface ComparableActivitySummary {
  id: number;
  sportType: string | null;
  startedAt: string | null;
  distanceKm: number | null;
  movingTimeS: number | null;
}

export type ComparableSportFamily = "run" | "ride";

export interface ComparableActivityMatch {
  source: ComparableActivitySummary;
  candidate: ComparableActivitySummary;
  sportFamily: ComparableSportFamily;
  distanceDifference: number;
  movingTimeDifference: number;
  signedDistanceDelta: number;
  signedMovingTimeDelta: number;
}

export type ComparableActivityResult =
  { state: "match"; match: ComparableActivityMatch } | { state: "no_match" };

export interface MatchComparablePriorActivityInput {
  source: ComparableActivitySummary;
  candidates: readonly ComparableActivitySummary[];
  /** A caller-supplied ISO instant; the matcher never reads the system clock. */
  asOf: string;
}

const RELIABLE_DISTANCE_DIFFERENCE = 0.1;
const RELIABLE_MOVING_TIME_DIFFERENCE = 0.2;
const ISO_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|([+-])(\d{2}):(\d{2}))$/;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function instantMs(value: string | null): number | null {
  if (!value) return null;
  const match = ISO_INSTANT.exec(value);
  if (!match) return null;

  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    fraction,
    zone,
    sign,
    offsetHourText,
    offsetMinuteText,
  ] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const offsetHour = offsetHourText == null ? 0 : Number(offsetHourText);
  const offsetMinute = offsetMinuteText == null ? 0 : Number(offsetMinuteText);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    return null;
  }

  const fractionalMs = fraction == null ? 0 : Number(fraction.slice(0, 3).padEnd(3, "0"));
  const local = new Date(0);
  local.setUTCFullYear(year, month - 1, day);
  local.setUTCHours(hour, minute, second, fractionalMs);
  const localMs = local.getTime();
  const offsetMinutes = offsetHour * 60 + offsetMinute;
  const signedOffsetMinutes = zone === "Z" ? 0 : sign === "+" ? offsetMinutes : -offsetMinutes;
  const timestamp = localMs - signedOffsetMinutes * 60_000;

  return Number.isFinite(timestamp) ? timestamp : null;
}

function validActivityId(id: number): boolean {
  return Number.isSafeInteger(id) && id > 0;
}

function validPositive(value: number | null): value is number {
  return value != null && Number.isFinite(value) && value > 0;
}

/**
 * D-015 deliberately reuses the current sport predicates. The run guard makes
 * a malformed value matching both predicates resolve predictably without
 * broadening either sport family.
 */
export function comparableSportFamily(sportType: string | null): ComparableSportFamily | null {
  if (isRunSport(sportType)) return "run";
  if (isRideSport(sportType)) return "ride";
  return null;
}

function usableSummary(
  activity: ComparableActivitySummary,
  asOfMs: number
): { sportFamily: ComparableSportFamily; startedAtMs: number } | null {
  if (!validActivityId(activity.id)) return null;
  if (!validPositive(activity.distanceKm) || !validPositive(activity.movingTimeS)) return null;
  const startedAtMs = instantMs(activity.startedAt);
  if (startedAtMs == null || startedAtMs > asOfMs) return null;
  const sportFamily = comparableSportFamily(activity.sportType);
  return sportFamily ? { sportFamily, startedAtMs } : null;
}

/** True only when a summary can safely enter the comparable-activity route. */
export function isComparablePriorActivitySource(
  source: ComparableActivitySummary,
  asOf: string
): boolean {
  const asOfMs = instantMs(asOf);
  return asOfMs != null && usableSummary(source, asOfMs) != null;
}

/**
 * Finds the single reliable prior activity under D-015. Selection never rounds
 * inputs or differences; display formatting belongs to the UI boundary.
 */
export function matchComparablePriorActivity({
  source,
  candidates,
  asOf,
}: MatchComparablePriorActivityInput): ComparableActivityResult {
  const asOfMs = instantMs(asOf);
  if (asOfMs == null) return { state: "no_match" };
  const sourceInfo = usableSummary(source, asOfMs);
  if (!sourceInfo || !validPositive(source.distanceKm) || !validPositive(source.movingTimeS)) {
    return { state: "no_match" };
  }

  const matches: Array<ComparableActivityMatch & { candidateStartedAtMs: number }> = [];
  for (const candidate of candidates) {
    const candidateInfo = usableSummary(candidate, asOfMs);
    if (
      !candidateInfo ||
      candidate.id === source.id ||
      candidateInfo.startedAtMs >= sourceInfo.startedAtMs
    ) {
      continue;
    }
    if (
      candidateInfo.sportFamily !== sourceInfo.sportFamily ||
      !validPositive(candidate.distanceKm) ||
      !validPositive(candidate.movingTimeS)
    ) {
      continue;
    }

    const signedDistanceDelta = (candidate.distanceKm - source.distanceKm) / source.distanceKm;
    const signedMovingTimeDelta = (candidate.movingTimeS - source.movingTimeS) / source.movingTimeS;
    const distanceDifference = Math.abs(signedDistanceDelta);
    const movingTimeDifference = Math.abs(signedMovingTimeDelta);
    if (
      distanceDifference > RELIABLE_DISTANCE_DIFFERENCE ||
      movingTimeDifference > RELIABLE_MOVING_TIME_DIFFERENCE
    ) {
      continue;
    }

    matches.push({
      source,
      candidate,
      sportFamily: sourceInfo.sportFamily,
      distanceDifference,
      movingTimeDifference,
      signedDistanceDelta,
      signedMovingTimeDelta,
      candidateStartedAtMs: candidateInfo.startedAtMs,
    });
  }

  matches.sort((left, right) => {
    if (left.distanceDifference !== right.distanceDifference) {
      return left.distanceDifference - right.distanceDifference;
    }
    if (left.movingTimeDifference !== right.movingTimeDifference) {
      return left.movingTimeDifference - right.movingTimeDifference;
    }
    if (left.candidateStartedAtMs !== right.candidateStartedAtMs) {
      return right.candidateStartedAtMs - left.candidateStartedAtMs;
    }
    return right.candidate.id - left.candidate.id;
  });

  const best = matches[0];
  if (!best) return { state: "no_match" };
  return {
    state: "match",
    match: {
      source: best.source,
      candidate: best.candidate,
      sportFamily: best.sportFamily,
      distanceDifference: best.distanceDifference,
      movingTimeDifference: best.movingTimeDifference,
      signedDistanceDelta: best.signedDistanceDelta,
      signedMovingTimeDelta: best.signedMovingTimeDelta,
    },
  };
}

export const comparableActivityThresholds = {
  distanceDifference: RELIABLE_DISTANCE_DIFFERENCE,
  movingTimeDifference: RELIABLE_MOVING_TIME_DIFFERENCE,
} as const;
