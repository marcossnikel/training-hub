"use client";

// One mean-max curve panel: the selected window's best in each bucket over the
// all-time best. Hand-rolled SVG in the house style (unitless viewBox, colors
// only via CSS vars, crosshair + HTML tooltip). Pointer and keyboard reach the
// same buckets — the tooltip is the only place a value, its activity and its
// date are written, so a pointer-only chart would put all of it out of reach —
// and neither one selects anything: nothing here is clickable.
//
// Carries no business math: `curveSeries` in src/lib/curves.ts already picked
// the winning value and activity per bucket, so this file only maps numbers to
// coordinates and formats them.

import { useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { keyIndex } from "@/lib/chart-keys";
import { fmtPower } from "@/lib/cycling";
import { fmtDateWithYear, fmtPace } from "@/lib/format";
import { type CurveBucketBest, type CurveKind, type CurveSeriesPoint } from "@/lib/curves";

// viewBox geometry (unitless; the SVG scales to its container width).
const VBW = 600;
const PAD_L = 46;
const PAD_R = 12;
const TOP = 12;
const PLOT_H = 150;
const AXIS_H = 22;
const PLOT_W = VBW - PAD_L - PAD_R;
const BOTTOM = TOP + PLOT_H;
const VBH = BOTTOM + AXIS_H;
// Room kept above and below the extremes so the top and bottom dots stay whole.
const INSET = 6;

const WINDOW_COLOR = "var(--primary)";
const ALL_TIME_COLOR = "var(--muted-foreground)";

/**
 * Contiguous runs of plotted points as SVG polyline strings. A bucket the
 * selected window never reached breaks the line rather than being bridged: the
 * gap is missing data, not a slide between two distances.
 */
function segmentsOf(points: ({ x: number; y: number } | null)[]): string[] {
  const segments: string[] = [];
  let run: string[] = [];
  for (const point of points) {
    if (point === null) {
      if (run.length > 1) segments.push(run.join(" "));
      run = [];
      continue;
    }
    run.push(`${point.x.toFixed(1)},${point.y.toFixed(1)}`);
  }
  if (run.length > 1) segments.push(run.join(" "));
  return segments;
}

/**
 * @param points Buckets to draw, in bucket order. An EMPTY list renders nothing
 *   at all: there is no curve, and a panel scaled to no values would name its
 *   axis "Infinity:NaN /km".
 */
export function MeanMaxCurve({
  kind,
  points,
  windowLabel,
}: {
  kind: CurveKind;
  points: CurveSeriesPoint[];
  /** Label of the selected time window, used for the first series everywhere. */
  windowLabel: string;
}) {
  const { t, lang } = useI18n();
  const tp = t.performance;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  const n = points.length;
  const fmtValue = kind === "pace" ? fmtPace : fmtPower;

  const geom = useMemo(() => {
    const values = points.flatMap((point) =>
      point.windowed ? [point.allTime.value, point.windowed.value] : [point.allTime.value]
    );
    const hi = Math.max(...values);
    const lo = Math.min(...values);
    // A flat curve (one bucket, or every bucket at the same value) has no span
    // to scale against; centre it instead of dividing by zero.
    const span = hi - lo;
    const xPx = (i: number) => (n <= 1 ? PAD_L + PLOT_W / 2 : PAD_L + (i / (n - 1)) * PLOT_W);
    const yPx = (value: number) => {
      if (span <= 0) return TOP + PLOT_H / 2;
      // Better is always UP: the lowest pace and the highest wattage both sit at
      // the top of the panel. Swapping these two branches draws either panel
      // upside down, which no axis label would give away — mean-max-curve.test
      // compares the plotted heights for exactly that reason.
      const frac = kind === "power" ? (value - lo) / span : (hi - value) / span;
      return BOTTOM - INSET - frac * (PLOT_H - 2 * INSET);
    };
    const at = (best: CurveBucketBest | null, i: number) =>
      best === null ? null : { x: xPx(i), y: yPx(best.value) };
    return {
      xPx,
      yPx,
      // The value drawn at the top of the panel, and the one at the bottom.
      top: kind === "power" ? hi : lo,
      bottom: kind === "power" ? lo : hi,
      flat: span <= 0,
      windowSegments: segmentsOf(points.map((point, i) => at(point.windowed, i))),
      allTimeSegments: segmentsOf(points.map((point, i) => at(point.allTime, i))),
    };
  }, [points, n, kind]);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || n === 0) return;
    const rect = svg.getBoundingClientRect();
    const vbX = ((e.clientX - rect.left) / rect.width) * VBW;
    const frac = (vbX - PAD_L) / PLOT_W;
    setHover(Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1)))));
  };

  // The same stepping the PMC and activity charts use, so a reader who has
  // learned one hover chart has learned this one.
  const onKey = (e: React.KeyboardEvent<SVGSVGElement>) => {
    const next = keyIndex(e.key, hover, n);
    if (next === null) return;
    setHover(next);
    e.preventDefault();
  };

  const hoverPoint = hover === null ? null : points[hover];
  const hoverX = hover === null ? null : geom.xPx(hover);

  // Nothing to draw and nothing to scale against (see `points`). After the
  // hooks, which must run on every render.
  if (n === 0) return null;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {[
          { label: windowLabel, color: WINDOW_COLOR, dashed: false },
          { label: tp.curveAllTime, color: ALL_TIME_COLOR, dashed: true },
        ].map((series) => (
          <span key={series.label} className="flex items-center gap-1.5 text-muted-foreground">
            <svg width="14" height="4" aria-hidden>
              <line
                x1={0}
                y1={2}
                x2={14}
                y2={2}
                stroke={series.color}
                strokeWidth={2}
                strokeDasharray={series.dashed ? "3 2" : undefined}
              />
            </svg>
            {series.label}
          </span>
        ))}
      </div>

      <div className="relative w-full">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VBW} ${VBH}`}
          width="100%"
          style={{ height: "auto", touchAction: "none" }}
          role="img"
          tabIndex={0}
          aria-label={kind === "pace" ? tp.paceCurveLabel : tp.powerCurveLabel}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
          onKeyDown={onKey}
          className="outline-none"
        >
          <line
            x1={PAD_L}
            y1={BOTTOM}
            x2={VBW - PAD_R}
            y2={BOTTOM}
            stroke="var(--border)"
            strokeWidth={1}
          />
          {/* The extremes are named at the heights they are actually plotted at.
              A flat curve names its single value once, down the middle. */}
          {geom.flat ? (
            <text
              x={PAD_L - 5}
              y={TOP + PLOT_H / 2 + 3}
              textAnchor="end"
              fontSize={8}
              fill="var(--muted-foreground)"
              className="font-mono"
            >
              {fmtValue(geom.top)}
            </text>
          ) : (
            <>
              <text
                x={PAD_L - 5}
                y={geom.yPx(geom.top) + 3}
                textAnchor="end"
                fontSize={8}
                fill="var(--muted-foreground)"
                className="font-mono"
              >
                {fmtValue(geom.top)}
              </text>
              <text
                x={PAD_L - 5}
                y={geom.yPx(geom.bottom) + 3}
                textAnchor="end"
                fontSize={8}
                fill="var(--muted-foreground)"
                className="font-mono"
              >
                {fmtValue(geom.bottom)}
              </text>
            </>
          )}

          {geom.allTimeSegments.map((segment) => (
            <polyline
              key={segment}
              points={segment}
              fill="none"
              stroke={ALL_TIME_COLOR}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {geom.windowSegments.map((segment) => (
            <polyline
              key={segment}
              points={segment}
              fill="none"
              stroke={WINDOW_COLOR}
              strokeWidth={1.75}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {points.map((point, i) => (
            <g key={point.bucket}>
              <circle
                cx={geom.xPx(i)}
                cy={geom.yPx(point.allTime.value)}
                r={1.75}
                fill={ALL_TIME_COLOR}
              />
              {point.windowed ? (
                <circle
                  cx={geom.xPx(i)}
                  cy={geom.yPx(point.windowed.value)}
                  r={2.5}
                  fill={WINDOW_COLOR}
                />
              ) : null}
            </g>
          ))}

          {hoverX !== null ? (
            <line
              x1={hoverX}
              y1={TOP}
              x2={hoverX}
              y2={BOTTOM}
              stroke="var(--foreground)"
              strokeWidth={1}
              opacity={0.35}
              pointerEvents="none"
            />
          ) : null}

          {points.map((point, i) => (
            <text
              key={point.bucket}
              x={geom.xPx(i)}
              y={VBH - 6}
              textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
              fontSize={8}
              fill="var(--muted-foreground)"
              className="font-mono"
            >
              {tp.curveBuckets[point.bucket]}
            </text>
          ))}
        </svg>

        {hoverPoint !== null && hoverX !== null ? (
          <div
            className="pointer-events-none absolute top-1 z-10 max-w-[240px] rounded-lg border bg-card/95 px-2.5 py-2 text-xs shadow-md backdrop-blur"
            style={{
              left: `${(hoverX / VBW) * 100}%`,
              transform: `translateX(${hoverX > VBW / 2 ? "-100%" : "0"}) translateX(${hoverX > VBW / 2 ? "-8px" : "8px"})`,
            }}
          >
            <div className="mb-1 font-mono font-medium text-foreground">
              {tp.curveBuckets[hoverPoint.bucket]}
            </div>
            <div className="space-y-1">
              {[
                { label: windowLabel, color: WINDOW_COLOR, best: hoverPoint.windowed },
                { label: tp.curveAllTime, color: ALL_TIME_COLOR, best: hoverPoint.allTime },
              ].map((row) => (
                <div key={row.label}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: row.color }}
                        aria-hidden
                      />
                      {row.label}
                    </span>
                    <span className="font-mono tabular-nums" style={{ color: row.color }}>
                      {row.best ? fmtValue(row.best.value) : "–"}
                    </span>
                  </div>
                  {row.best ? (
                    <div className="truncate text-2xs text-muted-foreground">
                      {row.best.activityName ?? "–"} · {fmtDateWithYear(row.best.date, lang)}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
