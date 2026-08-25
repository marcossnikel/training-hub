import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";

const PUBLIC_PATHS = ["/", "/login", "/sign-up", "/api/auth", "/api/strava/callback"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((base) => pathname === base || pathname.startsWith(`${base}/`));
}

/**
 * Protected pages are personalised by the database-backed session. Explicitly
 * prohibit intermediary caches from retaining either an authenticated response
 * or a guest recovery redirect. This is defense in depth alongside the page
 * and route owner checks: a later request must always be authorized again.
 */
function privateNoStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

/** Redirect UX only; every action still validates the database-backed session server-side. */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const isGuestRoot = request.nextUrl.pathname === "/";
  // The root is the one guest-readable application route. It still has to
  // resolve the database-backed session in the proxy so both guest landing
  // documents and authenticated training logs are private/no-store. The page
  // repeats its owner check before it reads any product-domain data.
  if (isPublicPath(request.nextUrl.pathname) && !isGuestRoot) return NextResponse.next();
  // A Server Action has its own session-derived authorization boundary. Let it
  // return its typed safe recovery state instead of converting an expired
  // session into a redirect response that the React action protocol rejects.
  if (request.headers.has("next-action")) return NextResponse.next();
  const session = await auth.api.getSession({
    headers: request.headers,
    query: { disableCookieCache: true },
  });
  if (session) return privateNoStore(NextResponse.next());

  if (isGuestRoot) return privateNoStore(NextResponse.next());

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return privateNoStore(NextResponse.redirect(loginUrl));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
