import { ReviewFlow } from "@/components/review-flow";
import { redirect } from "next/navigation";
import { listBikes, listPendingActivities, listShoes } from "@/lib/db";
import { toGearOption } from "@/lib/gear";
import { getDict } from "@/lib/lang";
import { requireCurrentUser } from "@/lib/auth";

export const metadata = { title: "Review" };

export default async function ReviewPage() {
  const owner = await requireCurrentUser();
  if (!owner) redirect("/login");
  const { t } = await getDict();
  const items = await listPendingActivities(owner);
  const shoes = (await listShoes(owner)).map(toGearOption);
  const bikes = (await listBikes(owner)).map(toGearOption);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="sr-only">{t.nav.review}</h1>
      <ReviewFlow items={items} shoes={shoes} bikes={bikes} />
    </div>
  );
}
