import { NextResponse, type NextRequest } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { resolveAuthorizationByoOrigin } from "@/lib/strava-byo";
import { startByoAuthorization as beginAuthorization } from "@/features/strava/server/connection";

/**
 * Starts only the external authorization navigation. #31 owns callback
 * consumption, token exchange, sync, reconnect, and lifecycle recovery.
 */
export async function startByoAuthorization(request: NextRequest) {
  const owner = await requireCurrentUser();
  if (!owner) return new NextResponse(null, { status: 401 });

  const origin = resolveAuthorizationByoOrigin(request.nextUrl);
  if (!origin) return new NextResponse(null, { status: 400 });
  try {
    const authorization = await beginAuthorization(owner, origin);
    return NextResponse.redirect(authorization ? authorization : new URL("/settings", origin));
  } catch {
    return NextResponse.redirect(new URL("/settings", origin));
  }
}

export async function GET(request: NextRequest) {
  return startByoAuthorization(request);
}
