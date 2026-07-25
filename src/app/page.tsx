import Link from "next/link";
import {
  CableIcon,
  ChevronRightIcon,
  FootprintsIcon,
  MedalIcon,
  RefreshCwIcon,
  SearchXIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { FeelingBadge } from "@/components/feeling-badge";
import { FilterPill } from "@/components/filter-pill";
import { FormStrip } from "@/components/form-strip";
import { ReviewBanner } from "@/components/review-banner";
import { SportIcon } from "@/components/sport-icon";
import { buildPmc } from "@/lib/action-helpers";
import { countPending, listConfirmedActivities } from "@/lib/db";
import { formSnapshot, weekLoadVsTrailing } from "@/lib/fitness";
import { getDict } from "@/lib/lang";
import { isStravaConnected, stravaConfigured } from "@/lib/strava";
import {
  fmtDate,
  fmtDateWithYear,
  fmtDuration,
  fmtHoursMin,
  fmtKm,
  fmtPace,
  localStartedAt,
  mondayOf,
  weekLabel,
} from "@/lib/format";
import { fillStr, type Dict, type Lang } from "@/lib/i18n";
import { SPORT_CATEGORIES, sportCategory, type SportCategory } from "@/lib/sports";
import { fmtPower, fmtSpeed, isRideSport, rideMetrics } from "@/lib/cycling";
import { isRunSport } from "@/lib/validate";
import type { ActivityWithSplits } from "@/lib/types";

export const metadata = { title: "Training log" };

interface WeekGroup {
  key: string;
  label: string;
  items: ActivityWithSplits[];
  km: Partial<Record<SportCategory, number>>;
  seconds: Partial<Record<SportCategory, number>>;
  count: Partial<Record<SportCategory, number>>;
}

function groupByWeek(activities: ActivityWithSplits[], lang: Lang): WeekGroup[] {
  const groups: WeekGroup[] = [];
  const byKey = new Map<string, WeekGroup>();
  for (const activity of activities) {
    const date = new Date(localStartedAt(activity) ?? activity.created_at);
    const monday = mondayOf(date);
    const key = `${monday.getFullYear()}-${monday.getMonth()}-${monday.getDate()}`;
    let group = byKey.get(key);
    if (!group) {
      group = { key, label: weekLabel(monday, lang), items: [], km: {}, seconds: {}, count: {} };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push(activity);
    const category = sportCategory(activity.sport_type);
    group.km[category] = (group.km[category] ?? 0) + (activity.distance_km ?? 0);
    group.seconds[category] = (group.seconds[category] ?? 0) + (activity.moving_time_s ?? 0);
    group.count[category] = (group.count[category] ?? 0) + 1;
  }
  return groups;
}

/**
 * One compact chunk per category present in the week: distance sports show km,
 * time sports show hours, anything without either shows a count.
 */
function weekSummary(week: WeekGroup, t: Dict): string {
  const parts: string[] = [];
  for (const key of SPORT_CATEGORIES) {
    const n = week.count[key] ?? 0;
    if (n === 0) continue;
    const km = week.km[key] ?? 0;
    const seconds = week.seconds[key] ?? 0;
    const value = km > 0.05 ? fmtKm(km, 1) : seconds > 0 ? fmtHoursMin(seconds) : `${n}x`;
    parts.push(`${value} ${t.sports[key].toLowerCase()}`);
  }
  return parts.join(" · ") || `${week.items.length} ${t.words.activities}`;
}

function ActivityRow({ activity, lang, t }: { activity: ActivityWithSplits; lang: Lang; t: Dict }) {
  const run = isRunSport(activity.sport_type);
  const ride = isRideSport(activity.sport_type);
  const metrics = ride ? rideMetrics(activity) : null;
  const statParts = [
    activity.distance_km ? fmtKm(activity.distance_km) : null,
    run ? fmtPace(activity.avg_pace_s_per_km) : null,
    metrics ? fmtSpeed(metrics.avgSpeedKmh) : null,
    metrics && metrics.avgPower != null ? fmtPower(metrics.avgPower) : null,
    activity.moving_time_s ? fmtDuration(activity.moving_time_s) : null,
  ].filter((part) => part && part !== "–");
  const shoeSplits = activity.splits.filter((s) => s.shoe_name);

  return (
    <li>
      <Link
        href={`/activity/${activity.id}`}
        className="group/row -mx-2 grid grid-cols-[74px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent/50 lg:grid-cols-[74px_minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)_92px_minmax(0,0.85fr)]"
      >
        <span className="font-mono text-xs whitespace-nowrap tabular-nums text-muted-foreground">
          {fmtDate(localStartedAt(activity), lang)}
        </span>

        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <SportIcon sport={activity.sport_type} className="shrink-0" />
            {activity.is_race ? (
              <MedalIcon className="size-3.5 shrink-0 text-primary" aria-label={t.detail.race} />
            ) : null}
            <span className="truncate text-sm font-medium transition-colors group-hover/row:text-primary">
              {activity.name ?? t.log.untitled}
            </span>
          </span>
          <span className="mt-0.5 block truncate font-mono text-xs tabular-nums text-muted-foreground">
            {statParts.join(" · ") || activity.sport_type}
          </span>
        </span>

        <span className="hidden min-w-0 truncate text-[13px] text-muted-foreground italic lg:block">
          {activity.workout_notes ?? ""}
        </span>

        <span className="hidden min-w-0 truncate text-[13px] text-muted-foreground italic lg:block">
          {activity.health_notes ?? ""}
        </span>

        <span className="justify-self-start">
          {activity.feeling ? (
            <FeelingBadge feeling={activity.feeling} label={t.feelings[activity.feeling]} />
          ) : (
            <span aria-hidden className="text-xs text-muted-foreground/40">
              –
            </span>
          )}
        </span>

        <span className="hidden min-w-0 flex-wrap items-center gap-1 lg:flex">
          {ride && activity.bike_name ? (
            <span
              className="max-w-full truncate rounded-full border bg-card px-2 py-0.5 text-[11px] text-muted-foreground"
              title={activity.bike_name}
            >
              {activity.bike_name}
            </span>
          ) : shoeSplits.length === 0 ? (
            <span aria-hidden className="text-xs text-muted-foreground/40">
              –
            </span>
          ) : (
            shoeSplits.map((split) => (
              <span
                key={split.id}
                className="max-w-full truncate rounded-full border bg-card px-2 py-0.5 text-[11px] text-muted-foreground"
                title={`${split.shoe_name} · ${fmtKm(split.km)}`}
              >
                {split.shoe_name}
                {shoeSplits.length > 1 ? (
                  <span className="font-mono tabular-nums"> {fmtKm(split.km, 0)}</span>
                ) : null}
              </span>
            ))
          )}
        </span>
      </Link>
    </li>
  );
}

export default async function TrainingLogPage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const { lang, t } = await getDict();
  // The form strip's PMC query is independent of the log's own reads, so it is
  // an extra round trip run concurrently with the existing ones rather than
  // after them.
  const [pending, activities, connected, pmc] = await Promise.all([
    countPending(),
    listConfirmedActivities(),
    isStravaConnected(),
    buildPmc(),
  ]);
  const configured = stravaConfigured();

  // Form strip (T19): whole-history PMC, so today's TSB/CTL match the /fitness
  // tiles exactly, plus this week's load against the trailing 4-week average.
  const form = formSnapshot(pmc);
  const weekLoad = weekLoadVsTrailing(pmc);

  const counts = new Map<SportCategory, number>();
  for (const activity of activities) {
    const category = sportCategory(activity.sport_type);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  const rawSport = typeof params.sport === "string" ? params.sport : "all";
  const filter: SportCategory | "all" = SPORT_CATEGORIES.some(
    (key) => key === rawSport && (counts.get(key) ?? 0) > 0
  )
    ? (rawSport as SportCategory)
    : "all";

  const visible =
    filter === "all"
      ? activities
      : activities.filter((a) => sportCategory(a.sport_type) === filter);
  const weeks = groupByWeek(visible, lang);
  const totalKm = visible.reduce((acc, a) => acc + (a.distance_km ?? 0), 0);
  const availableCategories = SPORT_CATEGORIES.filter((key) => (counts.get(key) ?? 0) > 0);
  const filterLabel = filter === "all" ? null : t.sports[filter].toLowerCase();
  const oldest = visible[visible.length - 1];
  const oldestDate = oldest ? (localStartedAt(oldest) ?? oldest.created_at) : null;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-bold uppercase">{t.log.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {visible.length === 0 ? (
              t.log.empty
            ) : (
              <>
                {visible.length} {filterLabel ?? t.words.confirmed}{" "}
                {visible.length === 1 ? t.words.activity : t.words.activities}
                {oldestDate ? (
                  <>
                    {" "}
                    {t.words.since} {fmtDateWithYear(oldestDate, lang)}
                  </>
                ) : null}
                {totalKm > 0 ? (
                  <>
                    <span aria-hidden> · </span>
                    <span className="font-mono tabular-nums">{fmtKm(totalKm, 0)}</span>
                  </>
                ) : null}
              </>
            )}
          </p>
        </div>
      </div>

      {form ? <FormStrip {...form} week={weekLoad} t={t} /> : null}

      {pending > 0 ? (
        <div className="mt-5">
          <ReviewBanner count={pending} />
        </div>
      ) : null}

      {activities.length > 0 && availableCategories.length > 1 ? (
        <nav aria-label="Filter by sport" className="mt-5 flex flex-wrap items-center gap-1.5">
          <FilterPill
            href="/"
            active={filter === "all"}
            label={t.log.all}
            count={activities.length}
          />
          {availableCategories.map((category) => (
            <FilterPill
              key={category}
              href={`/?sport=${category}`}
              active={filter === category}
              label={t.sports[category]}
              count={counts.get(category) ?? 0}
            />
          ))}
        </nav>
      ) : null}

      {activities.length === 0 ? (
        <div className="mt-6">
          {pending > 0 ? (
            <EmptyState
              icon={FootprintsIcon}
              title={t.log.emptyQueueTitle}
              description={t.log.emptyQueueBody}
            >
              <Button asChild>
                <Link href="/review">{t.log.goToReview}</Link>
              </Button>
            </EmptyState>
          ) : !configured || !connected ? (
            <EmptyState
              icon={CableIcon}
              title={t.log.connectTitle}
              description={configured ? t.log.connectBodyConfigured : t.log.connectBodyMissing}
            >
              <Button asChild>
                <Link href="/settings">{t.log.openSettings}</Link>
              </Button>
            </EmptyState>
          ) : (
            <EmptyState
              icon={RefreshCwIcon}
              title={t.log.noActivitiesTitle}
              description={t.log.noActivitiesBody}
            >
              <Button asChild variant="outline">
                <Link href="/settings">{t.log.openSettings}</Link>
              </Button>
            </EmptyState>
          )}
        </div>
      ) : visible.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={SearchXIcon}
            title={fillStr(t.log.noMatchTitle, { category: filterLabel ?? "" })}
            description={t.log.noMatchBody}
          >
            <Button asChild variant="outline">
              <Link href="/">{t.log.showEverything}</Link>
            </Button>
          </EmptyState>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {weeks.map((week, index) => (
            <details key={week.key} open={index < 4} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 border-b pb-2 select-none [&::-webkit-details-marker]:hidden">
                <h2 className="flex items-center gap-1.5 font-display text-base font-medium italic">
                  <ChevronRightIcon
                    aria-hidden
                    className="size-3.5 shrink-0 text-muted-foreground/70 transition-transform group-open:rotate-90"
                  />
                  {week.label}
                </h2>
                <span className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                  {weekSummary(week, t)}
                </span>
              </summary>
              <ul className="mt-1.5 mb-4 divide-y divide-border/50">
                {week.items.map((activity) => (
                  <ActivityRow key={activity.id} activity={activity} lang={lang} t={t} />
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
