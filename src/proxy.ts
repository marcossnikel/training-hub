import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/sign-up", "/api/auth", "/api/strava/callback"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((base) => pathname === base || pathname.startsWith(`${base}/`));
}

/** Redirect UX only; every action still validates the database-backed session server-side. */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (isPublicPath(request.nextUrl.pathname)) return NextResponse.next();
  // A Server Action has its own session-derived authorization boundary. Let it
  // return its typed safe recovery state instead of converting an expired
  // session into a redirect response that the React action protocol rejects.
  if (request.headers.has("next-action")) return NextResponse.next();
  const session = await auth.api.getSession({
    headers: request.headers,
    query: { disableCookieCache: true },
  });
  if (session) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
