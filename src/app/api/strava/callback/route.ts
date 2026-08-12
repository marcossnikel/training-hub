import { NextResponse, type NextRequest } from "next/server";
import { constantTimeEqual } from "@/lib/crypto";
import { exchangeCode } from "@/lib/strava";
import { requireCurrentUser } from "@/lib/auth";

function settingsRedirect(request: NextRequest, params: string) {
  const response = NextResponse.redirect(new URL(`/settings?${params}`, request.url));
  response.cookies.delete("strava_oauth_state");
  return response;
}

export async function GET(request: NextRequest) {
  const owner = await requireCurrentUser();
  if (!owner) return new NextResponse(null, { status: 401 });
  const search = request.nextUrl.searchParams;

  if (search.get("error")) {
    return settingsRedirect(request, "error=denied");
  }

  const code = search.get("code");
  const state = search.get("state");
  const expectedState = request.cookies.get("strava_oauth_state")?.value;
  if (!code || !state || !expectedState || !constantTimeEqual(state, expectedState)) {
    return settingsRedirect(request, "error=state");
  }

  try {
    await exchangeCode(owner, code);
  } catch {
    return settingsRedirect(request, "error=exchange");
  }

  return settingsRedirect(request, "connected=1");
}
