import { BikeIcon, HomeIcon, MountainIcon, PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GearCard } from "@/components/gear-card";
import { GearDialog, RetireGearButton } from "@/components/gear-dialog";
import { fmtKm } from "@/lib/format";
import { fillStr, type Dict } from "@/lib/i18n";
import type { BikeWithMileage, StravaGear } from "@/lib/types";

// Bike specialization of GearCard: the big lifetime distance, ride count, and
// the indoor/outdoor split breakdown.
export function BikeCard({
  bike,
  gearOptions,
  gearName,
  connected,
  t,
}: {
  bike: BikeWithMileage;
  gearOptions: StravaGear[] | null;
  gearName: string | null;
  connected: boolean;
  t: Dict;
}) {
  const providerGear = bike.origin === "strava";
  const providerStale =
    bike.provider_observed_at !== null &&
    bike.provider_last_seen_at !== null &&
    bike.provider_last_seen_at > bike.provider_observed_at;
  const mountain = (bike.role ?? "").toLowerCase().includes("mount");
  const RoleIcon = mountain ? MountainIcon : BikeIcon;

  const tracked = bike.indoor_km + bike.outdoor_km;
  const hasBreakdown = tracked > 0.05;
  const indoorPct = hasBreakdown ? Math.round((bike.indoor_km / tracked) * 100) : 0;

  return (
    <GearCard
      name={bike.name}
      role={bike.role}
      noRoleLabel={t.bikesPage.noRole}
      roleIcon={RoleIcon}
      photoPath={bike.photo_path}
      retired={!!bike.retired_at}
      fallbackIcon={RoleIcon}
      contentClassName="space-y-3.5"
      gearName={gearName}
      gearLabel={t.bikesPage.gearLabel}
      editTrigger={
        !providerGear ? (
          <GearDialog kind="bike" gear={bike} gearOptions={gearOptions} connected={connected}>
            <Button variant="outline" size="sm">
              <PencilIcon data-icon="inline-start" /> {t.bikesPage.edit}
            </Button>
          </GearDialog>
        ) : undefined
      }
      retireButton={!providerGear ? <RetireGearButton kind="bike" gear={bike} /> : undefined}
    >
      {providerGear ? (
        <ProviderOdometer bike={bike} t={t} stale={providerStale} />
      ) : (
        <>
          <div className="flex items-end justify-between gap-2">
            <div className="flex items-baseline gap-1">
              <span className="font-display text-4xl leading-none font-bold tracking-tight">
                {(bike.current_km ?? 0).toFixed(0)}
              </span>
              <span className="text-sm font-medium text-muted-foreground">km</span>
            </div>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {fillStr(t.bikesPage.rides, { n: bike.ride_count })}
            </span>
          </div>

          {hasBreakdown ? (
            <div className="space-y-2">
              <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
                <div className="bg-chart-2" style={{ width: `${indoorPct}%` }} />
                <div className="flex-1 bg-primary" />
              </div>
              <div className="flex items-center justify-between gap-2 font-mono text-xs tabular-nums text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <HomeIcon className="size-3 text-chart-2" aria-hidden />
                  {fmtKm(bike.indoor_km, 0)} {t.detail.indoor.toLowerCase()}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <BikeIcon className="size-3 text-primary" aria-hidden />
                  {fmtKm(bike.outdoor_km, 0)} {t.detail.outdoor.toLowerCase()}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t.bikesPage.lifetime}</p>
          )}
          {bike.provider_distance_m !== null ? (
            <ProviderOdometer bike={bike} t={t} stale={providerStale} reference />
          ) : null}
        </>
      )}
    </GearCard>
  );
}

function ProviderOdometer({
  bike,
  t,
  stale,
  reference = false,
}: {
  bike: BikeWithMileage;
  t: Dict;
  stale: boolean;
  reference?: boolean;
}) {
  const km = bike.provider_distance_m === null ? null : bike.provider_distance_m / 1000;
  return (
    <div className="space-y-1 font-mono text-xs tabular-nums text-muted-foreground">
      <p>{reference ? t.bikesPage.providerReference : t.bikesPage.providerOdometer}</p>
      <p className="text-2xl font-semibold text-foreground">
        {km === null ? t.bikesPage.odometerUnknown : fmtKm(km, 1)}
      </p>
      {bike.provider_observed_at ? (
        <p title={bike.provider_observed_at}>
          {fillStr(t.bikesPage.providerObserved, { date: bike.provider_observed_at.slice(0, 10) })}
          {stale ? ` · ${t.bikesPage.providerStale}` : ""}
        </p>
      ) : null}
    </div>
  );
}
