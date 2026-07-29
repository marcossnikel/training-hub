import type { Dict } from "@/lib/i18n";

/** Decoupling bands: under 5% well supported, 5-10% drifting, above 10% too much. */
function decouplingColor(pct: number): string {
  if (pct < 5) return "var(--positive)";
  if (pct <= 10) return "var(--wear-worn)";
  return "var(--wear-critical)";
}

function MetricTile({
  label,
  value,
  color,
  title,
}: {
  label: string;
  value: string;
  color?: string;
  /** One-line definition, shown on hover. */
  title: string;
}) {
  return (
    <div className="min-w-0" title={title}>
      <dt className="label-micro">{label}</dt>
      <dd
        className="mt-0.5 font-display text-2xl font-semibold tabular-nums"
        style={color ? { color } : undefined}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * Aerobic quality of a single session: efficiency factor and cardiac decoupling.
 * Both are read-only derivations of the recorded streams, so this is a server
 * component with no interactivity. Renders nothing when neither is available.
 */
export function ActivityMetricsStrip({
  ef,
  efFromGap,
  decoupling,
  t,
}: {
  /** Efficiency factor, null when the sport or the recording gives no basis. */
  ef: number | null;
  /** True when that EF was measured against grade-adjusted speed rather than raw pace. */
  efFromGap: boolean;
  /** Aerobic decoupling in percent, null for short or streamless efforts. */
  decoupling: number | null;
  t: Dict;
}) {
  if (ef == null && decoupling == null) return null;

  return (
    <div className="mt-6 rounded-xl border bg-card p-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
        {ef != null ? (
          <MetricTile
            label={t.detail.ef}
            value={ef.toFixed(2)}
            title={efFromGap ? t.detail.efGapTooltip : t.detail.efTooltip}
          />
        ) : null}
        {decoupling != null ? (
          <MetricTile
            label={t.detail.decoupling}
            value={`${decoupling.toFixed(1)}%`}
            color={decouplingColor(decoupling)}
            title={t.detail.decouplingTooltip}
          />
        ) : null}
      </dl>
    </div>
  );
}
