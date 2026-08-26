"use server";

import { revalidatePath } from "next/cache";
import {
  applyParameterCandidate,
  clearAthleteParameter,
  clearAthleteTimezone,
  isAthleteParameterKey,
  saveAthleteEnteredParameter,
  saveAthleteTimezone,
} from "@/lib/db";
import { requireCurrentUser } from "@/lib/auth";

export type ProfileActionResult = { ok: true } | { ok: false; error: string };

function refreshProfile(): void {
  revalidatePath("/settings");
  revalidatePath("/performance");
}

export async function saveProfileParameterAction(input: {
  key: unknown;
  value: unknown;
}): Promise<ProfileActionResult> {
  const owner = await requireCurrentUser();
  if (!owner) return { ok: false, error: "Sign in to edit your profile." };
  if (!isAthleteParameterKey(input.key)) return { ok: false, error: "Unknown profile field." };
  if (!(await saveAthleteEnteredParameter(owner, input.key, input.value)))
    return { ok: false, error: "Enter a value in the accepted range." };
  refreshProfile();
  return { ok: true };
}

export async function clearProfileParameterAction(key: unknown): Promise<ProfileActionResult> {
  const owner = await requireCurrentUser();
  if (!owner) return { ok: false, error: "Sign in to edit your profile." };
  if (!isAthleteParameterKey(key)) return { ok: false, error: "Unknown profile field." };
  await clearAthleteParameter(owner, key);
  refreshProfile();
  return { ok: true };
}

export async function applyProfileCandidateAction(
  candidateId: unknown
): Promise<ProfileActionResult> {
  const owner = await requireCurrentUser();
  if (!owner) return { ok: false, error: "Sign in to edit your profile." };
  if (typeof candidateId !== "string" || !(await applyParameterCandidate(owner, candidateId)))
    return { ok: false, error: "That candidate is unavailable." };
  refreshProfile();
  return { ok: true };
}

export async function saveProfileTimezoneAction(
  rawTimezone: unknown
): Promise<ProfileActionResult> {
  const owner = await requireCurrentUser();
  if (!owner) return { ok: false, error: "Sign in to edit your profile." };
  if (!(await saveAthleteTimezone(owner, rawTimezone)))
    return { ok: false, error: "Enter a complete IANA timezone, such as America/Sao_Paulo." };
  refreshProfile();
  return { ok: true };
}

export async function clearProfileTimezoneAction(): Promise<ProfileActionResult> {
  const owner = await requireCurrentUser();
  if (!owner) return { ok: false, error: "Sign in to edit your profile." };
  await clearAthleteTimezone(owner);
  refreshProfile();
  return { ok: true };
}
