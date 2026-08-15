import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { createOAuthState, getPendingStravaAuthorization } from "@/lib/db";
import { buildByoAuthorizeUrl, deriveCurrentRequestOrigin } from "@/lib/strava-byo";

/**
 * Starts only the external authorization navigation. #31 owns callback
 * consumption, token exchange, sync, reconnect, and lifecycle recovery.
 */
export async function GET() {
  const owner = await requireCurrentUser();
  if (!owner) return new NextResponse(null, { status: 401 });

  const origin = deriveCurrentRequestOrigin(await headers());
  if (!origin) return new NextResponse(null, { status: 400 });
  const pending = await getPendingStravaAuthorization(owner);
  if (!pending) return NextResponse.redirect(new URL("/settings", origin));

  try {
    const state = await createOAuthState(owner, { intent: "connect", redirectKey: "settings" });
    return NextResponse.redirect(
      buildByoAuthorizeUrl({
        clientId: pending.client_id,
        origin,
        state,
      })
    );
  } catch {
    return NextResponse.redirect(new URL("/settings", origin));
  }
}
