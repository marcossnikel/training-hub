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

  return (
    <div>
      <div className="mx-auto w-full max-w-5xl px-4 pt-8 sm:px-6">
        <nav aria-label="Gear" className="flex items-center gap-1.5">
          <FilterPill href="/gear" active={tab === "shoes"} label={t.nav.shoes} />
          <FilterPill href="/gear?tab=bikes" active={tab === "bikes"} label={t.nav.bikes} />
        </nav>
      </div>
      {tab === "bikes" ? <BikesSection /> : <ShoesSection />}
    </div>
  );
}
