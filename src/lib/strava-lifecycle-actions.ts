"use server";

import { redirect } from "next/navigation";
import { requireCurrentUser } from "./auth";
import { disconnectStrava, requestStravaReconnect } from "@/features/strava/server/connection";

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
    const ready = await requestStravaReconnect(owner);
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

  const result = await disconnectStrava(owner);
  if (!result.deleted) return { status: "unavailable" };
  redirect(
    result.providerConfirmed
      ? "/settings?strava=deleted"
      : "/settings?strava=deleted_provider_unconfirmed"
  );
}
