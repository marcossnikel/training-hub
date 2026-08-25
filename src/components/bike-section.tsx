"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ClockIcon, Loader2Icon, PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BikeSelect } from "@/components/bike-select";
import { useI18n } from "@/components/i18n-provider";
import { setActivityBikeAction } from "@/features/activities/server/actions";
import type { ActivityWithSplits, BikeOption } from "@/lib/types";

export function BikeSection({
  activity,
  bikes,
}: {
  activity: ActivityWithSplits;
  bikes: BikeOption[];
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [bikeId, setBikeId] = useState<number | null>(activity.bike_id);
  const [pending, startTransition] = useTransition();

  const bikeName = bikes.find((b) => b.id === activity.bike_id)?.name ?? null;

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

  function save() {
    startTransition(async () => {
      const result = await setActivityBikeAction(activity.id, bikeId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(t.toasts.bikeUpdated);
      setEditing(false);
    });
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm">
          {bikeName ?? <span className="text-muted-foreground">{t.detail.noBike}</span>}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setBikeId(activity.bike_id);
            setEditing(true);
          }}
        >
          <PencilIcon data-icon="inline-start" />
          {activity.bike_id ? t.detail.edit : t.detail.assignBike}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <BikeSelect value={bikeId} onChange={setBikeId} bikes={bikes} />
      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
          {t.detail.save}
        </Button>
        <Button variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
          {t.detail.cancel}
        </Button>
      </div>
    </div>
  );
}
