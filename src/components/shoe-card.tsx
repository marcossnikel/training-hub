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
  const providerGear = shoe.origin === "strava";
  const providerStale =
    shoe.provider_observed_at !== null &&
    shoe.provider_last_seen_at !== null &&
    shoe.provider_last_seen_at > shoe.provider_observed_at;
  const status = wearStatus(shoe);
  const meta = STATUS_META[status];
  const StatusIcon = meta.icon;
  const cap = shoe.retirement_km && shoe.retirement_km > 0 ? shoe.retirement_km : 700;
  const currentKm = shoe.current_km ?? 0;
  const overCap = currentKm - cap;

  return (
    <GearCard
      name={shoe.name}
      role={shoe.role}
      noRoleLabel={t.shoesPage.noRole}
      photoPath={shoe.photo_path}
      retired={providerGear ? !!shoe.retired_at : status === "retired"}
      fallbackIcon={FootprintsIcon}
      gearName={gearName}
      gearLabel={t.shoesPage.gearLabel}
      badge={
        !providerGear ? (
          <span
            className={cn(
              "absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-card px-2 py-0.5 text-xs font-medium shadow-xs",
              meta.className
            )}
          >
            <StatusIcon className="size-3" aria-hidden />
            {t.wear[status]}
          </span>
        ) : undefined
      }
      editTrigger={
        !providerGear ? (
          <GearDialog kind="shoe" gear={shoe} gearOptions={gearOptions} connected={connected}>
            <Button variant="outline" size="sm">
              <PencilIcon data-icon="inline-start" /> {t.shoesPage.edit}
            </Button>
          </GearDialog>
        ) : undefined
      }
      retireButton={!providerGear ? <RetireGearButton kind="shoe" gear={shoe} /> : undefined}
    >
      {providerGear ? (
        <ProviderOdometer shoe={shoe} t={t} stale={providerStale} />
      ) : (
        <>
          <WearBar currentKm={currentKm} retirementKm={shoe.retirement_km} status={status} />
          <div className="flex items-baseline justify-between gap-2 font-mono text-xs tabular-nums">
            <span>
              <span className="text-sm font-semibold">{currentKm.toFixed(1)}</span>
              <span className="text-muted-foreground"> / {Math.round(cap)} km</span>
            </span>
            {overCap > 0 ? (
              <span className="text-wear-critical">
                {fillStr(t.shoesPage.kmOver, { km: fmtKm(overCap, 0) })}
              </span>
            ) : (
              <span className="text-muted-foreground">
                {fillStr(t.shoesPage.kmLeft, { km: fmtKm(cap - currentKm, 0) })}
              </span>
            )}
          </div>
          {shoe.provider_distance_m !== null ? (
            <ProviderOdometer shoe={shoe} t={t} stale={providerStale} reference />
          ) : null}
        </>
      )}
    </GearCard>
  );
}

function ProviderOdometer({
  shoe,
  t,
  stale,
  reference = false,
}: {
  shoe: ShoeWithMileage;
  t: Dict;
  stale: boolean;
  reference?: boolean;
}) {
  const km = shoe.provider_distance_m === null ? null : shoe.provider_distance_m / 1000;
  return (
    <div className="space-y-1 font-mono text-xs tabular-nums text-muted-foreground">
      <p>{reference ? t.shoesPage.providerReference : t.shoesPage.providerOdometer}</p>
      <p className="text-sm font-semibold text-foreground">
        {km === null ? t.shoesPage.odometerUnknown : fmtKm(km, 1)}
      </p>
      {shoe.provider_observed_at ? (
        <p title={shoe.provider_observed_at}>
          {fillStr(t.shoesPage.providerObserved, { date: shoe.provider_observed_at.slice(0, 10) })}
          {stale ? ` · ${t.shoesPage.providerStale}` : ""}
        </p>
      ) : null}
    </div>
  );
}
