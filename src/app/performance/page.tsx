import { GaugeIcon, MedalIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { ApplyFtpButton } from "@/components/apply-ftp";
import { ApplyThresholdPaceButton } from "@/components/apply-threshold-pace";
import { FilterPill } from "@/components/filter-pill";
import { MeanMaxCurve } from "@/components/mean-max-curve";
import { ZonesPanel } from "@/components/zones-panel";
import { ConsistencyHeatmapCard } from "@/components/consistency-heatmap";
import { TotalsTable } from "@/components/totals-table";
import { VdotCard } from "@/components/vdot-card";
import {
  countCurveActivities,
  getAthleteThresholds,
  getTrainingZones,
  listBestEffortsForVdot,
  listCurveBests,
  listFastestBestEfforts,
  listRunEfforts,
  listSessionStarts,
  listTotalsActivities,
} from "@/lib/db";
import { getDict } from "@/lib/lang";
import {
  consistencyHeatmap,
  heatmapFrom,
  minutesByDay,
  sessionCountsByDay,
} from "@/lib/consistency";
import { periodTotals, totalsFrom, TOTALS_PERIODS, type TotalsPeriod } from "@/lib/totals";
import {
  bestEffortRecords,
  estimateCriticalSpeed,
  estimateEftp,
  pickReferenceEffort,
  powerDurationPoints,
  predictRaceTimes,
  showEftp,
  vdotTrend,
  EFTP_WINDOW_DAYS,
} from "@/lib/benchmarks";
import { fmtPower } from "@/lib/cycling";
import { curveSeries, curveWindowStart, showPowerCurve, MIN_POWER_CURVE_RIDES } from "@/lib/curves";
import { fmtDate, fmtDuration, fmtKm, fmtPace } from "@/lib/format";
import { fillStr } from "@/lib/i18n";
import { timeWindows } from "@/lib/windows";
import { requireCurrentUser } from "@/lib/auth";

export const metadata = { title: "Performance" };

// Windows the curve overlay offers. "All" is deliberately absent: all-time is
// already the second series, so selecting it would draw one line twice.
const CURVE_WINDOWS = timeWindows(["90d", "6m", "1y"]);
const DEFAULT_CURVE_WINDOW = CURVE_WINDOWS[0];

function StatTile({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="label-micro">{label}</div>
      <div className="mt-1 font-display text-3xl font-bold" style={color ? { color } : undefined}>
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

export default async function PerformancePage({ searchParams }: PageProps<"/performance">) {
  const owner = await requireCurrentUser();
  if (!owner) redirect("/login");
  const params = await searchParams;
  const { lang, t } = await getDict();
  const tp = t.performance;

  const efforts = await listRunEfforts(owner);
  const storedEfforts = await listFastestBestEfforts(owner);
  const thresholds = await getAthleteThresholds(owner);
  const trainingZones = await getTrainingZones(owner);

  // Best times come from the true sub-segments Strava cut out of runs where we have
  // them, and from whole-activity summaries everywhere else. The critical-speed fit
  // and the Riegel anchor stay on whole activities: both want a maximal RACE effort,
  // and a fast segment inside a training run is not one.
  const best = bestEffortRecords(efforts, storedEfforts);
  const criticalSpeed = estimateCriticalSpeed(efforts);
  const reference = pickReferenceEffort(efforts);
  const predictions = reference ? predictRaceTimes(reference) : [];
  // VDOT reads EVERY stored segment effort with its date (not just the fastest per
  // name), because the trend is per month: the same effort table, a different shape.
  const vdot = vdotTrend(await listBestEffortsForVdot(owner), new Date());

  // Consistency and volume. Both are keyed by moving time rather than a training
  // load: this app deliberately does not compute TSS (TrainingPeaks owns that
  // number), and every recorded session has a duration, so a gym day counts as a
  // trained day where a distance-keyed grid would read it as rest.
  const period: TotalsPeriod = params.period === "months" ? "months" : "weeks";
  const heatFrom = heatmapFrom();
  const [sessionStarts, totalsActivities] = await Promise.all([
    listSessionStarts(owner, heatFrom),
    listTotalsActivities(owner, totalsFrom(period)),
  ]);
  // The minutes come from the totals rows on purpose: one read feeds both cards,
  // and `minutesByDay` re-buckets them onto the heatmap's own day key.
  const heatmap = consistencyHeatmap(
    minutesByDay(totalsActivities, heatFrom),
    sessionCountsByDay(sessionStarts)
  );
  const totals = periodTotals(totalsActivities, period);

  // Mean-max curves (T27). Both series are aggregated in SQL from
  // `activity_curve_points`, so this costs a handful of small reads and never
  // touches a stream. The window pill is the only thing the URL selects on this
  // page. Issued together: they are independent, so serializing them would pay
  // six Turso round trips end to end for no ordering anyone needs. The power
  // reads go out with them rather than behind the ride-count check — one extra
  // read of an empty table beats a serial round trip.
  const rawWindow = typeof params.window === "string" ? params.window : DEFAULT_CURVE_WINDOW.key;
  const curveWindow = CURVE_WINDOWS.find((w) => w.key === rawWindow) ?? DEFAULT_CURVE_WINDOW;
  const now = new Date();
  const since = curveWindowStart(curveWindow.days, now);
  const [paceWindowed, paceAllTime, powerWindowed, powerAllTime, powerRecent, powerRides] =
    await Promise.all([
      listCurveBests(owner, "pace", since),
      listCurveBests(owner, "pace", null),
      listCurveBests(owner, "power", since),
      listCurveBests(owner, "power", null),
      listCurveBests(owner, "power", curveWindowStart(EFTP_WINDOW_DAYS, now)),
      countCurveActivities(owner, "power"),
    ]);
  // eFTP (T28) reads its OWN fixed EFTP_WINDOW_DAYS window, not the display
  // pills: an FTP that changed because someone clicked "6 months" on a chart
  // filter would be incoherent, but an unbounded all-time read would offer a peak
  // from years ago as today's threshold. `showEftp` carries the rest of the gate,
  // including the ride-count floor the power chart uses — below it the card is
  // not rendered at all.
  const eftp = estimateEftp(powerDurationPoints(powerRecent));
  const eftpVisible = showEftp(eftp, powerRides);
  const paceCurve = curveSeries("pace", paceWindowed, paceAllTime);
  const powerCurve = showPowerCurve(powerRides)
    ? curveSeries("power", powerWindowed, powerAllTime)
    : [];
  const curveWindowLabel = tp.windows[curveWindow.key];
  const curveHref = (key: string) =>
    key === DEFAULT_CURVE_WINDOW.key ? "/performance" : `/performance?window=${key}`;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-4xl font-bold">{tp.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{tp.subtitle}</p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t.zones.title}</CardTitle>
          <CardDescription>{t.zones.subtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <ZonesPanel initial={trainingZones} />
        </CardContent>
      </Card>

      {best.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={GaugeIcon} title={tp.empty} description={tp.emptyBody} />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <p className="text-xs text-muted-foreground">{tp.summaryNote}</p>

          {/* Best efforts by distance */}
          <Card>
            <CardHeader>
              <CardTitle>{tp.bestEfforts}</CardTitle>
              <CardDescription>{tp.bestEffortsBody}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-x-3 gap-y-2 text-sm sm:gap-x-5">
                <div className="label-micro">{tp.distance}</div>
                <div className="label-micro">{tp.time}</div>
                <div className="label-micro">{tp.measured}</div>
                <div className="label-micro">{tp.pace}</div>
                <div className="text-right label-micro">{tp.date}</div>
                {best.map((effort) => (
                  <div key={effort.distance} className="contents">
                    <div className="flex items-center gap-1.5 border-t border-border/50 pt-2 font-medium">
                      {t.racesPage.categories[effort.distance]}
                      {effort.isRace ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-3xs font-medium text-primary">
                          <MedalIcon className="size-2.5" aria-hidden />
                          {tp.raceTag}
                        </span>
                      ) : null}
                      {effort.source === "segment" ? (
                        <span
                          className="rounded-full bg-muted px-1.5 py-0.5 text-3xs font-medium text-muted-foreground"
                          title={tp.segmentTagTitle}
                        >
                          {tp.segmentTag}
                        </span>
                      ) : null}
                    </div>
                    <div className="border-t border-border/50 pt-2 font-mono tabular-nums">
                      {fmtDuration(effort.movingTimeS)}
                    </div>
                    {/* The length the time was actually measured over: a segment is
                        exactly the distance, a whole activity only within ±10% of
                        it, so the Time column needs this to be readable at all. */}
                    <div className="border-t border-border/50 pt-2 font-mono tabular-nums text-muted-foreground">
                      {fmtKm(effort.distanceKm, 2)}
                    </div>
                    <div className="border-t border-border/50 pt-2 font-mono tabular-nums text-muted-foreground">
                      {fmtPace(effort.paceSPerKm)}
                    </div>
                    <div className="border-t border-border/50 pt-2 text-right font-mono text-xs tabular-nums text-muted-foreground">
                      {fmtDate(effort.date, lang)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Critical Speed / threshold-pace suggestion */}
          <Card>
            <CardHeader>
              <CardTitle>{tp.criticalSpeed}</CardTitle>
              <CardDescription>{tp.criticalSpeedBody}</CardDescription>
            </CardHeader>
            <CardContent>
              {criticalSpeed ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <StatTile
                      label={tp.estThresholdPace}
                      value={fmtPace(criticalSpeed.thresholdPaceSPerKm)}
                      sub={`${tp.csValue}: ${criticalSpeed.cs.toFixed(2)} m/s`}
                      color="var(--primary)"
                    />
                    <StatTile
                      label={tp.currentThresholdPace}
                      value={fmtPace(thresholds.thresholdPaceSPerKm)}
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                    <p className="text-xs text-muted-foreground">
                      {tp.fitQuality}: {Math.round(criticalSpeed.rSquared * 100)}% ·{" "}
                      {fillStr(tp.coverage, { n: criticalSpeed.points.length })}
                    </p>
                    <ApplyThresholdPaceButton
                      suggestedPaceSPerKm={criticalSpeed.thresholdPaceSPerKm}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <StatTile
                    label={tp.currentThresholdPace}
                    value={fmtPace(thresholds.thresholdPaceSPerKm)}
                  />
                  <p className="text-sm text-muted-foreground">{tp.csEmpty}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Riegel race predictions */}
          {reference && predictions.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{tp.predictions}</CardTitle>
                <CardDescription>
                  {fillStr(tp.predictionsBody, {
                    ref: fmtKm(reference.distanceKm),
                    time: fmtDuration(reference.movingTimeS),
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-[auto_1fr_1fr] gap-x-4 gap-y-2 text-sm sm:gap-x-6">
                  <div className="label-micro">{tp.distance}</div>
                  <div className="label-micro">{tp.predictedTime}</div>
                  <div className="label-micro">{tp.pace}</div>
                  {predictions.map((prediction) => (
                    <div key={prediction.distance} className="contents">
                      <div className="border-t border-border/50 pt-2 font-medium">
                        {t.racesPage.categories[prediction.distance]}
                      </div>
                      <div className="border-t border-border/50 pt-2 font-mono tabular-nums">
                        {fmtDuration(prediction.predictedTimeS)}
                      </div>
                      <div className="border-t border-border/50 pt-2 font-mono tabular-nums text-muted-foreground">
                        {fmtPace(prediction.paceSPerKm)}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* Riegel predicts times from one effort; VDOT turns the same efforts into
              a single fitness number over time. They read as a pair. */}
          <VdotCard trend={vdot} lang={lang} t={t} />
        </div>
      )}

      {/* Everything below is NOT runner-only. `best` holds RUN efforts, so an
          athlete with power rides and no confirmed runs would otherwise get the
          runner's empty state and never see their own cycling card — and the
          point of the eFTP card is that this page stops being runner-only. The
          curves come out with it: they are read from `activity_curve_points`,
          which has nothing to do with the run best-effort ladder. */}
      {eftpVisible || paceCurve.length > 0 || powerCurve.length > 0 ? (
        <div className="mt-6 space-y-6">
          {/* Critical power, the cycling sibling of Critical Speed. Hidden
              entirely below the floor: an FTP nobody can trust is worse than no
              FTP, because every power-ride TSS is measured against it. */}
          {eftpVisible ? (
            <Card>
              <CardHeader>
                <CardTitle>{tp.eftp}</CardTitle>
                <CardDescription>
                  {fillStr(tp.eftpBody, { days: EFTP_WINDOW_DAYS })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <StatTile
                      label={tp.estFtp}
                      value={fmtPower(eftp.cp)}
                      sub={`${tp.wPrime}: ${(eftp.wPrimeJ / 1000).toFixed(1)} kJ`}
                      color="var(--primary)"
                    />
                    <StatTile
                      label={tp.currentFtp}
                      value={fmtPower(thresholds.ftpW)}
                      sub={
                        thresholds.ftpProvisional ? t.fitness.thresholds.ftpProvisional : undefined
                      }
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                    <p className="text-xs text-muted-foreground">
                      {tp.fitQuality}: {Math.round(eftp.r2 * 100)}% ·{" "}
                      {fillStr(tp.eftpCoverage, { n: eftp.sampleCount })}
                    </p>
                    <ApplyFtpButton suggestedFtpW={eftp.cp} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {fillStr(tp.eftpCaveat, { n: MIN_POWER_CURVE_RIDES })}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* Mean-max curves. The window pills drive both panels, so they sit
              above the pair rather than inside either card. */}
          {paceCurve.length > 0 || powerCurve.length > 0 ? (
            <>
              <nav aria-label="Time window" className="flex flex-wrap items-center gap-1.5">
                {CURVE_WINDOWS.map((w) => (
                  <FilterPill
                    key={w.key}
                    href={curveHref(w.key)}
                    active={curveWindow.key === w.key}
                    label={tp.windows[w.key]}
                  />
                ))}
              </nav>

              {paceCurve.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle>{tp.paceCurve}</CardTitle>
                    <CardDescription>{tp.paceCurveBody}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <MeanMaxCurve kind="pace" points={paceCurve} windowLabel={curveWindowLabel} />
                  </CardContent>
                </Card>
              ) : null}

              {powerCurve.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle>{tp.powerCurve}</CardTitle>
                    <CardDescription>{tp.powerCurveBody}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <MeanMaxCurve kind="power" points={powerCurve} windowLabel={curveWindowLabel} />
                  </CardContent>
                </Card>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      <ConsistencyHeatmapCard heatmap={heatmap} lang={lang} t={t} />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t.fitness.totals.title}</CardTitle>
          <CardDescription>{t.fitness.totals.subtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <nav aria-label={t.fitness.totals.period} className="mb-3 flex items-center gap-1.5">
            {TOTALS_PERIODS.map((key) => (
              <FilterPill
                key={key}
                href={key === "weeks" ? "/performance" : `/performance?period=${key}`}
                active={period === key}
                label={t.fitness.totals[key]}
              />
            ))}
          </nav>
          <TotalsTable rows={totals} period={period} lang={lang} t={t} />
        </CardContent>
      </Card>
    </div>
  );
}
