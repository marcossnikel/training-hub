"use client";

import { useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { fmtDayMonth, parseLocalDate } from "@/lib/format";
import {
  formState,
  TSB_FRESH_ABOVE,
  TSB_NEUTRAL_FLOOR,
  TSB_PRODUCTIVE_FLOOR,
  TSB_TRANSITION_ABOVE,
  type FormStateKey,
} from "@/lib/fitness";

/** Text color for a form state, the source of truth for STATE-colored copy
 * (stat tiles on /fitness, this chart's TSB tooltip row). */
export const STATE_COLOR: Record<FormStateKey, string> = {
  transition: "var(--wear-worn)",
  fresh: "var(--positive)",
  neutral: "var(--muted-foreground)",
  productive: "var(--primary)",
  fatigued: "var(--wear-critical)",
};

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
}

export interface WeeklyBar {
  date: string; // Monday, YYYY-MM-DD local
  load: number;
}

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
const PMC_H = TSB_TOP + TSB_H + AXIS_H;

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const scaled = value / pow;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * pow;
}

export function PmcChart({ points, weekly }: { points: PmcSeriesPoint[]; weekly: WeeklyBar[] }) {
  const { t, lang } = useI18n();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  const n = points.length;
  const xPx = (i: number) => (n <= 1 ? PAD_L + PLOT_W / 2 : PAD_L + (i / (n - 1)) * PLOT_W);

  const loadMax = useMemo(
    () => niceMax(Math.max(1, ...points.map((p) => Math.max(p.ctl, p.atl)))),
    [points]
  );
  const tsbMax = useMemo(
    () => niceMax(Math.max(1, ...points.map((p) => Math.abs(p.tsb)))),
    [points]
  );

  const yLoad = (v: number) => MAIN_BOTTOM - (v / loadMax) * MAIN_H;
  const yTsb = (v: number) => TSB_MID - (v / tsbMax) * (TSB_H / 2);

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

  // Evenly spaced date ticks along the shared bottom axis.
  const ticks = useMemo(() => {
    if (n === 0) return [];
    const count = Math.min(5, n);
    return Array.from({ length: count }, (_, k) => {
      const i = count === 1 ? 0 : Math.round((k / (count - 1)) * (n - 1));
      return { i, label: fmtDayMonth(parseLocalDate(points[i].date), lang) };
    });
  }, [n, points, lang]);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || n === 0) return;
    const rect = svg.getBoundingClientRect();
    const vbX = ((e.clientX - rect.left) / rect.width) * VBW;
    const frac = (vbX - PAD_L) / PLOT_W;
    const idx = Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1))));
    setHover(idx);
  };

  // Keyboard navigation across the data points, mirroring activity-chart: arrows
  // step the active point (from no selection, ArrowRight/Left land on the ends),
  // Home/End jump to the first/last.
  const onKey = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (n === 0) return;
    if (e.key === "ArrowRight") {
      setHover(Math.min(n - 1, (hover == null ? -1 : hover) + 1));
      e.preventDefault();
    } else if (e.key === "ArrowLeft") {
      // From no selection, step back from the count so we land on the LAST
      // point (n - 1); otherwise step back one from the current point.
      setHover(Math.max(0, (hover == null ? n : hover) - 1));
      e.preventDefault();
    } else if (e.key === "Home") {
      setHover(0);
      e.preventDefault();
    } else if (e.key === "End") {
      setHover(n - 1);
      e.preventDefault();
    }
  };

  const hoverX = hover != null ? xPx(hover) : null;
  const hoverPoint = hover != null ? points[hover] : null;

  // Weekly bars in their own compact SVG.
  const WEEK_H = 120;
  const WEEK_AXIS = 20;
  const weekMax = niceMax(Math.max(1, ...weekly.map((w) => w.load)));
  const barGap = 3;
  const barW =
    weekly.length > 0 ? Math.max(2, (PLOT_W - barGap * (weekly.length - 1)) / weekly.length) : 0;
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
        </div>

        <div className="relative w-full overflow-x-auto">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${VBW} ${PMC_H}`}
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

            {/* x-axis ticks */}
            {ticks.map((tick) => (
              <g key={tick.i}>
                <line
                  x1={xPx(tick.i)}
                  y1={TOP}
                  x2={xPx(tick.i)}
                  y2={TSB_TOP + TSB_H}
                  stroke="var(--border)"
                  strokeWidth={1}
                  opacity={0.2}
                />
                <text
                  x={xPx(tick.i)}
                  y={TSB_TOP + TSB_H + 15}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--muted-foreground)"
                  className="font-mono"
                >
                  {tick.label}
                </text>
              </g>
            ))}

            {/* crosshair + markers */}
            {hoverX != null && hoverPoint != null ? (
              <>
                <line
                  x1={hoverX}
                  y1={TOP}
                  x2={hoverX}
                  y2={TSB_TOP + TSB_H}
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
                    value: Math.round(hoverPoint.tsb),
                    color: STATE_COLOR[formState(hoverPoint.tsb).key],
                  },
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
            </div>
          ) : null}
        </div>
      </div>

      {weekly.length > 0 ? (
        <div>
          <h3 className="mb-3 text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {t.fitness.weeklyLoad}
          </h3>
          <div className="w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${VBW} ${WEEK_H + WEEK_AXIS}`}
              width="100%"
              style={{ height: "auto" }}
              role="img"
              aria-label={t.fitness.weeklyLoad}
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
                const h = (w.load / weekMax) * (WEEK_H - 4);
                const x = PAD_L + i * (barW + barGap);
                return (
                  <rect
                    key={w.date}
                    x={x}
                    y={WEEK_H - h}
                    width={barW}
                    height={h}
                    rx={1.5}
                    fill="var(--primary)"
                    opacity={0.8}
                  >
                    <title>{`${fmtDayMonth(parseLocalDate(w.date), lang)} · ${Math.round(w.load)} ${t.fitness.tssUnit}`}</title>
                  </rect>
                );
              })}
              {weekTicks.map((tick) => {
                const x = PAD_L + tick.i * (barW + barGap) + barW / 2;
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
          </div>
        </div>
      ) : null}
    </div>
  );
}
