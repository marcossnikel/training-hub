import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { getInitialStravaImportStatus } from "@/lib/db";
import { advanceInitialStravaImport } from "@/lib/strava";

/** Owner-scoped observation. There is intentionally no job, cursor, or count input. */
export async function GET() {
  const owner = await requireCurrentUser();
  if (!owner) return new NextResponse(null, { status: 404 });
  const status = await getInitialStravaImportStatus(owner);
  if (!status) return new NextResponse(null, { status: 404 });
  return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
}

/** Advances at most one leased step and returns only the new safe snapshot. */
export async function POST() {
  const owner = await requireCurrentUser();
  if (!owner) return new NextResponse(null, { status: 404 });
  const result = await advanceInitialStravaImport(owner);
  if (!result.status) return new NextResponse(null, { status: 404 });
  return NextResponse.json(result.status, { headers: { "Cache-Control": "no-store" } });
}
