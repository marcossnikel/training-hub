"use client";

import { useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import { applyFtpAction } from "@/features/activities/server/actions";
import { FTP_RANGE } from "@/lib/fitness";

/**
 * Explicit, user-initiated apply of the eFTP ESTIMATE to the athlete's stored
 * thresholds — the cycling twin of ApplyThresholdPaceButton, and deliberately
 * the same shape. Nothing here runs automatically: it posts only on click, and
 * the server action re-reads the current thresholds and changes just the FTP
 * (clearing the provisional flag), so it never reverts unrelated threshold edits
 * made after the page loaded.
 *
 * A fit can land outside the range the save accepts; rather than offer a button
 * that always fails validation, the apply is suppressed and a short label
 * explains why.
 */
export function ApplyFtpButton({ suggestedFtpW }: { suggestedFtpW: number }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();

  const ftp = Math.round(suggestedFtpW);
  const outOfRange = ftp < FTP_RANGE.min || ftp > FTP_RANGE.max;

  if (outOfRange) {
    return <span className="text-xs text-muted-foreground">{t.performance.applyOutOfRange}</span>;
  }

  function apply() {
    startTransition(async () => {
      const result = await applyFtpAction(ftp);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(t.performance.eftpApplied);
    });
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={apply} disabled={pending}>
      {pending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
      {t.performance.eftpApply}
    </Button>
  );
}
