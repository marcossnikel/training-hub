import { NextResponse, type NextRequest } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import {
  consumeOAuthState,
  getPendingStravaExchangeInput,
  promotePendingStravaConnection,
  setMeta,
} from "@/lib/db";
import { exchangeByoCode, syncActivities } from "@/lib/strava";
import { normalizeExactByoGrantedScope, resolveAuthorizationByoOrigin } from "@/lib/strava-byo";

type CallbackResult = "connected" | "scope" | "recovery";

const OPAQUE_STATE = /^[A-Za-z0-9_-]{43}$/;

function isSafeCode(value: string | null): value is string {
  return !!value && value.length <= 2048 && !/[\u0000-\u001F\u007F]/.test(value);
}

/** Redirect only to the state-owned Settings route on the canonical origin. */
function settingsRedirect(origin: string, result: CallbackResult): NextResponse {
  const url = new URL("/settings", origin);
  url.searchParams.set("strava", result);
  return NextResponse.redirect(url);
}

/** A completed first sync starts with the athlete's own imported records. */
function recentTrainingRedirect(origin: string): NextResponse {
  const url = new URL("/", origin);
  url.searchParams.set("strava", "connected");
  return NextResponse.redirect(url);
}

/**
 * The OAuth provider returns here in the athlete's authenticated browser.
 * State is consumed before any exchange, and both state ownership and pending
 * credentials are read only with the server session owner.
 */
export async function GET(request: NextRequest) {
  const owner = await requireCurrentUser();
  if (!owner) return new NextResponse(null, { status: 401 });

  const origin = resolveAuthorizationByoOrigin(request.nextUrl);
  if (!origin) return new NextResponse(null, { status: 400 });

  const state = request.nextUrl.searchParams.get("state");
  if (!state || !OPAQUE_STATE.test(state)) return settingsRedirect(origin, "recovery");

  const consumed = await consumeOAuthState(owner, state);
  if (!consumed || consumed.intent !== "connect" || consumed.redirectKey !== "settings") {
    return settingsRedirect(origin, "recovery");
  }

  // A provider denial is still a terminal use of the opaque state. It never
  // attempts an exchange or discloses whether any other owner's state exists.
  if (request.nextUrl.searchParams.has("error")) return settingsRedirect(origin, "scope");

  const code = request.nextUrl.searchParams.get("code");
  if (!isSafeCode(code)) return settingsRedirect(origin, "recovery");

  const pending = await getPendingStravaExchangeInput(owner);
  if (!pending) return settingsRedirect(origin, "recovery");

  let token;
  try {
    token = await exchangeByoCode(pending, code);
  } catch {
    return settingsRedirect(origin, "recovery");
  }

  const grantedScope = normalizeExactByoGrantedScope(token.scope);
  if (!grantedScope || !token.athlete) return settingsRedirect(origin, "scope");

  const promoted = await promotePendingStravaConnection(owner, {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: token.expires_at,
    strava_athlete_id: token.athlete.id,
    granted_scope: grantedScope,
  });
  if (!promoted) return settingsRedirect(origin, "recovery");

  const name = [token.athlete.firstname, token.athlete.lastname].filter(Boolean).join(" ");
  try {
    if (name) await setMeta(owner, "athlete_name", name);
    await syncActivities(owner);
  } catch {
    // A valid connection remains connected after an initial import failure, so
    // the owner can retry through the existing owner-scoped sync action.
    return settingsRedirect(origin, "recovery");
  }
  return recentTrainingRedirect(origin);
}
