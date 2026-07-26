"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import { applyLoadRecomputeAction, previewLoadRecomputeAction } from "@/lib/actions";
import { fmtTssDelta } from "@/lib/format";
import { fillStr } from "@/lib/i18n";
import type { LoadRecomputePlan } from "@/lib/db";

/**
 * The two-step "recompute loads" control: preview first, apply only on a second
 * click, with the preview's numbers on screen while that decision is made.
 *
 * Recomputing is not a refresh. Every stored TSS is an input to the 42-day CTL
 * average, so adopting the stream-integrated hrTSS across history moves the
 * fitness curve itself — the preview exists so that move is seen before it
 * happens, not discovered afterwards on the chart.
 */
export function RecomputeLoads() {
  const router = useRouter();
  const { t } = useI18n();
  const [plan, setPlan] = useState<LoadRecomputePlan | null>(null);
  const [pending, startTransition] = useTransition();

  function preview() {
    startTransition(async () => {
      const result = await previewLoadRecomputeAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setPlan(result);
    });
  }

  function apply() {
    if (!plan) return;
    // The figures on screen, handed back so the server can refuse to write
    // anything else. Between the two clicks a sync can land or another stream
    // can be cached, and the apply must not quietly move CTL further than the
    // preview promised.
    const expect = { changed: plan.changed, ctlAfter: plan.ctlAfter };
    startTransition(async () => {
      const result = await applyLoadRecomputeAction(expect);
      if (!result.ok) {
        toast.error(result.error);
        // Nothing was written and these numbers are now wrong: clear them so the
        // only way on is a fresh preview.
        if (result.drifted) setPlan(null);
        return;
      }
      setPlan(null);
      toast.success(fillStr(t.settingsPage.recompute.applied, { count: result.changed }));
      router.refresh();
    });
  }

  const copy = t.settingsPage.recompute;
  return (
    <div className="space-y-3">
      {plan ? (
        <>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <Figure label={copy.changed} value={`${plan.changed} / ${plan.considered}`} />
            <Figure label={copy.meanDelta} value={fmtTssDelta(plan.meanDelta)} />
            <Figure label={copy.maxDelta} value={fmtTssDelta(plan.maxDelta)} />
            <Figure
              label={copy.ctlToday}
              value={`${plan.ctlBefore.toFixed(1)} → ${plan.ctlAfter.toFixed(1)}`}
            />
          </dl>
          <p className="text-xs text-muted-foreground">
            {fillStr(copy.detail, {
              stream: plan.streamCount,
              manual: plan.manualSkipped,
            })}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={apply} disabled={pending || plan.changed === 0}>
              {pending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
              {copy.apply}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPlan(null)} disabled={pending}>
              {copy.cancel}
            </Button>
            {plan.changed === 0 ? (
              <span className="text-xs text-muted-foreground">{copy.noChanges}</span>
            ) : null}
          </div>
        </>
      ) : (
        <Button variant="outline" size="sm" onClick={preview} disabled={pending}>
          {pending ? (
            <Loader2Icon className="animate-spin" data-icon="inline-start" />
          ) : (
            <RefreshCwIcon data-icon="inline-start" />
          )}
          {copy.preview}
        </Button>
      )}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 font-mono text-sm tabular-nums">{value}</dd>
    </div>
  );
}
