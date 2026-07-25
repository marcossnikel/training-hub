// Today's form at the top of the training log: the same TSB / CTL numbers the
// /fitness tiles show, plus this week's load in context, as one link into
// /fitness. Every value arrives already computed (buildPmc + weekLoadVsTrailing)
// — this file only formats and lays out, so it renders on the server with no
// client JS.

import Link from "next/link";
import { formState, type WeekLoadComparison } from "@/lib/fitness";
import { fillStr, type Dict } from "@/lib/i18n";
import { sparkline } from "@/lib/sparkline";
import { STATE_COLOR } from "@/lib/zones";

// Sparkline viewBox (unitless; the SVG scales to its container width).
const SPARK_W = 120;
const SPARK_H = 32;

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
  const rounded = Math.round(tsb);
  const spark = sparkline(ctlTrend, SPARK_W, SPARK_H);
  // "210 / avg 305", or this week's load alone when no complete trailing week
  // has been recorded yet.
  const thisWeek = Math.round(week.thisWeek);
  const weekText =
    week.trailingAvg != null
      ? `${thisWeek} / ${fillStr(t.log.weekLoadAvg, { load: Math.round(week.trailingAvg) })}`
      : String(thisWeek);

  return (
    <Link
      href="/fitness"
      aria-label={t.log.formStrip}
      className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl border bg-card px-4 py-3 transition-colors hover:border-primary/40 hover:bg-accent/40"
    >
      <div className="min-w-0">
        <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          {t.fitness.form}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-2xl font-semibold tabular-nums" style={{ color }}>
            {rounded > 0 ? `+${rounded}` : String(rounded)}
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
                r={2.25}
                fill="var(--primary)"
                stroke="var(--card)"
                strokeWidth={1.5}
              />
            </svg>
          ) : null}
        </div>
      </div>

      <div className="min-w-0">
        <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          {t.log.weekLoad}
        </div>
        <div className="font-mono text-sm tabular-nums">{weekText}</div>
      </div>
    </Link>
  );
}
