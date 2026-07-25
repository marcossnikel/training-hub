// Geometry for tiny non-interactive sparklines: values in, SVG coordinates out.
// Pure, so the arithmetic is unit-tested instead of buried in a component. The
// full-size charts keep their own richer geometry (activity-chart-series.ts,
// pmc-chart.tsx); this is only for the thumbnail case with no axes or hover.

export interface Sparkline {
  /** `points` for an SVG <polyline>: "x,y x,y ...". */
  points: string;
  /** The final point, for the end-of-line dot. */
  last: { x: number; y: number };
}

/**
 * Maps `values` evenly across `width` and scales them to `height`, with the
 * series minimum at the bottom and its maximum at the top. Everything is inset
 * by `inset` on both axes so neither a rounded stroke nor an end-of-line dot is
 * clipped by the viewBox. A flat series (or a single value) draws along the
 * vertical middle. Null when there is nothing to draw.
 */
export function sparkline(
  values: number[],
  width: number,
  height: number,
  inset = 2
): Sparkline | null {
  if (values.length === 0) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo;
  const plotW = width - 2 * inset;
  const plotH = height - 2 * inset;
  const n = values.length;
  const point = (value: number, i: number) => ({
    x: n === 1 ? width / 2 : inset + (i / (n - 1)) * plotW,
    y: span === 0 ? height / 2 : inset + (1 - (value - lo) / span) * plotH,
  });
  const points = values.map(point);
  return {
    points: points.map((p) => `${round2(p.x)},${round2(p.y)}`).join(" "),
    last: points[n - 1],
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
