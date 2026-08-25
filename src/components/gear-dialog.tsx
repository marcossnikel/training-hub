"use client";

import { useActionState, useCallback, useEffect, useState, useTransition } from "react";
import { ArchiveIcon, ArchiveRestoreIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  saveBikeFormAction,
  saveShoeFormAction,
  setBikeRetiredAction,
  setShoeRetiredAction,
} from "@/lib/actions";
import { NONE } from "@/lib/constants";
import { fillStr } from "@/lib/i18n";
import type { Bike, Shoe, StravaGear } from "@/lib/types";

// The add/edit dialog for a gear entity. Shoe and bike share the whole form
// chrome and save idiom; `kind` selects the i18n namespace + save action, and
// the shoe-only retirement cap field is the single structural specialization.
type GearDialogProps = {
  gearOptions: StravaGear[] | null;
  connected: boolean;
  children: React.ReactNode;
} & ({ kind: "shoe"; gear?: Shoe } | { kind: "bike"; gear?: Bike });

export function GearDialog(props: GearDialogProps) {
  const { kind, gear, gearOptions, connected, children } = props;
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  const d = kind === "shoe" ? t.shoeDialog : t.bikeDialog;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{gear ? fillStr(d.editTitle, { name: gear.name }) : d.addTitle}</DialogTitle>
          <DialogDescription>{gear ? d.editBody : d.addBody}</DialogDescription>
        </DialogHeader>
        {kind === "shoe" ? (
          <ShoeGearForm
            gear={gear}
            gearOptions={gearOptions}
            connected={connected}
            onSuccess={close}
          />
        ) : (
          <BikeGearForm
            gear={gear}
            gearOptions={gearOptions}
            connected={connected}
            onSuccess={close}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type GearFormProps = {
  gearOptions: StravaGear[] | null;
  connected: boolean;
  onSuccess: () => void;
};

function ShoeGearForm({ gear, ...props }: GearFormProps & { gear?: Shoe }) {
  const [result, formAction, pending] = useActionState(saveShoeFormAction, null);
  return (
    <GearForm
      kind="shoe"
      gear={gear}
      result={result}
      formAction={formAction}
      pending={pending}
      {...props}
    />
  );
}

function BikeGearForm({ gear, ...props }: GearFormProps & { gear?: Bike }) {
  const [result, formAction, pending] = useActionState(saveBikeFormAction, null);
  return (
    <GearForm
      kind="bike"
      gear={gear}
      result={result}
      formAction={formAction}
      pending={pending}
      {...props}
    />
  );
}

function GearForm({
  kind,
  gear,
  gearOptions,
  connected,
  onSuccess,
  result,
  formAction,
  pending,
}: GearFormProps & {
  kind: "shoe" | "bike";
  gear?: Shoe | Bike;
  result: Awaited<ReturnType<typeof saveShoeFormAction>> | null;
  formAction: (payload: FormData) => void;
  pending: boolean;
}) {
  const { t } = useI18n();
  const d = kind === "shoe" ? t.shoeDialog : t.bikeDialog;
  const namePlaceholder = kind === "shoe" ? "ASICS Superblast 3" : "TSW TR10 One";

  useEffect(() => {
    if (!result) return;
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      gear
        ? kind === "shoe"
          ? t.toasts.shoeUpdated
          : t.toasts.bikeUpdated
        : kind === "shoe"
          ? t.toasts.shoeAdded
          : t.toasts.bikeAdded
    );
    onSuccess();
  }, [gear, kind, onSuccess, result, t]);

  const baselineField = (
    <div className="space-y-1.5">
      <Label htmlFor={`${kind}-initial`}>{d.baseline}</Label>
      <Input
        id={`${kind}-initial`}
        name="initial_km"
        type="number"
        step={kind === "shoe" ? "0.1" : "1"}
        min="0"
        defaultValue={gear?.initial_km ?? 0}
        className="font-mono tabular-nums"
      />
    </div>
  );

  return (
    <form action={formAction} className="space-y-4">
      {gear ? <input type="hidden" name="id" value={gear.id} /> : null}

      <div className="space-y-1.5">
        <Label htmlFor={`${kind}-name`}>{d.name}</Label>
        <Input
          id={`${kind}-name`}
          name="name"
          required
          defaultValue={gear?.name ?? ""}
          placeholder={namePlaceholder}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${kind}-role`}>{d.role}</Label>
        <Input
          id={`${kind}-role`}
          name="role"
          defaultValue={gear?.role ?? ""}
          placeholder={d.rolePlaceholder}
        />
      </div>

      {kind === "shoe" ? (
        <div className="grid grid-cols-2 gap-3">
          {baselineField}
          <div className="space-y-1.5">
            <Label htmlFor="shoe-retirement">{t.shoeDialog.retireAt}</Label>
            <Input
              id="shoe-retirement"
              name="retirement_km"
              type="number"
              step="1"
              min="1"
              defaultValue={(gear as Shoe | undefined)?.retirement_km ?? 700}
              className="font-mono tabular-nums"
            />
          </div>
        </div>
      ) : (
        baselineField
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`${kind}-photo`}>{d.photo}</Label>
        <Input id={`${kind}-photo`} name="photo" type="file" accept="image/*" />
        {gear?.photo_path ? <p className="text-xs text-muted-foreground">{d.keepPhoto}</p> : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${kind}-gear`}>{d.gear}</Label>
        {gearOptions && gearOptions.length > 0 ? (
          <Select name="strava_gear_id" defaultValue={gear?.strava_gear_id ?? NONE}>
            <SelectTrigger id={`${kind}-gear`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{d.notLinked}</SelectItem>
              {gearOptions.map((option) => (
                <GearSelectItem key={option.id} gear={option} />
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
            {connected ? d.gearUnavailable : d.gearConnectHint}
          </p>
        )}
      </div>

      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2Icon
              className="animate-spin motion-reduce:animate-none"
              data-icon="inline-start"
            />
          ) : null}
          {gear ? d.save : d.add}
        </Button>
      </DialogFooter>
    </form>
  );
}

// Toggles a gear entity in/out of retirement. Shoe and bike share the button
// chrome and toast idiom; `kind` selects the retire action and the entity's
// retire/unretire labels.
export function RetireGearButton(
  props: { kind: "shoe"; gear: Shoe } | { kind: "bike"; gear: Bike }
) {
  const { gear } = props;
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  const retired = !!gear.retired_at;
  const setRetired = props.kind === "shoe" ? setShoeRetiredAction : setBikeRetiredAction;
  const labels = props.kind === "shoe" ? t.shoesPage : t.bikesPage;

  function toggle() {
    startTransition(async () => {
      const result = await setRetired(gear.id, !retired);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        fillStr(retired ? t.toasts.backInRotation : t.toasts.retired, { name: gear.name })
      );
    });
  }

  return (
    <Button variant="ghost" size="sm" onClick={toggle} disabled={pending}>
      {retired ? (
        <ArchiveRestoreIcon data-icon="inline-start" />
      ) : (
        <ArchiveIcon data-icon="inline-start" />
      )}
      {retired ? labels.unretire : labels.retire}
    </Button>
  );
}
