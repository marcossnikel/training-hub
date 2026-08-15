import { WeeklyBriefView, rangeLabel } from "./weekly-brief-view";
import { requireCurrentUser } from "@/lib/auth";
import { listWeeklyBriefActivities } from "@/lib/db";
import { buildWeeklyBrief } from "@/lib/weekly-brief";
import { mostRecentCompletedWeeklyBriefPeriod } from "@/lib/weekly-brief-window";

export const metadata = { title: "Weekly brief" };

export default async function WeeklyBriefPage() {
  const owner = await requireCurrentUser();
  if (!owner) return null;
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
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="font-display text-4xl font-bold">Weekly brief</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {rangeLabel(result.currentWindow.start, result.currentWindow.end)}
        </p>
      </header>
      <WeeklyBriefView result={result} />
    </div>
  );
}
