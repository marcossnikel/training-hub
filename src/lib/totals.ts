// Period totals for the /fitness totals table: weekly and monthly volume with
// the change from the period before. Pure — bucketing and delta arithmetic only,
// no DB reads and no formatting, so the table component just lays numbers out.
//
// Every bucket is keyed by the LOCAL calendar day an activity started on, the
// same started_at -> local-day conversion dailyLoadSeries uses. Doing this in
// SQL (strftime) would group by UTC and drift every week boundary by the
// athlete's timezone offset.

import { localDateInputValue, mondayOf, parseLocalDate } from "./format";

/** Which calendar period the totals table groups by. */
export type TotalsPeriod = "weeks" | "months";

/** Pill order on /fitness; the first entry is the default. */
export const TOTALS_PERIODS: readonly TotalsPeriod[] = ["weeks", "months"];

/** How many periods the table shows. */
export const TOTALS_ROWS = 12;

/** One period's volume. Units are in the field names; nothing here is rounded. */
export interface TotalsValues {
  /** Training load (TSS) — the same sum the weekly load bars stack. */
  load: number;
  seconds: number;
  km: number;
  elevationM: number;
  sessions: number;
}

/** The value columns, in display order. */
export const TOTALS_METRICS: readonly TotalsMetric[] = [
  "load",
  "seconds",
  "km",
  "elevationM",
  "sessions",
];
export type TotalsMetric = keyof TotalsValues;

/** One confirmed activity, as the totals query hands it back. */
export interface TotalsActivity {
  /** Stored UTC instant, bucketed by its local calendar day. */
  started_at: string;
  tss: number | null;
  moving_time_s: number | null;
  distance_km: number | null;
  elevation_gain_m: number | null;
}

export interface PeriodTotals {
  /** Local day key the period starts on: its Monday (weeks) or its 1st (months). */
  start: string;
  values: TotalsValues;
  /** This period minus the period before it; null when no earlier one was loaded. */
  delta: TotalsValues | null;
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

function deltaOf(current: TotalsValues, previous: TotalsValues): TotalsValues {
  return {
    load: current.load - previous.load,
    seconds: current.seconds - previous.seconds,
    km: current.km - previous.km,
    elevationM: current.elevationM - previous.elevationM,
    sessions: current.sessions - previous.sessions,
  };
}

/**
 * Bucket activities into the `rows` periods ending with the one containing
 * today, newest first, each carrying its change from the period before. Empty
 * periods are kept as zero rows so a rest week still occupies its slot; the
 * extra oldest period `totalsFrom` loads is dropped once it has served as the
 * last row's comparison base.
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
    buckets.set(cursor, { load: 0, seconds: 0, km: 0, elevationM: 0, sessions: 0 });
    cursor = shiftPeriod(cursor, period, 1);
  }
  for (const activity of activities) {
    const day = localDateInputValue(new Date(activity.started_at));
    const bucket = buckets.get(periodStart(day, period));
    if (!bucket) continue;
    bucket.load += activity.tss ?? 0;
    bucket.seconds += activity.moving_time_s ?? 0;
    bucket.km += activity.distance_km ?? 0;
    bucket.elevationM += activity.elevation_gain_m ?? 0;
    bucket.sessions += 1;
  }
  // Map insertion order is the ascending period cursor above.
  const ascending = [...buckets.entries()];
  return ascending
    .map(([start, values], index) => ({
      start,
      values,
      delta: index === 0 ? null : deltaOf(values, ascending[index - 1][1]),
    }))
    .slice(1)
    .reverse();
}
