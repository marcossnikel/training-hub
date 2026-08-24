import {
  getConfirmedComparableActivity,
  listConfirmedComparableActivities,
  listWeeklyBriefActivities,
} from "./db";
import {
  comparableActivityInsightReference,
  weeklyBriefInsightReference,
  type InsightReference,
} from "./insight-feedback";
import {
  isComparablePriorActivitySource,
  matchComparablePriorActivity,
} from "./comparable-activity";
import { buildWeeklyBrief, type WeeklyBriefResult } from "./weekly-brief";
import { mostRecentCompletedWeeklyBriefPeriod } from "./weekly-brief-window";
import type { OwnerContext } from "./owner-context";

export async function resolveWeeklyBriefFeedbackTarget(
  owner: OwnerContext
): Promise<{ result: WeeklyBriefResult; reference: InsightReference | null }> {
  const period = mostRecentCompletedWeeklyBriefPeriod();
  const activities = await listWeeklyBriefActivities(owner, period.fromDay, period.toDay);
  const result = buildWeeklyBrief({
    asOfWeekStart: period.asOfWeekStart,
    activities: activities.map((activity) => ({
      id: activity.id,
      startedAt: activity.started_at,
      startedAtLocal: activity.started_at_local,
      sportType: activity.sport_type,
      movingTimeS: activity.moving_time_s,
      distanceKm: activity.distance_km,
      confirmed: true,
    })),
  });
  return { result, reference: weeklyBriefInsightReference(result) };
}

export async function resolveComparableActivityFeedbackTarget(
  owner: OwnerContext,
  sourceActivityId: number,
  now = new Date().toISOString()
): Promise<InsightReference | null> {
  if (!Number.isSafeInteger(sourceActivityId) || sourceActivityId <= 0) return null;
  const source = await getConfirmedComparableActivity(owner, sourceActivityId);
  if (!source || !isComparablePriorActivitySource(source, now)) return null;
  const result = matchComparablePriorActivity({
    source,
    candidates: await listConfirmedComparableActivities(owner),
    asOf: now,
  });
  return comparableActivityInsightReference(result, now);
}
