/**
 * The canonical athlete calendar day for summary surfaces. Strava's
 * `start_date_local` is deliberately stored as a naive-local ISO stamp; its
 * date prefix is the athlete's day and must never be interpreted in the
 * server/browser timezone. Older rows fall back to their UTC instant.
 */
export interface ActivityDayInput {
  started_at: string;
  started_at_local: string | null;
}

export function activityDay({ started_at, started_at_local }: ActivityDayInput): string {
  return (started_at_local ?? started_at).slice(0, 10);
}
