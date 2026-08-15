import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({ startByoAuthorization: vi.fn() }));

vi.mock("../byo-connect/route", () => ({ startByoAuthorization: mocks.startByoAuthorization }));

import { GET } from "./route";

const ORIGINAL_CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const ORIGINAL_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.startByoAuthorization.mockResolvedValue(
    NextResponse.redirect("https://www.strava.com/oauth/authorize?state=owner-bound-state")
  );
});

afterEach(() => {
  if (ORIGINAL_CLIENT_ID === undefined) delete process.env.STRAVA_CLIENT_ID;
  else process.env.STRAVA_CLIENT_ID = ORIGINAL_CLIENT_ID;
  if (ORIGINAL_CLIENT_SECRET === undefined) delete process.env.STRAVA_CLIENT_SECRET;
  else process.env.STRAVA_CLIENT_SECRET = ORIGINAL_CLIENT_SECRET;
});

describe("legacy Strava connect entrypoint", () => {
  it("delegates unchanged to the owner-bound route without reading founder environment credentials or making an authorization URL", async () => {
    process.env.STRAVA_CLIENT_ID = "founder-client-must-not-be-used";
    process.env.STRAVA_CLIENT_SECRET = "founder-secret-must-not-be-used";
    const request = new NextRequest("https://attacker.example/api/strava/connect", {
      headers: { "x-forwarded-host": "attacker.example", "x-forwarded-proto": "https" },
    });

    const response = await GET(request);

    expect(mocks.startByoAuthorization).toHaveBeenCalledExactlyOnceWith(request);
    expect(response.headers.get("location")).toBe(
      "https://www.strava.com/oauth/authorize?state=owner-bound-state"
    );
    const legacyArtifact = JSON.stringify({
      location: response.headers.get("location"),
      calls: mocks.startByoAuthorization.mock.calls,
    });
    expect(legacyArtifact).not.toContain("founder-client-must-not-be-used");
    expect(legacyArtifact).not.toContain("founder-secret-must-not-be-used");
    expect(legacyArtifact).not.toContain("attacker.example");
  });

  it("passes through the owner-bound route's unauthenticated safe response", async () => {
    mocks.startByoAuthorization.mockResolvedValue(new NextResponse(null, { status: 401 }));
    const request = new NextRequest("https://attacker.example/api/strava/connect");

    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(response.headers.get("location")).toBeNull();
    expect(mocks.startByoAuthorization).toHaveBeenCalledExactlyOnceWith(request);
  });
});
