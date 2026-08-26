import { NextResponse, type NextRequest } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { consumeOAuthState, ensureConnectionActivation } from "@/lib/db";
import { resolveAuthorizationByoOrigin } from "@/lib/strava-byo";
import { completeByoAuthorization } from "@/features/strava/server/connection";
import { advanceInitialStravaImport } from "@/features/strava/server/sync";

type CallbackResult = "connected" | "scope" | "recovery";

const OPAQUE_STATE = /^[A-Za-z0-9_-]{43}$/;

function hasAsciiControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}

function isSafeCode(value: string | null): value is string {
  return !!value && value.length <= 2048 && !hasAsciiControlCharacter(value);
}

/** Redirect only to the state-owned Settings route on the canonical origin. */
function settingsRedirect(origin: string, result: CallbackResult): NextResponse {
  const url = new URL("/settings", origin);
  url.searchParams.set("strava", result);
  return NextResponse.redirect(url);
}

/** The activation route derives all lifecycle state from the server session. */
function activationRedirect(origin: string): NextResponse {
  const url = new URL("/onboarding/connection", origin);
  return NextResponse.redirect(url);
}

/** A retained connection can renew credentials without replaying its completed activation. */
function appRedirect(origin: string): NextResponse {
  return NextResponse.redirect(new URL("/", origin));
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
  if (consumed?.intent !== "connect" || consumed.redirectKey !== "settings") {
    return settingsRedirect(origin, "recovery");
  }

  // A provider denial is still a terminal use of the opaque state. It never
  // attempts an exchange or discloses whether any other owner's state exists.
  if (request.nextUrl.searchParams.has("error")) return settingsRedirect(origin, "scope");

  const code = request.nextUrl.searchParams.get("code");
  if (!isSafeCode(code)) return settingsRedirect(origin, "recovery");

  const result = await completeByoAuthorization(owner, code);
  if (result !== "connected") return settingsRedirect(origin, result);
  try {
    const activation = await ensureConnectionActivation(owner);
    await advanceInitialStravaImport(owner);
    if (activation?.state === "completed") return appRedirect(origin);
  } catch {
    // A valid connection remains connected after a start failure. The next
    // owner-scoped advance can create or resume the persisted job.
    return settingsRedirect(origin, "recovery");
  }
  return activationRedirect(origin);
}
