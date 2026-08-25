import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  requestStravaReconnect: vi.fn(),
  disconnectStrava: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("./auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/features/strava/server/connection", () => ({
  requestStravaReconnect: mocks.requestStravaReconnect,
  disconnectStrava: mocks.disconnectStrava,
}));

import { disconnectStravaAction, reconnectStravaAction } from "./strava-lifecycle-actions";

const owner = { userId: "owner-a" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentUser.mockResolvedValue(owner);
  mocks.requestStravaReconnect.mockResolvedValue(true);
  mocks.disconnectStrava.mockResolvedValue({ deleted: true, providerConfirmed: true });
  mocks.redirect.mockImplementation((path: string) => {
    throw new Error(`redirect:${path}`);
  });
});

describe("Strava lifecycle server actions", () => {
  it("derives reconnect ownership from the session and exposes only a fixed safe result", async () => {
    await expect(reconnectStravaAction()).rejects.toThrow("redirect:/settings?strava=reconnect");
    expect(mocks.requestStravaReconnect).toHaveBeenCalledWith(owner);
  });

  it("attempts deauthorization with a stale reconnect token, then deletes locally after failure", async () => {
    await expect(reconnectStravaAction()).rejects.toThrow("redirect:/settings?strava=reconnect");
    expect(mocks.requestStravaReconnect).toHaveBeenCalledWith(owner);

    mocks.disconnectStrava.mockResolvedValue({ deleted: true, providerConfirmed: false });
    await expect(disconnectStravaAction()).rejects.toThrow(
      "redirect:/settings?strava=deleted_provider_unconfirmed"
    );
    expect(mocks.disconnectStrava).toHaveBeenCalledWith(owner);
    expect(mocks.redirect).toHaveBeenCalledWith("/settings?strava=deleted_provider_unconfirmed");
  });

  it("reports provider confirmation unavailable when no connection token remains", async () => {
    mocks.disconnectStrava.mockResolvedValue({ deleted: true, providerConfirmed: false });

    await expect(disconnectStravaAction()).rejects.toThrow(
      "redirect:/settings?strava=deleted_provider_unconfirmed"
    );
    expect(mocks.disconnectStrava).toHaveBeenCalledWith(owner);
  });

  it("does not claim completion when the mandatory local transaction fails", async () => {
    mocks.disconnectStrava.mockResolvedValue({ deleted: false, providerConfirmed: false });

    expect(await disconnectStravaAction()).toEqual({ status: "unavailable" });
  });

  it("rejects unauthenticated lifecycle mutations before connection reads", async () => {
    mocks.requireCurrentUser.mockResolvedValue(null);

    expect(await reconnectStravaAction()).toEqual({ status: "unauthorized" });
    expect(await disconnectStravaAction()).toEqual({ status: "unauthorized" });
    expect(mocks.requestStravaReconnect).not.toHaveBeenCalled();
    expect(mocks.disconnectStrava).not.toHaveBeenCalled();
  });
});
