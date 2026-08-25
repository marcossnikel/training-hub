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
    <div className="mx-auto w-full max-w-[760px] px-4 py-10 sm:px-5 lg:py-12">
      <header>
        <p className="font-mono text-xs font-medium text-muted-foreground uppercase">
          {t.nav.review}
        </p>
        <h1 className="mt-4 max-w-[700px] text-4xl leading-[1.1] font-semibold tracking-[-0.035em] text-foreground sm:text-[2.5rem]">
          {t.review.headline}
        </h1>
        <p className="mt-3 max-w-[720px] text-base leading-6 text-muted-foreground">
          {t.review.description}
        </p>
      </header>
      <ReviewFlow items={items} shoes={shoes} bikes={bikes} />
    </div>
  );
}
