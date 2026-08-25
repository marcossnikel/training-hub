import { FilterPill } from "@/components/filter-pill";
import { redirect } from "next/navigation";
import { BikesSection, ShoesSection } from "@/components/gear-sections";
import { requireCurrentUser } from "@/lib/auth";
import { getDict } from "@/lib/lang";

export const metadata = { title: "Gear" };

// Consolidated gear page: one nav entry with Shoes / Bikes tabs (?tab=bikes),
// replacing the two separate nav items. Each tab renders its collection section.
export default async function GearPage({ searchParams }: PageProps<"/gear">) {
  const owner = await requireCurrentUser();
  if (!owner) redirect("/login");
  const params = await searchParams;
  const { t } = await getDict();
  const tab = params.tab === "bikes" ? "bikes" : "shoes";
  const tg = t.gearPage;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:py-10">
      <header className="max-w-3xl">
        <p className="font-mono text-xs text-muted-foreground uppercase">{tg.eyebrow}</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-[2.5rem] sm:leading-[2.75rem]">
          {tg.headline}
        </h1>
        <p className="mt-3 text-base leading-7 text-muted-foreground">{tg.intro}</p>
      </header>

      <nav aria-label="Gear" className="mt-6 flex items-center gap-1.5">
        <FilterPill href="/gear" active={tab === "shoes"} label={t.nav.shoes} />
        <FilterPill href="/gear?tab=bikes" active={tab === "bikes"} label={t.nav.bikes} />
      </nav>

      {tab === "bikes" ? <BikesSection /> : <ShoesSection />}
      <p className="mt-6 font-mono text-xs leading-5 text-muted-foreground">{tg.evidenceNote}</p>
    </div>
  );
}
