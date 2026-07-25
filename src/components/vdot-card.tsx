// The /performance VDOT card: today's Daniels VDOT next to the monthly-max trend
// behind it. Server-rendered SVG with a native <title> per month and zero client
// JS (the HealthTrendChart / consistency-heatmap philosophy). Every number arrives
// already computed by `vdotTrend` in src/lib/benchmarks.ts — this file only lays
// out and formats.

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { VDOT_CURRENT_WINDOW_DAYS, type VdotTrend } from "@/lib/benchmarks";
import { monthShort } from "@/lib/format";
import { fillStr, type Dict, type Lang } from "@/lib/i18n";
import { sparkline } from "@/lib/sparkline";

// Trend geometry in viewBox units (the SVG scales to its container width): a plot
// box with room on the left for the two value labels and a band underneath for the
// month ticks.
const VBW = 320;
const PAD_L = 26;
const PAD_R = 6;
const TOP = 8;
const PLOT_W = VBW - PAD_L - PAD_R;
const PLOT_H = 56;
const TICK_BAND = 16;
const VBH = TOP + PLOT_H + TICK_BAND;
// Monthly dot, the emphasised dot on the most recent month, and the inset the
// geometry needs to keep the bigger one whole: its radius plus half its stroke.
const DOT_R = 1.75;
const LAST_DOT_R = 2.75;
const LAST_DOT_STROKE_W = 1.5;
const INSET = LAST_DOT_R + LAST_DOT_STROKE_W / 2;
const LABEL_FONT = 8;

/** "Jul 2026" from a "YYYY-MM" month key. The span crosses years, so the year is
 * always spelled out. */
function monthLabel(month: string, lang: Lang): string {
  return `${monthShort(Number(month.slice(5, 7)) - 1, lang)} ${month.slice(0, 4)}`;
}

/** VDOT reads as one decimal everywhere: whole numbers hide a month of progress. */
function fmtVdot(vdot: number): string {
  return vdot.toFixed(1);
}

/**
 * Renders nothing when no month in the window produced a qualifying effort — only
 * a fraction of runs carry the detail payload best efforts come from, so an empty
 * trend is the normal early state and an empty chart frame would say less than no
 * card at all.
 */
export function VdotCard({ trend, lang, t }: { trend: VdotTrend; lang: Lang; t: Dict }) {
  const tp = t.performance;
  const spark = sparkline(
    trend.months.map((m) => m.vdot),
    PLOT_W,
    PLOT_H,
    INSET
  );
  if (!spark) return null;

  // `vertices` holds one point per PLOTTED month, in order, so the months with a
  // value line up with it index for index; the empty ones hold their x slot in the
  // series without a dot or a line through them.
  const plotted = trend.months.filter((m) => m.vdot !== null);
  const values = plotted.map((m) => m.vdot as number);
  const first = trend.months[0].month;
  const last = trend.months[trend.months.length - 1].month;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tp.vdot}</CardTitle>
        <CardDescription>{tp.vdotBody}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
              {tp.vdotCurrent}
            </div>
            <div
              className="mt-1 font-display text-3xl font-bold"
              style={trend.current === null ? undefined : { color: "var(--primary)" }}
            >
              {trend.current === null ? "–" : fmtVdot(trend.current)}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {fillStr(trend.current === null ? tp.vdotNoRecent : tp.vdotWindow, {
                days: VDOT_CURRENT_WINDOW_DAYS,
              })}
            </div>
          </div>

          <svg
            viewBox={`0 0 ${VBW} ${VBH}`}
            width="100%"
            style={{ height: "auto", maxWidth: `${VBW}px` }}
            role="img"
            aria-label={fillStr(tp.vdotTrendLabel, { n: trend.months.length })}
            className="min-w-0 flex-1"
          >
            <line
              x1={PAD_L}
              y1={TOP + PLOT_H}
              x2={VBW - PAD_R}
              y2={TOP + PLOT_H}
              stroke="var(--border)"
              strokeWidth={1}
            />
            {/* The plotted extremes sit exactly at these two heights (the inset
                bounds the sparkline box), so each label names the value at its own
                y instead of an axis the series only approaches. */}
            <text
              x={PAD_L - 5}
              y={TOP + INSET + 3}
              textAnchor="end"
              fontSize={LABEL_FONT}
              fill="var(--muted-foreground)"
              className="font-mono"
            >
              {fmtVdot(Math.max(...values))}
            </text>
            <text
              x={PAD_L - 5}
              y={TOP + PLOT_H - INSET + 3}
              textAnchor="end"
              fontSize={LABEL_FONT}
              fill="var(--muted-foreground)"
              className="font-mono"
            >
              {fmtVdot(Math.min(...values))}
            </text>
            <g transform={`translate(${PAD_L}, ${TOP})`}>
              {/* One polyline per run of measured months: a gap in the middle of
                  the year must read as missing data, not as a slide between two
                  readings months apart. */}
              {spark.segments.map((segment) => (
                <polyline
                  key={segment}
                  points={segment}
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth={1.75}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}
              {spark.vertices.map((vertex, i) => (
                <circle
                  key={plotted[i].month}
                  cx={vertex.x}
                  cy={vertex.y}
                  r={i === spark.vertices.length - 1 ? LAST_DOT_R : DOT_R}
                  fill="var(--primary)"
                  stroke={i === spark.vertices.length - 1 ? "var(--card)" : undefined}
                  strokeWidth={i === spark.vertices.length - 1 ? LAST_DOT_STROKE_W : undefined}
                >
                  {/* Readable with no JS: a lone month is otherwise just a dot. */}
                  <title>{`${monthLabel(plotted[i].month, lang)} · ${tp.vdot} ${fmtVdot(values[i])}`}</title>
                </circle>
              ))}
            </g>
            <text
              x={PAD_L}
              y={VBH - 4}
              textAnchor="start"
              fontSize={LABEL_FONT}
              fill="var(--muted-foreground)"
              className="font-mono"
            >
              {monthLabel(first, lang)}
            </text>
            <text
              x={VBW - PAD_R}
              y={VBH - 4}
              textAnchor="end"
              fontSize={LABEL_FONT}
              fill="var(--muted-foreground)"
              className="font-mono"
            >
              {monthLabel(last, lang)}
            </text>
          </svg>
        </div>
      </CardContent>
    </Card>
  );
}
