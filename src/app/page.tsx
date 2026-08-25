import Link from "next/link";
import {
  CableIcon,
  ChevronRightIcon,
  FootprintsIcon,
  RefreshCwIcon,
  SearchXIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { FilterPill } from "@/components/filter-pill";
import { ReviewBanner } from "@/components/review-banner";
import { countPending, listConfirmedActivities } from "@/lib/db";
import { getDict } from "@/lib/lang";
import { isStravaConnected } from "@/lib/strava";
import { requireCurrentUser } from "@/lib/auth";
import { PrivateBetaLanding } from "@/components/private-beta-landing";
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

// The root log is per-owner data. Keep this explicit even though the parent
// proxy handles the ordinary HTTP request, so a future proxy matcher change
// cannot turn a missing session into a rendered empty/data-bearing route.
export const dynamic = "force-dynamic";

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

  return (
    <li>
      <Link
        href={`/activity/${activity.id}`}
        className="group/row -mx-2 flex items-center justify-between gap-4 rounded-lg px-2 py-3 transition-colors hover:bg-accent/70"
      >
        <span className="min-w-0">
          <span className="block truncate text-base font-medium transition-colors group-hover/row:text-primary">
            {activity.name ?? t.log.untitled}
          </span>
          <span className="mt-0.5 block truncate font-mono text-xs tabular-nums text-muted-foreground uppercase">
            {fmtDate(localStartedAt(activity), lang)} · {t.detail.confirmed}
            {activity.is_race ? ` · ${t.detail.race}` : ""}
          </span>
        </span>
        <span className="max-w-[45%] shrink-0 text-right text-sm text-muted-foreground sm:text-base">
          {statParts.join(" · ") || activity.sport_type}
        </span>
      </Link>
    </li>
  );
}

function MetricCard({
  label,
  value,
  provenance,
}: {
  label: string;
  value: string;
  provenance: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-[1.75rem] leading-8 font-semibold tracking-[-0.03em] text-foreground">
        {value}
      </p>
      <p className="mt-2 font-mono text-xs leading-4 text-muted-foreground">{provenance}</p>
    </div>
  );
}

/** Rows the log renders before offering the rest. */
const LOG_PAGE_SIZE = 150;

export default async function RootPage({ searchParams }: PageProps<"/">) {
  // This branch is deliberately ahead of every product-domain import call.
  // A cookie-free root request receives only the static beta explanation; the
  // proxy adds private/no-store before this page starts rendering.
  const owner = await requireCurrentUser();
  if (!owner) return <PrivateBetaLanding />;
  return <TrainingLogPage owner={owner} searchParams={searchParams} />;
}

async function TrainingLogPage({
  owner,
  searchParams,
}: {
  owner: NonNullable<Awaited<ReturnType<typeof requireCurrentUser>>>;
  searchParams: PageProps<"/">["searchParams"];
}) {
  const params = await searchParams;
  const { lang, t } = await getDict();
  const [pending, activities, connected] = await Promise.all([
    countPending(owner),
    listConfirmedActivities(owner),
    isStravaConnected(owner),
  ]);

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

  const matching =
    filter === "all"
      ? activities
      : activities.filter((a) => sportCategory(a.sport_type) === filter);
  // The log rendered every confirmed activity ever: 1229 rows, 4.8 MB of HTML on
  // a single response. Show the most recent window by default and keep the whole
  // history one click away.
  const showAll = params.all === "1";
  const visible = showAll ? matching : matching.slice(0, LOG_PAGE_SIZE);
  const hiddenCount = matching.length - visible.length;
  const weeks = groupByWeek(visible, lang);
  const totalKm = visible.reduce((acc, a) => acc + (a.distance_km ?? 0), 0);
  const availableCategories = SPORT_CATEGORIES.filter((key) => (counts.get(key) ?? 0) > 0);
  const filterLabel = filter === "all" ? null : t.sports[filter].toLowerCase();
  const oldest = visible[visible.length - 1];
  const oldestDate = oldest ? (localStartedAt(oldest) ?? oldest.created_at) : null;
  const now = new Date();
  const weekStart = mondayOf(now).getTime();
  const thisWeek = activities.filter((activity) => {
    const startedAt = localStartedAt(activity) ?? activity.created_at;
    const timestamp = new Date(startedAt).getTime();
    return Number.isFinite(timestamp) && timestamp >= weekStart && timestamp <= now.getTime();
  });
  const thisWeekSeconds = thisWeek.reduce(
    (total, activity) => total + Math.max(0, activity.moving_time_s ?? 0),
    0
  );
  const longestThisWeek = thisWeek.reduce<ActivityWithSplits | null>((longest, activity) => {
    if (!longest) return activity;
    return (activity.moving_time_s ?? 0) > (longest.moving_time_s ?? 0) ? activity : longest;
  }, null);
  const longestStartedAt = longestThisWeek
    ? (localStartedAt(longestThisWeek) ?? longestThisWeek.created_at)
    : null;
  const longestDay = longestStartedAt
    ? new Intl.DateTimeFormat(lang === "pt" ? "pt-BR" : "en", { weekday: "long" }).format(
        new Date(longestStartedAt)
      )
    : t.log.confirmedWindow;
  const sessionLabel = `${thisWeek.length} ${thisWeek.length === 1 ? t.words.session : t.words.sessions}`;

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-10 sm:px-5 lg:py-12">
      <header>
        <p className="font-mono text-xs font-medium tracking-normal text-muted-foreground uppercase">
          {t.log.title}
        </p>
        <h1 className="mt-4 max-w-[700px] text-4xl leading-[1.1] font-semibold tracking-[-0.035em] text-foreground sm:text-[2.5rem]">
          {t.log.headline}
        </h1>
        <p className="mt-3 max-w-[720px] text-base leading-6 text-muted-foreground">
          {t.log.description}
        </p>
      </header>

      {params.strava === "connected" ? (
        <Alert className="mt-5 border-emerald-500/30 text-emerald-800 dark:text-emerald-200">
          <CableIcon aria-hidden />
          <AlertTitle>Strava is connected</AlertTitle>
          <AlertDescription>
            Your existing history was added to Recent training. New activities will appear in Review
            when they need your confirmation.
          </AlertDescription>
        </Alert>
      ) : null}

      {pending > 0 ? (
        <div className="mt-5">
          <ReviewBanner count={pending} />
        </div>
      ) : null}

      {activities.length > 0 ? (
        <section aria-label={t.log.thisWeek} className="mt-6 grid gap-3 sm:grid-cols-3">
          <MetricCard
            label={t.log.thisWeek}
            value={sessionLabel}
            provenance={t.log.confirmedWindow}
          />
          <MetricCard
            label={t.log.movingTime}
            value={thisWeekSeconds > 0 ? fmtHoursMin(thisWeekSeconds) : "—"}
            provenance={t.log.priorFourWeeks}
          />
          <MetricCard
            label={t.log.longSession}
            value={
              longestThisWeek?.moving_time_s
                ? fmtDuration(longestThisWeek.moving_time_s)
                : t.log.noLongSession
            }
            provenance={longestDay}
          />
        </section>
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
          ) : !connected ? (
            <EmptyState
              icon={CableIcon}
              title={t.log.connectTitle}
              description={t.log.connectBodyConfigured}
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
          <p className="font-mono text-xs text-muted-foreground">
            {visible.length} {filterLabel ?? t.words.confirmed}{" "}
            {visible.length === 1 ? t.words.activity : t.words.activities}
            {oldestDate ? (
              <>
                {" "}
                {t.words.since} {fmtDateWithYear(oldestDate, lang)}
              </>
            ) : null}
            {totalKm > 0 ? ` · ${fmtKm(totalKm, 0)}` : ""}
          </p>
          {weeks.map((week, index) => (
            <details
              key={week.key}
              open={index < 4}
              className="group rounded-2xl border bg-card p-4"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 select-none [&::-webkit-details-marker]:hidden">
                <h2 className="flex min-w-0 items-center gap-1.5 text-base font-medium">
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
              <ul className="mt-3 divide-y divide-border/70 border-t pt-1">
                {week.items.map((activity) => (
                  <ActivityRow key={activity.id} activity={activity} lang={lang} t={t} />
                ))}
              </ul>
            </details>
          ))}
          {hiddenCount > 0 ? (
            <div className="pt-2 text-center">
              <Button asChild variant="outline" size="sm">
                <Link href={filter === "all" ? "/?all=1" : `/?sport=${filter}&all=1`}>
                  {fillStr(t.log.showOlder, { n: hiddenCount })}
                </Link>
              </Button>
            </div>
          ) : null}
          <div className="pt-1">
            <Button asChild className="h-10 rounded-full px-4">
              <Link href="/weekly-brief">{t.log.openWeeklyBrief}</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
