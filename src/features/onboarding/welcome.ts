import "server-only";

import type { OwnerContext } from "@/lib/owner-context";
import { getMeta } from "@/lib/db";
import { exec } from "@/lib/db/helpers";

export const WELCOME_ONBOARDING_VERSION = 1;
const WELCOME_META_KEY = "welcome_onboarding_version";

export type WelcomeOutcome = "completed" | "skipped";

export function welcomeMetaValue(
  outcome: WelcomeOutcome,
  version = WELCOME_ONBOARDING_VERSION
): string {
  return `${version}:${outcome}`;
}

/** A terminal state is deliberately versioned so a later approved experience can opt in anew. */
export async function needsWelcomeOnboarding(owner: OwnerContext): Promise<boolean> {
  const value = await getMeta(owner, WELCOME_META_KEY);
  return value !== welcomeMetaValue("completed") && value !== welcomeMetaValue("skipped");
}

/** Owner-scoped and idempotent: the first terminal outcome wins for this version. */
export async function finishWelcomeOnboarding(
  owner: OwnerContext,
  outcome: WelcomeOutcome
): Promise<void> {
  await exec(
    `INSERT INTO user_meta (user_id, key, value) VALUES (?, ?, ?)
     ON CONFLICT(user_id, key) DO NOTHING`,
    [owner.userId, WELCOME_META_KEY, welcomeMetaValue(outcome)]
  );
}
