import { localDateInputValue, mondayOf, parseLocalDate } from "./format";

export interface WeeklyBriefPeriod {
  asOfWeekStart: string;
  fromDay: string;
  toDay: string;
}

/** The last whole Monday-Sunday app-calendar week and its four-week baseline. */
export function mostRecentCompletedWeeklyBriefPeriod(now = new Date()): WeeklyBriefPeriod {
  const currentMonday = mondayOf(now);
  const asOf = new Date(currentMonday);
  asOf.setDate(asOf.getDate() - 7);
  const from = parseLocalDate(localDateInputValue(asOf));
  from.setDate(from.getDate() - 28);
  const to = new Date(asOf);
  to.setDate(to.getDate() + 7);
  return {
    asOfWeekStart: localDateInputValue(asOf),
    fromDay: localDateInputValue(from),
    toDay: localDateInputValue(to),
  };
}
