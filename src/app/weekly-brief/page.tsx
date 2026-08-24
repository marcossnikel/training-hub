import { WeeklyBriefView, rangeLabel } from "./weekly-brief-view";
import { WeeklyBriefSkeleton } from "./weekly-brief-skeleton";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth";
import { getInsightFeedback, insightFeedbackEnabled } from "@/lib/db";
import { resolveWeeklyBriefFeedbackTarget } from "@/lib/insight-feedback-targets";
import { InsightFeedback } from "@/components/insight-feedback";

export const metadata = { title: "Weekly brief" };

export default function WeeklyBriefPage() {
  return (
    <Suspense fallback={<WeeklyBriefSkeleton />}>
      <WeeklyBriefContent />
    </Suspense>
  );
}

/**
 * Keep all request-time identity and owner-scoped data access inside the
 * boundary so the shared static fallback can stream during real route work.
 */
export async function WeeklyBriefContent() {
  const owner = await requireCurrentUser();
  if (!owner) redirect("/login");
  const { result, reference } = await resolveWeeklyBriefFeedbackTarget(owner);
  const feedback =
    reference && insightFeedbackEnabled() ? await getInsightFeedback(owner, reference) : null;
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="font-display text-4xl font-bold">Weekly brief</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {rangeLabel(result.currentWindow.start, result.currentWindow.end)}
        </p>
      </header>
      <WeeklyBriefView result={result} />
      {reference && insightFeedbackEnabled() ? (
        <InsightFeedback target={{ kind: "weekly_brief" }} initial={feedback} />
      ) : null}
    </div>
  );
}
