import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  getPendingStravaAuthorization: vi.fn(),
  createOAuthState: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/lib/db", () => ({
  getPendingStravaAuthorization: mocks.getPendingStravaAuthorization,
  createOAuthState: mocks.createOAuthState,
}));

import { GET } from "./route";

const ORIGINAL_PUBLIC_ORIGIN = process.env.TRAINING_HUB_PUBLIC_ORIGIN;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.TRAINING_HUB_PUBLIC_ORIGIN;
  mocks.requireCurrentUser.mockResolvedValue({ userId: "owner-a" });
  mocks.getPendingStravaAuthorization.mockResolvedValue({ client_id: "athlete-client" });
  mocks.createOAuthState.mockResolvedValue("opaque-state");
});

afterEach(() => {
  if (ORIGINAL_PUBLIC_ORIGIN === undefined) delete process.env.TRAINING_HUB_PUBLIC_ORIGIN;
  else process.env.TRAINING_HUB_PUBLIC_ORIGIN = ORIGINAL_PUBLIC_ORIGIN;
});

describe("BYO authorization handoff route", () => {
  it("rejects a nonlocal request even when hostile forwarding headers name an attacker", async () => {
    const response = await GET(
      new NextRequest("https://app.training-hub.example/api/strava/byo-connect", {
        headers: {
          "x-forwarded-host": "attacker.example",
          "x-forwarded-proto": "https",
        },
      })
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
    expect(mocks.getPendingStravaAuthorization).not.toHaveBeenCalled();
    expect(mocks.createOAuthState).not.toHaveBeenCalled();
  });

  it("uses only the configured canonical HTTPS origin despite hostile forwarding headers", async () => {
    process.env.TRAINING_HUB_PUBLIC_ORIGIN = "https://preview.training-hub.example";
    const response = await GET(
      new NextRequest("https://app.training-hub.example/api/strava/byo-connect", {
        headers: {
          "x-forwarded-host": "attacker.example",
          "x-forwarded-proto": "https",
        },
      })
    );
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.searchParams.get("redirect_uri")).toBe(
      "https://preview.training-hub.example/api/strava/callback"
    );
    expect(location.toString()).not.toContain("attacker.example");
    expect(mocks.createOAuthState).toHaveBeenCalledWith(
      { userId: "owner-a" },
      { intent: "connect", redirectKey: "settings" }
    );
  });
});
