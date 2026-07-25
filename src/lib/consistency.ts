// The /fitness consistency heatmap: a GitHub-style trailing-year grid of daily
// training load, plus the two numbers that sit beside its title (current streak
// and active days per week). Pure — grid layout, quartile bucketing and the
// counters only, so the component just fills rects and formats labels.
//
// DAY-KEY CONVENTION, the one landmine here. Every key below is the key
// `dailyLoadSeries` (src/lib/fitness.ts) produces: `localDateInputValue(new
// Date(started_at))`, i.e. the stored UTC instant read in the PROCESS timezone.
// That is deliberate and not a third convention: the loads this grid paints ARE
// dailyLoadSeries' output (already computed on /fitness), so the session count
// drawn inside the same cell has to be bucketed by that identical key or a count
// would land on a different day than its load.
//
// The app's other convention — `localStartedAt`, the athlete's own local day,
// which the training log, src/lib/insights.ts and src/lib/totals.ts read days by
// — is intentionally NOT used here. Mixing the two is precisely the bug: an
// evening session whose UTC instant has already rolled over would be counted one
// day later than the load it belongs to. Session counts are therefore grouped in
// JS from raw `started_at` stamps rather than with a SQL GROUP BY: strftime
// groups by UTC (and `substr(started_at, 1, 10)` only matches this convention
// while the server itself runs in UTC), so neither can key the same cell.

import { eachDay, localDateInputValue, mondayOf, parseLocalDate } from "./format";

/** Grid width in weeks: 53 columns cover a full year plus the partial current week. */
export const HEATMAP_WEEKS = 53;

/** Grid height: one row per weekday, row 0 = Monday (the app's week start). */
export const DAYS_PER_WEEK = 7;

/** Weeks the active-days-per-week figure averages over. */
export const ACTIVE_WEEKS = 4;

/** One confirmed session's start, as the heatmap's session query hands it back. */
export interface SessionStart {
  /** Stored UTC instant, bucketed by the convention documented above. */
  started_at: string;
  /** Raw Strava sport, so an active sport filter narrows these rows too. */
  sport_type: string | null;
}

/** Load bucket of a day: 0 = no load, 1–4 = quartile of the year's active days. */
export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export interface HeatmapCell {
  /** Local day key, YYYY-MM-DD. */
  date: string;
  /** That day's total training load (TSS). */
  load: number;
  sessions: number;
  level: HeatLevel;
  /** 0-based week column, oldest week first. */
  column: number;
  /** 0-based weekday row, 0 = Monday. */
  row: number;
}

/** A month's label position: which column its 1st falls in. */
export interface HeatmapMonth {
  /** 0-based month index, for `monthShort`. */
  month: number;
  column: number;
}

export interface ConsistencyHeatmap {
  columns: number;
  rows: number;
  /**
   * Every day from the grid's first Monday through today, ascending. Days after
   * today have no cell at all, so the current week ends where the year does
   * instead of trailing empty squares.
   */
  cells: HeatmapCell[];
  months: HeatmapMonth[];
  /** Consecutive days with load, ending today (see `currentStreak`). */
  streak: number;
  /** Days with load per week over the trailing `ACTIVE_WEEKS` weeks, unrounded. */
  activeDaysPerWeek: number;
}

/** Shift a local day key by whole days. */
function shiftDay(key: string, days: number): string {
  const date = parseLocalDate(key);
  date.setDate(date.getDate() + days);
  return localDateInputValue(date);
}

/** The grid's first column: the Monday HEATMAP_WEEKS - 1 weeks before this one. */
function firstMonday(now: Date): string {
  const monday = mondayOf(now);
  monday.setDate(monday.getDate() - (HEATMAP_WEEKS - 1) * DAYS_PER_WEEK);
  return localDateInputValue(monday);
}

/**
 * The local day the heatmap's session query reads from: one day ahead of the
 * grid's first column. The slack is deliberate — the day key is read in the
 * process timezone while the query bound is a UTC instant, so a session on the
 * grid's first day can be stored under the previous day's instant (or the day
 * after's). Bucketing then drops whatever lands outside the grid.
 */
export function heatmapFrom(now = new Date()): string {
  return shiftDay(firstMonday(now), -1);
}

/** Per-day session counts, keyed by the day convention documented at the top. */
export function sessionCountsByDay(sessions: SessionStart[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const session of sessions) {
    const key = localDateInputValue(new Date(session.started_at));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Linear-interpolated quantile of an ascending, non-empty list. */
function quantile(sorted: number[], p: number): number {
  const index = (sorted.length - 1) * p;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
}

/**
 * The three inner quartile cut points of the displayed year's ACTIVE days (load
 * above zero). Rest days are excluded on purpose: including them in a year with
 * many of them would push every real session into the top buckets.
 *
 * Null when the year has no load at all, which is the caller's signal that every
 * cell is an empty one.
 */
function loadQuartiles(loads: number[]): [number, number, number] | null {
  const active = loads.filter((load) => load > 0).sort((a, b) => a - b);
  if (active.length === 0) return null;
  return [quantile(active, 0.25), quantile(active, 0.5), quantile(active, 0.75)];
}

/**
 * A day's bucket from the year's cuts. A load exactly ON a cut takes the LOWER
 * bucket (`<=`), so the day at the median reads as a level-2 day.
 *
 * When every active day of the displayed year carries the same load — or there is
 * exactly one active day — all three cuts collapse onto that value, and `<=`
 * would paint the hardest day of the year at the faintest step, nearly
 * indistinguishable from a rest day. An active day that is the year's only load
 * level is a top day, so the collapsed case goes to 4.
 */
function levelOf(load: number, quartiles: [number, number, number] | null): HeatLevel {
  if (load <= 0 || quartiles == null) return 0;
  if (quartiles[0] === quartiles[2]) return 4;
  if (load <= quartiles[0]) return 1;
  if (load <= quartiles[1]) return 2;
  if (load <= quartiles[2]) return 3;
  return 4;
}

/**
 * Consecutive days carrying load, counted back from today. A day that has no
 * load yet does not end the streak while it is still today — before the day's
 * first session the streak is the one ending yesterday — so the number only
 * drops to 0 once a whole day has passed without training.
 */
export function currentStreak(daily: { date: string; load: number }[], now = new Date()): number {
  if (daily.length === 0) return 0;
  const byDay = new Map(daily.map((day) => [day.date, day.load]));
  const loadOn = (key: string) => byDay.get(key) ?? 0;
  const first = daily[0].date;
  let cursor = localDateInputValue(now);
  if (loadOn(cursor) <= 0) cursor = shiftDay(cursor, -1);
  let streak = 0;
  while (cursor >= first && loadOn(cursor) > 0) {
    streak += 1;
    cursor = shiftDay(cursor, -1);
  }
  return streak;
}

/**
 * Days with load per week over the trailing `weeks` calendar weeks ending today.
 * Calendar-based, not history-based: a week with no data counts as a week with no
 * training, which is what a consistency figure should say. Unrounded.
 */
export function activeDaysPerWeek(
  daily: { date: string; load: number }[],
  weeks = ACTIVE_WEEKS,
  now = new Date()
): number {
  const byDay = new Map(daily.map((day) => [day.date, day.load]));
  const today = localDateInputValue(now);
  const from = shiftDay(today, -(weeks * DAYS_PER_WEEK - 1));
  const active = eachDay(from, today).filter((key) => (byDay.get(key) ?? 0) > 0).length;
  return active / weeks;
}

/**
 * The trailing-year grid: HEATMAP_WEEKS Monday-started columns ending with the
 * week containing today, one cell per day up to today. Loads come from
 * `dailyLoadSeries` output and session counts from `sessionCountsByDay`, both on
 * the same day key; a day missing from either simply reads as zero.
 */
export function consistencyHeatmap(
  daily: { date: string; load: number }[],
  sessions: Map<string, number>,
  now = new Date()
): ConsistencyHeatmap {
  const byDay = new Map(daily.map((day) => [day.date, day.load]));
  const today = localDateInputValue(now);
  const days = eachDay(firstMonday(now), today);
  const quartiles = loadQuartiles(days.map((key) => byDay.get(key) ?? 0));
  const cells = days.map((date, index): HeatmapCell => {
    const load = byDay.get(date) ?? 0;
    return {
      date,
      load,
      sessions: sessions.get(date) ?? 0,
      level: levelOf(load, quartiles),
      // The range opens on a Monday, so an index within it is the week column
      // and the weekday row directly.
      column: Math.floor(index / DAYS_PER_WEEK),
      row: index % DAYS_PER_WEEK,
    };
  });
  // A month is labeled at the column its 1st falls in, so the label sits above
  // the first cell of that month. The partial month the grid opens with has its
  // 1st before the first Monday, so it goes unlabeled rather than squeezed.
  const months = cells
    .filter((cell) => cell.date.endsWith("-01"))
    .map((cell): HeatmapMonth => ({
      month: parseLocalDate(cell.date).getMonth(),
      column: cell.column,
    }));
  return {
    columns: HEATMAP_WEEKS,
    rows: DAYS_PER_WEEK,
    cells,
    months,
    streak: currentStreak(daily, now),
    activeDaysPerWeek: activeDaysPerWeek(daily, ACTIVE_WEEKS, now),
  };
}
