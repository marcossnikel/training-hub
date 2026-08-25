"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Loader2Icon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GearSelectItem } from "@/components/gear-select-item";
import { useI18n } from "@/components/i18n-provider";
import { createManualActivityAction, setBikeGearAction, setShoeGearAction } from "@/lib/actions";
import { NONE } from "@/lib/constants";
import { fmtKm, localDateInputValue } from "@/lib/format";
import { fillStr } from "@/lib/i18n";
import type { GearOption, StravaGear } from "@/lib/types";

// One matcher for both entities: identical chrome, the only difference is which
// server action links the row. `kind` selects it so shoes call setShoeGearAction
// and bikes call setBikeGearAction with the exact same (id, gearId) idiom.
export function GearMatcher({
  items,
  gear,
  kind,
}: {
  items: Array<GearOption & { gearId: string | null }>;
  gear: StravaGear[];
  kind: "shoe" | "bike";
}) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  // The server prop stays the authority; this layer only carries the in-flight
  // pick so the trigger shows the new gear right away instead of snapping back
  // to the old label for the whole (Strava-backed) round-trip. Selecting also
  // disables every trigger, so a second link cannot race the first.
  const [optimisticItems, applyPick] = useOptimistic(
    items,
    (current, pick: { id: number; gearId: string | null }) =>
      current.map((item) => (item.id === pick.id ? { ...item, gearId: pick.gearId } : item))
  );
  const setGear = kind === "shoe" ? setShoeGearAction : setBikeGearAction;

  function link(id: number, value: string) {
    const gearId = value === NONE ? null : value;
    // useOptimistic only applies inside a transition, so the whole call sits in one.
    startTransition(async () => {
      applyPick({ id, gearId });
      const result = await setGear(id, gearId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(gearId ? t.toasts.gearLinked : t.toasts.gearUnlinked);
    });
  }

  return (
    <ul className="space-y-2.5">
      {optimisticItems.map((item) => (
        <li key={item.id} className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{item.name}</p>
            {item.role ? (
              <p className="truncate text-xs text-muted-foreground italic">{item.role}</p>
            ) : null}
          </div>
          <Select value={item.gearId ?? NONE} onValueChange={(value) => link(item.id, value)}>
            <SelectTrigger size="sm" className="w-52 shrink-0" disabled={pending}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t.settingsPage.notLinked}</SelectItem>
              {gear.map((g) => (
                <GearSelectItem key={g.id} gear={g} />
              ))}
            </SelectContent>
          </Select>
        </li>
      ))}
    </ul>
  );
}

export function ManualActivityForm({ shoes }: { shoes: GearOption[] }) {
  const { t } = useI18n();
  const [date, setDate] = useState(() => localDateInputValue());
  const [km, setKm] = useState("");
  const [shoeId, setShoeId] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const kmValue = parseFloat(km);
    if (!shoeId) {
      toast.error(t.toasts.pickShoe);
      return;
    }
    if (!Number.isFinite(kmValue) || kmValue === 0) {
      toast.error(t.toasts.zeroDistance);
      return;
    }
    startTransition(async () => {
      const result = await createManualActivityAction({
        date,
        km: kmValue,
        shoeId: Number(shoeId),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const shoeName = shoes.find((s) => s.id === Number(shoeId))?.name ?? "";
      toast.success(
        fillStr(kmValue > 0 ? t.toasts.manualAdded : t.toasts.manualRemoved, {
          km: fmtKm(Math.abs(kmValue)),
          name: shoeName,
        })
      );
      setKm("");
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="manual-date">{t.settingsPage.date}</Label>
        <Input
          id="manual-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className="w-38 font-mono tabular-nums"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="manual-km">{t.settingsPage.distanceKm}</Label>
        <Input
          id="manual-km"
          type="number"
          step="0.1"
          value={km}
          onChange={(e) => setKm(e.target.value)}
          placeholder="8.0"
          required
          className="w-28 text-right font-mono tabular-nums"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="manual-shoe">{t.settingsPage.shoe}</Label>
        <Select value={shoeId} onValueChange={setShoeId}>
          <SelectTrigger id="manual-shoe" className="w-56">
            <SelectValue placeholder={t.splits.pickShoe} />
          </SelectTrigger>
          <SelectContent>
            {shoes.map((shoe) => (
              <SelectItem key={shoe.id} value={String(shoe.id)}>
                <span className="truncate">{shoe.name}</span>
                {shoe.retired ? (
                  <span className="text-xs text-muted-foreground">· {t.splits.retiredTag}</span>
                ) : null}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? (
          <Loader2Icon
            className="animate-spin motion-reduce:animate-none"
            data-icon="inline-start"
          />
        ) : (
          <PlusIcon data-icon="inline-start" />
        )}
        {t.settingsPage.addEntry}
      </Button>
    </form>
  );
}
