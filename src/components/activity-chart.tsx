"use client";

import { useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import type { ActivityStreams } from "@/lib/streams";
import { fmtDuration, fmtKm } from "@/lib/format";
import {
  AXIS_H,
  GAP,
  PAD_L,
  PAD_R,
  PANEL_H,
  PLOT_W,
  TOP,
  VBW,
  buildSeries,
  extent,
  fmtClock,
  type SeriesDef,
  type SeriesKey,
  type XMode,
} from "@/components/activity-chart-series";

export function ActivityChart({
  activityId,
  streams,
  isRun,
  isRide,
}: {
  activityId: number;
  streams: ActivityStreams;
  isRun: boolean;
  isRide: boolean;
}) {
  const { t } = useI18n();
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Every candidate series with its fixed color slot; only the ones whose
  // stream is present become togglable.
  const allSeries = useMemo<SeriesDef[]>(() => buildSeries(streams, t, isRun), [streams, t, isRun]);

  const available = useMemo(() => allSeries.map((s) => s.key), [allSeries]);
  const hasElevation = available.includes("elevation");

  // Sensible defaults per sport; only ever enabling available series.
  const defaultActive = useMemo(() => {
    const wanted: SeriesKey[] = isRide
      ? ["power", "heartRate", "cadence", ...(hasElevation ? (["elevation"] as SeriesKey[]) : [])]
      : isRun
        ? ["heartRate", "pace", "elevation"]
        : ["heartRate", "elevation"];
    return new Set(wanted.filter((k) => available.includes(k)));
  }, [isRide, isRun, hasElevation, available]);

  const timeAvailable = streams.timeS.some((v) => v != null);
  const distAvailable = streams.distanceKm.some((v) => v != null);
  // Prefer the distance axis, but an activity with no usable distance stream
  // (treadmill / pool) has only time to plot against — defaulting to distance
  // there leaves an empty x-axis and a blank chart.
  const defaultXMode: XMode = distAvailable ? "distance" : "time";

  const [active, setActive] = useState<Set<SeriesKey>>(defaultActive);
  const [xMode, setXMode] = useState<XMode>(defaultXMode);
  const [hover, setHover] = useState<number | null>(null);

  // Client-side navigation between two /activity/[id] pages can reuse this same
  // component instance, so per-activity view state would otherwise persist and
  // show the previous activity's default series. Resync during render when the
  // activity changes (React's "adjust state on prop change" pattern, no effect).
  const [prevActivityId, setPrevActivityId] = useState(activityId);
  if (activityId !== prevActivityId) {
    setPrevActivityId(activityId);
    setActive(defaultActive);
    setXMode(defaultXMode);
    setHover(null);
  }
  const xs = xMode === "time" && timeAvailable ? streams.timeS : streams.distanceKm;
  const xExtent = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const v of xs) {
      if (v == null) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return Number.isFinite(min) && max > min ? ([min, max] as const) : null;
  }, [xs]);

  const shown = allSeries.filter((s) => active.has(s.key));
  const height = TOP + shown.length * PANEL_H + Math.max(0, shown.length - 1) * GAP + AXIS_H;

  const xPx = (v: number) =>
    xExtent ? PAD_L + ((v - xExtent[0]) / (xExtent[1] - xExtent[0])) * PLOT_W : PAD_L;

  const validIdx = useMemo(
    () => xs.map((v, i) => (v != null ? i : -1)).filter((i) => i >= 0),
    [xs]
  );

  const toggle = (key: SeriesKey) =>
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Pointer -> nearest data index, mapping client px into viewBox units.
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || !xExtent || validIdx.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const vbX = ((e.clientX - rect.left) / rect.width) * VBW;
    let best = validIdx[0];
    let bestD = Infinity;
    for (const i of validIdx) {
      const d = Math.abs(xPx(xs[i]!) - vbX);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    setHover(best);
  };

  const onKey = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (validIdx.length === 0) return;
    const pos = hover == null ? 0 : validIdx.indexOf(hover);
    if (e.key === "ArrowRight") {
      setHover(validIdx[Math.min(validIdx.length - 1, (pos < 0 ? -1 : pos) + 1)]);
      e.preventDefault();
    } else if (e.key === "ArrowLeft") {
      setHover(validIdx[Math.max(0, (pos < 0 ? 1 : pos) - 1)]);
      e.preventDefault();
    } else if (e.key === "Home") {
      setHover(validIdx[0]);
      e.preventDefault();
    } else if (e.key === "End") {
      setHover(validIdx[validIdx.length - 1]);
      e.preventDefault();
    }
  };

  const hoverX = hover != null && xs[hover] != null ? xPx(xs[hover]!) : null;
  const xLabel = (v: number) => (xMode === "time" ? fmtDuration(v) : fmtKm(v, 2));

  // Evenly spaced x-axis ticks.
  const xTicks = useMemo(() => {
    if (!xExtent) return [];
    const T = 5;
    return Array.from(
      { length: T + 1 },
      (_, k) => xExtent[0] + ((xExtent[1] - xExtent[0]) * k) / T
    );
  }, [xExtent]);

  return (
    <div>
      {/* Series toggles + x-axis control */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {allSeries.map((s) => {
          const on = active.has(s.key);
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggle(s.key)}
              aria-pressed={on}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                on
                  ? "border-transparent bg-muted text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: on ? s.color : "var(--muted-foreground)" }}
                aria-hidden
              />
              {s.label}
            </button>
          );
        })}
        <div className="ml-auto inline-flex overflow-hidden rounded-full border text-xs font-medium">
          {distAvailable ? (
            <button
              type="button"
              onClick={() => setXMode("distance")}
              aria-pressed={xMode === "distance"}
              className={`cursor-pointer px-2.5 py-1 transition-colors ${
                xMode === "distance"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.chart.distance}
            </button>
          ) : null}
          {timeAvailable ? (
            <button
              type="button"
              onClick={() => setXMode("time")}
              aria-pressed={xMode === "time"}
              className={`cursor-pointer px-2.5 py-1 transition-colors ${
                xMode === "time"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.chart.time}
            </button>
          ) : null}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">–</p>
      ) : (
        <div className="relative w-full overflow-x-auto">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${VBW} ${height}`}
            width="100%"
            style={{ height: "auto", touchAction: "none" }}
            role="img"
            tabIndex={0}
            aria-label={t.chart.analysis}
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => setHover(null)}
            onKeyDown={onKey}
            className="outline-none"
          >
            {shown.map((s, i) => {
              const top = TOP + i * (PANEL_H + GAP);
              const bottom = top + PANEL_H;
              const ext = extent(s.data);
              if (!ext) return null;
              const [lo, hi] = ext;
              const yPx = (v: number) =>
                s.invert
                  ? top + ((v - lo) / (hi - lo)) * PANEL_H
                  : bottom - ((v - lo) / (hi - lo)) * PANEL_H;

              // Line segments, broken on nulls so gaps are not drawn through.
              const segs: string[] = [];
              let cur = "";
              for (let k = 0; k < s.data.length; k++) {
                const d = s.data[k];
                const x = xs[k];
                if (d == null || x == null) {
                  if (cur) segs.push(cur);
                  cur = "";
                  continue;
                }
                cur += `${cur ? "L" : "M"}${xPx(x).toFixed(1)},${yPx(d).toFixed(1)} `;
              }
              if (cur) segs.push(cur);

              // Filled area (elevation) built per contiguous run.
              let areaPath = "";
              if (s.area) {
                let run: Array<[number, number]> = [];
                const flush = () => {
                  if (run.length > 1) {
                    areaPath += `M${xPx(run[0][0]).toFixed(1)},${bottom.toFixed(1)} `;
                    for (const [x, y] of run)
                      areaPath += `L${xPx(x).toFixed(1)},${yPx(y).toFixed(1)} `;
                    areaPath += `L${xPx(run[run.length - 1][0]).toFixed(1)},${bottom.toFixed(1)} Z `;
                  }
                  run = [];
                };
                for (let k = 0; k < s.data.length; k++) {
                  const d = s.data[k];
                  const x = xs[k];
                  if (d == null || x == null) flush();
                  else run.push([x, d]);
                }
                flush();
              }

              const topLabel = s.invert ? s.tick(lo) : s.tick(hi);
              const botLabel = s.invert ? s.tick(hi) : s.tick(lo);
              const hoverVal = hover != null ? s.data[hover] : null;

              return (
                <g key={s.key}>
                  {/* panel frame (recessive) */}
                  <line
                    x1={PAD_L}
                    y1={top}
                    x2={VBW - PAD_R}
                    y2={top}
                    stroke="var(--border)"
                    strokeWidth={1}
                    opacity={0.5}
                  />
                  <line
                    x1={PAD_L}
                    y1={bottom}
                    x2={VBW - PAD_R}
                    y2={bottom}
                    stroke="var(--border)"
                    strokeWidth={1}
                  />
                  {/* y ticks */}
                  <text
                    x={PAD_L - 6}
                    y={top + 4}
                    textAnchor="end"
                    fontSize={9}
                    fill="var(--muted-foreground)"
                    className="font-mono"
                  >
                    {topLabel}
                  </text>
                  <text
                    x={PAD_L - 6}
                    y={bottom}
                    textAnchor="end"
                    fontSize={9}
                    fill="var(--muted-foreground)"
                    className="font-mono"
                  >
                    {botLabel}
                  </text>
                  {/* series label with color swatch */}
                  <circle cx={PAD_L + 6} cy={top + 10} r={3} fill={s.color} />
                  <text
                    x={PAD_L + 13}
                    y={top + 13}
                    fontSize={10}
                    fill="var(--muted-foreground)"
                    className="font-medium"
                  >
                    {s.label}
                    <tspan fill="var(--muted-foreground)" opacity={0.7}>{`  ${s.unit}`}</tspan>
                  </text>

                  {s.area ? <path d={areaPath} fill={s.color} opacity={0.18} /> : null}
                  {segs.map((d, si) => (
                    <path
                      key={si}
                      d={d}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  ))}

                  {hoverVal != null && hoverX != null ? (
                    <circle
                      cx={hoverX}
                      cy={yPx(hoverVal)}
                      r={3.5}
                      fill={s.color}
                      stroke="var(--card)"
                      strokeWidth={1.5}
                    />
                  ) : null}
                </g>
              );
            })}

            {/* x-axis ticks + labels along the shared bottom axis */}
            {xTicks.map((v, i) => {
              const x = xPx(v);
              const axisY = TOP + shown.length * PANEL_H + Math.max(0, shown.length - 1) * GAP;
              return (
                <g key={i}>
                  <line
                    x1={x}
                    y1={TOP}
                    x2={x}
                    y2={axisY}
                    stroke="var(--border)"
                    strokeWidth={1}
                    opacity={0.25}
                  />
                  <text
                    x={x}
                    y={axisY + 15}
                    textAnchor="middle"
                    fontSize={9}
                    fill="var(--muted-foreground)"
                    className="font-mono"
                  >
                    {xMode === "time" ? fmtClock(v) : v.toFixed(v < 10 ? 1 : 0)}
                  </text>
                </g>
              );
            })}

            {/* shared crosshair */}
            {hoverX != null ? (
              <line
                x1={hoverX}
                y1={TOP}
                x2={hoverX}
                y2={TOP + shown.length * PANEL_H + Math.max(0, shown.length - 1) * GAP}
                stroke="var(--foreground)"
                strokeWidth={1}
                opacity={0.35}
                pointerEvents="none"
              />
            ) : null}
          </svg>

          {/* tooltip */}
          {hover != null && hoverX != null ? (
            <div
              className="pointer-events-none absolute top-1 z-10 rounded-lg border bg-card/95 px-2.5 py-2 text-xs shadow-md backdrop-blur"
              style={{
                left: `${(hoverX / VBW) * 100}%`,
                transform: `translateX(${hoverX > VBW / 2 ? "-100%" : "0"}) translateX(${hoverX > VBW / 2 ? "-8px" : "8px"})`,
              }}
            >
              <div className="mb-1 font-mono font-medium text-foreground">{xLabel(xs[hover]!)}</div>
              <div className="space-y-0.5">
                {shown.map((s) => {
                  const v = s.data[hover];
                  return (
                    <div key={s.key} className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: s.color }}
                          aria-hidden
                        />
                        {s.label}
                      </span>
                      <span className="font-mono tabular-nums" style={{ color: s.color }}>
                        {v == null ? "–" : s.fmt(v)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
