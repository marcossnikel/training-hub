import { GaugeIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { FilterPill } from "@/components/filter-pill";
import {
  PmcChart,
  STATE_COLOR,
  type PmcMarker,
  type PmcSeriesPoint,
  type WeeklyBar,
} from "@/components/pmc-chart";
import { WeeklyDigest } from "@/components/weekly-digest";
import {
  getAthleteThresholds,
  getWeeklyDigest,
  listActivityLoadsForPmc,
  listGoals,
  listRaceMarkers,
} from "@/lib/db";
import { isCoachConfigured } from "@/lib/coach";
import { getDict } from "@/lib/lang";
import { computeAcwr, computePmc, dailyLoadSeries, formState } from "@/lib/fitness";
import { localDateInputValue, mondayOf, parseLocalDate } from "@/lib/format";
import { timeWindows } from "@/lib/windows";

export const metadata = { title: "Fitness" };

const WINDOWS = timeWindows(["90d", "6m", "1y", "all"]);

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

export default async function FitnessPage({ searchParams }: PageProps<"/fitness">) {
  const params = await searchParams;
  const { t } = await getDict();
  // Thresholds are what the persisted loads were computed from; ensure the row
  // exists (seeded on first migration) before reading the curve.
  await getAthleteThresholds();
  const loads = await listActivityLoadsForPmc();

  const rawWindow = typeof params.window === "string" ? params.window : "6m";
  const win = WINDOWS.find((w) => w.key === rawWindow) ?? WINDOWS[1];

  // PMC runs over the whole history (gap-filled to today) so CTL/ATL carry the
  // full accumulation; the window only slices what the chart shows.
  const daily = dailyLoadSeries(loads);

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

  const windowPoints: PmcSeriesPoint[] = Number.isFinite(win.days)
    ? pmc.slice(Math.max(0, pmc.length - win.days))
    : pmc;

  // Race and goal markers (T02): confirmed is_race activities and athlete
  // goals, restricted to the dates actually shown so a narrower window shows
  // fewer markers. Race dates use the same started_at -> local-day conversion
  // dailyLoadSeries uses, so they land on the same point as their load.
  const [races, goals] = await Promise.all([listRaceMarkers(), listGoals()]);
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

  // Weekly TSS totals over the shown window, bucketed by ISO week (Monday).
  const weeklyMap = new Map<string, number>();
  for (const point of windowPoints) {
    const monday = localDateInputValue(mondayOf(parseLocalDate(point.date)));
    weeklyMap.set(monday, (weeklyMap.get(monday) ?? 0) + point.load);
  }
  const weekly: WeeklyBar[] = [...weeklyMap.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, load]) => ({ date, load }));

  const digest = await getWeeklyDigest();
  const coachConfigured = isCoachConfigured();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-4xl font-bold uppercase">{t.fitness.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t.fitness.subtitle}</p>

      <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 rounded-xl border bg-card p-5 sm:grid-cols-5">
        <StatTile
          label={t.fitness.form}
          value={String(Math.round(latest.tsb))}
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

      <nav aria-label="Time window" className="mt-6 flex flex-wrap items-center gap-1.5">
        {WINDOWS.map((w) => (
          <FilterPill
            key={w.key}
            href={w.key === "6m" ? "/fitness" : `/fitness?window=${w.key}`}
            active={win.key === w.key}
            label={t.fitness.windows[w.key]}
          />
        ))}
      </nav>

      <Card className="mt-5">
        <CardContent>
          <PmcChart points={windowPoints} weekly={weekly} markers={markers} />
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
