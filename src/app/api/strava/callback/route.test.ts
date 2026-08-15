import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  consumeOAuthState: vi.fn(),
  getPendingStravaExchangeInput: vi.fn(),
  promotePendingStravaConnection: vi.fn(),
  setMeta: vi.fn(),
  exchangeByoCode: vi.fn(),
  syncActivities: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/lib/db", () => ({
  consumeOAuthState: mocks.consumeOAuthState,
  getPendingStravaExchangeInput: mocks.getPendingStravaExchangeInput,
  promotePendingStravaConnection: mocks.promotePendingStravaConnection,
  setMeta: mocks.setMeta,
}));
vi.mock("@/lib/strava", () => ({
  exchangeByoCode: mocks.exchangeByoCode,
  syncActivities: mocks.syncActivities,
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
  mocks.getPendingStravaExchangeInput.mockResolvedValue({
    client_id: "athlete-client",
    client_secret: "athlete-secret",
  });
  mocks.exchangeByoCode.mockResolvedValue({
    access_token: "access-token",
    refresh_token: "refresh-token",
    expires_at: 4_000_000_000,
    scope: "profile:read_all activity:read_all",
    athlete: { id: 42, firstname: "Ada", lastname: "Runner" },
  });
  mocks.promotePendingStravaConnection.mockResolvedValue(true);
  mocks.syncActivities.mockResolvedValue({ imported: 1, pendingNew: 1, pendingTotal: 1 });
});

afterEach(() => {
  if (ORIGINAL_PUBLIC_ORIGIN === undefined) delete process.env.TRAINING_HUB_PUBLIC_ORIGIN;
  else process.env.TRAINING_HUB_PUBLIC_ORIGIN = ORIGINAL_PUBLIC_ORIGIN;
});

describe("owner-bound Strava callback", () => {
  it("consumes state before owner-only exchange, promotes exact scope, syncs, and redirects safely", async () => {
    process.env.STRAVA_CLIENT_ID = "founder-client-must-not-be-used";
    process.env.STRAVA_CLIENT_SECRET = "founder-secret-must-not-be-used";
    const response = await GET(request({ state: STATE, code: "provider-code" }));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/?strava=connected`);
    expect(mocks.consumeOAuthState).toHaveBeenCalledWith(OWNER, STATE);
    expect(mocks.exchangeByoCode).toHaveBeenCalledWith(
      { client_id: "athlete-client", client_secret: "athlete-secret" },
      "provider-code"
    );
    expect(mocks.promotePendingStravaConnection).toHaveBeenCalledWith(
      OWNER,
      expect.objectContaining({
        access_token: "access-token",
        refresh_token: "refresh-token",
        strava_athlete_id: 42,
        granted_scope: "activity:read_all,profile:read_all",
      })
    );
    expect(mocks.syncActivities).toHaveBeenCalledWith(OWNER);
    const artifact = JSON.stringify({
      location: response.headers.get("location"),
      calls: mocks.exchangeByoCode.mock.calls,
    });
    expect(artifact).not.toContain("founder-client-must-not-be-used");
    expect(artifact).not.toContain("founder-secret-must-not-be-used");
    expect(artifact).not.toContain("access-token");
    expect(artifact).not.toContain("refresh-token");
  });

  it("fails closed for a consumed, expired, replayed, or other-owner state without exchange", async () => {
    mocks.consumeOAuthState.mockResolvedValue(null);
    const response = await GET(request({ state: STATE, code: "provider-code" }));

    expect(response.headers.get("location")).toBe(`${ORIGIN}/settings?strava=recovery`);
    expect(mocks.exchangeByoCode).not.toHaveBeenCalled();
    expect(mocks.getPendingStravaExchangeInput).not.toHaveBeenCalled();
    expect(mocks.promotePendingStravaConnection).not.toHaveBeenCalled();
  });

  it("consumes a provider denial but makes no exchange or sync", async () => {
    const response = await GET(request({ state: STATE, error: "access_denied" }));

    expect(response.headers.get("location")).toBe(`${ORIGIN}/settings?strava=scope`);
    expect(mocks.consumeOAuthState).toHaveBeenCalledWith(OWNER, STATE);
    expect(mocks.exchangeByoCode).not.toHaveBeenCalled();
    expect(mocks.syncActivities).not.toHaveBeenCalled();
  });

  it("rejects missing or expanded granted scopes before token persistence or sync", async () => {
    mocks.exchangeByoCode.mockResolvedValue({
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_at: 4_000_000_000,
      scope: "activity:read_all,profile:read_all,read_all",
      athlete: { id: 42 },
    });
    const response = await GET(request({ state: STATE, code: "provider-code" }));

    expect(response.headers.get("location")).toBe(`${ORIGIN}/settings?strava=scope`);
    expect(mocks.promotePendingStravaConnection).not.toHaveBeenCalled();
    expect(mocks.syncActivities).not.toHaveBeenCalled();
  });

  it("keeps the pending credentials for an exchange or sync failure and exposes no provider detail", async () => {
    mocks.exchangeByoCode.mockRejectedValue(new Error("provider body: secret response"));
    const response = await GET(request({ state: STATE, code: "provider-code" }));

    expect(response.headers.get("location")).toBe(`${ORIGIN}/settings?strava=recovery`);
    expect(mocks.promotePendingStravaConnection).not.toHaveBeenCalled();
    expect(mocks.syncActivities).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain("provider body");
  });
});
