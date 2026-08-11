// Page-gating (the step after T1.6). Proxy is Next 16's renamed Middleware
// (see node_modules/next/dist/docs/.../file-conventions/proxy.md). It runs
// before every matched route and redirects unauthenticated visitors to /login,
// so nothing — not even read views — is visible without the owner session.
//
// RUNTIME: Proxy defaults to the Node.js runtime in Next 16 (proxy.md "Runtime"
// + version history v16.0.0; the authentication guide's proxy tip repeats it).
// The `runtime` config option is not available here and throws if set. Because
// it is the Node.js runtime, node:crypto is available, so this reuses the SAME
// verifySessionToken() the server actions use — the signature is validated, not
// merely the cookie's presence, and there is no second crypto implementation to
// drift from auth.ts.
//
// GRACEFUL DEGRADATION mirrors auth.ts: when auth is not configured (either of
// AUTH_PASSWORD / AUTH_SECRET missing) authConfigured() is false and the proxy
// allows every request, exactly as isAuthenticated() returns true in that case.
import { NextResponse, type NextRequest } from "next/server";
import { authConfigured, SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

// Reachable without a session. `/login` is the destination itself; the Strava
// OAuth callback returns from strava.com and validates its own signed state, so
// it must not be redirected. Everything else — including `/api/strava/connect`
// (which initiates OAuth) and `/api/uploads` (private photos) — requires the
// owner session.
const PUBLIC_PATHS = ["/login", "/api/strava/callback"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((base) => pathname === base || pathname.startsWith(`${base}/`));
}

export function proxy(request: NextRequest): NextResponse {
  // Auth disabled (unconfigured secrets): allow-all, same as before page-gating.
  if (!authConfigured()) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  // Optimistic cookie check: verify the HMAC signature of the session token.
  // A forged or tampered cookie fails verifySessionToken and is redirected.
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (verifySessionToken(token)) return NextResponse.next();

  // Preserve the intended destination in the URL for a later return.
  const loginUrl = new URL("/login", request.nextUrl);
  loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

// Run on every route except Next internals and the favicon; static assets under
// /_next are excluded so CSS/JS/fonts always load. API routes are intentionally
// INCLUDED so the gate covers them (the two public ones are allowlisted above).
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
