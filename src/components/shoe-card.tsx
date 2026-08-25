import {
  ArchiveIcon,
  FootprintsIcon,
  PencilIcon,
  SparklesIcon,
  TrendingDownIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { GearCard } from "@/components/gear-card";
import { GearDialog, RetireGearButton } from "@/components/gear-dialog";
import { WearBar, wearStatus } from "@/components/wear-bar";
import { fmtKm } from "@/lib/format";
import { fillStr, type Dict } from "@/lib/i18n";
import type { ShoeWithMileage, StravaGear, WearStatus } from "@/lib/types";

const STATUS_META: Record<WearStatus, { icon: LucideIcon; className: string }> = {
  fresh: { icon: SparklesIcon, className: "text-positive" },
  worn: { icon: TrendingDownIcon, className: "text-wear-worn" },
  critical: { icon: TriangleAlertIcon, className: "text-wear-critical" },
  retired: { icon: ArchiveIcon, className: "text-muted-foreground" },
};

// Shoe specialization of GearCard: the wear meter, wear-status pill, and the
// mileage readout against the retirement cap.
export function ShoeCard({
  shoe,
  gearOptions,
  gearName,
  connected,
  t,
}: {
  shoe: ShoeWithMileage;
  gearOptions: StravaGear[] | null;
  gearName: string | null;
  connected: boolean;
  t: Dict;
}) {
  const status = wearStatus(shoe);
  const meta = STATUS_META[status];
  const StatusIcon = meta.icon;
  const cap = shoe.retirement_km && shoe.retirement_km > 0 ? shoe.retirement_km : 700;
  const overCap = shoe.current_km - cap;

  return (
    <GearCard
      name={shoe.name}
      role={shoe.role}
      noRoleLabel={t.shoesPage.noRole}
      photoPath={shoe.photo_path}
      retired={status === "retired"}
      fallbackIcon={FootprintsIcon}
      gearName={gearName}
      gearLabel={t.shoesPage.gearLabel}
      badge={
        <span
          className={cn(
            "absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-card px-2 py-0.5 text-xs font-medium shadow-xs",
            meta.className
          )}
        >
          <StatusIcon className="size-3" aria-hidden />
          {t.wear[status]}
        </span>
      }
      editTrigger={
        <GearDialog kind="shoe" gear={shoe} gearOptions={gearOptions} connected={connected}>
          <Button variant="outline" size="sm">
            <PencilIcon data-icon="inline-start" /> {t.shoesPage.edit}
          </Button>
        </GearDialog>
      }
      retireButton={<RetireGearButton kind="shoe" gear={shoe} />}
    >
      <WearBar currentKm={shoe.current_km} retirementKm={shoe.retirement_km} status={status} />

      <div className="flex items-baseline justify-between gap-2 font-mono text-xs tabular-nums">
        <span>
          <span className="text-sm font-semibold">{shoe.current_km.toFixed(1)}</span>
          <span className="text-muted-foreground"> / {Math.round(cap)} km</span>
        </span>
        {overCap > 0 ? (
          <span className="text-wear-critical">
            {fillStr(t.shoesPage.kmOver, { km: fmtKm(overCap, 0) })}
          </span>
        ) : (
          <span className="text-muted-foreground">
            {fillStr(t.shoesPage.kmLeft, { km: fmtKm(cap - shoe.current_km, 0) })}
          </span>
        )}
      </div>
    </GearCard>
  );
}
