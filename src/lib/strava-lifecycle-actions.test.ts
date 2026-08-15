import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  getStravaAuth: vi.fn(),
  prepareStravaReconnect: vi.fn(),
  deleteOwnerStravaData: vi.fn(),
  deauthorizeStravaAccessToken: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("./auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("./db", () => ({
  getStravaAuth: mocks.getStravaAuth,
  prepareStravaReconnect: mocks.prepareStravaReconnect,
  deleteOwnerStravaData: mocks.deleteOwnerStravaData,
}));
vi.mock("./strava", () => ({ deauthorizeStravaAccessToken: mocks.deauthorizeStravaAccessToken }));

import { disconnectStravaAction, reconnectStravaAction } from "./strava-lifecycle-actions";

const owner = { userId: "owner-a" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentUser.mockResolvedValue(owner);
  mocks.prepareStravaReconnect.mockResolvedValue(true);
  mocks.getStravaAuth.mockResolvedValue({ access_token: "token-that-must-not-return" });
  mocks.deauthorizeStravaAccessToken.mockResolvedValue(true);
  mocks.deleteOwnerStravaData.mockResolvedValue({ activities: 2, connection: true });
  mocks.redirect.mockImplementation((path: string) => {
    throw new Error(`redirect:${path}`);
  });
});

describe("Strava lifecycle server actions", () => {
  it("derives reconnect ownership from the session and exposes only a fixed safe result", async () => {
    await expect(reconnectStravaAction()).rejects.toThrow("redirect:/settings?strava=reconnect");
    expect(mocks.prepareStravaReconnect).toHaveBeenCalledWith(owner);
  });

  it("always locally deletes after a provider failure and never returns token/provider details", async () => {
    mocks.deauthorizeStravaAccessToken.mockResolvedValue(false);
    await expect(disconnectStravaAction()).rejects.toThrow(
      "redirect:/settings?strava=deleted_provider_unconfirmed"
    );
    expect(mocks.deauthorizeStravaAccessToken).toHaveBeenCalledWith("token-that-must-not-return");
    expect(mocks.deleteOwnerStravaData).toHaveBeenCalledWith(owner);
    expect(mocks.redirect).toHaveBeenCalledWith("/settings?strava=deleted_provider_unconfirmed");
  });

  it("does not claim completion when the mandatory local transaction fails", async () => {
    mocks.deleteOwnerStravaData.mockRejectedValue(new Error("database internal detail"));

    expect(await disconnectStravaAction()).toEqual({ status: "unavailable" });
  });

  it("rejects unauthenticated lifecycle mutations before connection reads", async () => {
    mocks.requireCurrentUser.mockResolvedValue(null);

    expect(await reconnectStravaAction()).toEqual({ status: "unauthorized" });
    expect(await disconnectStravaAction()).toEqual({ status: "unauthorized" });
    expect(mocks.prepareStravaReconnect).not.toHaveBeenCalled();
    expect(mocks.getStravaAuth).not.toHaveBeenCalled();
    expect(mocks.deleteOwnerStravaData).not.toHaveBeenCalled();
  });
});
