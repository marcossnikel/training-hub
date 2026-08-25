import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  getInitialStravaImportStatus: vi.fn(),
  advanceInitialStravaImport: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/lib/db", () => ({ getInitialStravaImportStatus: mocks.getInitialStravaImportStatus }));
vi.mock("@/features/strava/server/sync", () => ({
  advanceInitialStravaImport: mocks.advanceInitialStravaImport,
}));

import { GET, POST } from "./route";

const owner = { userId: "owner-a" };
const safeStatus = {
  job: { id: "job-a", status: "partial", stage: "fetching_activities" },
  counters: { historical_confirmed_created: 3 },
  pagesCommitted: 1,
  snapshot: { confirmed: 3, pending: 0 },
  percent: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentUser.mockResolvedValue(owner);
  mocks.getInitialStravaImportStatus.mockResolvedValue(safeStatus);
  mocks.advanceInitialStravaImport.mockResolvedValue({ advanced: true, status: safeStatus });
});

describe("owner-scoped Strava import boundary", () => {
  it("makes a guest and a missing/foreign job indistinguishable", async () => {
    mocks.requireCurrentUser.mockResolvedValue(null);
    expect((await GET()).status).toBe(404);
    expect((await POST()).status).toBe(404);

    mocks.requireCurrentUser.mockResolvedValue(owner);
    mocks.getInitialStravaImportStatus.mockResolvedValue(null);
    mocks.advanceInitialStravaImport.mockResolvedValue({ advanced: false, status: null });
    expect((await GET()).status).toBe(404);
    expect((await POST()).status).toBe(404);
  });

  it("accepts no browser-supplied state and returns only the owner-safe snapshot", async () => {
    const response = await POST();

    expect(mocks.advanceInitialStravaImport).toHaveBeenCalledWith(owner);
    expect(await response.json()).toEqual(safeStatus);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
