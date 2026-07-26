// Keyboard stepping for the hand-rolled hover charts. Pure index arithmetic —
// no React, no DOM — so every SVG that answers to a pointer answers to the
// arrow keys the same way, and the rule is tested once rather than per chart.

/**
 * Where a cursor key moves the active index, or null for a key the chart does
 * not handle (the caller then leaves the event alone).
 *
 * Arrows step by one and clamp at the ends. From NO selection they land on an
 * end rather than at zero: ArrowRight opens on the first point, ArrowLeft on the
 * last, so a reader tabbing to a chart and pressing left starts where the data
 * ends — which on a time series is the most recent point. Home and End jump.
 */
export function keyIndex(key: string, current: number | null, count: number): number | null {
  if (count === 0) return null;
  if (key === "ArrowRight") return Math.min(count - 1, (current == null ? -1 : current) + 1);
  // From no selection, step back from the count so we land on the LAST index.
  if (key === "ArrowLeft") return Math.max(0, (current == null ? count : current) - 1);
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}
