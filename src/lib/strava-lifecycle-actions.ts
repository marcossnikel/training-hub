"use server";

import { redirect } from "next/navigation";
import { requireCurrentUser } from "./auth";
import { deleteOwnerStravaData, getStravaAuth, prepareStravaReconnect } from "./db";
import { deauthorizeStravaAccessToken } from "./strava";

export type ReconnectStravaResult = { status: "unavailable" } | { status: "unauthorized" };

export type DisconnectStravaResult = { status: "unavailable" } | { status: "unauthorized" };

/**
 * Reuses the owner-bound BYO authorization path without accepting client or
 * redirect input. The current connection is never made available while it is
 * awaiting the new provider authorization.
 */
export async function reconnectStravaAction(): Promise<ReconnectStravaResult> {
  const owner = await requireCurrentUser();
  if (!owner) return { status: "unauthorized" };
  try {
    const ready = await prepareStravaReconnect(owner);
    if (!ready) return { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
  redirect("/settings?strava=reconnect");
}

/**
 * Attempts provider revocation first but treats the local deletion transaction
 * as mandatory and independent. The browser receives a generic outcome only:
 * no secret, provider response, owner ID, or deletion inventory leaves this
 * server action.
 */
export async function disconnectStravaAction(): Promise<DisconnectStravaResult> {
  const owner = await requireCurrentUser();
  if (!owner) return { status: "unauthorized" };

  let providerConfirmed = true;
  try {
    const auth = await getStravaAuth(owner);
    if (auth) providerConfirmed = await deauthorizeStravaAccessToken(auth.access_token);
  } catch {
    // A malformed/unreadable encrypted record cannot prevent local removal.
    providerConfirmed = false;
  }

  try {
    await deleteOwnerStravaData(owner);
  } catch {
    // Do not claim deletion unless the local transaction committed.
    return { status: "unavailable" };
  }
  redirect(
    providerConfirmed ? "/settings?strava=deleted" : "/settings?strava=deleted_provider_unconfirmed"
  );
}
