"use server";

import { fail } from "@/lib/action-result";
import { requireCurrentUser } from "@/lib/auth";
import { removeInsightFeedback, saveInsightFeedback, saveInsightFeedbackNote } from "@/lib/db";
import { insightFeedbackEnabled } from "@/lib/db/insight-feedback";
import {
  isInsightUsefulness,
  normalizeInsightNote,
  type InsightUsefulness,
} from "@/lib/insight-feedback";
import {
  resolveComparableActivityFeedbackTarget,
  resolveWeeklyBriefFeedbackTarget,
} from "@/lib/insight-feedback-targets";

export type InsightFeedbackActionResult =
  | { ok: true; usefulness: InsightUsefulness | null; note: string | null }
  | { ok: false; error: string };

export type InsightFeedbackTargetInput =
  { kind: "weekly_brief" } | { kind: "comparable_prior_activity"; sourceActivityId: number };

async function resolveFeedbackTargetForAction(
  owner: Awaited<ReturnType<typeof requireCurrentUser>>,
  target: InsightFeedbackTargetInput
) {
  if (!owner) return null;
  if (target.kind === "weekly_brief") {
    return (await resolveWeeklyBriefFeedbackTarget(owner)).reference;
  }
  return resolveComparableActivityFeedbackTarget(owner, target.sourceActivityId);
}

function feedbackUnavailable(): InsightFeedbackActionResult {
  return { ok: false, error: "We couldn’t save your feedback. Try again." };
}

export async function saveInsightUsefulnessAction(input: {
  target: InsightFeedbackTargetInput;
  usefulness: unknown;
}): Promise<InsightFeedbackActionResult> {
  const owner = await requireCurrentUser();
  if (!owner || !insightFeedbackEnabled() || !isInsightUsefulness(input.usefulness)) {
    return feedbackUnavailable();
  }
  try {
    const reference = await resolveFeedbackTargetForAction(owner, input.target);
    if (!reference) return feedbackUnavailable();
    await saveInsightFeedback(owner, { reference, usefulness: input.usefulness });
    return { ok: true, usefulness: input.usefulness, note: null };
  } catch (error) {
    return fail(error, "We couldn’t save your feedback. Try again.");
  }
}

export async function saveInsightFeedbackNoteAction(input: {
  target: InsightFeedbackTargetInput;
  note: unknown;
}): Promise<InsightFeedbackActionResult> {
  const owner = await requireCurrentUser();
  const note = normalizeInsightNote(input.note);
  if (!owner || !insightFeedbackEnabled()) return feedbackUnavailable();
  if (note === "invalid") return { ok: false, error: "Keep the note to 500 characters or fewer." };
  try {
    const reference = await resolveFeedbackTargetForAction(owner, input.target);
    if (!reference) return feedbackUnavailable();
    const updated = await saveInsightFeedbackNote(owner, { reference, note });
    if (!updated) return { ok: false, error: "Choose Useful or Not useful before adding a note." };
    return { ok: true, usefulness: null, note };
  } catch (error) {
    return fail(error, "We couldn’t save your feedback. Try again.");
  }
}

export async function removeInsightFeedbackAction(input: {
  target: InsightFeedbackTargetInput;
}): Promise<InsightFeedbackActionResult> {
  const owner = await requireCurrentUser();
  if (!owner || !insightFeedbackEnabled()) return feedbackUnavailable();
  try {
    const reference = await resolveFeedbackTargetForAction(owner, input.target);
    if (!reference) return feedbackUnavailable();
    await removeInsightFeedback(owner, reference);
    return { ok: true, usefulness: null, note: null };
  } catch (error) {
    return fail(error, "We couldn’t save your feedback. Try again.");
  }
}
