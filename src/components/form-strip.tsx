// Today's form at the top of the training log: the same TSB / CTL numbers the
// /fitness tiles show, plus this week's load in context, as one link into
// /fitness. Every value arrives already computed (formSnapshot + weekLoadVsTrailing)
// — this file only formats and lays out, so it renders on the server with no
// client JS.

import Link from "next/link";
import { formState, type WeekLoadComparison } from "@/lib/fitness";
import { fmtTsb } from "@/lib/format";
import { fillStr, type Dict } from "@/lib/i18n";
import { sparkline } from "@/lib/sparkline";
import { STATE_COLOR } from "@/lib/zones";

// Sparkline viewBox, in the fixed pixel size the SVG is rendered at (this
// thumbnail does not stretch to its container the way the full charts do).
const SPARK_W = 120;
const SPARK_H = 32;
// End-of-line dot, and the inset the geometry needs to keep it whole: its outer
// edge is the radius plus half of the stroke drawn around it.
const DOT_R = 2.25;
const DOT_STROKE_W = 1.5;
const SPARK_INSET = DOT_R + DOT_STROKE_W / 2;

export function FormStrip({
  tsb,
  ctl,
  ctlTrend,
  week,
  t,
}: {
  /** Today's form (TSB) and fitness (CTL), raw; rounding happens here. */
  tsb: number;
  ctl: number;
  /** Trailing CTL values, oldest first, for the sparkline. */
  ctlTrend: number[];
  week: WeekLoadComparison;
  t: Dict;
}) {
  const state = formState(tsb);
  const color = STATE_COLOR[state.key];
  const spark = sparkline(ctlTrend, SPARK_W, SPARK_H, SPARK_INSET);
  // "210 / avg 305 (4 wk)": a Monday-to-today partial week against the mean of
  // the complete weeks before it. The week count is part of the text because a
  // short history averages fewer weeks than the four the label would imply.
  const thisWeek = Math.round(week.thisWeek);
  const weekText = week.trailing
    ? `${thisWeek} / ${fillStr(t.log.weekLoadAvg, {
        load: Math.round(week.trailing.avg),
        weeks: week.trailing.weeks,
      })}`
    : String(thisWeek);
  const weekHint = week.trailing
    ? fillStr(t.log.weekLoadHint, { weeks: week.trailing.weeks })
    : undefined;

  return (
    <Link
      href="/fitness"
      className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl border bg-card px-4 py-3 transition-colors hover:border-primary/40 hover:bg-accent/40"
    >
      {/* Names the destination without replacing the values below in the link's
          accessible name, which an aria-label on the <Link> would. */}
      <span className="sr-only">{t.log.formStrip}</span>

      <div className="min-w-0">
        <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          {t.fitness.form}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-2xl font-semibold tabular-nums" style={{ color }}>
            {fmtTsb(tsb)}
          </span>
          <span className="truncate text-sm" style={{ color }}>
            {t.fitness.states[state.key]}
          </span>
        </div>
      </div>

      <div className="min-w-0">
        <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          {t.fitness.fitness}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-display text-2xl font-semibold tabular-nums text-primary">
            {Math.round(ctl)}
          </span>
          {/* No trend yet on a history's very first day, so the thumbnail is
              conditional. */}
          {spark ? (
            <svg
              viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
              width={SPARK_W}
              height={SPARK_H}
              role="img"
              aria-label={t.log.ctlTrend}
              className="shrink-0"
            >
              <polyline
                points={spark.points}
                fill="none"
                stroke="var(--primary)"
                strokeWidth={1.75}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <circle
                cx={spark.last.x}
                cy={spark.last.y}
                r={DOT_R}
                fill="var(--primary)"
                stroke="var(--card)"
                strokeWidth={DOT_STROKE_W}
              />
            </svg>
          ) : null}
        </div>
      </div>

      <div className="min-w-0" title={weekHint}>
        <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          {t.log.weekLoad}
        </div>
        <div className="font-mono text-sm tabular-nums">{weekText}</div>
      </div>
    </Link>
  );
}
