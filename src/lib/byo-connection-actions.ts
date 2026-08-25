"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "./auth";
import { getStravaConnectionStatus, savePendingStravaConnection } from "./db";
import { STRAVA_BYO_HANDOFF_PATH, validateByoCredentials } from "./strava-byo";

export type BeginByoConnectionResult =
  | { status: "invalid"; clientId: string; errors: { clientId?: string; clientSecret?: string } }
  | { status: "ready"; handoffPath: typeof STRAVA_BYO_HANDOFF_PATH }
  | { status: "pending"; handoffPath: typeof STRAVA_BYO_HANDOFF_PATH }
  | { status: "unauthorized" }
  | { status: "unavailable" };

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/**
 * Validates and persists credentials only for the session-derived owner. Its
 * result intentionally has no secret, ciphertext, OAuth state, owner ID, or
 * callback URL; the browser can only navigate to the fixed handoff route.
 */
export async function beginByoConnectionAction(
  formData: FormData
): Promise<BeginByoConnectionResult> {
  const owner = await requireCurrentUser();
  if (!owner) return { status: "unauthorized" };

  const validated = validateByoCredentials({
    clientId: formValue(formData, "clientId"),
    clientSecret: formValue(formData, "clientSecret"),
  });
  if (Object.keys(validated.errors).length > 0) {
    return { status: "invalid", clientId: validated.clientId, errors: validated.errors };
  }

  try {
    const status = await getStravaConnectionStatus(owner);
    if (status === "connected") return { status: "unavailable" };
    const saved = await savePendingStravaConnection(owner, {
      client_id: validated.clientId,
      client_secret: validated.clientSecret,
    });
    revalidatePath("/settings");
    return saved
      ? { status: "ready", handoffPath: STRAVA_BYO_HANDOFF_PATH }
      : { status: "pending", handoffPath: STRAVA_BYO_HANDOFF_PATH };
  } catch {
    // Storage/key failures never reflect submitted material or database details.
    return { status: "unavailable" };
  }
}
