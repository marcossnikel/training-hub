"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, PencilIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/components/i18n-provider";
import { resetActivityLoadAction, setActivityLoadManualAction } from "@/lib/actions";
import type { LoadMethod, LoadVariant } from "@/lib/fitness";

/** Decoupling bands: under 5% well supported, 5-10% drifting, above 10% too much. */
function decouplingColor(pct: number): string {
  if (pct < 5) return "var(--positive)";
  if (pct <= 10) return "var(--wear-worn)";
  return "var(--wear-critical)";
}

function MetricTile({
  label,
  value,
  sub,
  color,
  title,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  /** One-line definition, shown on hover. */
  title: string;
}) {
  return (
    <div className="min-w-0" title={title}>
      <dt className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </dt>
      <dd
        className="mt-0.5 font-display text-2xl font-semibold tabular-nums"
        style={color ? { color } : undefined}
      >
        {value}
        {sub ? (
          <span className="ml-1 align-middle text-xs font-medium text-muted-foreground">{sub}</span>
        ) : null}
      </dd>
    </div>
  );
}

export function ActivityLoadControl({
  activityId,
  tss,
  method,
  variant,
  source,
  intensityFactor,
  ef,
  efFromGap,
  decoupling,
}: {
  activityId: number;
  tss: number;
  method: LoadMethod | null;
  /**
   * Which hrTSS reading this load is. Null on the other methods and on rows
   * stored before the variant was recorded, which fall back to the plain method
   * label rather than claiming a measurement that was never made.
   */
  variant: LoadVariant | null;
  source: "auto" | "manual" | "computed";
  /** Persisted IF of the load; null on manual overrides and RPE loads. */
  intensityFactor: number | null;
  /** Efficiency factor, null when the sport or the recording gives no basis. */
  ef: number | null;
  /** True when that EF was measured against grade-adjusted speed rather than raw pace. */
  efFromGap: boolean;
  /** Aerobic decoupling in percent, null for short or streamless efforts. */
  decoupling: number | null;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(tss));
  const [pending, startTransition] = useTransition();

  const methodLabel =
    method === "hr" && variant
      ? t.fitness.hrVariants[variant]
      : method
        ? t.fitness.methods[method]
        : null;

  function save() {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error(t.errors.invalidLoad);
      return;
    }
    startTransition(async () => {
      const result = await setActivityLoadManualAction(activityId, parsed);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(t.detail.loadSaved);
      setEditing(false);
      router.refresh();
    });
  }

  function reset() {
    startTransition(async () => {
      const result = await resetActivityLoadAction(activityId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(t.detail.loadReset);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <div className="mt-6 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
        <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          {t.detail.load}
        </span>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode="decimal"
          className="w-24 text-right font-mono tabular-nums"
        />
        <span className="text-xs text-muted-foreground">{t.fitness.tssUnit}</span>
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
          {t.detail.save}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setEditing(false);
            setValue(String(tss));
          }}
          disabled={pending}
        >
          {t.detail.cancel}
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-xl border bg-card p-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        <MetricTile
          label={t.detail.load}
          value={String(tss)}
          sub={t.fitness.tssUnit}
          title={t.detail.loadTooltip}
        />
        {intensityFactor != null ? (
          <MetricTile
            label={t.detail.intensityFactor}
            value={intensityFactor.toFixed(2)}
            title={t.detail.intensityFactorTooltip}
          />
        ) : null}
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
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-2 text-xs text-muted-foreground">
        {source === "manual" ? (
          <span className="rounded-full border px-2 py-0.5 text-[11px]">{t.detail.loadManual}</span>
        ) : methodLabel ? (
          <span>
            {t.detail.loadMethod}: {methodLabel}
          </span>
        ) : null}
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t.detail.editLoad}
          onClick={() => setEditing(true)}
        >
          <PencilIcon />
        </Button>
        {source === "manual" ? (
          <Button size="sm" variant="ghost" onClick={reset} disabled={pending}>
            <RotateCcwIcon data-icon="inline-start" /> {t.detail.resetLoad}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
