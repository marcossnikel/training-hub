// The /fitness totals table: one row per week or month with its volume and, under
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

const TH =
  "px-2 py-1.5 text-left text-[11px] font-medium tracking-wider text-muted-foreground uppercase";
const TD = "px-2 py-1.5 font-mono text-sm tabular-nums whitespace-nowrap";

function headerOf(metric: TotalsMetric, t: Dict): string {
  switch (metric) {
    case "load":
      return t.fitness.load;
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

function valueOf(metric: TotalsMetric, values: TotalsValues): string {
  switch (metric) {
    case "load":
      return String(Math.round(values.load));
    case "seconds":
      return fmtHoursMin(values.seconds);
    case "km":
      return fmtKm(values.km, 1);
    case "elevationM":
      return fmtElev(values.elevationM);
    case "sessions":
      return String(values.sessions);
  }
}

/**
 * A change at its column's precision: "+8.3 km", "-42". Null when it rounds to
 * nothing there, so an unchanged (usually empty) row stays quiet.
 */
function signed(value: number, digits: number, unit = ""): string | null {
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  if (rounded === 0) return null;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(digits)}${unit}`;
}

function deltaOf(metric: TotalsMetric, delta: TotalsValues | null): string | null {
  if (!delta) return null;
  switch (metric) {
    case "load":
      return signed(delta.load, 0);
    case "seconds":
      return signed(delta.seconds / 3600, 1, " h");
    case "km":
      return signed(delta.km, 1, " km");
    case "elevationM":
      return signed(delta.elevationM, 0, " m");
    case "sessions":
      return signed(delta.sessions, 0);
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
                const change = deltaOf(metric, row.delta);
                return (
                  <td key={metric} className={TD}>
                    {valueOf(metric, row.values)}
                    {/* Deltas stay neutral-negative: more training is not always
                        better, so only a gain is colored. */}
                    {change ? (
                      <span
                        className="mt-0.5 block text-[10px] leading-none"
                        style={{
                          color:
                            (row.delta?.[metric] ?? 0) > 0
                              ? "var(--positive)"
                              : "var(--muted-foreground)",
                        }}
                      >
                        {change}
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
