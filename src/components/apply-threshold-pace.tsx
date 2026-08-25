"use client";

import { useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import { applyThresholdPaceAction } from "@/features/activities/server/actions";
import { THRESHOLD_PACE_RANGE } from "@/lib/fitness";

/**
 * Explicit, user-initiated apply of the Critical Speed threshold-pace SUGGESTION
 * to the athlete's stored thresholds. Nothing here runs automatically: it posts
 * only on click, and it calls a PACE-ONLY server action that re-reads the current
 * thresholds server-side and changes just the threshold pace — so it never
 * reverts unrelated threshold edits made after the page loaded.
 *
 * A slow race can imply a pace outside the range the save accepts; rather than
 * offer a button that always fails validation, the apply is suppressed and a
 * short label explains why.
 */
export function ApplyThresholdPaceButton({ suggestedPaceSPerKm }: { suggestedPaceSPerKm: number }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();

  const pace = Math.round(suggestedPaceSPerKm);
  const outOfRange = pace < THRESHOLD_PACE_RANGE.min || pace > THRESHOLD_PACE_RANGE.max;

  if (outOfRange) {
    return <span className="text-xs text-muted-foreground">{t.performance.applyOutOfRange}</span>;
  }

  function apply() {
    startTransition(async () => {
      const result = await applyThresholdPaceAction(pace);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(t.performance.applied);
    });
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={apply} disabled={pending}>
      {pending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
      {t.performance.apply}
    </Button>
  );
}
