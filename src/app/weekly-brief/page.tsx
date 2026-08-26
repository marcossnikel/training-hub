import { WeeklyBriefView, rangeLabel } from "./weekly-brief-view";
import { WeeklyBriefSkeleton } from "./weekly-brief-skeleton";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth";
import { getInsightFeedback, insightFeedbackEnabled } from "@/lib/db";
import { resolveWeeklyBriefFeedbackTarget } from "@/lib/insight-feedback-targets";
import { InsightFeedback } from "@/components/insight-feedback";
import { trainingAnalystView } from "@/features/analyst/server/service";
import { TrainingAnalystPanel } from "@/features/analyst/training-analyst-panel";

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
  const analyst = await trainingAnalystView(owner);
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-5 lg:py-12">
      <header className="mb-6 max-w-3xl">
        <p className="font-mono text-xs font-medium text-muted-foreground uppercase">
          Training / Weekly brief ·{" "}
          {rangeLabel(result.currentWindow.start, result.currentWindow.end)}
        </p>
        <h1 className="font-narrative mt-4 text-[3.25rem] leading-[1.02] font-normal tracking-[-0.035em]">
          This week, in context.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-6 text-muted-foreground">
          A factual recap of your most recent completed week. Every observation links to the
          activities and window behind it.
        </p>
      </header>
      <WeeklyBriefView result={result} />
      <TrainingAnalystPanel consent={analyst.consent} hypotheses={analyst.hypotheses} />
      {reference && insightFeedbackEnabled() ? (
        <InsightFeedback target={{ kind: "weekly_brief" }} initial={feedback} />
      ) : null}
    </div>
  );
}
