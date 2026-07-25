"use client";

import { useRouter } from "next/navigation";
import { MedalIcon } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Card, CardContent } from "@/components/ui/card";
import { ZoneBar } from "@/components/zone-bar";
import { cn } from "@/lib/utils";
import { fillStr, type Dict, type Lang } from "@/lib/i18n";
import type { BlockSummary, RaceAnalysis } from "@/lib/blocks";
import { RACE_CATEGORY_ORDER, type RaceCategory } from "@/lib/races";
import { fmtDateWithYear, fmtDuration, fmtHoursMin, fmtHr, fmtKm, fmtPace } from "@/lib/format";

export interface RaceOption {
  id: number;
  name: string;
  category: RaceCategory;
  startedAt: string;
}

export interface CompareSide {
  race: { id: number; name: string | null; startedAt: string; category: RaceCategory };
  block: BlockSummary;
  analysis: RaceAnalysis;
}

const COLOR_A = "var(--primary)";
const COLOR_B = "var(--chart-3)";

// Overlay chart geometry (unitless viewBox; the SVG scales to its container).
const VBW = 760;
const PAD_L = 44;
const PAD_R = 14;
const PLOT_W = VBW - PAD_L - PAD_R;
const TOP = 12;
const CHART_H = 150;
const AXIS_H = 22;
const CHART_BOTTOM = TOP + CHART_H;
const CHART_TOTAL_H = CHART_BOTTOM + AXIS_H;

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const scaled = value / pow;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * pow;
}

const SELECT_CLASS =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/** Two weekly series overlaid on one axis, aligned by weeks-to-race (−N…−1). */
function OverlayChart({
  weeks,
  seriesA,
  seriesB,
  fmt,
  ariaLabel,
}: {
  weeks: number;
  seriesA: number[];
  seriesB: number[];
  fmt: (v: number) => string;
  ariaLabel: string;
}) {
  const n = weeks;
  const yMax = niceMax(Math.max(1, ...seriesA, ...seriesB));
  const x = (i: number) => (n <= 1 ? PAD_L + PLOT_W / 2 : PAD_L + (i / (n - 1)) * PLOT_W);
  const y = (v: number) => CHART_BOTTOM - (v / yMax) * CHART_H;
  const line = (s: number[]) =>
    s.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = (s: number[]) =>
    n > 0
      ? `M${x(0).toFixed(1)},${CHART_BOTTOM} ` +
        s.map((v, i) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ") +
        ` L${x(n - 1).toFixed(1)},${CHART_BOTTOM} Z`
      : "";

  const tickCount = Math.min(6, n);
  const tickIdx = Array.from({ length: tickCount }, (_, k) =>
    tickCount <= 1 ? 0 : Math.round((k / (tickCount - 1)) * (n - 1))
  );

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${VBW} ${CHART_TOTAL_H}`}
        width="100%"
        style={{ height: "auto" }}
        role="img"
        aria-label={ariaLabel}
      >
        <line
          x1={PAD_L}
          y1={TOP}
          x2={VBW - PAD_R}
          y2={TOP}
          stroke="var(--border)"
          strokeWidth={1}
          opacity={0.5}
        />
        <line
          x1={PAD_L}
          y1={CHART_BOTTOM}
          x2={VBW - PAD_R}
          y2={CHART_BOTTOM}
          stroke="var(--border)"
          strokeWidth={1}
        />
        <text
          x={PAD_L - 6}
          y={TOP + 4}
          textAnchor="end"
          fontSize={9}
          fill="var(--muted-foreground)"
          className="font-mono"
        >
          {yMax}
        </text>
        <text
          x={PAD_L - 6}
          y={CHART_BOTTOM}
          textAnchor="end"
          fontSize={9}
          fill="var(--muted-foreground)"
          className="font-mono"
        >
          0
        </text>

        <path d={area(seriesA)} fill={COLOR_A} opacity={0.12} />
        <path d={area(seriesB)} fill={COLOR_B} opacity={0.1} />
        <path
          d={line(seriesB)}
          fill="none"
          stroke={COLOR_B}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d={line(seriesA)}
          fill="none"
          stroke={COLOR_A}
          strokeWidth={2.25}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {seriesB.map((v, i) => (
          <circle key={`b-${i}`} cx={x(i)} cy={y(v)} r={2.5} fill={COLOR_B}>
            <title>{`${i - weeks} · ${fmt(v)}`}</title>
          </circle>
        ))}
        {seriesA.map((v, i) => (
          <circle key={`a-${i}`} cx={x(i)} cy={y(v)} r={2.5} fill={COLOR_A}>
            <title>{`${i - weeks} · ${fmt(v)}`}</title>
          </circle>
        ))}

        {tickIdx.map((i) => (
          <text
            key={i}
            x={x(i)}
            y={CHART_BOTTOM + 15}
            textAnchor="middle"
            fontSize={9}
            fill="var(--muted-foreground)"
            className="font-mono"
          >
            {i - weeks}
          </text>
        ))}
      </svg>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-0.5 font-display text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

interface CategoryGroup {
  cat: RaceCategory;
  items: RaceOption[];
}

function RacePicker({
  label,
  value,
  exclude,
  onPick,
  groups,
  categoryLabels,
}: {
  label: string;
  value: number;
  exclude: number;
  onPick: (id: number) => void;
  groups: CategoryGroup[];
  categoryLabels: Record<string, string>;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      <select
        className={cn(SELECT_CLASS, "cursor-pointer")}
        value={value}
        onChange={(e) => onPick(Number(e.target.value))}
      >
        {groups.map((g) => (
          <optgroup key={g.cat} label={categoryLabels[g.cat]}>
            {g.items.map((o) => (
              <option key={o.id} value={o.id} disabled={o.id === exclude}>
                {o.name} · {o.startedAt.slice(0, 4)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

function SideColumn({
  side,
  color,
  t,
  lang,
  zoneLabels,
}: {
  side: CompareSide;
  color: string;
  t: Dict;
  lang: Lang;
  zoneLabels: string[];
}) {
  const { race, block } = side;
  const hasBlock = block.sessions > 0;
  return (
    <div className="min-w-0 space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden />
          <h3 className="truncate font-display text-lg font-semibold">
            {race.name ?? t.compare.raceA}
          </h3>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
            <MedalIcon className="size-3" aria-hidden />
            {t.racesPage.categories[race.category]}
          </span>
          <span aria-hidden>·</span>
          <span className="font-mono tabular-nums">{fmtDateWithYear(race.startedAt, lang)}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-sm tabular-nums">
          {side.analysis.movingS > 0 ? <span>{fmtDuration(side.analysis.movingS)}</span> : null}
          {side.analysis.actualPaceSPerKm != null ? (
            <span className="text-muted-foreground">{fmtPace(side.analysis.actualPaceSPerKm)}</span>
          ) : null}
          {side.analysis.avgHr != null ? (
            <span className="text-muted-foreground">{fmtHr(side.analysis.avgHr)}</span>
          ) : null}
        </div>
      </div>

      {hasBlock ? (
        <>
          <div className="grid grid-cols-3 gap-x-4 gap-y-4 rounded-xl border bg-card p-4">
            <Tile label={t.compare.totalKm} value={fmtKm(block.totalKm)} />
            <Tile label={t.compare.runningKm} value={fmtKm(block.runKm)} />
            <Tile label={t.compare.hours} value={fmtHoursMin(block.totalHours * 3600)} />
            <Tile label={t.compare.sessions} value={String(block.sessions)} />
            <Tile label={t.compare.runs} value={String(block.runs)} />
            <Tile label={t.compare.weeklyAvg} value={fmtKm(block.totalKm / block.weeks)} />
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <h4 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                {t.compare.timeInZones}
              </h4>
              <span className="text-[11px] text-muted-foreground/70">
                {t.compare.estimatedFromAvgHr}
              </span>
            </div>
            <div className="mt-2">
              <ZoneBar zoneSec={block.zoneSec} labels={zoneLabels} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t.compare.polarization}:{" "}
              <span className="font-mono tabular-nums text-foreground">
                {block.polarization != null ? `${block.polarization.toFixed(1)} : 1` : "–"}
              </span>
              <span className="ml-1 text-muted-foreground/70">
                ({t.compare.easy} / {t.compare.hard})
              </span>
            </p>
          </div>
        </>
      ) : (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          {t.compare.noBlock}
        </p>
      )}
    </div>
  );
}

export function RaceCompare({
  options,
  weekOptions,
  weeks,
  sideA,
  sideB,
}: {
  options: RaceOption[];
  weekOptions: number[];
  weeks: number;
  sideA: CompareSide;
  sideB: CompareSide;
}) {
  const router = useRouter();
  const { t, lang } = useI18n();

  const zoneLabels = [
    t.compare.zones.z1,
    t.compare.zones.z2,
    t.compare.zones.z3,
    t.compare.zones.z4,
    t.compare.zones.z5,
  ];

  function navigate(next: { a?: number; b?: number; weeks?: number }) {
    const a = next.a ?? sideA.race.id;
    const b = next.b ?? sideB.race.id;
    const w = next.weeks ?? weeks;
    router.push(`/races/compare?a=${a}&b=${b}&weeks=${w}`);
  }

  const groups: CategoryGroup[] = RACE_CATEGORY_ORDER.map((cat) => ({
    cat,
    items: options.filter((o) => o.category === cat),
  })).filter((g) => g.items.length > 0);

  function splitCell(a: RaceAnalysis): string | null {
    if (a.splitDeltaS == null) return null;
    const type = a.splitDeltaS < 0 ? t.compare.negativeSplit : t.compare.positiveSplit;
    const sign = a.splitDeltaS > 0 ? "+" : a.splitDeltaS < 0 ? "-" : "";
    return `${type} · ${sign}${Math.abs(a.splitDeltaS)} s/km`;
  }

  function fadeCell(a: RaceAnalysis): string | null {
    if (a.fadePct == null) return null;
    return `${a.fadePct > 0 ? "+" : ""}${a.fadePct.toFixed(1)}%`;
  }

  const dur = (s: number | null): string | null => (s == null ? null : fmtDuration(s));

  // Head-to-head rows; each renders only when at least one side has the metric.
  const rows: { label: string; sub?: string; a: string | null; b: string | null }[] = [
    {
      label: t.compare.goalPace,
      a: sideA.analysis.goalPaceSPerKm != null ? fmtPace(sideA.analysis.goalPaceSPerKm) : null,
      b: sideB.analysis.goalPaceSPerKm != null ? fmtPace(sideB.analysis.goalPaceSPerKm) : null,
    },
    {
      label: t.compare.actualPace,
      a: sideA.analysis.actualPaceSPerKm != null ? fmtPace(sideA.analysis.actualPaceSPerKm) : null,
      b: sideB.analysis.actualPaceSPerKm != null ? fmtPace(sideB.analysis.actualPaceSPerKm) : null,
    },
    {
      label: t.compare.finish,
      a: sideA.analysis.movingS > 0 ? fmtDuration(sideA.analysis.movingS) : null,
      b: sideB.analysis.movingS > 0 ? fmtDuration(sideB.analysis.movingS) : null,
    },
    {
      label: t.compare.avgHr,
      a: sideA.analysis.avgHr != null ? fmtHr(sideA.analysis.avgHr) : null,
      b: sideB.analysis.avgHr != null ? fmtHr(sideB.analysis.avgHr) : null,
    },
    { label: t.compare.split, a: splitCell(sideA.analysis), b: splitCell(sideB.analysis) },
    {
      label: t.compare.fade,
      sub: t.compare.finalQuarter,
      a: fadeCell(sideA.analysis),
      b: fadeCell(sideB.analysis),
    },
    {
      label: t.compare.timeAtGoal,
      a: dur(sideA.analysis.atGoalSec),
      b: dur(sideB.analysis.atGoalSec),
    },
    {
      label: t.compare.fasterThanGoal,
      a: dur(sideA.analysis.belowGoalSec),
      b: dur(sideB.analysis.belowGoalSec),
    },
    {
      label: t.compare.slowerThanGoal,
      a: dur(sideA.analysis.aboveGoalSec),
      b: dur(sideB.analysis.aboveGoalSec),
    },
    {
      label: t.compare.longestAtGoal,
      a: dur(sideA.analysis.longestAtGoalSec),
      b: dur(sideB.analysis.longestAtGoalSec),
    },
  ].filter((r) => r.a != null || r.b != null);

  const showInRaceZones =
    sideA.analysis.inRaceZoneSec != null || sideB.analysis.inRaceZoneSec != null;

  const sides = [
    { side: sideA, color: COLOR_A },
    { side: sideB, color: COLOR_B },
  ];

  return (
    <div className="mt-6 space-y-8">
      {/* Controls */}
      <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-end">
        <RacePicker
          label={t.compare.raceA}
          value={sideA.race.id}
          exclude={sideB.race.id}
          onPick={(id) => navigate({ a: id })}
          groups={groups}
          categoryLabels={t.racesPage.categories}
        />
        <RacePicker
          label={t.compare.raceB}
          value={sideB.race.id}
          exclude={sideA.race.id}
          onPick={(id) => navigate({ b: id })}
          groups={groups}
          categoryLabels={t.racesPage.categories}
        />
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
            {t.compare.blockLength}
          </span>
          <div className="inline-flex overflow-hidden rounded-full border text-xs font-medium">
            {weekOptions.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => navigate({ weeks: w })}
                aria-pressed={weeks === w}
                className={cn(
                  "cursor-pointer px-3 py-1.5 transition-colors",
                  weeks === w
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {fillStr(t.compare.weeksN, { n: w })}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Per-race headers, volume tiles and zone distribution */}
      <div className="grid gap-6 md:grid-cols-2">
        {sides.map(({ side, color }) => (
          <SideColumn
            key={side.race.id}
            side={side}
            color={color}
            t={t}
            lang={lang}
            zoneLabels={zoneLabels}
          />
        ))}
      </div>

      {/* Weekly progression charts (the centerpiece) */}
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm font-medium">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: COLOR_A }}
              aria-hidden
            />
            {sideA.race.name ?? t.compare.raceA}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: COLOR_B }}
              aria-hidden
            />
            {sideB.race.name ?? t.compare.raceB}
          </span>
        </div>

        <Card>
          <CardContent className="space-y-8">
            <div>
              <h4 className="mb-3 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                {t.compare.weeklyVolume}
              </h4>
              <OverlayChart
                weeks={weeks}
                seriesA={sideA.block.weekly.map((w) => w.runKm)}
                seriesB={sideB.block.weekly.map((w) => w.runKm)}
                fmt={(v) => fmtKm(v)}
                ariaLabel={t.compare.weeklyVolume}
              />
            </div>
            <div>
              <h4 className="mb-3 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                {t.compare.longestRun}
              </h4>
              <OverlayChart
                weeks={weeks}
                seriesA={sideA.block.weekly.map((w) => w.longestRunKm)}
                seriesB={sideB.block.weekly.map((w) => w.longestRunKm)}
                fmt={(v) => fmtKm(v)}
                ariaLabel={t.compare.longestRun}
              />
            </div>
            <p className="text-center text-[11px] text-muted-foreground/70">
              {t.compare.weeksToRace}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Race head-to-head */}
      <div>
        <h2 className="mb-3 font-display text-base font-medium italic">{t.compare.headToHead}</h2>
        <Card>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-1.5 pr-2 text-left text-[11px] font-medium tracking-wider text-muted-foreground uppercase"></th>
                  <th className="py-1.5 pl-2 text-right text-[11px] font-medium tracking-wider uppercase">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: COLOR_A }}
                        aria-hidden
                      />
                      <span className="max-w-32 truncate">
                        {sideA.race.name ?? t.compare.raceA}
                      </span>
                    </span>
                  </th>
                  <th className="py-1.5 pl-2 text-right text-[11px] font-medium tracking-wider uppercase">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: COLOR_B }}
                        aria-hidden
                      />
                      <span className="max-w-32 truncate">
                        {sideB.race.name ?? t.compare.raceB}
                      </span>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {rows.map((row) => (
                  <tr key={row.label}>
                    <td className="py-2 pr-2 text-muted-foreground">
                      {row.label}
                      {row.sub ? (
                        <span className="ml-1 text-xs text-muted-foreground/60">({row.sub})</span>
                      ) : null}
                    </td>
                    <td className="py-2 pl-2 text-right font-mono tabular-nums">{row.a ?? "–"}</td>
                    <td className="py-2 pl-2 text-right font-mono tabular-nums">{row.b ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {showInRaceZones ? (
              <div className="mt-5 border-t pt-4">
                <h4 className="mb-3 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  {t.compare.timeInZones}
                </h4>
                <div className="grid gap-5 md:grid-cols-2">
                  {sides.map(({ side, color }) =>
                    side.analysis.inRaceZoneSec != null ? (
                      <div key={side.race.id}>
                        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium">
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: color }}
                            aria-hidden
                          />
                          <span className="truncate">{side.race.name ?? t.compare.raceA}</span>
                        </div>
                        <ZoneBar zoneSec={side.analysis.inRaceZoneSec} labels={zoneLabels} />
                      </div>
                    ) : null
                  )}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
