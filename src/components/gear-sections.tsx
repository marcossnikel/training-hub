import { BikeIcon, FootprintsIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GearCollection } from "@/components/gear-collection";
import { GearDialog } from "@/components/gear-dialog";
import { ShoeCard } from "@/components/shoe-card";
import { BikeCard } from "@/components/bike-card";
import { listBikes, listShoes } from "@/lib/db";
import { getDict } from "@/lib/lang";
import { isStravaConnected, tryFetchBikes, tryFetchGear } from "@/lib/strava";
import { fmtKm } from "@/lib/format";
import { requireCurrentUser } from "@/lib/auth";
import type { BikeWithMileage, ShoeWithMileage } from "@/lib/types";

// The shoes/bikes collection bodies, extracted so both the consolidated /gear
// page (tabbed) and the legacy /shoes//bikes routes render the same thing.

export async function ShoesSection() {
  const owner = await requireCurrentUser();
  if (!owner) return null;
  const { t } = await getDict();
  const shoes = await listShoes(owner);
  const connected = await isStravaConnected(owner);
  const gear = await tryFetchGear(owner);
  const gearNameById = new Map((gear ?? []).map((g) => [g.id, g.name]));

  const active = shoes.filter((s) => !s.retired_at);
  const retired = shoes.filter((s) => s.retired_at);
  const totalKm = shoes.reduce((acc, s) => acc + s.current_km, 0);

  const addTrigger = (
    <GearDialog kind="shoe" gearOptions={gear} connected={connected}>
      <Button>
        <PlusIcon data-icon="inline-start" /> {t.shoesPage.addShoe}
      </Button>
    </GearDialog>
  );

  const renderCard = (shoe: ShoeWithMileage) => (
    <ShoeCard
      key={shoe.id}
      shoe={shoe}
      gearOptions={gear}
      gearName={shoe.strava_gear_id ? (gearNameById.get(shoe.strava_gear_id) ?? null) : null}
      connected={connected}
      t={t}
    />
  );

  return (
    <GearCollection
      title={t.shoesPage.title}
      summary={
        shoes.length === 0 ? (
          t.shoesPage.empty
        ) : (
          <>
            {shoes.length} {t.nav.shoes.toLowerCase()}
            <span aria-hidden> · </span>
            <span className="font-mono tabular-nums">{fmtKm(totalKm, 0)}</span>{" "}
            {t.shoesPage.countSuffix}
          </>
        )
      }
      addTrigger={addTrigger}
      empty={
        shoes.length === 0
          ? {
              icon: FootprintsIcon,
              title: t.shoesPage.firstShoeTitle,
              body: t.shoesPage.firstShoeBody,
              action: addTrigger,
            }
          : null
      }
      active={active.map(renderCard)}
      retired={
        retired.length > 0
          ? { label: t.shoesPage.retiredSection, cards: retired.map(renderCard) }
          : null
      }
    />
  );
}

export async function BikesSection() {
  const owner = await requireCurrentUser();
  if (!owner) return null;
  const { t } = await getDict();
  const bikes = await listBikes(owner);
  const connected = await isStravaConnected(owner);
  const gear = await tryFetchBikes(owner);
  const gearNameById = new Map((gear ?? []).map((g) => [g.id, g.name]));

  const active = bikes.filter((b) => !b.retired_at);
  const retired = bikes.filter((b) => b.retired_at);
  const totalKm = bikes.reduce((acc, b) => acc + b.current_km, 0);

  const addTrigger = (
    <GearDialog kind="bike" gearOptions={gear} connected={connected}>
      <Button>
        <PlusIcon data-icon="inline-start" /> {t.bikesPage.addBike}
      </Button>
    </GearDialog>
  );

  const renderCard = (bike: BikeWithMileage) => (
    <BikeCard
      key={bike.id}
      bike={bike}
      gearOptions={gear}
      gearName={bike.strava_gear_id ? (gearNameById.get(bike.strava_gear_id) ?? null) : null}
      connected={connected}
      t={t}
    />
  );

  return (
    <GearCollection
      title={t.bikesPage.title}
      summary={
        bikes.length === 0 ? (
          t.bikesPage.empty
        ) : (
          <>
            {bikes.length} {t.nav.bikes.toLowerCase()}
            <span aria-hidden> · </span>
            <span className="font-mono tabular-nums">{fmtKm(totalKm, 0)}</span>{" "}
            {t.bikesPage.countSuffix}
          </>
        )
      }
      addTrigger={addTrigger}
      empty={
        bikes.length === 0
          ? {
              icon: BikeIcon,
              title: t.bikesPage.firstBikeTitle,
              body: t.bikesPage.firstBikeBody,
              action: addTrigger,
            }
          : null
      }
      active={active.map(renderCard)}
      retired={
        retired.length > 0
          ? { label: t.bikesPage.retiredSection, cards: retired.map(renderCard) }
          : null
      }
    />
  );
}
