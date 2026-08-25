import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  getStravaConnectionStatus: vi.fn(),
  savePendingStravaConnection: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("./auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("./db", () => ({
  getStravaConnectionStatus: mocks.getStravaConnectionStatus,
  savePendingStravaConnection: mocks.savePendingStravaConnection,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { beginByoConnectionAction } from "./byo-connection-actions";

function credentials(
  clientId = "athlete-client",
  clientSecret = "secret-that-must-not-return"
): FormData {
  const form = new FormData();
  form.set("clientId", clientId);
  form.set("clientSecret", clientSecret);
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentUser.mockResolvedValue({ userId: "owner-a" });
  mocks.getStravaConnectionStatus.mockResolvedValue("disconnected");
  mocks.savePendingStravaConnection.mockResolvedValue(true);
});

describe("begin BYO connection Server Action", () => {
  it("returns an unauthenticated result before parsing or storing submitted credentials", async () => {
    mocks.requireCurrentUser.mockResolvedValue(null);
    const result = await beginByoConnectionAction(credentials());
    expect(result).toEqual({ status: "unauthorized" });
    expect(JSON.stringify(result)).not.toContain("secret-that-must-not-return");
    expect(mocks.savePendingStravaConnection).not.toHaveBeenCalled();
  });

  it("returns only a fixed handoff after a saved owner credential pair", async () => {
    const result = await beginByoConnectionAction(credentials("  athlete-client  "));
    expect(mocks.savePendingStravaConnection).toHaveBeenCalledWith(
      { userId: "owner-a" },
      { client_id: "athlete-client", client_secret: "secret-that-must-not-return" }
    );
    expect(result).toEqual({ status: "ready", handoffPath: "/api/strava/byo-connect" });
    expect(JSON.stringify(result)).not.toContain("secret-that-must-not-return");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("does not leak secrets on validation errors or duplicate held submissions", async () => {
    const invalid = await beginByoConnectionAction(credentials(" "));
    expect(invalid).toMatchObject({ status: "invalid", clientId: "" });
    expect(JSON.stringify(invalid)).not.toContain("secret-that-must-not-return");
    expect(mocks.savePendingStravaConnection).not.toHaveBeenCalled();

    mocks.savePendingStravaConnection.mockResolvedValue(false);
    const duplicate = await beginByoConnectionAction(credentials());
    expect(duplicate).toEqual({ status: "pending", handoffPath: "/api/strava/byo-connect" });
    expect(JSON.stringify(duplicate)).not.toContain("secret-that-must-not-return");
  });
});
