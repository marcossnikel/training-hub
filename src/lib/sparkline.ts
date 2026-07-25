// Geometry for tiny non-interactive sparklines: values in, SVG coordinates out.
// Pure, so the arithmetic is unit-tested instead of buried in a component. The
// full-size charts keep their own richer geometry (activity-chart-series.ts,
// pmc-chart.tsx); this is only for the thumbnail case with no axes or hover.

export interface Point {
  x: number;
  y: number;
}

export interface Sparkline {
  /** `points` for an SVG <polyline>: "x,y x,y ...". */
  points: string;
  /**
   * `points` split at the gaps: one entry per run of consecutive values, so a
   * series with holes draws as separate polylines instead of a line straight
   * across the missing stretch. A gapless series yields exactly `[points]`.
   */
  segments: string[];
  /** Every plotted vertex, so a caller can dot values a polyline cannot show. */
  vertices: Point[];
  /** The final plotted point, for the end-of-line dot; rounded like `points`. */
  last: Point;
}

/**
 * Maps `values` evenly across `width` and scales them to `height`, with the
 * series minimum at the bottom and its maximum at the top. Every coordinate
 * stays at least `inset` from each edge, so nothing drawn at a vertex is clipped
 * by the viewBox as long as the caller passes its own outer radius: half a
 * stroke width for the polyline, radius plus half the stroke for an end dot. The
 * default clears a hairline stroke only. A flat series (or a single value) draws
 * along the vertical middle. Null when there is nothing to draw.
 *
 * A `null` value is a KNOWN GAP, not a zero: it holds its slot on the x axis (so
 * the rest of the series stays where it belongs in time) but is neither plotted
 * nor scaled, and it breaks `segments` in two. That is what a sparse monthly
 * series needs — a month with no measurement must read as missing, not as a dip
 * to the bottom of the box.
 */
export function sparkline(
  values: readonly (number | null)[],
  width: number,
  height: number,
  inset = 2
): Sparkline | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) return null;
  const lo = Math.min(...present);
  const hi = Math.max(...present);
  const span = hi - lo;
  const plotW = width - 2 * inset;
  const plotH = height - 2 * inset;
  const n = values.length;
  const point = (value: number, i: number) => ({
    x: round2(n === 1 ? width / 2 : inset + (i / (n - 1)) * plotW),
    y: round2(span === 0 ? height / 2 : inset + (1 - (value - lo) / span) * plotH),
  });

  const vertices: Point[] = [];
  const segments: string[] = [];
  let run: string[] = [];
  values.forEach((value, i) => {
    if (value === null) {
      if (run.length > 0) segments.push(run.join(" "));
      run = [];
      return;
    }
    const p = point(value, i);
    vertices.push(p);
    run.push(`${p.x},${p.y}`);
  });
  if (run.length > 0) segments.push(run.join(" "));

  return {
    points: vertices.map((p) => `${p.x},${p.y}`).join(" "),
    segments,
    vertices,
    last: vertices[vertices.length - 1],
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
