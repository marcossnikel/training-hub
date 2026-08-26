"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth";
import {
  enableTrainingAnalystConsent,
  revokeTrainingAnalystConsent,
  saveTrainingAnalystFeedback,
} from "./repository";
import { requestTrainingAnalystHypotheses } from "./service";
import type { AnalystAction } from "../types";

function refresh(): void {
  revalidatePath("/weekly-brief");
  revalidatePath("/settings");
}
export type AnalystActionResult = { ok: true; state?: string } | { ok: false; error: string };

export async function enableTrainingAnalystAction(
  understood: unknown
): Promise<AnalystActionResult> {
  const owner = await requireCurrentUser();
  if (!owner) return { ok: false, error: "Sign in to enable Training Analyst." };
  if (understood !== true) return { ok: false, error: "Confirm the OpenAI disclosure first." };
  await enableTrainingAnalystConsent(owner);
  refresh();
  return { ok: true };
}
export async function revokeTrainingAnalystAction(): Promise<AnalystActionResult> {
  const owner = await requireCurrentUser();
  if (!owner) return { ok: false, error: "Sign in to change this setting." };
  await revokeTrainingAnalystConsent(owner);
  refresh();
  return { ok: true };
}
export async function requestTrainingAnalystAction(): Promise<AnalystActionResult> {
  const owner = await requireCurrentUser();
  if (!owner) return { ok: false, error: "Sign in to request hypotheses." };
  const result = await requestTrainingAnalystHypotheses(owner);
  refresh();
  return result.state === "success"
    ? { ok: true, state: result.state }
    : { ok: false, error: result.state };
}
export async function saveTrainingAnalystFeedbackAction(input: {
  hypothesisId: unknown;
  action: unknown;
  requestId: unknown;
  editedHypothesis?: unknown;
}): Promise<AnalystActionResult> {
  const owner = await requireCurrentUser();
  if (
    !owner ||
    typeof input.hypothesisId !== "string" ||
    typeof input.requestId !== "string" ||
    !["confirmed", "edited", "rejected", "deferred"].includes(String(input.action))
  )
    return { ok: false, error: "That hypothesis is unavailable." };
  const saved = await saveTrainingAnalystFeedback(owner, {
    hypothesisId: input.hypothesisId,
    action: input.action as AnalystAction,
    requestId: input.requestId,
    editedHypothesis: typeof input.editedHypothesis === "string" ? input.editedHypothesis : null,
  });
  if (saved === "unavailable")
    return { ok: false, error: "That hypothesis is no longer available." };
  refresh();
  return { ok: true };
}
