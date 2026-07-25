import { GaugeIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { FilterPill } from "@/components/filter-pill";
import {
  PmcChart,
  type PmcMarker,
  type PmcProjection,
  type PmcSeriesPoint,
} from "@/components/pmc-chart";
import { TotalsTable } from "@/components/totals-table";
import { WeeklyDigest } from "@/components/weekly-digest";
import {
  getAthleteThresholds,
  getResolvedNumericSeries,
  getWeeklyDigest,
  listActivityLoadsForPmc,
  listGoals,
  listRaceMarkers,
  listTotalsActivities,
} from "@/lib/db";
import { isCoachConfigured } from "@/lib/coach";
import { buildWellnessLane, WELLNESS_METRICS } from "@/lib/health";
import { getDict } from "@/lib/lang";
import { fillStr } from "@/lib/i18n";
import {
  availableLoadSports,
  computeAcwr,
  computePmc,
  dailyLoadSeries,
  formState,
  loadSport,
  projectPmc,
  weeklyMonotony,
  weeklySportLoad,
  type LoadSport,
} from "@/lib/fitness";
import { fmtTsb, localDateInputValue, parseLocalDate } from "@/lib/format";
import { periodTotals, totalsFrom, TOTALS_PERIODS, type TotalsPeriod } from "@/lib/totals";
import { timeWindows } from "@/lib/windows";
import { STATE_COLOR } from "@/lib/zones";

export const metadata = { title: "Fitness" };

const WINDOWS = timeWindows(["90d", "6m", "1y", "all"]);
const DEFAULT_WINDOW = "6m";

// Projection horizon (T05): 28 days by default, stretched to reach the next
// goal race when it lands within 56 days (further out and the closed-form
// scenarios say little worth reading).
const PROJECTION_DAYS = 28;
const GOAL_HORIZON_DAYS = 56;
// Trailing window whose mean daily load defines the "steady" scenario.
const STEADY_LOAD_DAYS = 28;
const DAY_MS = 86_400_000;

function daysBetween(from: string, to: string): number {
  return Math.round((parseLocalDate(to).getTime() - parseLocalDate(from).getTime()) / DAY_MS);
}

/** Everything the URL selects on this page. */
interface FitnessFilters {
  window: string;
  sport: LoadSport | "all";
  period: TotalsPeriod;
}

/**
 * Shareable /fitness URL carrying every filter, with one of them overridden.
 * Each group of pills therefore preserves the others, and defaults are left
 * implicit so the plain /fitness URL stays clean.
 */
function fitnessHref(current: FitnessFilters, override: Partial<FitnessFilters>): string {
  const { window, sport, period } = { ...current, ...override };
  const query = new URLSearchParams();
  if (window !== DEFAULT_WINDOW) query.set("window", window);
  if (sport !== "all") query.set("sport", sport);
  if (period !== TOTALS_PERIODS[0]) query.set("period", period);
  const qs = query.toString();
  return qs ? `/fitness?${qs}` : "/fitness";
}

function rampColor(ramp: number): string {
  if (ramp > 8) return "var(--wear-worn)"; // building fast — worth watching
  if (ramp > 0) return "var(--primary)";
  return "var(--muted-foreground)";
}

// ACWR bands (T03): below 0.8 undertraining, 0.8-1.3 sweet spot (default text
// color), 1.3-1.5 caution, above 1.5 elevated injury risk.
function acwrColor(acwr: number): string | undefined {
  if (acwr < 0.8) return "var(--muted-foreground)";
  if (acwr <= 1.3) return undefined;
  if (acwr <= 1.5) return "var(--wear-worn)";
  return "var(--wear-critical)";
}

// Foster monotony (T04): above 2.0 the week had too little easy-hard contrast,
// above 2.5 it is a warning.
function monotonyColor(monotony: number): string | undefined {
  if (monotony > 2.5) return "var(--wear-critical)";
  if (monotony > 2) return "var(--wear-worn)";
  return undefined;
}

function StatTile({
  label,
  value,
  sub,
  color,
  title,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  title?: string;
}) {
  return (
    <div className="min-w-0" title={title}>
      <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-1 font-display text-3xl font-bold" style={color ? { color } : undefined}>
        {value}
        {sub ? (
          <span className="ml-1.5 align-middle text-sm font-medium text-muted-foreground">
            {sub}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Quieter, smaller sibling of StatTile for secondary context numbers. */
function QuietTile({
  label,
  value,
  sub,
  color,
  title,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  title?: string;
}) {
  return (
    <div className="min-w-0" title={title}>
      <div className="font-mono text-xl font-semibold" style={color ? { color } : undefined}>
        {value}
      </div>
      <div className="text-[11px] text-muted-foreground">
        {label}
        {sub ? ` · ${sub}` : ""}
      </div>
    </div>
  );
}

export default async function FitnessPage({ searchParams }: PageProps<"/fitness">) {
  const params = await searchParams;
  const { lang, t } = await getDict();
  // Thresholds are what the persisted loads were computed from; ensure the row
  // exists (seeded on first migration) before reading the curve.
  await getAthleteThresholds();
  const loads = await listActivityLoadsForPmc();

  const rawWindow = typeof params.window === "string" ? params.window : DEFAULT_WINDOW;
  const win = WINDOWS.find((w) => w.key === rawWindow) ?? WINDOWS[1];

  // Totals period (T20): weeks unless the URL asks for months.
  const period: TotalsPeriod = params.period === "months" ? "months" : "weeks";

  // Sport filter (T07): per-sport CTL/ATL/TSB, the whole page recomputed from
  // the filtered rows. Only sports that actually carry positive load get a pill,
  // so a filter can never leave the page with an empty or all-zero curve.
  const availableSports = availableLoadSports(loads);
  const rawSport = typeof params.sport === "string" ? params.sport : "all";
  const sport: LoadSport | "all" = availableSports.some((s) => s === rawSport)
    ? (rawSport as LoadSport)
    : "all";
  const sportLoads =
    sport === "all" ? loads : loads.filter((r) => loadSport(r.sport_type) === sport);
  const filters: FitnessFilters = { window: win.key, sport, period };

  // PMC runs over the whole history (gap-filled to today) so CTL/ATL carry the
  // full accumulation; the window only slices what the chart shows.
  const daily = dailyLoadSeries(sportLoads);

  if (daily.length === 0) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="font-display text-4xl font-bold uppercase">{t.fitness.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.fitness.subtitle}</p>
        <div className="mt-6">
          <EmptyState icon={GaugeIcon} title={t.fitness.empty} description={t.fitness.emptyBody} />
        </div>
      </div>
    );
  }

  const pmc = computePmc(daily);
  const latest = pmc[pmc.length - 1];
  const state = formState(latest.tsb);
  const ramp = latest.ctl - (pmc[pmc.length - 8]?.ctl ?? 0);
  const acwr = computeAcwr(daily);
  const week = weeklyMonotony(daily);

  const windowPoints: PmcSeriesPoint[] = Number.isFinite(win.days)
    ? pmc.slice(Math.max(0, pmc.length - win.days))
    : pmc;

  // Race and goal markers (T02): confirmed is_race activities and athlete
  // goals, restricted to the dates actually shown so a narrower window shows
  // fewer markers. Race dates use the same started_at -> local-day conversion
  // dailyLoadSeries uses, so they land on the same point as their load.
  const [races, goals, totalsActivities] = await Promise.all([
    listRaceMarkers(),
    listGoals(),
    listTotalsActivities(totalsFrom(period)),
  ]);
  const windowStart = windowPoints[0]?.date;
  const windowEnd = windowPoints[windowPoints.length - 1]?.date;
  const inWindow = (date: string) =>
    windowStart != null && windowEnd != null && date >= windowStart && date <= windowEnd;
  const markers: PmcMarker[] = [
    ...races
      .map((r): PmcMarker => ({
        date: localDateInputValue(new Date(r.started_at)),
        kind: "race",
        label: r.name ?? t.detail.race,
      }))
      .filter((m) => inWindow(m.date)),
    ...goals
      .filter((g) => g.race_date != null)
      .map((g): PmcMarker => ({ date: g.race_date as string, kind: "goal", label: g.name }))
      .filter((m) => inWindow(m.date)),
  ];

  // Projected scenarios (T05): both continue the EWMA from today's point, one
  // at the trailing mean daily load, one at zero. The horizon reaches the next
  // goal race when that falls inside GOAL_HORIZON_DAYS.
  const trailing = daily.slice(-STEADY_LOAD_DAYS);
  const steadyLoad = trailing.reduce((sum, day) => sum + day.load, 0) / trailing.length;
  const nextGoalDate = goals
    .map((g) => g.race_date)
    .filter((date): date is string => date != null && date > latest.date)
    .sort()[0];
  const goalDaysAway = nextGoalDate != null ? daysBetween(latest.date, nextGoalDate) : null;
  const horizonDays =
    goalDaysAway != null && goalDaysAway > PROJECTION_DAYS && goalDaysAway <= GOAL_HORIZON_DAYS
      ? goalDaysAway
      : PROJECTION_DAYS;
  const steady = projectPmc(latest, horizonDays, steadyLoad);
  const rest = projectPmc(latest, horizonDays, 0);
  const restRaceDay = rest.find((p) => p.date === nextGoalDate);
  const steadyRaceDay = steady.find((p) => p.date === nextGoalDate);
  const projection: PmcProjection = {
    steady,
    rest,
    raceDay:
      goalDaysAway != null && restRaceDay != null && steadyRaceDay != null
        ? {
            daysAway: goalDaysAway,
            restTsb: Math.round(restRaceDay.tsb),
            steadyTsb: Math.round(steadyRaceDay.tsb),
          }
        : undefined,
  };

  // Weekly TSS over the shown window, bucketed by ISO week (Monday) and split
  // per sport (T06). Built from the load rows rather than the daily PMC points
  // because only the rows carry sport_type; both use the same local-day
  // conversion, so the stacks total exactly what the daily series does.
  const weekly =
    windowStart != null && windowEnd != null
      ? weeklySportLoad(sportLoads, { from: windowStart, to: windowEnd })
      : [];

  // Wellness overlay lanes (T08): all three recovery signals are always fetched
  // for the shown dates and handed to the chart, which owns their visibility.
  // Garmin history starts mid-2026, so earlier dates simply have no reading and
  // the lanes render as breaks there. A metric with nothing in the window is
  // dropped so the chart never offers a toggle for an empty lane.
  const dates = windowPoints.map((p) => p.date);
  const wellnessSeries = await Promise.all(
    WELLNESS_METRICS.map(async (metric) => ({
      metric,
      points: await getResolvedNumericSeries(metric, dates[0], dates[dates.length - 1]),
    }))
  );
  const wellness = wellnessSeries
    .filter((s) => s.points.length > 0)
    .map((s) => buildWellnessLane(s.metric, dates, s.points));

  // Totals (T20): weekly or monthly volume with each period's change from the
  // one before, bucketed by local calendar day like every other series here.
  const totals = periodTotals(totalsActivities, period);

  const digest = await getWeeklyDigest();
  const coachConfigured = isCoachConfigured();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-4xl font-bold uppercase">{t.fitness.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t.fitness.subtitle}</p>

      <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 rounded-xl border bg-card p-5 sm:grid-cols-5">
        <StatTile
          label={t.fitness.form}
          value={fmtTsb(latest.tsb)}
          sub={t.fitness.states[state.key]}
          color={STATE_COLOR[state.key]}
        />
        <StatTile
          label={t.fitness.fitness}
          value={String(Math.round(latest.ctl))}
          sub={t.fitness.ctl}
          color="var(--primary)"
        />
        <StatTile
          label={t.fitness.fatigue}
          value={String(Math.round(latest.atl))}
          sub={t.fitness.atl}
        />
        <StatTile
          label={t.fitness.ramp7d}
          value={`${ramp > 0 ? "+" : ""}${Math.round(ramp)}`}
          color={rampColor(ramp)}
        />
        <StatTile
          label={t.fitness.acwr}
          value={acwr != null ? acwr.toFixed(2) : "–"}
          color={acwr != null ? acwrColor(acwr) : "var(--muted-foreground)"}
          title={t.fitness.acwrTooltip}
        />
      </dl>

      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border bg-card px-5 py-3">
        <QuietTile
          label={t.fitness.monotony}
          value={week.monotony != null ? week.monotony.toFixed(1) : "–"}
          color={week.monotony != null ? monotonyColor(week.monotony) : "var(--muted-foreground)"}
          title={t.fitness.monotonyTooltip}
        />
        <QuietTile
          label={t.fitness.strain}
          value={week.strain != null ? String(Math.round(week.strain)) : "–"}
          sub={`${t.fitness.load7d} ${Math.round(week.load7d)}`}
          color={week.strain != null ? undefined : "var(--muted-foreground)"}
          title={t.fitness.strainTooltip}
        />
      </dl>

      {sport !== "all" ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {fillStr(t.fitness.sportOnlyNote, { sport: t.sports[sport], all: t.log.all })}
        </p>
      ) : null}

      <nav aria-label="Time window" className="mt-6 flex flex-wrap items-center gap-1.5">
        {WINDOWS.map((w) => (
          <FilterPill
            key={w.key}
            href={fitnessHref(filters, { window: w.key })}
            active={win.key === w.key}
            label={t.fitness.windows[w.key]}
          />
        ))}
      </nav>

      {/* Rendered whenever any sport carries load so the All reset is always
          reachable from a sport-filtered URL. */}
      {availableSports.length > 0 ? (
        <nav aria-label="Filter by sport" className="mt-2 flex flex-wrap items-center gap-1.5">
          <FilterPill
            href={fitnessHref(filters, { sport: "all" })}
            active={sport === "all"}
            label={t.log.all}
          />
          {availableSports.map((s) => (
            <FilterPill
              key={s}
              href={fitnessHref(filters, { sport: s })}
              active={sport === s}
              label={t.sports[s]}
            />
          ))}
        </nav>
      ) : null}

      <Card className="mt-5">
        <CardContent>
          <PmcChart
            points={windowPoints}
            weekly={weekly}
            markers={markers}
            projection={projection}
            wellness={wellness}
          />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t.fitness.totals.title}</CardTitle>
          <CardDescription>{t.fitness.totals.subtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <nav
            aria-label={t.fitness.totals.period}
            className="mb-3 flex flex-wrap items-center gap-1.5"
          >
            {TOTALS_PERIODS.map((p) => (
              <FilterPill
                key={p}
                href={fitnessHref(filters, { period: p })}
                active={period === p}
                label={t.fitness.totals[p]}
              />
            ))}
          </nav>
          <TotalsTable rows={totals} period={period} lang={lang} t={t} />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t.digest.title}</CardTitle>
          <CardDescription>{t.digest.subtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <WeeklyDigest digest={digest} configured={coachConfigured} />
        </CardContent>
      </Card>
    </div>
  );
}
