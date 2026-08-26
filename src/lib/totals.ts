// Period totals for the Performance page: weekly and monthly volume with
// the period before it to compare against. Pure — bucketing only, no DB reads and
// no formatting, so the table component just lays numbers out.
//
// Every bucket is keyed by the athlete's own calendar day: Strava's naive-local
// `started_at_local` when the row carries one (localStartedAt), else the UTC
// instant `started_at`. The day is read off that stamp with UTC getters, so the
// key is the athlete's real local day and is identical in every process timezone
// — the local-stamp-first convention the training log reads days by, and exactly
// the day key used consistently across analysis modules. Doing this in SQL (strftime) would
// group by UTC and drift every period boundary by the athlete's timezone offset.
//
// Residual, deliberately out of scope here: dailyLoadSeries and weeklySportLoad
// in src/lib/fitness.ts still key off `started_at` alone (and with local
// getters), so as `started_at_local` fills in on synced rows the Performance weekly
// load bar can drift from this table by a period boundary. Migrating those
// rewrites PMC history and is its own task.

import { activityDay } from "./activity-day";
import { localDateInputValue, mondayOf, parseLocalDate } from "./format";
import { sportCategory } from "./sports";

/** Which calendar period the totals table groups by. */
export type TotalsPeriod = "weeks" | "months";

/** Pill order on Performance; the first entry is the default. */
export const TOTALS_PERIODS: readonly TotalsPeriod[] = ["weeks", "months"];

/** How many periods the table shows. */
export const TOTALS_ROWS = 12;

/**
 * The sport buckets the filter offers. Runs and rides keep their own column;
 * everything else folds into "other". Lived in fitness.ts until the training-load
 * engine was removed; it is pure sport bucketing, nothing to do with load.
 */
export type TotalsSport = "run" | "bike" | "other";

/** Buckets a raw Strava sport_type into the sport it filters under. */
export function totalsSport(sport: string | null | undefined): TotalsSport {
  const category = sportCategory(sport);
  return category === "run" || category === "bike" ? category : "other";
}

/** One period's volume. Units are in the field names; nothing here is rounded. */
export interface TotalsValues {
  seconds: number;
  km: number;
  elevationM: number;
  sessions: number;
}

/** The value columns, in display order. */
export const TOTALS_METRICS: readonly TotalsMetric[] = ["seconds", "km", "elevationM", "sessions"];
export type TotalsMetric = keyof TotalsValues;

/** One confirmed activity, as the totals query hands it back. */
export interface TotalsActivity {
  /** Stored UTC instant; the fallback day source when no local stamp was captured. */
  started_at: string;
  /** Strava's naive-local wall-clock stamp, the day this row is bucketed by. */
  started_at_local: string | null;
  /** Raw Strava sport, bucketed by `totalsSport` for the sport filter. */
  sport_type: string | null;
  moving_time_s: number | null;
  distance_km: number | null;
  elevation_gain_m: number | null;
}

export interface PeriodTotals {
  /** Local day key the period starts on: its Monday (weeks) or its 1st (months). */
  start: string;
  values: TotalsValues;
  /**
   * The period immediately before this one, which the table's deltas are read
   * against. Never absent: `totalsFrom` loads one period more than the table
   * shows precisely so the oldest displayed row has a base too.
   */
  previous: TotalsValues;
}

/**
 * The athlete's calendar day an activity counts on, as a YYYY-MM-DD key. Slicing
 * the Z-suffixed stamp is the UTC-getter read localStartedAt's contract asks for,
 * so the key never moves with the process timezone.
 */
/**
 * The rows an active sport filter keeps.
 * on what counts as that sport instead of only roughly matching.
 */
export function filterBySport(
  activities: TotalsActivity[],
  sport: TotalsSport | "all"
): TotalsActivity[] {
  if (sport === "all") return activities;
  return activities.filter((activity) => totalsSport(activity.sport_type) === sport);
}

/** The local day key of the start of the period containing `day`. */
function periodStart(day: string, period: TotalsPeriod): string {
  if (period === "months") return `${day.slice(0, 7)}-01`;
  return localDateInputValue(mondayOf(parseLocalDate(day)));
}

/** Shift a period start by whole periods (negative goes back in time). */
function shiftPeriod(start: string, period: TotalsPeriod, periods: number): string {
  const date = parseLocalDate(start);
  if (period === "months") date.setMonth(date.getMonth() + periods);
  else date.setDate(date.getDate() + periods * 7);
  return localDateInputValue(date);
}

/**
 * The local day the totals query must read from. One period more than the table
 * displays, so even the oldest displayed row has a previous period to compare
 * against.
 */
export function totalsFrom(period: TotalsPeriod, rows = TOTALS_ROWS, now = new Date()): string {
  return shiftPeriod(periodStart(localDateInputValue(now), period), period, -rows);
}

/**
 * Bucket activities into the `rows` periods ending with the one containing
 * today, newest first, each carrying the period before it to compare against.
 * Empty periods are kept as zero rows so a rest week still occupies its slot;
 * the extra oldest period `totalsFrom` loads is dropped once it has served as
 * the last row's comparison base.
 */
export function periodTotals(
  activities: TotalsActivity[],
  period: TotalsPeriod,
  rows = TOTALS_ROWS,
  now = new Date()
): PeriodTotals[] {
  const buckets = new Map<string, TotalsValues>();
  const last = periodStart(localDateInputValue(now), period);
  let cursor = totalsFrom(period, rows, now);
  while (cursor <= last) {
    buckets.set(cursor, { seconds: 0, km: 0, elevationM: 0, sessions: 0 });
    cursor = shiftPeriod(cursor, period, 1);
  }
  for (const activity of activities) {
    const bucket = buckets.get(periodStart(activityDay(activity), period));
    if (!bucket) continue;
    bucket.seconds += activity.moving_time_s ?? 0;
    bucket.km += activity.distance_km ?? 0;
    bucket.elevationM += activity.elevation_gain_m ?? 0;
    bucket.sessions += 1;
  }
  // Map insertion order is the ascending period cursor above. Dropping the first
  // entry first leaves every remaining row with a predecessor at the same index
  // in `ascending`, so `previous` is always a real period.
  const ascending = [...buckets.entries()];
  return ascending
    .slice(1)
    .map(([start, values], index) => ({ start, values, previous: ascending[index][1] }))
    .reverse();
}
