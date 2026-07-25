import { GaugeIcon, MedalIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { ApplyThresholdPaceButton } from "@/components/apply-threshold-pace";
import { ZonesPanel } from "@/components/zones-panel";
import { VdotCard } from "@/components/vdot-card";
import {
  getAthleteThresholds,
  getTrainingZones,
  listBestEffortsForVdot,
  listFastestBestEfforts,
  listRunEfforts,
} from "@/lib/db";
import { isCoachConfigured } from "@/lib/coach";
import { getDict } from "@/lib/lang";
import {
  bestEffortRecords,
  estimateCriticalSpeed,
  pickReferenceEffort,
  predictRaceTimes,
  vdotTrend,
} from "@/lib/benchmarks";
import { fmtDate, fmtDuration, fmtKm, fmtPace } from "@/lib/format";
import { fillStr } from "@/lib/i18n";

export const metadata = { title: "Performance" };

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
      <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-1 font-display text-3xl font-bold" style={color ? { color } : undefined}>
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

export default async function PerformancePage() {
  const { lang, t } = await getDict();
  const tp = t.performance;

  const efforts = await listRunEfforts();
  const storedEfforts = await listFastestBestEfforts();
  const thresholds = await getAthleteThresholds();
  const trainingZones = await getTrainingZones();
  const coachConfigured = isCoachConfigured();

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
  const vdot = vdotTrend(await listBestEffortsForVdot(), new Date());

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-4xl font-bold uppercase">{tp.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{tp.subtitle}</p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t.zones.title}</CardTitle>
          <CardDescription>{t.zones.subtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <ZonesPanel initial={trainingZones} configured={coachConfigured} />
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
                <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                  {tp.distance}
                </div>
                <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                  {tp.time}
                </div>
                <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                  {tp.measured}
                </div>
                <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                  {tp.pace}
                </div>
                <div className="text-right text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                  {tp.date}
                </div>
                {best.map((effort) => (
                  <div key={effort.distance} className="contents">
                    <div className="flex items-center gap-1.5 border-t border-border/50 pt-2 font-medium">
                      {t.racesPage.categories[effort.distance]}
                      {effort.isRace ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          <MedalIcon className="size-2.5" aria-hidden />
                          {tp.raceTag}
                        </span>
                      ) : null}
                      {effort.source === "segment" ? (
                        <span
                          className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
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
                  <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                    {tp.distance}
                  </div>
                  <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                    {tp.predictedTime}
                  </div>
                  <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                    {tp.pace}
                  </div>
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
    </div>
  );
}
