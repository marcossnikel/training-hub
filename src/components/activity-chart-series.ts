import type { ActivityStreams } from "@/lib/streams";
import type { Dict } from "@/lib/i18n";
import { fmtHr, fmtPace, fmtPaceShort } from "@/lib/format";
import { fmtCadence, fmtPower } from "@/lib/cycling";
import {
  hrZones,
  paceZones,
  type AthleteThresholds,
  type Zone,
  type ZoneBounds,
} from "@/lib/fitness";

export type SeriesKey = "heartRate" | "pace" | "power" | "cadence" | "elevation";
export type XMode = "distance" | "time";

export interface SeriesDef {
  key: SeriesKey;
  data: (number | null)[]; // guaranteed non-null series (available ones only)
  color: string; // fixed CSS-var order: primary, chart-2..chart-5
  label: string;
  unit: string;
  invert: boolean; // pace: faster (smaller) sits higher
  area: boolean; // elevation renders as a filled area
  fmt: (v: number) => string;
  tick: (v: number) => string;
  /**
   * The athlete's zones for this series, when it can be classified against their
   * thresholds. The panel shades them and the tooltip names the hovered sample's
   * zone, both through `src/lib/fitness` (`zoneBoundsOf` for the boundaries,
   * `zoneIndexOf` for the classification), so the min-inclusive / max-exclusive
   * rule has exactly one implementation. Absent means no bands and no zone.
   */
  zones?: Zone[];
}

type SeriesCandidate = Omit<SeriesDef, "data"> & { data: (number | null)[] | null };

// viewBox geometry (unitless; the SVG scales to its container width)
export const VBW = 760;
export const PAD_L = 48;
export const PAD_R = 14;
export const PLOT_W = VBW - PAD_L - PAD_R;
export const TOP = 8;
export const PANEL_H = 68;
export const GAP = 16;
export const AXIS_H = 26;
/** The lap strip and its breathing room, added above the first panel only when laps exist. */
export const LAP_STRIP_H = 10;
export const LAP_STRIP_GAP = 6;

const round = (v: number) => String(Math.round(v));

/** Strava reports run cadence as one leg's rpm, and one revolution is two steps. */
const STEPS_PER_REVOLUTION = 2;

/**
 * Doubles a run's one-leg cadence stream into true steps per minute. This is the
 * single owner of the doubling on the chart path: the panel scale, the y ticks
 * and the tooltip all read the doubled values, so `fmtSpm` only labels them.
 */
function toStepRate(cadence: (number | null)[] | null): (number | null)[] | null {
  if (!cadence) return null;
  return cadence.map((v) => (v == null ? null : v * STEPS_PER_REVOLUTION));
}

/** Labels an already-doubled step rate; does NOT double (unlike `fmtStepRate`). */
const fmtSpm = (spm: number) => `${Math.round(spm)} spm`;

/** Compact clock for the time axis: h:mm past an hour, else m:ss. */
export function fmtClock(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/** 8% headroom around a series' min and max, never dipping below zero. */
function padded(min: number, max: number): [number, number] {
  if (min === max) return [min - 1, max + 1];
  const pad = (max - min) * 0.08;
  // Don't pad below zero for naturally non-negative series (power, cadence).
  const lo = min >= 0 ? Math.max(0, min - pad) : min - pad;
  return [lo, max + pad];
}

export function extent(data: (number | null)[]): [number, number] | null {
  let min = Infinity;
  let max = -Infinity;
  for (const v of data) {
    if (v == null) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min)) return null;
  return padded(min, max);
}

/**
 * How far past the activity's own median pace the pace panel still plots, slow
 * and fast. `streams.ts` derives pace as `1000 / velocity` with no upper bound,
 * so one stopped-GPS sample owns the whole scale: activity 1245's stream tops
 * out at 8333 s/km against a 243 s/km median, which flattened its trace to a
 * line and handed Z1 96% of the panel while the same page's time-in-zone card
 * reported 18% — the chart contradicting the card it sits next to.
 *
 * The window is relative to the median rather than to the athlete's threshold
 * pace for two reasons: the median is unmoved by the outliers it is meant to
 * bound, and it also fits efforts a running threshold says nothing about (a
 * walk, a ride's pace panel). The factors are wide enough to keep a real walk
 * break or a finishing sprint on scale; anything past them is pinned to the
 * panel edge by `panelScale`.
 */
const PACE_SLOWEST_OF_MEDIAN = 1.6;
const PACE_FASTEST_OF_MEDIAN = 0.6;

function median(data: (number | null)[]): number | null {
  const values = data.filter((v): v is number => v != null).sort((a, b) => a - b);
  return values.length > 0 ? values[Math.floor(values.length / 2)] : null;
}

/** The pace panel's y extent: the data's range, bounded to plausible paces. */
export function paceExtent(data: (number | null)[]): [number, number] | null {
  const med = median(data);
  if (med == null) return null;
  const fastest = med * PACE_FASTEST_OF_MEDIAN;
  const slowest = med * PACE_SLOWEST_OF_MEDIAN;
  let min = Infinity;
  let max = -Infinity;
  for (const v of data) {
    if (v == null) continue;
    const bounded = Math.min(Math.max(v, fastest), slowest);
    if (bounded < min) min = bounded;
    if (bounded > max) max = bounded;
  }
  return padded(min, max);
}

/**
 * A panel's y extent. Only pace needs bounding: every other series is recorded
 * directly, while pace is a reciprocal of a velocity that goes to zero.
 */
export function panelExtent(series: SeriesDef): [number, number] | null {
  return series.key === "pace" ? paceExtent(series.data) : extent(series.data);
}

/**
 * A panel's value → y mapping. `at` is the raw scale, which lands outside the
 * panel for a value outside `ext`; `plot` pins those to the nearest edge so a
 * bounded panel (pace) never draws over its neighbours.
 */
export function panelScale(ext: [number, number], invert: boolean, top: number) {
  const [lo, hi] = ext;
  const bottom = top + PANEL_H;
  const at = (v: number) =>
    invert ? top + ((v - lo) / (hi - lo)) * PANEL_H : bottom - ((v - lo) / (hi - lo)) * PANEL_H;
  return { at, plot: (v: number) => Math.min(Math.max(at(v), top), bottom) };
}

/** Faint bands sit behind the trace, so a hairline is enough to read one. */
const MIN_BAND_H = 1;

export interface ZoneBand {
  zi: number;
  y: number;
  h: number;
}

/**
 * The horizontal zone bands of one panel, as viewBox rects. `bounds` run in zone
 * order and the scale honours `invert`, so band i sits between the boundary above
 * it and the one below it; the outermost zones are open-ended and take the panel
 * edge. A zone whose range misses the panel's extent entirely is omitted, so at
 * most five come back; one that reaches into it is clamped to the panel and
 * floored at MIN_BAND_H, never dropped — a zone the panel does reach has to stay
 * visible even when a wide extent squeezes its slice to a fraction of a unit.
 */
export function zoneBands(
  bounds: ZoneBounds,
  ext: [number, number],
  invert: boolean,
  top: number
): ZoneBand[] {
  const bottom = top + PANEL_H;
  const { at } = panelScale(ext, invert, top);
  const bands: ZoneBand[] = [];
  for (let zi = 0; zi <= bounds.length; zi++) {
    const yTop = zi === bounds.length ? top : at(bounds[zi]);
    const yBottom = zi === 0 ? bottom : at(bounds[zi - 1]);
    if (yBottom <= top || yTop >= bottom) continue; // wholly outside the panel
    const clampedTop = Math.min(Math.max(yTop, top), bottom);
    const clampedBottom = Math.min(Math.max(yBottom, top), bottom);
    const h = Math.max(clampedBottom - clampedTop, MIN_BAND_H);
    bands.push({ zi, y: Math.min(clampedTop, bottom - h), h });
  }
  return bands;
}

/**
 * Every candidate series with its fixed color slot; only the ones whose stream
 * is present (data != null) survive the filter and become togglable.
 *
 * Thresholds decide which series carry zones: heart rate for any sport that
 * recorded a trace, pace for runs only (the pace zones are built from a running
 * threshold pace). An unset threshold leaves the zones off.
 */
export function buildSeries(
  streams: ActivityStreams,
  t: Dict,
  isRun: boolean,
  thresholds: AthleteThresholds
): SeriesDef[] {
  const defs: SeriesCandidate[] = [
    {
      key: "heartRate",
      data: streams.heartrate,
      color: "var(--primary)",
      label: t.chart.heartRate,
      unit: "bpm",
      invert: false,
      area: false,
      fmt: (v) => fmtHr(v),
      tick: round,
      zones: thresholds.lthr > 0 ? hrZones(thresholds) : undefined,
    },
    {
      key: "pace",
      data: streams.paceSPerKm,
      color: "var(--chart-2)",
      label: t.chart.pace,
      unit: "min/km",
      invert: true,
      area: false,
      fmt: (v) => fmtPace(v),
      tick: fmtPaceShort,
      zones: isRun && thresholds.thresholdPaceSPerKm > 0 ? paceZones(thresholds) : undefined,
    },
    {
      key: "power",
      data: streams.watts,
      color: "var(--chart-3)",
      label: t.chart.power,
      unit: "W",
      invert: false,
      area: false,
      fmt: (v) => fmtPower(v),
      tick: round,
    },
    {
      key: "cadence",
      // Runs are plotted as steps per minute, every other sport as crank rpm.
      data: isRun ? toStepRate(streams.cadence) : streams.cadence,
      color: "var(--chart-4)",
      label: t.chart.cadence,
      unit: isRun ? "spm" : "rpm",
      invert: false,
      area: false,
      fmt: isRun ? fmtSpm : (v) => fmtCadence(v),
      tick: round,
    },
    {
      key: "elevation",
      data: streams.altitudeM,
      color: "var(--chart-5)",
      label: t.chart.elevation,
      unit: "m",
      invert: false,
      area: true,
      fmt: (v) => `${round(v)} m`,
      tick: round,
    },
  ];
  return defs.filter((d): d is SeriesDef => d.data != null);
}
