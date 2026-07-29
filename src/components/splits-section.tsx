"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ClockIcon, Loader2Icon, PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SplitsEditor, newRowKey, rowsToSplits, type SplitRow } from "@/components/splits-editor";
import { useI18n } from "@/components/i18n-provider";
import { updateSplitsAction } from "@/lib/actions";
import { fmtKm } from "@/lib/format";
import { splitErrorText } from "@/lib/i18n";
import { isRunSport, validateSplits } from "@/lib/validate";
import type { ActivityWithSplits, ShoeOption } from "@/lib/types";

export function SplitsSection({
  activity,
  shoes,
}: {
  activity: ActivityWithSplits;
  shoes: ShoeOption[];
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<SplitRow[]>([]);
  const [pending, startTransition] = useTransition();

  const run = isRunSport(activity.sport_type);

  if (activity.status === "pending_review") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3">
        <p className="flex items-center gap-2 text-sm">
          <ClockIcon className="size-4 text-primary" aria-hidden />
          {t.detail.pendingBanner}
        </p>
        <Button asChild size="sm">
          <Link href="/review">{t.detail.reviewNow}</Link>
        </Button>
      </div>
    );
  }

  function startEditing() {
    const initial: SplitRow[] = activity.splits.map((s) => ({
      key: newRowKey(),
      shoeId: s.shoe_id,
      km: s.km ? String(s.km) : "",
    }));
    if (initial.length === 0 && run && (activity.distance_km ?? 0) > 0) {
      initial.push({ key: newRowKey(), shoeId: null, km: String(activity.distance_km) });
    }
    setRows(initial);
    setEditing(true);
  }

  function save() {
    const payload = rowsToSplits(rows);
    const error = validateSplits(activity, payload);
    if (error) {
      toast.error(splitErrorText(error, t));
      return;
    }
    startTransition(async () => {
      const result = await updateSplitsAction({ activityId: activity.id, splits: payload });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(t.toasts.splitsSaved);
      setEditing(false);
    });
  }

  if (!editing) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          {activity.splits.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.detail.noSplits}</p>
          ) : (
            <ul className="min-w-0 flex-1 space-y-1.5">
              {activity.splits.map((split) => (
                <li
                  key={split.id}
                  className="flex items-baseline justify-between gap-4 border-b border-dashed border-border/70 pb-1.5 text-sm"
                >
                  <span className="min-w-0 truncate">
                    {split.shoe_name ?? t.detail.noShoe}
                    {split.shoe_role ? (
                      <span className="text-xs text-muted-foreground"> · {split.shoe_role}</span>
                    ) : null}
                  </span>
                  <span className="font-mono font-medium tabular-nums">{fmtKm(split.km)}</span>
                </li>
              ))}
            </ul>
          )}
          <Button variant="ghost" size="sm" onClick={startEditing} className="shrink-0 self-start">
            <PencilIcon data-icon="inline-start" />
            {activity.splits.length === 0 ? t.detail.assignShoes : t.detail.edit}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SplitsEditor
        rows={rows}
        onChange={setRows}
        distanceKm={activity.distance_km ?? 0}
        isRun={run}
        shoes={shoes}
      />
      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
          {t.detail.saveSplits}
        </Button>
        <Button variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
          {t.detail.cancel}
        </Button>
      </div>
    </div>
  );
}
