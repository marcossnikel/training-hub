"use client";

import { useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import type { ActivityStreams } from "@/lib/streams";
import { zoneBoundsOf, zoneIndexOf, type AthleteThresholds } from "@/lib/fitness";
import { ZONE_COLORS, zoneLabels } from "@/lib/zones";
import { fmtDuration, fmtElev, fmtHr, fmtKm, fmtPace } from "@/lib/format";
import { fmtPower } from "@/lib/cycling";
import { fillStr } from "@/lib/i18n";
import { distanceAtTime, type LapWindow } from "@/lib/laps";
import { rangeMetrics } from "@/lib/stream-range";
import {
  AXIS_H,
  GAP,
  LAP_STRIP_GAP,
  LAP_STRIP_H,
  PAD_L,
  PAD_R,
  PANEL_H,
  PLOT_W,
  TOP,
  VBW,
  buildSeries,
  fmtClock,
  panelExtent,
  panelScale,
  zoneBands,
  type SeriesDef,
  type SeriesKey,
  type XMode,
} from "@/components/activity-chart-series";

/** Faint enough to read a zone at a glance without competing with the trace. */
const ZONE_BAND_OPACITY = 0.06;

/** Alternating lap tints, then the one the pointer (or a pin) has hold of. */
const LAP_OPACITY = [0.15, 0.3];
const LAP_ACTIVE_OPACITY = 0.5;
/** The active lap's span behind every panel: readable, still transparent to the trace. */
const LAP_HIGHLIGHT_OPACITY = 0.12;

/**
 * How far a press has to travel, in viewBox units, before it is a selection
 * rather than a click. Below it the press keeps doing exactly what it always did
 * (move the crosshair), so nothing about clicking the chart or the lap strip
 * changes.
 */
const DRAG_THRESHOLD = 6;
/** The selected span: a wash of the text colour, faint enough to read the trace through. */
const SELECTION_OPACITY = 0.06;
const SELECTION_EDGE_OPACITY = 0.4;

export function ActivityChart({
  activityId,
  streams,
  isRun,
  isRide,
  thresholds,
  laps,
}: {
  activityId: number;
  streams: ActivityStreams;
  isRun: boolean;
  isRide: boolean;
  thresholds: AthleteThresholds;
  /** Lap windows on the stream's clock; absent when the activity has no structured laps. */
  laps?: LapWindow[];
}) {
  const { t } = useI18n();
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Every candidate series with its fixed color slot; only the ones whose
  // stream is present become togglable.
  const allSeries = useMemo<SeriesDef[]>(
    () => buildSeries(streams, t, isRun, thresholds),
    [streams, t, isRun, thresholds]
  );

  // Z1–Z5, the same dict tokens the zone bars are labelled with.
  const labels = zoneLabels(t);

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
  // Which lap the strip has hold of: the pointer's, else the clicked (pinned)
  // one. Both are indices into `laps`, both local to this chart.
  const [hoverLap, setHoverLap] = useState<number | null>(null);
  const [pinnedLap, setPinnedLap] = useState<number | null>(null);
  // The selected range: the sample the press (or the Shift key) anchored on plus
  // the one the pointer / keyboard cursor has reached. Held unnormalized so a
  // selection can be extended past its anchor in either direction.
  const [selection, setSelection] = useState<{ anchor: number; cursor: number } | null>(null);
  // The press in flight, as a ref rather than state: a press that never travels
  // DRAG_THRESHOLD must not re-render anything. Only pointer handlers touch it,
  // and pointer-up / leave always clear it, so it needs no resync below.
  const dragRef = useRef<{ index: number; x: number } | null>(null);

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
    setHoverLap(null);
    setPinnedLap(null);
    setSelection(null);
  }
  // The active x-axis, and so the domain lap windows have to be mapped into.
  const xIsTime = xMode === "time" && timeAvailable;
  const xs = xIsTime ? streams.timeS : streams.distanceKm;
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

  const xPx = (v: number) =>
    xExtent ? PAD_L + ((v - xExtent[0]) / (xExtent[1] - xExtent[0])) * PLOT_W : PAD_L;

  /** Keeps a lap's edge inside the plot: its clock can run a hair past the stream's. */
  const clampX = (x: number) => Math.min(Math.max(x, PAD_L), PAD_L + PLOT_W);

  // Lap windows mapped onto whichever axis is showing: seconds plot directly on
  // the time axis, and interpolate through the stream to km on the distance one.
  // A handful of laps against the 400-sample paths this chart already rebuilds
  // every render, so it is not worth memoizing.
  const lapDomain = (s: number) =>
    xIsTime ? s : distanceAtTime(streams.timeS, streams.distanceKm, s);
  const lapBars =
    laps && xExtent
      ? laps.flatMap((lap, i) => {
          const from = lapDomain(lap.startS);
          const to = lapDomain(lap.endS);
          if (from == null || to == null) return [];
          const x = clampX(xPx(from));
          const w = clampX(xPx(to)) - x;
          return w > 0 ? [{ lap, i, x, w }] : [];
        })
      : [];

  // The strip takes its band off the top, so the panels start lower only when
  // there are rects to draw. Reserving it from the `laps` prop instead pushed
  // every panel down and grew the axis for an activity whose windows all map to
  // nothing — a cached stream carrying distances but no times, in distance mode.
  const hasStrip = lapBars.length > 0;
  const plotTop = TOP + (hasStrip ? LAP_STRIP_H + LAP_STRIP_GAP : 0);
  const axisY = plotTop + shown.length * PANEL_H + Math.max(0, shown.length - 1) * GAP;
  const height = axisY + AXIS_H;

  // A lap only stays surfaced while it still renders. Switching to an axis where
  // it has no span (a lap the distance stream never advances through) would
  // otherwise leave the pin set with no highlight to see and no rect to click,
  // making it unclearable except through Escape.
  if (pinnedLap != null && !lapBars.some((bar) => bar.i === pinnedLap)) setPinnedLap(null);
  if (hoverLap != null && !lapBars.some((bar) => bar.i === hoverLap)) setHoverLap(null);

  // The pointer (or the keyboard cursor) wins over the pin, so surfacing another
  // lap reads that one.
  const activeLap = hoverLap ?? pinnedLap;
  const activeBar = lapBars.find((bar) => bar.i === activeLap) ?? null;

  /** The rendered lap whose window contains a stream time, if any. */
  const barAtTime = (s: number | null | undefined) =>
    s == null ? null : (lapBars.find(({ lap }) => s >= lap.startS && s < lap.endS) ?? null);

  // The lap the CROSSHAIR sits in, which is the only lap the tooltip may name. A
  // pinned (or hovered) strip rect can be half an hour from the hovered sample,
  // and heading that sample's readout with it simply misreports where it is.
  const hoverBar = barAtTime(hover != null ? streams.timeS[hover] : null);

  // A selection only survives while both of its edges still plot. Switching to an
  // axis where an edge's sample has no value (a stream carrying times but no
  // distances) would otherwise collapse the band onto the plot's left edge while
  // the strip below kept reporting the range it no longer marks — the same
  // reconciliation the lap pin gets a few lines above.
  if (selection && (xs[selection.anchor] == null || xs[selection.cursor] == null))
    setSelection(null);
  const sel =
    selection && xs[selection.anchor] != null && xs[selection.cursor] != null ? selection : null;
  const selLo = sel ? Math.min(sel.anchor, sel.cursor) : null;
  const selHi = sel ? Math.max(sel.anchor, sel.cursor) : null;
  // Cheap over the 400 samples this chart already rebuilds its paths from every
  // render. At that downsample a 1 h activity carries a sample roughly every 9 s,
  // so a selection under ~30 s is coarse: its edges snap to whole samples and its
  // averages weight each sample by the seconds it stands in for. No zoom, no
  // re-fetch — the range is read off the arrays already in the component.
  const selMetrics = selLo != null && selHi != null ? rangeMetrics(streams, selLo, selHi) : null;
  const selX0 = selLo != null ? clampX(xPx(xs[selLo]!)) : null;
  const selX1 = selHi != null ? clampX(xPx(xs[selHi]!)) : null;

  /** One strip entry per metric the range actually has; a null metric is omitted. */
  const selItems: { key: string; label: string; value: string }[] = [];
  if (selMetrics) {
    const push = (key: string, label: string, value: string | null) => {
      if (value != null) selItems.push({ key, label, value });
    };
    const { durationS, distanceKm, avgHr, maxHr, avgPaceSPerKm, avgPowerW, elevationGainM } =
      selMetrics;
    push(
      "duration",
      t.chart.duration,
      durationS != null && durationS > 0 ? fmtDuration(durationS) : null
    );
    push("distance", t.chart.distance, distanceKm != null ? fmtKm(distanceKm, 2) : null);
    push("avgHr", t.chart.avgHr, avgHr != null ? fmtHr(avgHr) : null);
    push("maxHr", t.chart.maxHr, maxHr != null ? fmtHr(maxHr) : null);
    // A ride reads in watts when the bike had a meter, everything else in pace.
    if (isRide && avgPowerW != null) push("power", t.chart.avgPower, fmtPower(avgPowerW));
    else push("pace", t.chart.avgPace, avgPaceSPerKm != null ? fmtPace(avgPaceSPerKm) : null);
    push("elevGain", t.chart.elevGain, elevationGainM != null ? fmtElev(elevationGainM) : null);
  }

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

  /** Client px -> viewBox units on the x-axis, null before the SVG is mounted. */
  const vbXOf = (clientX: number): number | null => {
    const svg = svgRef.current;
    if (!svg || !xExtent || validIdx.length === 0) return null;
    const rect = svg.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * VBW;
  };

  /** The data index plotted nearest a viewBox x. */
  const nearestIdx = (vbX: number): number => {
    let best = validIdx[0];
    let bestD = Infinity;
    for (const i of validIdx) {
      const d = Math.abs(xPx(xs[i]!) - vbX);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };

  // Pointer -> nearest data index, and while a press is held and has travelled,
  // the far end of the selection it is dragging out.
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const vbX = vbXOf(e.clientX);
    if (vbX == null) return;
    const i = nearestIdx(vbX);
    setHover(i);
    const drag = dragRef.current;
    if (drag && Math.abs(vbX - drag.x) >= DRAG_THRESHOLD) {
      setSelection({ anchor: drag.index, cursor: i });
    }
  };

  // A press arms a drag and drops whatever band was showing: it either becomes a
  // new selection or stays a plain click, which is the "pointer-down outside
  // clears" half of the interaction. It runs on the SVG, after a lap rect's own
  // handlers have bubbled through it, so the strip's click-to-pin is untouched.
  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const vbX = vbXOf(e.clientX);
    if (vbX == null) return;
    const i = nearestIdx(vbX);
    setHover(i);
    setSelection(null);
    dragRef.current = { index: i, x: vbX };
  };

  /** Ends the press, keeping the band it dragged out. */
  const endDrag = () => {
    dragRef.current = null;
  };

  /** Pins the lap, or unpins it when it is already the pinned one. */
  const togglePin = (i: number) => setPinnedLap((prev) => (prev === i ? null : i));

  // Moves the keyboard cursor and surfaces the lap the sample it lands on falls
  // in, so the arrow keys reach the strip the way the pointer does.
  const moveCursor = (i: number) => {
    setHover(i);
    setHoverLap(barAtTime(streams.timeS[i])?.i ?? null);
  };

  // Extends the selection to wherever the cursor just landed, anchoring on its
  // existing anchor, else on the sample the cursor came from.
  const extendTo = (i: number, from: number) => {
    moveCursor(i);
    setSelection((prev) => ({ anchor: prev?.anchor ?? from, cursor: i }));
  };

  const onKey = (e: React.KeyboardEvent<SVGSVGElement>) => {
    // Escape peels one overlay per press, newest first: the drag selection if one
    // is showing, otherwise the lap highlight (pinned or hovered). Precedence
    // rather than clearing both, so a reader who selected a range inside a pinned
    // lap keeps the lap they were studying and only loses the range they just
    // drew. Clicking a strip rect focuses this SVG, so the key lands here however
    // the browser treats focus on the rect itself.
    if (e.key === "Escape") {
      if (selection) {
        setSelection(null);
        return;
      }
      setHoverLap(null);
      setPinnedLap(null);
      return;
    }
    // Enter / Space pin and unpin the surfaced lap: the keyboard twin of a click
    // on its rect, reachable from the arrow-key cursor alone.
    if (e.key === "Enter" || e.key === " ") {
      const target = hoverLap ?? hoverBar?.i;
      if (target != null) {
        togglePin(target);
        e.preventDefault();
      }
      return;
    }
    if (validIdx.length === 0) return;
    const pos = hover == null ? 0 : validIdx.indexOf(hover);
    // Shift turns every cursor key into a range gesture, the keyboard twin of a
    // drag: the anchor is where the cursor stood, the cursor end follows the keys.
    const from = hover ?? validIdx[0];
    const step = e.shiftKey ? (i: number) => extendTo(i, from) : moveCursor;
    if (e.key === "ArrowRight") {
      step(validIdx[Math.min(validIdx.length - 1, (pos < 0 ? -1 : pos) + 1)]);
      e.preventDefault();
    } else if (e.key === "ArrowLeft") {
      step(validIdx[Math.max(0, (pos < 0 ? 1 : pos) - 1)]);
      e.preventDefault();
    } else if (e.key === "Home") {
      step(validIdx[0]);
      e.preventDefault();
    } else if (e.key === "End") {
      step(validIdx[validIdx.length - 1]);
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
            onPointerDown={onDown}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onPointerLeave={() => {
              setHover(null);
              setHoverLap(null);
              endDrag();
            }}
            onKeyDown={onKey}
            className="outline-none"
          >
            {/* Active lap's span, behind every panel so the traces stay readable. */}
            {activeBar ? (
              <rect
                data-lap-highlight={activeBar.lap.label}
                x={activeBar.x.toFixed(1)}
                y={plotTop}
                width={activeBar.w.toFixed(1)}
                height={(axisY - plotTop).toFixed(1)}
                fill="var(--chart-4)"
                opacity={LAP_HIGHLIGHT_OPACITY}
                pointerEvents="none"
              />
            ) : null}

            {/* Selected span, behind the panels alongside the lap highlight. */}
            {selX0 != null && selX1 != null ? (
              <rect
                data-selection-band={`${selLo}-${selHi}`}
                x={selX0.toFixed(1)}
                y={plotTop}
                // A hairline floor keeps a one-sample range visible.
                width={Math.max(selX1 - selX0, 1).toFixed(1)}
                height={(axisY - plotTop).toFixed(1)}
                fill="var(--foreground)"
                opacity={SELECTION_OPACITY}
                pointerEvents="none"
              />
            ) : null}

            {shown.map((s, i) => {
              const top = plotTop + i * (PANEL_H + GAP);
              const bottom = top + PANEL_H;
              const ext = panelExtent(s);
              if (!ext) return null;
              const [lo, hi] = ext;
              // Samples outside the extent (a bounded pace panel) are pinned to
              // the panel edge rather than drawn over the neighbouring panels.
              const yPx = panelScale(ext, s.invert, top).plot;

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

              // Zone shading, drawn first so the frame, area and trace sit on top.
              const bounds = s.zones ? zoneBoundsOf(s.zones, s.invert) : null;
              const bands = bounds ? zoneBands(bounds, ext, s.invert, top) : [];

              return (
                <g key={s.key}>
                  {bands.map((b) => (
                    <rect
                      key={b.zi}
                      data-zone-band={b.zi + 1}
                      x={PAD_L}
                      y={b.y.toFixed(1)}
                      width={PLOT_W}
                      height={b.h.toFixed(1)}
                      fill={ZONE_COLORS[b.zi]}
                      opacity={ZONE_BAND_OPACITY}
                    />
                  ))}
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
              return (
                <g key={i}>
                  <line
                    x1={x}
                    y1={plotTop}
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

            {/* Lap strip: one rect per lap, alternating so the boundaries read. */}
            {lapBars.map(({ lap, i, x, w }) => {
              // A rect spans the lap's ELAPSED time, which is the clock this
              // chart plots against, while the laps table's Time column reports
              // moving time. On the 20 cached laps with real stopped time the two
              // differ visibly (activity 1245's lap 2 is 8:33 elapsed against the
              // 6:04 its row shows), so the segment states its elapsed span and
              // the differing width has an explanation on the spot.
              const name = fillStr(t.chart.lapSpan, {
                lap: lap.label,
                duration: fmtDuration(lap.endS - lap.startS),
              });
              return (
                <rect
                  key={`${lap.label}-${i}`}
                  data-lap-strip={lap.label}
                  x={x.toFixed(1)}
                  y={TOP}
                  width={w.toFixed(1)}
                  height={LAP_STRIP_H}
                  fill="var(--chart-4)"
                  opacity={
                    activeLap === i ? LAP_ACTIVE_OPACITY : LAP_OPACITY[i % LAP_OPACITY.length]
                  }
                  className="cursor-pointer"
                  role="button"
                  // Not a tab stop of its own (an interval session has 20+ of
                  // them): the chart's own tab stop plus the arrow keys surface
                  // laps, and Enter pins them. Focusable so a click has somewhere
                  // to land, and the click hands focus to the SVG regardless,
                  // because Safari does not focus what a mouse presses.
                  tabIndex={-1}
                  aria-label={name}
                  aria-pressed={pinnedLap === i}
                  onPointerEnter={() => setHoverLap(i)}
                  onPointerLeave={() => setHoverLap((prev) => (prev === i ? null : prev))}
                  onFocus={() => setHoverLap(i)}
                  onClick={() => {
                    togglePin(i);
                    svgRef.current?.focus();
                  }}
                >
                  {/* Native hover affordance, same words as the accessible name. */}
                  <title>{name}</title>
                </rect>
              );
            })}

            {/* Selection edges, over the traces so the range's boundaries read. */}
            {selX0 != null && selX1 != null
              ? (
                  [
                    ["start", selX0],
                    ["end", selX1],
                  ] as const
                ).map(([edge, x]) => (
                  <line
                    key={edge}
                    data-selection-edge={edge}
                    x1={x.toFixed(1)}
                    y1={plotTop}
                    x2={x.toFixed(1)}
                    y2={axisY}
                    stroke="var(--foreground)"
                    strokeWidth={1}
                    opacity={SELECTION_EDGE_OPACITY}
                    pointerEvents="none"
                  />
                ))
              : null}

            {/* shared crosshair */}
            {hoverX != null ? (
              <line
                x1={hoverX}
                y1={plotTop}
                x2={hoverX}
                y2={axisY}
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
              <div className="mb-1 font-mono font-medium text-foreground">
                {hoverBar ? (
                  <span className="mr-1.5 text-muted-foreground">
                    {`${t.detail.lap} ${hoverBar.lap.label}`}
                  </span>
                ) : null}
                {xLabel(xs[hover]!)}
              </div>
              <div className="space-y-0.5">
                {shown.map((s) => {
                  const v = s.data[hover];
                  const zone = v != null && s.zones ? zoneIndexOf(v, s.zones) : -1;
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
                        {zone >= 0 ? (
                          <span className="ml-1.5 text-muted-foreground">{labels[zone]}</span>
                        ) : null}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* What the selected range adds up to; only the metrics it actually has. A
          sibling of the scroll container rather than a child, so a wide chart
          scrolling sideways never takes the strip with it. Nothing can be
          selected while no panel is shown, so it needs no guard of its own. */}
      {selItems.length > 0 ? (
        <div
          data-selection-metrics
          className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t pt-2 font-mono text-xs tabular-nums"
        >
          <span className="font-medium text-muted-foreground">{t.chart.selection}</span>
          {selItems.map((item) => (
            <span key={item.key} className="text-muted-foreground">
              {item.label} <span className="text-foreground">{item.value}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
