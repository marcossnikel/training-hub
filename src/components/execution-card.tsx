// Race-day execution on the activity page: how the two halves compared, how much
// the final quarter faded, and where the pace sat against the goal. Every number
// arrives already computed by `analyzeRace` (src/lib/blocks.ts) — this file only
// formats and lays out, so it renders on the server with no client JS.

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ZoneBar } from "@/components/zone-bar";
import type { RaceAnalysis } from "@/lib/blocks";
import { fmtDuration, fmtPace } from "@/lib/format";
import type { Dict } from "@/lib/i18n";

/** A negative split (second half faster) is the goal; a positive one is a fade. */
function splitColor(deltaS: number): string {
  return deltaS < 0 ? "var(--positive)" : "var(--wear-worn)";
}

function ExecTile({
  label,
  value,
  caption,
  color,
}: {
  label: string;
  value: string;
  caption: string;
  color?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </dt>
      <dd
        className="mt-0.5 font-display text-2xl font-semibold tabular-nums"
        style={color ? { color } : undefined}
      >
        {value}
      </dd>
      <dd className="text-xs text-muted-foreground">{caption}</dd>
    </div>
  );
}

export function ExecutionCard({ analysis, t }: { analysis: RaceAnalysis; t: Dict }) {
  const { splitDeltaS, fadePct, goalPaceSPerKm, atGoalSec, aboveGoalSec, belowGoalSec } = analysis;

  // The goal breakdown needs a goal pace and a pace stream; the segments follow
  // the goal-relative reading order: on it, under it, over it.
  const goalSec =
    goalPaceSPerKm != null && atGoalSec != null && belowGoalSec != null && aboveGoalSec != null
      ? [atGoalSec, belowGoalSec, aboveGoalSec]
      : null;

  // A stream without a usable distance grid yields nothing to show; the card
  // stays out of the page rather than rendering an empty shell.
  if (splitDeltaS == null && fadePct == null && goalSec == null) return null;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>{t.detail.execution}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {splitDeltaS != null || fadePct != null ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
            {splitDeltaS != null ? (
              <ExecTile
                label={t.compare.split}
                value={`${splitDeltaS > 0 ? "+" : splitDeltaS < 0 ? "-" : ""}${Math.abs(splitDeltaS)} s/km`}
                caption={splitDeltaS < 0 ? t.compare.negativeSplit : t.compare.positiveSplit}
                color={splitColor(splitDeltaS)}
              />
            ) : null}
            {fadePct != null ? (
              <ExecTile
                label={t.compare.fade}
                value={`${fadePct > 0 ? "+" : ""}${fadePct.toFixed(1)}%`}
                caption={t.compare.finalQuarter}
              />
            ) : null}
          </dl>
        ) : null}

        {goalSec ? (
          <div>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                {t.detail.vsGoal.title}
              </span>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {fmtPace(goalPaceSPerKm)}
              </span>
            </div>
            <ZoneBar
              zoneSec={goalSec}
              labels={[t.detail.vsGoal.at, t.detail.vsGoal.faster, t.detail.vsGoal.slower]}
              showTime
            />
            {analysis.longestAtGoalSec != null ? (
              <p className="mt-3 text-xs text-muted-foreground">
                {t.compare.longestAtGoal}:{" "}
                <span className="font-mono tabular-nums">
                  {fmtDuration(analysis.longestAtGoalSec)}
                </span>
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
