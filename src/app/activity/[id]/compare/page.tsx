import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { ComparableActivitySkeleton } from "./comparable-activity-skeleton";
import { ComparableActivityView } from "./comparable-activity-view";
import { requireCurrentUser } from "@/lib/auth";
import {
  getConfirmedComparableActivity,
  getInsightFeedback,
  insightFeedbackEnabled,
  listConfirmedComparableActivities,
} from "@/lib/db";
import {
  isComparablePriorActivitySource,
  matchComparablePriorActivity,
} from "@/lib/comparable-activity";
import { getDict } from "@/lib/lang";
import { comparableActivityInsightReference } from "@/lib/insight-feedback";
import { InsightFeedback } from "@/components/insight-feedback";

export const metadata = { title: "Comparable prior activity" };

export default function ComparableActivityPage({ params }: PageProps<"/activity/[id]/compare">) {
  return (
    <Suspense fallback={<ComparableActivitySkeleton />}>
      {params.then(({ id }) => (
        <ComparableActivityContent id={id} />
      ))}
    </Suspense>
  );
}

/** Request-time auth and data work stays inside the route's real Suspense boundary. */
export async function ComparableActivityContent({ id }: { id: string }) {
  const owner = await requireCurrentUser();
  if (!owner) redirect("/login");
  const numericId = Number(id);
  if (!Number.isSafeInteger(numericId) || numericId <= 0) notFound();

  const [source, { lang, t }] = await Promise.all([
    getConfirmedComparableActivity(owner, numericId),
    getDict(),
  ]);
  const asOf = new Date().toISOString();
  if (!source || !isComparablePriorActivitySource(source, asOf)) notFound();
  const candidates = await listConfirmedComparableActivities(owner);
  const result = matchComparablePriorActivity({ source, candidates, asOf });
  const reference = comparableActivityInsightReference(result, asOf);
  const feedback =
    reference && insightFeedbackEnabled() ? await getInsightFeedback(owner, reference) : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-5 lg:py-12">
      <ComparableActivityView
        source={source}
        result={result}
        lang={lang}
        t={t.comparableActivity}
      />
      {reference && insightFeedbackEnabled() ? (
        <InsightFeedback
          target={{ kind: "comparable_prior_activity", sourceActivityId: numericId }}
          initial={feedback}
        />
      ) : null}
    </div>
  );
}
