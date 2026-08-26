"use server";

import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth";
import { finishWelcomeOnboarding, type WelcomeOutcome } from "./welcome";

async function dismissWelcome(outcome: WelcomeOutcome): Promise<void> {
  const owner = await requireCurrentUser();
  if (!owner) redirect("/login");
  await finishWelcomeOnboarding(owner, outcome);
  redirect("/");
}

async function dismissWelcomeToSettings(): Promise<void> {
  const owner = await requireCurrentUser();
  if (!owner) redirect("/login");
  await finishWelcomeOnboarding(owner, "completed");
  redirect("/settings?onboarding=welcome");
}

export async function skipWelcomeAction(): Promise<void> {
  return dismissWelcome("skipped");
}

export async function completeWelcomeAction(): Promise<void> {
  return dismissWelcome("completed");
}

export async function completeWelcomeToSettingsAction(): Promise<void> {
  return dismissWelcomeToSettings();
}
