import {
  createOAuthState,
  deleteOwnerStravaData,
  getPendingStravaAuthorization,
  getPendingStravaExchangeInput,
  getStravaAuth,
  getStravaConnection,
  getStravaConnectionStatus,
  getStravaDeauthorizationAccessToken,
  markStravaConnectionRecoverable,
  prepareStravaReconnect,
  promotePendingStravaConnection,
  savePendingStravaConnection,
  saveProviderTimezone,
  saveStravaAuth,
  setMeta,
} from "@/lib/db";
import type { OwnerContext } from "@/lib/owner-context";
import { buildByoAuthorizeUrl, normalizeExactByoGrantedScope } from "@/lib/strava-byo";
import type { StravaConnectionStatus } from "@/lib/db/strava-auth";
import { stravaProvider, type StravaProvider } from "./provider";

export { type StravaConnectionStatus };

export async function isStravaConnected(owner: OwnerContext): Promise<boolean> {
  return (await getStravaAuth(owner)) !== null;
}

/** Returns an access token only to server-side Strava feature modules. */
export async function getStravaAccessToken(
  owner: OwnerContext,
  provider: StravaProvider = stravaProvider
): Promise<string> {
  const connection = await getStravaConnection(owner);
  if (!connection) throw new Error("Strava is not connected.");
  if (connection.expires_at > Math.floor(Date.now() / 1000) + 120) return connection.access_token;
  try {
    const token = await provider.refreshAccessToken({
      credentials: { clientId: connection.client_id, clientSecret: connection.client_secret },
      refreshToken: connection.refresh_token,
    });
    if (
      !(await saveStravaAuth(owner, {
        access_token: token.accessToken,
        refresh_token: token.refreshToken,
        expires_at: token.expiresAt,
      }))
    ) {
      throw new Error("Strava connection changed.");
    }
    return token.accessToken;
  } catch (error) {
    await markStravaConnectionRecoverable(owner);
    throw error;
  }
}

export async function startByoAuthorization(
  owner: OwnerContext,
  origin: string,
  redirectKey: "settings" | "onboarding" = "settings"
): Promise<string | null> {
  const pending = await getPendingStravaAuthorization(owner);
  if (!pending) return null;
  const state = await createOAuthState(owner, { intent: "connect", redirectKey });
  return buildByoAuthorizeUrl({ clientId: pending.client_id, origin, state });
}

export type CompleteByoAuthorization = "connected" | "scope" | "recovery";

/**
 * Exchanges a one-time owner-bound authorization code and promotes exactly the
 * same encrypted pending record. Its result intentionally contains no token,
 * client secret, provider payload, or owner identifier.
 */
export async function completeByoAuthorization(
  owner: OwnerContext,
  code: string,
  provider: StravaProvider = stravaProvider
): Promise<CompleteByoAuthorization> {
  const pending = await getPendingStravaExchangeInput(owner);
  if (!pending) return "recovery";
  try {
    const token = await provider.exchangeAuthorizationCode({
      credentials: { clientId: pending.client_id, clientSecret: pending.client_secret },
      code,
    });
    const grantedScope = normalizeExactByoGrantedScope(token.grantedScope);
    if (!grantedScope || token.athleteId === null) return "scope";
    const promoted = await promotePendingStravaConnection(owner, {
      access_token: token.accessToken,
      refresh_token: token.refreshToken,
      expires_at: token.expiresAt,
      strava_athlete_id: token.athleteId,
      granted_scope: grantedScope,
    });
    if (!promoted) return "recovery";
    if (token.athleteName) await setMeta(owner, "athlete_name", token.athleteName);
    // The provider payload is not trusted: numeric offsets and malformed names
    // are rejected by the profile boundary and never become calendar truth.
    if (token.athleteTimezone) await saveProviderTimezone(owner, token.athleteTimezone);
    return "connected";
  } catch {
    return "recovery";
  }
}

export async function saveByoCredentials(
  owner: OwnerContext,
  input: { clientId: string; clientSecret: string }
): Promise<boolean> {
  return savePendingStravaConnection(owner, {
    client_id: input.clientId,
    client_secret: input.clientSecret,
  });
}

export async function connectionStatus(owner: OwnerContext): Promise<StravaConnectionStatus> {
  return getStravaConnectionStatus(owner);
}

export async function requestStravaReconnect(owner: OwnerContext): Promise<boolean> {
  return prepareStravaReconnect(owner);
}

/** The local deletion transaction is mandatory even when provider revocation fails. */
export async function disconnectStrava(
  owner: OwnerContext,
  provider: StravaProvider = stravaProvider
): Promise<{ deleted: boolean; providerConfirmed: boolean }> {
  let providerConfirmed = false;
  try {
    const accessToken = await getStravaDeauthorizationAccessToken(owner);
    if (accessToken) providerConfirmed = await provider.deauthorize({ accessToken });
  } catch {
    providerConfirmed = false;
  }
  try {
    await deleteOwnerStravaData(owner);
    return { deleted: true, providerConfirmed };
  } catch {
    return { deleted: false, providerConfirmed: false };
  }
}
