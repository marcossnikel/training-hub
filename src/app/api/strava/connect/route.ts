import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { buildAuthorizeUrl, stravaConfigured } from "@/lib/strava";
import { requireCurrentUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  if (!(await requireCurrentUser())) return new NextResponse(null, { status: 401 });
  if (!stravaConfigured()) {
    return NextResponse.redirect(new URL("/settings?error=missing_env", request.url));
  }
  const state = crypto.randomBytes(16).toString("hex");
  const response = NextResponse.redirect(buildAuthorizeUrl(request.nextUrl.origin, state));
  // G11.4 (T3.9): mark the CSRF-state cookie `secure` on the https deployment so
  // it never rides over plain http. Gated on prod OR an https request (Vercel
  // sets NODE_ENV=production and terminates TLS, forwarding x-forwarded-proto),
  // so local http dev keeps a non-secure cookie and the OAuth dance still works.
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const isHttps = forwardedProto === "https" || request.nextUrl.protocol === "https:";
  const secure = process.env.NODE_ENV === "production" || isHttps;
  response.cookies.set("strava_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    maxAge: 600,
    path: "/",
  });
  return response;
}
