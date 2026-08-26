import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  startByoAuthorization: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/features/strava/server/connection", () => ({
  startByoAuthorization: mocks.startByoAuthorization,
}));

import { GET } from "./route";

const ORIGINAL_PUBLIC_ORIGIN = process.env.TRAINING_HUB_PUBLIC_ORIGIN;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.TRAINING_HUB_PUBLIC_ORIGIN;
  mocks.requireCurrentUser.mockResolvedValue({ userId: "owner-a" });
  mocks.startByoAuthorization.mockResolvedValue(
    "https://www.strava.com/oauth/authorize?state=opaque-state"
  );
});

afterEach(() => {
  if (ORIGINAL_PUBLIC_ORIGIN === undefined) delete process.env.TRAINING_HUB_PUBLIC_ORIGIN;
  else process.env.TRAINING_HUB_PUBLIC_ORIGIN = ORIGINAL_PUBLIC_ORIGIN;
});

describe("BYO authorization handoff route", () => {
  it("rejects an unauthenticated request before canonical-origin, credentials, state, or provider navigation", async () => {
    mocks.requireCurrentUser.mockResolvedValue(null);
    const response = await GET(new NextRequest("https://attacker.example/api/strava/byo-connect"));

    expect(response.status).toBe(401);
    expect(response.headers.get("location")).toBeNull();
    expect(mocks.startByoAuthorization).not.toHaveBeenCalled();
  });

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
    expect(mocks.startByoAuthorization).not.toHaveBeenCalled();
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
    expect(response.headers.get("location")).not.toContain("attacker.example");
    expect(mocks.startByoAuthorization).toHaveBeenCalledWith(
      { userId: "owner-a" },
      "https://preview.training-hub.example",
      "settings"
    );
  });

  it("uses the canonical Settings recovery when this owner has no pending credentials", async () => {
    process.env.TRAINING_HUB_PUBLIC_ORIGIN = "https://preview.training-hub.example";
    mocks.startByoAuthorization.mockResolvedValue(null);

    const response = await GET(
      new NextRequest("https://attacker.example/api/strava/byo-connect", {
        headers: { "x-forwarded-host": "attacker.example", "x-forwarded-proto": "https" },
      })
    );

    expect(response.headers.get("location")).toBe("https://preview.training-hub.example/settings");
    expect(mocks.startByoAuthorization).toHaveBeenCalledWith(
      { userId: "owner-a" },
      "https://preview.training-hub.example",
      "settings"
    );
  });
});
