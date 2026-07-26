"use client";

import { useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { extent } from "@/components/activity-chart-series";
import { keyIndex } from "@/lib/chart-keys";
import { fill } from "@/lib/i18n";
import { fmtDayMonth, fmtTsb, parseLocalDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WellnessLane, WellnessMetric } from "@/lib/health";
import { STATE_COLOR } from "@/lib/zones";
import {
  formState,
  LOAD_SPORTS,
  TSB_FRESH_ABOVE,
  TSB_NEUTRAL_FLOOR,
  TSB_PRODUCTIVE_FLOOR,
  TSB_TRANSITION_ABOVE,
  weeklyLoadTotal,
  type FormStateKey,
  type LoadSport,
  type WeeklySportLoad,
} from "@/lib/fitness";

// Decorative background bands for the TSB panel, one per form-state boundary
// in fitness.ts. Colors/opacities here are a separate decorative palette from
// STATE_COLOR (which stays the source of truth for text).
const FORM_BANDS: {
  key: FormStateKey;
  lo: number;
  hi: number;
  color: string;
  opacity: number;
}[] = [
  {
    key: "transition",
    lo: TSB_TRANSITION_ABOVE,
    hi: Infinity,
    color: "var(--positive)",
    opacity: 0.05,
  },
  {
    key: "fresh",
    lo: TSB_FRESH_ABOVE,
    hi: TSB_TRANSITION_ABOVE,
    color: "var(--positive)",
    opacity: 0.08,
  },
  {
    key: "neutral",
    lo: TSB_NEUTRAL_FLOOR,
    hi: TSB_FRESH_ABOVE,
    color: "var(--muted-foreground)",
    opacity: 0.05,
  },
  {
    key: "productive",
    lo: TSB_PRODUCTIVE_FLOOR,
    hi: TSB_NEUTRAL_FLOOR,
    color: "var(--primary)",
    opacity: 0.07,
  },
  {
    key: "fatigued",
    lo: -Infinity,
    hi: TSB_PRODUCTIVE_FLOOR,
    color: "var(--wear-critical)",
    opacity: 0.07,
  },
];

export interface PmcSeriesPoint {
  date: string; // YYYY-MM-DD local
  load: number;
  ctl: number;
  atl: number;
  tsb: number;
  /** ctl - ctl 7 days prior; null/absent when there isn't a week of history yet. */
  rampRate?: number | null;
}

/** Segment color per sport in the stacked weekly load bars. */
const SPORT_COLOR: Record<LoadSport, string> = {
  run: "var(--primary)",
  bike: "var(--chart-3)",
  other: "var(--chart-5)",
};

/** A race or goal event to annotate on the timeline, one per date. */
export interface PmcMarker {
  date: string; // YYYY-MM-DD local, matched against PmcSeriesPoint.date
  kind: "race" | "goal";
  label: string;
}

/**
 * Closed-form continuations of the PMC past today (T05), both starting from the
 * last historical point and running over the same dates.
 */
export interface PmcProjection {
  /** Trailing-mean daily load carried forward. */
  steady: PmcSeriesPoint[];
  /** Zero load from tomorrow on. */
  rest: PmcSeriesPoint[];
  /** Race-day form per scenario, only when a goal falls inside the horizon. */
  raceDay?: { daysAway: number; restTsb: number; steadyTsb: number };
}

/** Lane color per wellness metric (T08), the next free chart slots. */
const WELLNESS_COLOR: Record<WellnessMetric, string> = {
  hrv_overnight: "var(--chart-2)",
  resting_hr: "var(--chart-4)",
  sleep_total: "var(--chart-5)",
};

// viewBox geometry (unitless; the SVG scales to its container width).
const VBW = 760;
const PAD_L = 40;
const PAD_R = 14;
const PLOT_W = VBW - PAD_L - PAD_R;
const TOP = 10;
const MAIN_H = 150;
const GAP = 16;
const TSB_H = 54;
const AXIS_H = 22;
const MAIN_BOTTOM = TOP + MAIN_H;
const TSB_TOP = MAIN_BOTTOM + GAP;
const TSB_MID = TSB_TOP + TSB_H / 2;
// Ramp-rate lane (T03): a slim step-area strip directly under the TSB panel.
const RAMP_H = 40;
const RAMP_TOP = TSB_TOP + TSB_H + GAP;
const RAMP_MIN = -10;
const RAMP_MAX = 12;
const RAMP_RANGE = RAMP_MAX - RAMP_MIN;
// The ramp tile's existing "building fast" warning threshold (src/app/fitness/page.tsx
// rampColor), echoed here as a dotted reference line.
const RAMP_WARN = 8;
// Bottom of the plot area with no wellness lane enabled (T08). Each enabled lane
// pushes it further down; the x-axis and every full-height line follow it.
const LANES_TOP = RAMP_TOP + RAMP_H;
const LANE_H = 48;
// Minimum form-zone band height (viewBox units) that can hold a 9px label
// without overlapping its neighbors: font size plus a little breathing room.
const BAND_LABEL_MIN_HEIGHT = 11;
// Dash pattern for everything in the projected region (T05). Deliberately not
// "2 3", which the goal markers own.
const PROJECTED_DASH = "4 3";

/** Wellness lane values read to one decimal: 62 ms, 47 bpm, 7.4 h. */
function laneValue(value: number): string {
  return String(Math.round(value * 10) / 10);
}

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const scaled = value / pow;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * pow;
}

export function PmcChart({
  points,
  weekly,
  markers = [],
  projection,
  wellness = [],
}: {
  points: PmcSeriesPoint[];
  weekly: WeeklySportLoad[];
  markers?: PmcMarker[];
  projection?: PmcProjection;
  /** Wellness lanes available to overlay (T08); all start hidden. */
  wellness?: WellnessLane[];
}) {
  const { t, lang } = useI18n();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const weekSvgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [weekHover, setWeekHover] = useState<number | null>(null);
  // Which wellness lanes are shown. Off by default, so the chart looks exactly
  // as it did before until the athlete asks for a recovery signal.
  const [shownWellness, setShownWellness] = useState<WellnessMetric[]>([]);

  const n = points.length;
  // Projected days extend the x domain past the historical points; hover and
  // every historical path keep using `n`, only the scale sees `total`.
  const projected = projection ? [projection.steady, projection.rest] : [];
  const projLen = Math.max(0, ...projected.map((series) => series.length));
  const total = n + projLen;
  const xPx = (i: number) => (total <= 1 ? PAD_L + PLOT_W / 2 : PAD_L + (i / (total - 1)) * PLOT_W);

  const loadMax = useMemo(
    () =>
      niceMax(
        Math.max(
          1,
          ...points.map((p) => Math.max(p.ctl, p.atl)),
          ...(projection?.steady ?? []).map((p) => p.ctl),
          ...(projection?.rest ?? []).map((p) => p.ctl)
        )
      ),
    [points, projection]
  );
  const tsbMax = useMemo(
    () =>
      niceMax(
        Math.max(
          1,
          ...points.map((p) => Math.abs(p.tsb)),
          ...(projection?.steady ?? []).map((p) => Math.abs(p.tsb)),
          ...(projection?.rest ?? []).map((p) => Math.abs(p.tsb))
        )
      ),
    [points, projection]
  );

  const yLoad = (v: number) => MAIN_BOTTOM - (v / loadMax) * MAIN_H;
  const yTsb = (v: number) => TSB_MID - (v / tsbMax) * (TSB_H / 2);
  // Ramp lane: fixed [-10, +12] domain (clamped display per T03), independent
  // of the data's actual range so the lane's scale stays a stable reference.
  const yRamp = (v: number) => {
    const clamped = Math.min(RAMP_MAX, Math.max(RAMP_MIN, v));
    return RAMP_TOP + RAMP_H - ((clamped - RAMP_MIN) / RAMP_RANGE) * RAMP_H;
  };
  const rampZeroY = yRamp(0);
  const rampWarnY = yRamp(RAMP_WARN);
  const rampBarW = total > 1 ? PLOT_W / (total - 1) : PLOT_W;
  const rampBars = useMemo(
    () =>
      points
        .map((p, i) => (p.rampRate == null ? null : { i, value: p.rampRate }))
        .filter((b): b is { i: number; value: number } => b !== null),
    [points]
  );

  // Wellness lanes (T08): one compact strip per enabled metric, stacked under
  // the ramp lane. Each lane scales to its own extent — ms, bpm and hours share
  // no axis — and its line breaks on days the wearable has no reading for.
  const shownLanes = wellness.filter((lane) => shownWellness.includes(lane.metric));
  const laneGeom = shownLanes.map((lane, k) => {
    const top = LANES_TOP + GAP + k * (LANE_H + GAP);
    const bottom = top + LANE_H;
    const [lo, hi] = extent(lane.points.map((p) => p.value)) ?? [0, 1];
    const yPx = (v: number) => bottom - ((v - lo) / (hi - lo)) * LANE_H;
    const segments: string[] = [];
    let current = "";
    lane.points.forEach((p, i) => {
      if (p.avg == null) {
        if (current) segments.push(current);
        current = "";
        return;
      }
      current += `${current ? "L" : "M"}${xPx(i).toFixed(1)},${yPx(p.avg).toFixed(1)} `;
    });
    if (current) segments.push(current);
    const dots = lane.points
      .map((p, i) => (p.value == null ? null : { i, y: yPx(p.value) }))
      .filter((d): d is { i: number; y: number } => d !== null);
    return { lane, top, bottom, lo, hi, yPx, segments, dots };
  });
  // Enabled lanes extend the plot downward; the axis, crosshair and every
  // full-height marker line follow this instead of a fixed bottom.
  const plotBottom = laneGeom[laneGeom.length - 1]?.bottom ?? LANES_TOP;
  const chartH = plotBottom + AXIS_H;

  // Form-zone bands clipped to the panel's current TSB extent: clamp each
  // band's bounds to [-tsbMax, tsbMax] and drop it when that leaves no height
  // (fully outside the visible range). Cheap (fixed 5 bands), no memoization.
  const visibleBands = FORM_BANDS.map((band) => {
    const lo = Math.max(band.lo, -tsbMax);
    const hi = Math.min(band.hi, tsbMax);
    if (lo >= hi) return null;
    return { ...band, yTop: yTsb(hi), yBottom: yTsb(lo) };
  }).filter((b): b is NonNullable<typeof b> => b !== null);

  const ctlLine = points
    .map((p, i) => `${i ? "L" : "M"}${xPx(i).toFixed(1)},${yLoad(p.ctl).toFixed(1)}`)
    .join(" ");
  const ctlArea =
    n > 0
      ? `M${xPx(0).toFixed(1)},${MAIN_BOTTOM} ` +
        points.map((p, i) => `L${xPx(i).toFixed(1)},${yLoad(p.ctl).toFixed(1)}`).join(" ") +
        ` L${xPx(n - 1).toFixed(1)},${MAIN_BOTTOM} Z`
      : "";
  const atlLine = points
    .map((p, i) => `${i ? "L" : "M"}${xPx(i).toFixed(1)},${yLoad(p.atl).toFixed(1)}`)
    .join(" ");
  const tsbLine = points
    .map((p, i) => `${i ? "L" : "M"}${xPx(i).toFixed(1)},${yTsb(p.tsb).toFixed(1)}`)
    .join(" ");
  const tsbArea =
    n > 0
      ? `M${xPx(0).toFixed(1)},${TSB_MID} ` +
        points.map((p, i) => `L${xPx(i).toFixed(1)},${yTsb(p.tsb).toFixed(1)}`).join(" ") +
        ` L${xPx(n - 1).toFixed(1)},${TSB_MID} Z`
      : "";

  // Projected continuations (T05): each path starts at the last historical
  // point so the dashed line visually grows out of the solid series.
  const projPath = (
    series: PmcSeriesPoint[],
    value: (p: PmcSeriesPoint) => number,
    y: (v: number) => number
  ) =>
    n === 0 || series.length === 0
      ? ""
      : `M${xPx(n - 1).toFixed(1)},${y(value(points[n - 1])).toFixed(1)} ` +
        series.map((p, i) => `L${xPx(n + i).toFixed(1)},${y(value(p)).toFixed(1)}`).join(" ");
  const projectedPaths = projection
    ? [
        {
          key: "steady-ctl",
          d: projPath(projection.steady, (p) => p.ctl, yLoad),
          color: "var(--primary)",
        },
        {
          key: "steady-tsb",
          d: projPath(projection.steady, (p) => p.tsb, yTsb),
          color: "var(--chart-4)",
        },
        {
          key: "rest-ctl",
          d: projPath(projection.rest, (p) => p.ctl, yLoad),
          color: "var(--muted-foreground)",
        },
        {
          key: "rest-tsb",
          d: projPath(projection.rest, (p) => p.tsb, yTsb),
          color: "var(--muted-foreground)",
        },
      ].filter((path) => path.d !== "")
    : [];

  // Markers (races, goals) matched to a point by date. A marker whose date
  // falls outside the currently shown points (e.g. a goal beyond today, or a
  // race outside the selected window) simply has no match and is dropped —
  // the page is expected to pre-filter to the window, this is just the safety
  // net so an out-of-range marker never throws.
  const resolvedMarkers = useMemo(() => {
    const dateIndex = new Map(points.map((p, i) => [p.date, i] as const));
    return markers
      .map((m) => {
        const index = dateIndex.get(m.date);
        return index == null ? null : { ...m, index };
      })
      .filter((m): m is PmcMarker & { index: number } => m !== null);
  }, [markers, points]);
  const raceMarkers = resolvedMarkers.filter((m) => m.kind === "race");
  const goalMarkers = resolvedMarkers.filter((m) => m.kind === "goal");

  // Evenly spaced date ticks along the shared bottom axis, covering the
  // projected region too so the extended x domain stays readable.
  const ticks = useMemo(() => {
    const dates = [...points.map((p) => p.date), ...(projection?.steady ?? []).map((p) => p.date)];
    if (dates.length === 0) return [];
    const count = Math.min(5, dates.length);
    return Array.from({ length: count }, (_, k) => {
      const i = count === 1 ? 0 : Math.round((k / (count - 1)) * (dates.length - 1));
      return { i, label: fmtDayMonth(parseLocalDate(dates[i]), lang) };
    });
  }, [points, projection, lang]);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || n === 0) return;
    const rect = svg.getBoundingClientRect();
    const vbX = ((e.clientX - rect.left) / rect.width) * VBW;
    const frac = (vbX - PAD_L) / PLOT_W;
    // Clamped to the last historical point: the projected region has no hover.
    const idx = Math.max(0, Math.min(n - 1, Math.round(frac * (total - 1))));
    setHover(idx);
  };

  const onKey = (e: React.KeyboardEvent<SVGSVGElement>) => {
    const next = keyIndex(e.key, hover, n);
    if (next == null) return;
    setHover(next);
    e.preventDefault();
  };

  const hoverX = hover != null ? xPx(hover) : null;
  const hoverPoint = hover != null ? points[hover] : null;
  const hoverMarkers = hover != null ? resolvedMarkers.filter((m) => m.index === hover) : [];

  // Weekly bars in their own compact SVG, with their own hover index.
  const WEEK_H = 120;
  const WEEK_AXIS = 20;
  const weekTotals = weekly.map(weeklyLoadTotal);
  const weekMax = niceMax(Math.max(1, ...weekTotals));
  const barGap = 3;
  const barW =
    weekly.length > 0 ? Math.max(2, (PLOT_W - barGap * (weekly.length - 1)) / weekly.length) : 0;
  const weekX = (i: number) => PAD_L + i * (barW + barGap);
  const onWeekMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = weekSvgRef.current;
    if (!svg || weekly.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const vbX = ((e.clientX - rect.left) / rect.width) * VBW;
    const idx = Math.floor((vbX - PAD_L) / (barW + barGap));
    setWeekHover(Math.max(0, Math.min(weekly.length - 1, idx)));
  };
  const onWeekKey = (e: React.KeyboardEvent<SVGSVGElement>) => {
    const next = keyIndex(e.key, weekHover, weekly.length);
    if (next == null) return;
    setWeekHover(next);
    e.preventDefault();
  };
  const weekTicks = useMemo(() => {
    if (weekly.length === 0) return [];
    const count = Math.min(4, weekly.length);
    return Array.from({ length: count }, (_, k) => {
      const i = count === 1 ? 0 : Math.round((k / (count - 1)) * (weekly.length - 1));
      return { i, label: fmtDayMonth(parseLocalDate(weekly[i].date), lang) };
    });
  }, [weekly, lang]);

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-medium">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: "var(--primary)" }}
              aria-hidden
            />
            {t.fitness.ctl}
          </span>
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: "var(--chart-3)" }}
              aria-hidden
            />
            {t.fitness.atl}
          </span>
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: "var(--chart-4)" }}
              aria-hidden
            />
            {t.fitness.tsb}
          </span>
          {projLen > 0 ? (
            <>
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span
                  className="h-0.5 w-3.5"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(to right, var(--primary) 0 4px, transparent 4px 7px)",
                  }}
                  aria-hidden
                />
                {t.fitness.projSteady}
              </span>
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span
                  className="h-0.5 w-3.5"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(to right, var(--muted-foreground) 0 4px, transparent 4px 7px)",
                  }}
                  aria-hidden
                />
                {t.fitness.projRest}
              </span>
            </>
          ) : null}
        </div>

        {/* wellness overlay toggles (T08): the chart owns which lanes are on */}
        {wellness.length > 0 ? (
          <div
            role="group"
            aria-label={t.fitness.wellness}
            className="mb-3 flex flex-wrap items-center gap-1.5"
          >
            {wellness.map((lane) => {
              const on = shownWellness.includes(lane.metric);
              return (
                <button
                  key={lane.metric}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setShownWellness((prev) =>
                      prev.includes(lane.metric)
                        ? prev.filter((m) => m !== lane.metric)
                        : [...prev, lane.metric]
                    )
                  }
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                    on
                      ? "border-ring text-foreground"
                      : "border-border text-muted-foreground hover:border-ring hover:text-foreground"
                  )}
                >
                  <span
                    className="size-2 rounded-full"
                    style={{
                      backgroundColor: on ? WELLNESS_COLOR[lane.metric] : "var(--muted)",
                    }}
                    aria-hidden
                  />
                  {t.health.metrics[lane.metric]}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="relative w-full overflow-x-auto">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${VBW} ${chartH}`}
            width="100%"
            style={{ height: "auto", touchAction: "none" }}
            role="img"
            tabIndex={0}
            aria-label={t.fitness.title}
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => setHover(null)}
            onKeyDown={onKey}
            className="outline-none"
          >
            {/* main panel frame + load ticks */}
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
              y1={MAIN_BOTTOM}
              x2={VBW - PAD_R}
              y2={MAIN_BOTTOM}
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
              {loadMax}
            </text>
            <text
              x={PAD_L - 6}
              y={MAIN_BOTTOM}
              textAnchor="end"
              fontSize={9}
              fill="var(--muted-foreground)"
              className="font-mono"
            >
              0
            </text>

            {ctlArea ? <path d={ctlArea} fill="var(--primary)" opacity={0.14} /> : null}
            {atlLine ? (
              <path
                d={atlLine}
                fill="none"
                stroke="var(--chart-3)"
                strokeWidth={1.75}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null}
            {ctlLine ? (
              <path
                d={ctlLine}
                fill="none"
                stroke="var(--primary)"
                strokeWidth={2.25}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null}

            {/* TSB panel: form-zone background bands + right-edge labels */}
            {visibleBands.map((band) => (
              <g key={band.key}>
                <rect
                  x={PAD_L}
                  y={band.yTop}
                  width={PLOT_W}
                  height={band.yBottom - band.yTop}
                  fill={band.color}
                  opacity={band.opacity}
                />
                {band.yBottom - band.yTop >= BAND_LABEL_MIN_HEIGHT ? (
                  <text
                    x={VBW - PAD_R - 3}
                    y={(band.yTop + band.yBottom) / 2 + 3}
                    textAnchor="end"
                    fontSize={9}
                    fill="var(--muted-foreground)"
                    className="font-mono"
                    opacity={0.7}
                  >
                    {t.fitness.states[band.key]}
                  </text>
                ) : null}
              </g>
            ))}

            {/* TSB band: zero baseline + line + subtle area */}
            <line
              x1={PAD_L}
              y1={TSB_MID}
              x2={VBW - PAD_R}
              y2={TSB_MID}
              stroke="var(--border)"
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.7}
            />
            <text
              x={PAD_L - 6}
              y={TSB_TOP + 4}
              textAnchor="end"
              fontSize={9}
              fill="var(--muted-foreground)"
              className="font-mono"
            >
              +{tsbMax}
            </text>
            <text
              x={PAD_L - 6}
              y={TSB_TOP + TSB_H}
              textAnchor="end"
              fontSize={9}
              fill="var(--muted-foreground)"
              className="font-mono"
            >
              -{tsbMax}
            </text>
            {tsbArea ? <path d={tsbArea} fill="var(--chart-4)" opacity={0.1} /> : null}
            {tsbLine ? (
              <path
                d={tsbLine}
                fill="none"
                stroke="var(--chart-4)"
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null}

            {/* ramp-rate lane: step area of rampRate around a dashed zero line
                (T03), clamped to [-10, +12] with a dotted +8 warning reference. */}
            <line
              x1={PAD_L}
              y1={rampZeroY}
              x2={VBW - PAD_R}
              y2={rampZeroY}
              stroke="var(--border)"
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.7}
            />
            <line
              x1={PAD_L}
              y1={rampWarnY}
              x2={VBW - PAD_R}
              y2={rampWarnY}
              stroke="var(--wear-worn)"
              strokeWidth={1}
              strokeDasharray="1 3"
              opacity={0.5}
            />
            <text
              x={PAD_L - 6}
              y={RAMP_TOP + 4}
              textAnchor="end"
              fontSize={9}
              fill="var(--muted-foreground)"
              className="font-mono"
            >
              +{RAMP_MAX}
            </text>
            <text
              x={PAD_L - 6}
              y={RAMP_TOP + RAMP_H}
              textAnchor="end"
              fontSize={9}
              fill="var(--muted-foreground)"
              className="font-mono"
            >
              {RAMP_MIN}
            </text>
            {rampBars.map(({ i, value }) => {
              const yValue = yRamp(value);
              const top = Math.min(rampZeroY, yValue);
              const height = Math.abs(rampZeroY - yValue);
              return (
                <rect
                  key={`ramp-${i}`}
                  x={xPx(i) - rampBarW / 2}
                  y={top}
                  width={rampBarW}
                  height={height}
                  fill={value >= 0 ? "var(--positive)" : "var(--chart-2)"}
                  opacity={0.15}
                />
              );
            })}

            {/* wellness lanes (T08): 7-day trailing average as the line, faint
                daily dots, broken over days the wearable has no reading for */}
            {laneGeom.map(({ lane, top, bottom, lo, hi, yPx, segments, dots }) => {
              const color = WELLNESS_COLOR[lane.metric];
              const hoverAvg = hover != null ? (lane.points[hover]?.avg ?? null) : null;
              return (
                <g key={lane.metric}>
                  <line
                    x1={PAD_L}
                    y1={bottom}
                    x2={VBW - PAD_R}
                    y2={bottom}
                    stroke="var(--border)"
                    strokeWidth={1}
                    opacity={0.5}
                  />
                  <text
                    x={PAD_L - 6}
                    y={top + 4}
                    textAnchor="end"
                    fontSize={9}
                    fill="var(--muted-foreground)"
                    className="font-mono"
                  >
                    {laneValue(hi)}
                  </text>
                  <text
                    x={PAD_L - 6}
                    y={bottom}
                    textAnchor="end"
                    fontSize={9}
                    fill="var(--muted-foreground)"
                    className="font-mono"
                  >
                    {laneValue(lo)}
                  </text>
                  <text
                    x={PAD_L + 3}
                    y={top + 8}
                    fontSize={9}
                    fill={color}
                    className="font-mono"
                    opacity={0.8}
                  >
                    {t.health.metrics[lane.metric]}
                    {lane.unit ? ` · ${lane.unit}` : ""}
                  </text>
                  {dots.map((dot) => (
                    <circle
                      key={`dot-${dot.i}`}
                      cx={xPx(dot.i)}
                      cy={dot.y}
                      r={1.25}
                      fill={color}
                      opacity={0.35}
                    />
                  ))}
                  {segments.map((d, si) => (
                    <path
                      key={`seg-${si}`}
                      d={d}
                      fill="none"
                      stroke={color}
                      strokeWidth={1.5}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  ))}
                  {hoverAvg != null && hoverX != null ? (
                    <circle
                      cx={hoverX}
                      cy={yPx(hoverAvg)}
                      r={3}
                      fill={color}
                      stroke="var(--card)"
                      strokeWidth={1.5}
                    />
                  ) : null}
                </g>
              );
            })}

            {/* projection (T05): today divider, then dashed CTL/TSB
                continuations for the steady and full-rest scenarios */}
            {projLen > 0 && n > 0 ? (
              <>
                <line
                  x1={xPx(n - 1)}
                  y1={TOP}
                  x2={xPx(n - 1)}
                  y2={plotBottom}
                  stroke="var(--foreground)"
                  strokeWidth={1}
                  strokeDasharray={PROJECTED_DASH}
                  opacity={0.3}
                />
                <text
                  x={xPx(n - 1) + 3}
                  y={TOP + 8}
                  fontSize={9}
                  fill="var(--muted-foreground)"
                  className="font-mono"
                >
                  {t.fitness.today}
                </text>
              </>
            ) : null}
            {projectedPaths.map((path) => (
              <path
                key={path.key}
                d={path.d}
                fill="none"
                stroke={path.color}
                strokeWidth={1.5}
                strokeDasharray={PROJECTED_DASH}
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={0.75}
              />
            ))}

            {/* x-axis ticks */}
            {ticks.map((tick) => (
              <g key={tick.i}>
                <line
                  x1={xPx(tick.i)}
                  y1={TOP}
                  x2={xPx(tick.i)}
                  y2={plotBottom}
                  stroke="var(--border)"
                  strokeWidth={1}
                  opacity={0.2}
                />
                <text
                  x={xPx(tick.i)}
                  y={plotBottom + 15}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--muted-foreground)"
                  className="font-mono"
                >
                  {tick.label}
                </text>
              </g>
            ))}

            {/* goal markers: dashed vertical line + top label (T02) */}
            {goalMarkers.map((m) => (
              <g key={`goal-${m.index}-${m.label}`}>
                <line
                  x1={xPx(m.index)}
                  y1={TOP}
                  x2={xPx(m.index)}
                  y2={plotBottom}
                  stroke="var(--muted-foreground)"
                  strokeWidth={1}
                  strokeDasharray="2 3"
                  opacity={0.5}
                />
                <text
                  x={xPx(m.index)}
                  y={TOP - 2}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--muted-foreground)"
                  className="font-mono"
                >
                  {m.label}
                </text>
              </g>
            ))}

            {/* race markers: small circles on the CTL line (T02) */}
            {raceMarkers.map((m) => (
              <circle
                key={`race-${m.index}-${m.label}`}
                cx={xPx(m.index)}
                cy={yLoad(points[m.index].ctl)}
                r={4}
                fill="var(--wear-critical)"
                stroke="var(--card)"
                strokeWidth={2}
              />
            ))}

            {/* crosshair + hover dots */}
            {hoverX != null && hoverPoint != null ? (
              <>
                <line
                  x1={hoverX}
                  y1={TOP}
                  x2={hoverX}
                  y2={plotBottom}
                  stroke="var(--foreground)"
                  strokeWidth={1}
                  opacity={0.35}
                  pointerEvents="none"
                />
                <circle
                  cx={hoverX}
                  cy={yLoad(hoverPoint.ctl)}
                  r={3.5}
                  fill="var(--primary)"
                  stroke="var(--card)"
                  strokeWidth={1.5}
                />
                <circle
                  cx={hoverX}
                  cy={yLoad(hoverPoint.atl)}
                  r={3}
                  fill="var(--chart-3)"
                  stroke="var(--card)"
                  strokeWidth={1.5}
                />
                <circle
                  cx={hoverX}
                  cy={yTsb(hoverPoint.tsb)}
                  r={3}
                  fill="var(--chart-4)"
                  stroke="var(--card)"
                  strokeWidth={1.5}
                />
              </>
            ) : null}
          </svg>

          {hover != null && hoverPoint != null && hoverX != null ? (
            <div
              className="pointer-events-none absolute top-1 z-10 rounded-lg border bg-card/95 px-2.5 py-2 text-xs shadow-md backdrop-blur"
              style={{
                left: `${(hoverX / VBW) * 100}%`,
                transform: `translateX(${hoverX > VBW / 2 ? "-100%" : "0"}) translateX(${hoverX > VBW / 2 ? "-8px" : "8px"})`,
              }}
            >
              <div className="mb-1 font-mono font-medium text-foreground">
                {fmtDayMonth(parseLocalDate(hoverPoint.date), lang)}
              </div>
              <div className="space-y-0.5">
                {[
                  {
                    label: t.fitness.ctl,
                    value: Math.round(hoverPoint.ctl),
                    color: "var(--primary)",
                  },
                  {
                    label: t.fitness.atl,
                    value: Math.round(hoverPoint.atl),
                    color: "var(--chart-3)",
                  },
                  {
                    label: t.fitness.tsb,
                    value: fmtTsb(hoverPoint.tsb),
                    color: STATE_COLOR[formState(hoverPoint.tsb).key],
                  },
                  ...(hoverPoint.rampRate != null
                    ? [
                        {
                          label: t.fitness.ramp,
                          value: `${hoverPoint.rampRate >= 0 ? "+" : ""}${hoverPoint.rampRate.toFixed(1)} ${t.fitness.perWeek}`,
                          color: hoverPoint.rampRate >= 0 ? "var(--positive)" : "var(--chart-2)",
                        },
                      ]
                    : []),
                  // One row per enabled wellness lane (T08); a day the wearable
                  // has no reading for shows "–" rather than a stale value.
                  ...laneGeom.map(({ lane }) => {
                    const value = lane.points[hover]?.value ?? null;
                    return {
                      label: t.health.metrics[lane.metric],
                      value: value == null ? "–" : `${laneValue(value)} ${lane.unit}`.trim(),
                      color: WELLNESS_COLOR[lane.metric],
                    };
                  }),
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: row.color }}
                        aria-hidden
                      />
                      {row.label}
                    </span>
                    <span className="font-mono tabular-nums" style={{ color: row.color }}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
              {hoverMarkers.length > 0 ? (
                <div className="mt-1 space-y-0.5 border-t pt-1">
                  {hoverMarkers.map((m) => (
                    <div
                      key={`${m.kind}-${m.label}`}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="text-muted-foreground">
                        {m.kind === "race" ? t.detail.race : t.fitness.markerGoal}
                      </span>
                      <span className="font-medium text-foreground">{m.label}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* race-day form readout (T05), only when a goal sits inside the horizon */}
        {projection?.raceDay ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {fill(t.fitness.raceDayForm, {
              n: projection.raceDay.daysAway,
              rest: (
                <span
                  className="font-mono font-medium"
                  style={{ color: STATE_COLOR[formState(projection.raceDay.restTsb).key] }}
                >
                  {fmtTsb(projection.raceDay.restTsb)}
                </span>
              ),
              steady: (
                <span
                  className="font-mono font-medium"
                  style={{ color: STATE_COLOR[formState(projection.raceDay.steadyTsb).key] }}
                >
                  {fmtTsb(projection.raceDay.steadyTsb)}
                </span>
              ),
            })}
          </p>
        ) : null}
      </div>

      {weekly.length > 0 ? (
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <h3 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
              {t.fitness.weeklyLoad}
            </h3>
            {LOAD_SPORTS.map((sport) => (
              <span
                key={sport}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
              >
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: SPORT_COLOR[sport] }}
                  aria-hidden
                />
                {t.sports[sport]}
              </span>
            ))}
          </div>
          <div className="relative w-full overflow-x-auto">
            <svg
              ref={weekSvgRef}
              viewBox={`0 0 ${VBW} ${WEEK_H + WEEK_AXIS}`}
              width="100%"
              style={{ height: "auto", touchAction: "none" }}
              role="img"
              tabIndex={0}
              aria-label={t.fitness.weeklyLoad}
              onPointerMove={onWeekMove}
              onPointerDown={onWeekMove}
              onPointerLeave={() => setWeekHover(null)}
              onKeyDown={onWeekKey}
              className="outline-none"
            >
              <line
                x1={PAD_L}
                y1={WEEK_H}
                x2={VBW - PAD_R}
                y2={WEEK_H}
                stroke="var(--border)"
                strokeWidth={1}
              />
              <text
                x={PAD_L - 6}
                y={12}
                textAnchor="end"
                fontSize={9}
                fill="var(--muted-foreground)"
                className="font-mono"
              >
                {weekMax}
              </text>
              {weekly.map((w, i) => {
                // Stack from the baseline up in LOAD_SPORTS order; each segment's
                // height comes straight from its own load so the stack always
                // sums to the week's total.
                let baseline = WEEK_H;
                return (
                  <g key={w.date}>
                    {LOAD_SPORTS.map((sport) => {
                      const h = (w.load[sport] / weekMax) * (WEEK_H - 4);
                      if (h <= 0) return null;
                      baseline -= h;
                      return (
                        <rect
                          key={sport}
                          x={weekX(i)}
                          y={baseline}
                          width={barW}
                          height={h}
                          fill={SPORT_COLOR[sport]}
                          opacity={weekHover === i ? 1 : 0.8}
                        />
                      );
                    })}
                  </g>
                );
              })}
              {weekTicks.map((tick) => {
                const x = weekX(tick.i) + barW / 2;
                return (
                  <text
                    key={tick.i}
                    x={x}
                    y={WEEK_H + 14}
                    textAnchor="middle"
                    fontSize={9}
                    fill="var(--muted-foreground)"
                    className="font-mono"
                  >
                    {tick.label}
                  </text>
                );
              })}
            </svg>

            {weekHover != null && weekly[weekHover] != null ? (
              <div
                className="pointer-events-none absolute top-1 z-10 rounded-lg border bg-card/95 px-2.5 py-2 text-xs shadow-md backdrop-blur"
                style={{
                  left: `${((weekX(weekHover) + barW / 2) / VBW) * 100}%`,
                  transform: `translateX(${weekX(weekHover) > VBW / 2 ? "-100%" : "0"}) translateX(${weekX(weekHover) > VBW / 2 ? "-8px" : "8px"})`,
                }}
              >
                <div className="mb-1 font-mono font-medium text-foreground">
                  {fmtDayMonth(parseLocalDate(weekly[weekHover].date), lang)}
                </div>
                <div className="space-y-0.5">
                  {LOAD_SPORTS.filter((sport) => weekly[weekHover].load[sport] > 0).map((sport) => (
                    <div key={sport} className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: SPORT_COLOR[sport] }}
                          aria-hidden
                        />
                        {t.sports[sport]}
                      </span>
                      <span
                        className="font-mono tabular-nums"
                        style={{ color: SPORT_COLOR[sport] }}
                      >
                        {Math.round(weekly[weekHover].load[sport])}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-1 flex items-center justify-between gap-3 border-t pt-1">
                  <span className="text-muted-foreground">{t.fitness.weeklyTotal}</span>
                  <span className="font-mono font-medium tabular-nums text-foreground">
                    {Math.round(weekTotals[weekHover])} {t.fitness.tssUnit}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
