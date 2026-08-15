import type { NextRequest } from "next/server";
import { startByoAuthorization } from "../byo-connect/route";

/**
 * Legacy entrypoint retained only for old bookmarks. Authorization is wholly
 * delegated to the owner-bound BYO route, which owns authentication, pending
 * credential lookup, canonical-origin selection, opaque state, and provider
 * navigation. This route must never read process-wide Strava credentials.
 */
export async function GET(request: NextRequest) {
  return startByoAuthorization(request);
}
