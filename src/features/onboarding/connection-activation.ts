import "server-only";

import {
  client,
  getInitialStravaImportStatus,
  markConnectionActivationSummaryReady,
} from "@/lib/db";
import { activityDay } from "@/lib/activity-day";
import { firstValueSummary } from "@/lib/performance-first-value";
import { sportFamily, type SportFamily } from "@/features/strava/import-progress";
import type { OwnerContext } from "@/lib/owner-context";

export interface ActivationSummary {
  coverage: { oldest: string; newest: string } | null;
  confirmed: number;
  pending: number;
  sportMix: Record<SportFamily, number>;
  movingTimeS: number;
  distanceKm: number;
  elevationM: number;
  gearCount: number;
  recent: { sessions: number; activeDays: number; fromDay: string; throughDay: string } | null;
}

type SummaryRow = {
  started_at: string;
  started_at_local: string | null;
  sport_type: string | null;
  moving_time_s: number | null;
  distance_km: number | null;
  elevation_gain_m: number | null;
};

function emptyMix(): Record<SportFamily, number> {
  return { run: 0, ride: 0, other: 0, unknown: 0 };
}

/**
 * A deterministic, owner-scoped summary over committed activity rows only.
 * Calendar-YTD wording is intentionally absent until R19 supplies an effective
 * timezone; exact imported dates remain truthful for every current fixture.
 */
export async function connectionActivationSummary(
  owner: OwnerContext
): Promise<ActivationSummary | null> {
  const status = await getInitialStravaImportStatus(owner);
  if (status?.job.status !== "completed") return null;
  const activities = (
    await client.execute({
      sql: `SELECT started_at, started_at_local, sport_type, moving_time_s, distance_km, elevation_gain_m
          FROM activities WHERE user_id = ? AND strava_id IS NOT NULL AND status = 'confirmed'
          ORDER BY started_at ASC`,
      args: [owner.userId],
    })
  ).rows as unknown as SummaryRow[];
  const gear = await client.execute({
    sql: `SELECT
            (SELECT COUNT(*) FROM shoes WHERE user_id = ? AND origin = 'strava') +
            (SELECT COUNT(*) FROM bikes WHERE user_id = ? AND origin = 'strava') AS count`,
    args: [owner.userId, owner.userId],
  });
  const facts = firstValueSummary(activities);
  const mix = emptyMix();
  for (const activity of activities) mix[sportFamily(activity.sport_type)] += 1;

  const days = activities.map(activityDay).sort();
  const throughDay = days.at(-1) ?? null;
  const fromDay = throughDay ? new Date(`${throughDay}T12:00:00Z`) : null;
  if (fromDay) fromDay.setUTCDate(fromDay.getUTCDate() - 27);
  const recentActivities = fromDay
    ? activities.filter((activity) => activityDay(activity) >= fromDay.toISOString().slice(0, 10))
    : [];
  const recent =
    throughDay && fromDay
      ? {
          sessions: recentActivities.length,
          activeDays: new Set(recentActivities.map(activityDay)).size,
          fromDay: fromDay.toISOString().slice(0, 10),
          throughDay,
        }
      : null;

  const firstActivity = activities[0];
  const lastActivity = activities.at(-1);
  return {
    coverage:
      facts.fromDay && facts.throughDay && firstActivity && lastActivity
        ? { oldest: firstActivity.started_at, newest: lastActivity.started_at }
        : null,
    confirmed: status.snapshot.confirmed,
    pending: status.snapshot.pending,
    sportMix: mix,
    movingTimeS: facts.movingTimeS,
    distanceKm: facts.distanceKm,
    elevationM: facts.elevationM,
    gearCount: Number(gear.rows[0]?.count ?? 0),
    recent,
  };
}

/** A server component may make a completed job summary-ready, never complete it. */
export async function prepareConnectionActivationSummary(owner: OwnerContext) {
  const summary = await connectionActivationSummary(owner);
  if (!summary) return null;
  await markConnectionActivationSummaryReady(owner);
  return summary;
}
