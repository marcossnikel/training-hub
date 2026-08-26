import { activityDay } from "./activity-day";

export interface SummaryActivity {
  started_at: string;
  started_at_local: string | null;
  moving_time_s: number | null;
  distance_km: number | null;
  elevation_gain_m: number | null;
}

export interface FirstValueSummary {
  fromDay: string | null;
  throughDay: string | null;
  calendarLabelEligible: boolean;
  activityCount: number;
  movingTimeS: number;
  distanceKm: number;
  elevationM: number;
}

/** Summary-only first value. Calendar-YTD wording is legal only with R19's timezone. */
export function firstValueSummary(
  activities: SummaryActivity[],
  effectiveTimezone: string | null = null
): FirstValueSummary {
  const days = activities.map(activityDay).sort();
  return {
    fromDay: days[0] ?? null,
    throughDay: days.at(-1) ?? null,
    calendarLabelEligible: effectiveTimezone !== null,
    activityCount: activities.length,
    movingTimeS: activities.reduce((sum, row) => sum + (row.moving_time_s ?? 0), 0),
    distanceKm: activities.reduce((sum, row) => sum + (row.distance_km ?? 0), 0),
    elevationM: activities.reduce((sum, row) => sum + (row.elevation_gain_m ?? 0), 0),
  };
}
