import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, CheckCircle2Icon, ClockIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MedalIcon } from "lucide-react";
import { ActivityChart } from "@/components/activity-chart";
import { ActivityLoadControl } from "@/components/activity-load-control";
import { BikeSection } from "@/components/bike-section";
import { CoachChat } from "@/components/coach-chat";
import { RaceControl } from "@/components/race-control";
import { JournalEditor } from "@/components/journal-editor";
import { SplitsSection } from "@/components/splits-section";
import { SportIcon } from "@/components/sport-icon";
import { ZoneBar } from "@/components/zone-bar";
import {
  getActivity,
  getActivityLoad,
  getAthleteThresholds,
  listActivityChat,
  listBikes,
  listShoes,
} from "@/lib/db";
import { computeDecoupling, computeEf, type EfBasis } from "@/lib/analysis";
import { isCoachConfigured } from "@/lib/coach";
import {
  computeLoad,
  easyHardPct,
  hrZones,
  paceZones,
  powerZones,
  zoneIndexOf,
  zoneSeconds,
  type Zone,
} from "@/lib/fitness";
import { getDict } from "@/lib/lang";
import {
  ensureActivityDetail,
  ensureActivityStreams,
  type StravaBestEffort,
  type StravaLap,
  type StravaSplit,
} from "@/lib/strava";
import { fmtCadence, fmtEnergy, fmtPower, fmtSpeed, isRideSport, rideMetrics } from "@/lib/cycling";
import {
  fmtDateLong,
  fmtDuration,
  fmtElev,
  fmtHr,
  fmtKm,
  fmtPace,
  fmtStepRate,
  fmtTime,
  localStartedAt,
} from "@/lib/format";
import { fillStr, type Dict } from "@/lib/i18n";
import { isRunSport } from "@/lib/validate";
import { toGearOption } from "@/lib/gear";

export async function generateMetadata({ params }: PageProps<"/activity/[id]">) {
  const { id } = await params;
  const activity = Number.isInteger(Number(id)) ? await getActivity(Number(id)) : null;
  return { title: activity?.name ?? "Activity" };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 font-display text-2xl font-semibold">{value}</dd>
    </div>
  );
}

function paceOf(distanceM?: number, movingS?: number): number | null {
  if (!distanceM || !movingS || distanceM <= 0) return null;
  return movingS / (distanceM / 1000);
}

function fmtLapDist(distanceM?: number): string {
  if (!distanceM || distanceM <= 0) return "–";
  if (distanceM < 950) return `${Math.round(distanceM)} m`;
  return fmtKm(distanceM / 1000, distanceM < 99500 ? 2 : 1);
}

const TH =
  "px-2 py-1.5 text-left text-[11px] font-medium tracking-wider text-muted-foreground uppercase";
const TD = "px-2 py-1.5 font-mono text-sm tabular-nums whitespace-nowrap";

// The app's only five-colour chart palette, reused for the five training zones.
const ZONE_COLORS = [
  "var(--primary)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

/**
 * How a lap gets tinted: runs by lap pace against the pace zones, rides with a
 * real power meter by average watts against the %FTP zones. Absent when the
 * sport or the recording gives nothing to classify.
 */
interface LapZoning {
  by: "pace" | "power";
  zones: Zone[];
}

/**
 * The sport classification the laps table renders against: rides get speed and a
 * power column, runs get pace and cadence doubled into steps per minute, and
 * everything else (walks, hikes, rows, …) gets pace and raw cadence — a walk's
 * `average_cadence` must not be doubled as if it were a run.
 */
type LapSport = "ride" | "run" | "other";

/** Metres per second of a lap, the sport-neutral basis for the relative bar. */
function lapSpeed(lap: StravaLap): number | null {
  if (lap.average_speed) return lap.average_speed;
  if (!lap.distance || !lap.moving_time) return null;
  return lap.distance / lap.moving_time;
}

function LapsTable({
  laps,
  t,
  sport,
  zoning,
}: {
  laps: StravaLap[];
  t: Dict;
  sport: LapSport;
  zoning: LapZoning | null;
}) {
  const ride = sport === "ride";
  const run = sport === "run";
  // Columns only appear when the recording carries the data. Run power is
  // watch-estimated, so the power column is a ride-only affair.
  const showPower = ride && laps.some((lap) => lap.average_watts != null);
  const showCadence = laps.some((lap) => (lap.average_cadence ?? 0) > 0);
  const showElev = laps.some((lap) => (lap.total_elevation_gain ?? 0) > 0);
  const fastest = Math.max(0, ...laps.map((lap) => lapSpeed(lap) ?? 0));

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b">
            <th className={TH}>{t.detail.lap}</th>
            <th className={TH}>{t.review.distance}</th>
            <th className={TH}>{t.review.time}</th>
            <th className={TH}>{ride ? t.detail.speed : t.review.pace}</th>
            {showPower ? <th className={TH}>{t.detail.power}</th> : null}
            {showCadence ? <th className={TH}>{t.detail.cadence}</th> : null}
            {showElev ? <th className={TH}>{t.detail.elev}</th> : null}
            <th className={TH}>{t.detail.hr}</th>
            <th className={TH}>{t.detail.maxShort}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {laps.map((lap, index) => {
            const speed = lapSpeed(lap);
            const speedKmh = speed != null ? speed * 3.6 : null;
            const pace = speed != null ? 1000 / speed : paceOf(lap.distance, lap.moving_time);
            const zoneValue = zoning?.by === "power" ? lap.average_watts : pace;
            const zi = zoning && zoneValue != null ? zoneIndexOf(zoneValue, zoning.zones) : -1;
            // Z1/Z2 laps are recovery or easy volume: mute the whole row so the
            // work intervals stand out without a legend.
            const easy = zi === 0 || zi === 1;
            const width =
              speed != null && fastest > 0 ? Math.max(8, Math.round((speed / fastest) * 100)) : 0;
            return (
              <tr key={index} className={easy ? "text-muted-foreground" : undefined}>
                <td className={`${TD} text-muted-foreground`}>
                  <span className="inline-flex items-center gap-1.5">
                    {zi >= 0 ? (
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: ZONE_COLORS[zi] }}
                        role="img"
                        aria-label={`Z${zi + 1}`}
                      />
                    ) : null}
                    {lap.lap_index ?? index + 1}
                  </span>
                </td>
                <td className={TD}>{fmtLapDist(lap.distance)}</td>
                <td className={TD}>{fmtDuration(lap.moving_time)}</td>
                <td className={`${TD} min-w-24 font-medium`}>
                  {ride ? fmtSpeed(speedKmh) : pace ? fmtPace(pace) : "–"}
                  <span className="mt-1 block h-1 rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-primary/80"
                      style={{ width: `${width}%` }}
                    />
                  </span>
                </td>
                {showPower ? <td className={TD}>{fmtPower(lap.average_watts)}</td> : null}
                {showCadence ? (
                  <td className={`${TD} text-muted-foreground`}>
                    {/* Only a run's cadence is one leg's revolutions: doubling a
                        walk's or a row's would invent a number. */}
                    {run ? fmtStepRate(lap.average_cadence) : fmtCadence(lap.average_cadence)}
                  </td>
                ) : null}
                {showElev ? (
                  <td className={`${TD} text-muted-foreground`}>
                    {fmtElev(lap.total_elevation_gain)}
                  </td>
                ) : null}
                <td className={`${TD} text-muted-foreground`}>
                  {lap.average_heartrate ? Math.round(lap.average_heartrate) : "–"}
                </td>
                <td className={`${TD} text-muted-foreground`}>
                  {lap.max_heartrate ? Math.round(lap.max_heartrate) : "–"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Accent strength per PR rank. There is no medal palette in this app, so the
 * podium is expressed as one existing colour at three opacities: the top-three
 * chips read as a run of decreasing emphasis instead of three invented hues.
 */
const PR_OPACITY: Record<number, number> = { 1: 1, 2: 0.7, 3: 0.45 };

/** Strava reports both times identically for best efforts; prefer moving time. */
function effortTime(effort: StravaBestEffort): number {
  return effort.moving_time || effort.elapsed_time;
}

function BestEffortChips({ efforts, t }: { efforts: StravaBestEffort[]; t: Dict }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {efforts.map((effort, index) => {
        const opacity = effort.pr_rank ? PR_OPACITY[effort.pr_rank] : undefined;
        return (
          <li
            key={`${effort.name}-${index}`}
            className={`inline-flex items-baseline gap-1.5 rounded-full border px-2.5 py-1 font-mono text-xs tabular-nums ${
              opacity == null ? "text-muted-foreground" : ""
            }`}
            style={
              opacity == null
                ? undefined
                : { borderColor: "var(--wear-worn)", color: "var(--wear-worn)", opacity }
            }
            title={effort.pr_rank ? `${t.detail.prRank}: ${effort.pr_rank}` : undefined}
          >
            <span>{effort.name}</span>
            <span className="font-medium">{fmtDuration(effortTime(effort))}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * One time-in-zone distribution: the signal it was measured from and the seconds
 * spent in each of the five zones.
 */
interface ZoneDistribution {
  key: "hr" | "pace";
  label: string;
  zoneSec: number[];
}

function ZoneDistributions({ bars, t }: { bars: ZoneDistribution[]; t: Dict }) {
  // Z1..Z5 are the same tokens the race comparison labels its zone bars with;
  // they live in one place in the dict rather than being duplicated per page.
  const zoneLabels = [
    t.compare.zones.z1,
    t.compare.zones.z2,
    t.compare.zones.z3,
    t.compare.zones.z4,
    t.compare.zones.z5,
  ];

  return (
    <div className="space-y-5">
      {bars.map((bar) => {
        const split = easyHardPct(bar.zoneSec);
        return (
          <div key={bar.key}>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                {bar.label}
              </span>
              {split ? (
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {fillStr(t.detail.easyHard, { easy: split.easyPct, hard: split.hardPct })}
                </span>
              ) : null}
            </div>
            <ZoneBar zoneSec={bar.zoneSec} labels={zoneLabels} showTime />
          </div>
        );
      })}
    </div>
  );
}

function KmSplitsTable({ splits, t }: { splits: StravaSplit[]; t: Dict }) {
  const paces = splits
    .map((s) => (s.average_speed ? 1000 / s.average_speed : paceOf(s.distance, s.moving_time)))
    .map((p) => p ?? Number.POSITIVE_INFINITY);
  const fastest = Math.min(...paces.filter((p) => Number.isFinite(p)));

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b">
            <th className={TH}>km</th>
            <th className={TH}>{t.review.pace}</th>
            <th className={`${TH} w-full`} aria-hidden></th>
            <th className={TH}>{t.detail.hr}</th>
            <th className={TH}>{t.detail.elev}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {splits.map((split, index) => {
            const pace = paces[index];
            const partial = (split.distance ?? 1000) < 950;
            const width =
              Number.isFinite(pace) && Number.isFinite(fastest) && pace > 0
                ? Math.max(8, Math.round((fastest / pace) * 100))
                : 0;
            return (
              <tr key={index}>
                <td className={`${TD} text-muted-foreground`}>
                  {partial ? ((split.distance ?? 0) / 1000).toFixed(1) : (split.split ?? index + 1)}
                </td>
                <td className={`${TD} font-medium`}>
                  {Number.isFinite(pace) ? fmtPace(pace) : "–"}
                </td>
                <td className="w-full min-w-28 px-2 py-1.5">
                  <div className="h-1.5 rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary/80"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </td>
                <td className={`${TD} text-muted-foreground`}>
                  {split.average_heartrate ? Math.round(split.average_heartrate) : "–"}
                </td>
                <td className={`${TD} text-muted-foreground`}>
                  {split.elevation_difference != null
                    ? `${split.elevation_difference > 0 ? "+" : ""}${Math.round(split.elevation_difference)} m`
                    : "–"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function ActivityPage({ params }: PageProps<"/activity/[id]">) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  const activity = await getActivity(numericId);
  if (!activity) notFound();

  const { lang, t } = await getDict();
  const run = isRunSport(activity.sport_type);
  const ride = isRideSport(activity.sport_type);
  const confirmed = activity.status === "confirmed";

  const shoes = ride ? [] : (await listShoes()).map(toGearOption);
  const bikes = ride ? (await listBikes()).map(toGearOption) : [];
  const metrics = ride ? rideMetrics(activity) : null;

  const thresholds = await getAthleteThresholds();

  // Training load: the persisted value from backfill, else computed on the fly
  // for display from the current thresholds.
  const storedLoad = await getActivityLoad(activity.id);
  const computedLoad = storedLoad ? null : computeLoad(activity, thresholds);
  const loadTss = storedLoad?.tss ?? computedLoad?.tss ?? null;
  const loadMethod = storedLoad?.method ?? computedLoad?.method ?? null;
  const loadIntensity = storedLoad?.intensity_factor ?? computedLoad?.intensityFactor ?? null;
  const loadSource: "auto" | "manual" | "computed" = storedLoad
    ? storedLoad.source === "manual"
      ? "manual"
      : "auto"
    : "computed";

  const detail = await ensureActivityDetail(activity);
  const streams = await ensureActivityStreams(activity);
  const laps = (detail?.laps ?? []).filter(
    (lap) => (lap.distance ?? 0) > 0 || (lap.moving_time ?? 0) > 0
  );
  const kmSplits = (detail?.splits_metric ?? []).filter((s) => (s.distance ?? 0) > 0);
  // Strava only computes best efforts for runs; guard on the sport anyway so a
  // stray payload never puts a run-shaped chip row on a ride.
  const bestEfforts = run
    ? (detail?.best_efforts ?? []).filter((effort) => effort?.name && effortTime(effort) > 0)
    : [];
  // Devices auto-lap every km; only show laps when they carry real structure.
  const structuredLaps =
    laps.length > 1 && laps.some((lap) => Math.abs((lap.distance ?? 0) - 1000) > 150);
  // Lap tint: runs by pace, rides by watts (real power meters only — Strava's
  // estimated wattage would tint by guesswork).
  const lapZoning: LapZoning | null = ride
    ? metrics?.hasRealPower && thresholds.ftpW > 0
      ? { by: "power", zones: powerZones(thresholds) }
      : null
    : run
      ? { by: "pace", zones: paceZones(thresholds) }
      : null;
  // Aerobic quality (T12): rides read watts against HR, but only from a real
  // power meter; runs read speed against HR. Every other sport (and a ride with
  // estimated wattage) gets no basis, so its EF and decoupling tiles stay hidden.
  const efBasis: EfBasis | null = ride
    ? metrics?.hasRealPower
      ? "power"
      : null
    : run
      ? "speed"
      : null;
  const ef =
    efBasis === "power"
      ? computeEf({
          basis: "power",
          watts: metrics?.normalizedPower ?? metrics?.avgPower ?? null,
          avgHr: activity.avg_hr,
        })
      : efBasis === "speed"
        ? computeEf({
            basis: "speed",
            distanceKm: activity.distance_km,
            movingTimeS: activity.moving_time_s,
            avgHr: activity.avg_hr,
          })
        : null;
  const decoupling = efBasis
    ? computeDecoupling({ streams, basis: efBasis, movingTimeS: activity.moving_time_s })
    : null;
  // Time in zone, integrated from the cached stream: heart rate for any sport
  // that recorded a trace, pace for runs. A bar is dropped when the threshold it
  // needs is unset or no sample landed in a zone.
  const hrZoneSec =
    streams?.heartrate && thresholds.lthr > 0
      ? zoneSeconds(streams.timeS, streams.heartrate, hrZones(thresholds))
      : null;
  const paceZoneSec =
    run && streams?.paceSPerKm && thresholds.thresholdPaceSPerKm > 0
      ? zoneSeconds(streams.timeS, streams.paceSPerKm, paceZones(thresholds))
      : null;
  const zoneDistributions: ZoneDistribution[] = [
    ...(hrZoneSec ? [{ key: "hr" as const, label: t.chart.heartRate, zoneSec: hrZoneSec }] : []),
    ...(paceZoneSec ? [{ key: "pace" as const, label: t.chart.pace, zoneSec: paceZoneSec }] : []),
  ];

  const description = detail?.description?.trim();

  const coachConfigured = isCoachConfigured();
  const coachMessages = (await listActivityChat(activity.id)).map((m) => ({
    role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
    content: m.content,
  }));

  let rawPretty: string | null = null;
  const rawSource = detail ?? (activity.raw_json ? activity.raw_json : null);
  if (rawSource) {
    try {
      rawPretty = JSON.stringify(
        typeof rawSource === "string" ? JSON.parse(rawSource) : rawSource,
        null,
        2
      );
    } catch {
      rawPretty = typeof rawSource === "string" ? rawSource : null;
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeftIcon className="size-3.5" aria-hidden /> {t.detail.backToLog}
      </Link>

      <header className="mt-5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <SportIcon sport={activity.sport_type} />
          <span>{activity.sport_type ?? ""}</span>
          <span aria-hidden>·</span>
          <span>
            {fmtDateLong(localStartedAt(activity), lang)}
            {localStartedAt(activity) && fmtTime(localStartedAt(activity)) !== "00:00"
              ? `, ${fmtTime(localStartedAt(activity))}`
              : ""}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 font-display text-3xl font-semibold tracking-tight">
            {activity.is_race ? (
              <MedalIcon className="size-6 shrink-0 text-primary" aria-label={t.detail.race} />
            ) : null}
            {activity.name ?? t.log.untitled}
          </h1>
          {confirmed ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
              <CheckCircle2Icon className="size-3.5" aria-hidden /> {t.detail.confirmed}
            </span>
          ) : (
            <Link
              href="/review"
              className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
            >
              <ClockIcon className="size-3.5" aria-hidden /> {t.detail.pending}
            </Link>
          )}
        </div>
      </header>

      {description ? (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground italic">{description}</p>
      ) : null}

      {confirmed ? (
        <div className="mt-4">
          <RaceControl activity={activity} />
        </div>
      ) : null}

      {ride && metrics ? (
        <dl className="mt-6 grid grid-cols-3 gap-x-4 gap-y-4 rounded-xl border bg-card p-4 sm:grid-cols-4">
          <Stat
            label={t.review.distance}
            value={fmtKm(activity.distance_km, (activity.distance_km ?? 0) >= 100 ? 1 : 2)}
          />
          <Stat label={t.review.time} value={fmtDuration(activity.moving_time_s)} />
          <Stat
            label={metrics.indoor ? `${t.detail.speed} (${t.detail.estimated})` : t.detail.avgSpeed}
            value={fmtSpeed(metrics.avgSpeedKmh)}
          />
          {metrics.indoor ? null : (
            <Stat label={t.review.elevation} value={fmtElev(activity.elevation_gain_m)} />
          )}
          {metrics.avgPower != null ? (
            <Stat label={t.detail.avgPower} value={fmtPower(metrics.avgPower)} />
          ) : null}
          {metrics.normalizedPower != null ? (
            <Stat label={t.detail.normPower} value={fmtPower(metrics.normalizedPower)} />
          ) : null}
          {metrics.maxPower != null ? (
            <Stat label={t.detail.maxPower} value={fmtPower(metrics.maxPower)} />
          ) : null}
          {metrics.avgCadence != null ? (
            <Stat label={t.detail.cadence} value={fmtCadence(metrics.avgCadence)} />
          ) : null}
          <Stat label={t.review.heartRate} value={fmtHr(activity.avg_hr)} />
          {detail?.max_heartrate ? (
            <Stat label={t.detail.maxHr} value={fmtHr(detail.max_heartrate)} />
          ) : null}
          {metrics.kilojoules != null ? (
            <Stat label={t.detail.energy} value={fmtEnergy(metrics.kilojoules)} />
          ) : detail?.calories ? (
            <Stat label={t.detail.calories} value={`${Math.round(detail.calories)} kcal`} />
          ) : null}
          {metrics.variabilityIndex != null ? (
            <Stat label={t.detail.variability} value={metrics.variabilityIndex.toFixed(2)} />
          ) : null}
        </dl>
      ) : (
        <dl className="mt-6 grid grid-cols-3 gap-x-4 gap-y-4 rounded-xl border bg-card p-4 sm:grid-cols-5">
          <Stat
            label={t.review.distance}
            value={fmtKm(activity.distance_km, (activity.distance_km ?? 0) >= 100 ? 1 : 2)}
          />
          {run ? <Stat label={t.review.pace} value={fmtPace(activity.avg_pace_s_per_km)} /> : null}
          <Stat label={t.review.time} value={fmtDuration(activity.moving_time_s)} />
          <Stat label={t.review.heartRate} value={fmtHr(activity.avg_hr)} />
          <Stat label={t.review.elevation} value={fmtElev(activity.elevation_gain_m)} />
          {detail?.max_heartrate ? (
            <Stat label={t.detail.maxHr} value={fmtHr(detail.max_heartrate)} />
          ) : null}
          {detail?.calories ? (
            <Stat label={t.detail.calories} value={`${Math.round(detail.calories)} kcal`} />
          ) : null}
        </dl>
      )}

      {bestEfforts.length > 0 ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t.detail.bestEfforts}</CardTitle>
          </CardHeader>
          <CardContent>
            <BestEffortChips efforts={bestEfforts} t={t} />
          </CardContent>
        </Card>
      ) : null}

      {loadTss != null ? (
        <ActivityLoadControl
          activityId={activity.id}
          tss={loadTss}
          method={loadMethod}
          source={loadSource}
          intensityFactor={loadIntensity}
          ef={ef}
          decoupling={decoupling}
        />
      ) : null}

      {streams ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t.chart.analysis}</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityChart activityId={activity.id} streams={streams} isRun={run} isRide={ride} />
          </CardContent>
        </Card>
      ) : null}

      {zoneDistributions.length > 0 ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t.detail.zones}</CardTitle>
          </CardHeader>
          <CardContent>
            <ZoneDistributions bars={zoneDistributions} t={t} />
          </CardContent>
        </Card>
      ) : null}

      {structuredLaps ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t.detail.laps}</CardTitle>
          </CardHeader>
          <CardContent>
            <LapsTable
              laps={laps}
              t={t}
              sport={ride ? "ride" : run ? "run" : "other"}
              zoning={lapZoning}
            />
          </CardContent>
        </Card>
      ) : null}

      {kmSplits.length > 1 && !ride ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t.detail.kmSplits}</CardTitle>
          </CardHeader>
          <CardContent>
            <KmSplitsTable splits={kmSplits} t={t} />
          </CardContent>
        </Card>
      ) : null}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t.detail.journal}</CardTitle>
        </CardHeader>
        <CardContent>
          <JournalEditor activity={activity} />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t.coach.title}</CardTitle>
          <CardDescription>{t.coach.subtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <CoachChat
            activityId={activity.id}
            messages={coachMessages}
            insight={activity.coach_insight}
            configured={coachConfigured}
          />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{ride ? t.detail.bike : t.detail.shoes}</CardTitle>
        </CardHeader>
        <CardContent>
          {ride ? (
            <BikeSection activity={activity} bikes={bikes} />
          ) : (
            <SplitsSection activity={activity} shoes={shoes} />
          )}
        </CardContent>
      </Card>

      {rawPretty ? (
        <details className="group mt-6 rounded-xl border bg-card">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-muted-foreground transition-colors select-none hover:text-foreground">
            {t.detail.raw}
            <span className="ml-2 text-xs text-muted-foreground/60 group-open:hidden">
              {t.detail.show}
            </span>
            <span className="ml-2 hidden text-xs text-muted-foreground/60 group-open:inline">
              {t.detail.hide}
            </span>
          </summary>
          <pre className="max-h-96 overflow-auto border-t px-4 py-3 font-mono text-xs leading-relaxed text-muted-foreground">
            {rawPretty}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
