// The Performance totals table: one row per week or month with its volume and, under
// each number, the change from the period before. Every value and delta arrives
// already computed (periodTotals) — this file only formats and lays out, so it
// renders on the server with no client JS.

import { fmtElev, fmtHoursMin, fmtKm, monthLabel, parseLocalDate, weekLabel } from "@/lib/format";
import type { Dict, Lang } from "@/lib/i18n";
import {
  TOTALS_METRICS,
  type PeriodTotals,
  type TotalsMetric,
  type TotalsPeriod,
  type TotalsValues,
} from "@/lib/totals";

const TH = "px-2 py-1.5 text-left label-micro";
const TD = "px-2 py-1.5 font-mono text-sm tabular-nums whitespace-nowrap";

function headerOf(metric: TotalsMetric, t: Dict): string {
  switch (metric) {
    case "seconds":
      return t.fitness.totals.hours;
    case "km":
      return t.fitness.totals.distance;
    case "elevationM":
      return t.fitness.totals.elevation;
    case "sessions":
      return t.fitness.totals.sessions;
  }
}

/**
 * A column's number at the precision that column prints: elevation and
 * sessions whole, distance to a tenth, hours in whole minutes. Both the value and
 * the delta below it are derived from this, so a visible step always carries a
 * delta and a printed delta always matches a visible step.
 */
function rounded(metric: TotalsMetric, values: TotalsValues): number {
  switch (metric) {
    case "seconds":
      return Math.round(values.seconds / 60);
    case "km":
      return Math.round(values.km * 10) / 10;
    case "elevationM":
      return Math.round(values.elevationM);
    case "sessions":
      return values.sessions;
  }
}

/**
 * A rounded value in its column's unit. A genuine zero prints as a zero (an
 * illness week reads as a rest week, not as missing data), which is why the hours
 * cell does not hand 0 to fmtHoursMin — that renders the absent-value dash.
 */
function formatValue(metric: TotalsMetric, value: number): string {
  switch (metric) {
    case "seconds":
      return value === 0 ? "0h 00m" : fmtHoursMin(value * 60);
    case "km":
      return fmtKm(value, 1);
    case "elevationM":
      return fmtElev(value);
    case "sessions":
      return String(value);
  }
}

/**
 * A change between two rounded values, in its column's unit: "+8.3 km", "-42",
 * "+1h 20m". Null when the two round to the same thing, so an unchanged (usually
 * empty) row stays quiet.
 */
function deltaOf(metric: TotalsMetric, change: number): string | null {
  if (change === 0) return null;
  const sign = change > 0 ? "+" : "-";
  const size = Math.abs(change);
  switch (metric) {
    case "seconds":
      return `${sign}${fmtHoursMin(size * 60)}`;
    case "km":
      return `${sign}${size.toFixed(1)} km`;
    case "elevationM":
      return `${sign}${size} m`;
    case "sessions":
      return `${sign}${size}`;
  }
}

function periodLabel(start: string, period: TotalsPeriod, lang: Lang): string {
  const date = parseLocalDate(start);
  return period === "months" ? monthLabel(date, lang) : weekLabel(date, lang);
}

export function TotalsTable({
  rows,
  period,
  lang,
  t,
}: {
  /** Newest period first. */
  rows: PeriodTotals[];
  period: TotalsPeriod;
  lang: Lang;
  t: Dict;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b">
            <th className={TH}>{t.fitness.totals.period}</th>
            {TOTALS_METRICS.map((metric) => (
              <th key={metric} className={TH}>
                {headerOf(metric, t)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {rows.map((row) => (
            <tr key={row.start}>
              <td className={`${TD} text-muted-foreground`}>
                {periodLabel(row.start, period, lang)}
              </td>
              {TOTALS_METRICS.map((metric) => {
                const value = rounded(metric, row.values);
                const change = value - rounded(metric, row.previous);
                const label = deltaOf(metric, change);
                return (
                  <td key={metric} className={TD}>
                    {formatValue(metric, value)}
                    {/* Deltas stay neutral-negative: more training is not always
                        better, so only a gain is colored. */}
                    {label ? (
                      <span
                        className="mt-0.5 block text-3xs leading-none"
                        style={{
                          color: change > 0 ? "var(--positive)" : "var(--muted-foreground)",
                        }}
                      >
                        {label}
                      </span>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
