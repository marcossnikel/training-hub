import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  consumeOAuthState: vi.fn(),
  ensureConnectionActivation: vi.fn(),
  completeByoAuthorization: vi.fn(),
  advanceInitialStravaImport: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/lib/db", () => ({
  consumeOAuthState: mocks.consumeOAuthState,
  ensureConnectionActivation: mocks.ensureConnectionActivation,
}));
vi.mock("@/features/strava/server/connection", () => ({
  completeByoAuthorization: mocks.completeByoAuthorization,
}));
vi.mock("@/features/strava/server/sync", () => ({
  advanceInitialStravaImport: mocks.advanceInitialStravaImport,
}));

import { GET } from "./route";

const OWNER = { userId: "owner-a" };
const STATE = "A".repeat(43);
const ORIGIN = "https://preview.training-hub.example";
const ORIGINAL_PUBLIC_ORIGIN = process.env.TRAINING_HUB_PUBLIC_ORIGIN;

function request(query: Record<string, string>): NextRequest {
  const url = new URL("https://untrusted-request.example/api/strava/callback");
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return new NextRequest(url, {
    headers: { "x-forwarded-host": "attacker.example", "x-forwarded-proto": "https" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TRAINING_HUB_PUBLIC_ORIGIN = ORIGIN;
  mocks.requireCurrentUser.mockResolvedValue(OWNER);
  mocks.consumeOAuthState.mockResolvedValue({ intent: "connect", redirectKey: "settings" });
  mocks.completeByoAuthorization.mockResolvedValue("connected");
  mocks.ensureConnectionActivation.mockResolvedValue({ connectionId: "connection-a" });
  mocks.advanceInitialStravaImport.mockResolvedValue({ advanced: true, status: null });
});

afterEach(() => {
  if (ORIGINAL_PUBLIC_ORIGIN === undefined) delete process.env.TRAINING_HUB_PUBLIC_ORIGIN;
  else process.env.TRAINING_HUB_PUBLIC_ORIGIN = ORIGINAL_PUBLIC_ORIGIN;
});

describe("owner-bound Strava callback", () => {
  it("consumes state before the owner-bound lifecycle, starts one bounded import step, and redirects safely", async () => {
    const response = await GET(request({ state: STATE, code: "provider-code" }));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/onboarding/connection`);
    expect(mocks.consumeOAuthState).toHaveBeenCalledWith(OWNER, STATE);
    expect(mocks.completeByoAuthorization).toHaveBeenCalledWith(OWNER, "provider-code");
    expect(mocks.ensureConnectionActivation).toHaveBeenCalledWith(OWNER);
    expect(mocks.advanceInitialStravaImport).toHaveBeenCalledWith(OWNER);
    const artifact = JSON.stringify({
      location: response.headers.get("location"),
      calls: mocks.completeByoAuthorization.mock.calls,
    });
    expect(artifact).not.toContain("athlete-secret");
  });

  it("fails closed for a consumed, expired, replayed, or other-owner state without exchange", async () => {
    mocks.consumeOAuthState.mockResolvedValue(null);
    const response = await GET(request({ state: STATE, code: "provider-code" }));

    expect(response.headers.get("location")).toBe(`${ORIGIN}/settings?strava=recovery`);
    expect(mocks.completeByoAuthorization).not.toHaveBeenCalled();
  });

  it("renews a retained connection without replaying its completed activation", async () => {
    mocks.ensureConnectionActivation.mockResolvedValue({
      connectionId: "connection-a",
      state: "completed",
    });

    const response = await GET(request({ state: STATE, code: "provider-code" }));

    expect(response.headers.get("location")).toBe(`${ORIGIN}/`);
    expect(mocks.advanceInitialStravaImport).toHaveBeenCalledWith(OWNER);
  });

  it("consumes a provider denial but makes no exchange or sync", async () => {
    const response = await GET(request({ state: STATE, error: "access_denied" }));

    expect(response.headers.get("location")).toBe(`${ORIGIN}/settings?strava=scope`);
    expect(mocks.consumeOAuthState).toHaveBeenCalledWith(OWNER, STATE);
    expect(mocks.completeByoAuthorization).not.toHaveBeenCalled();
    expect(mocks.advanceInitialStravaImport).not.toHaveBeenCalled();
  });

  it("rejects missing or expanded granted scopes before token persistence or sync", async () => {
    mocks.completeByoAuthorization.mockResolvedValue("scope");
    const response = await GET(request({ state: STATE, code: "provider-code" }));

    expect(response.headers.get("location")).toBe(`${ORIGIN}/settings?strava=scope`);
    expect(mocks.completeByoAuthorization).toHaveBeenCalledWith(OWNER, "provider-code");
    expect(mocks.advanceInitialStravaImport).not.toHaveBeenCalled();
  });

  it("keeps the pending credentials for an exchange or sync failure and exposes no provider detail", async () => {
    mocks.completeByoAuthorization.mockResolvedValue("recovery");
    const response = await GET(request({ state: STATE, code: "provider-code" }));

    expect(response.headers.get("location")).toBe(`${ORIGIN}/settings?strava=recovery`);
    expect(mocks.completeByoAuthorization).toHaveBeenCalledWith(OWNER, "provider-code");
    expect(mocks.advanceInitialStravaImport).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain("provider body");
  });
});
