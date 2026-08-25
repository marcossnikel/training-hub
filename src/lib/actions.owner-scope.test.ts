import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getShoe: vi.fn(),
  setShoeRetired: vi.fn(),
  requireCurrentUser: vi.fn(),
  refreshAll: vi.fn(),
}));

vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {} }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/lib/db", () => ({
  getShoe: mocks.getShoe,
  setShoeRetired: mocks.setShoeRetired,
}));
vi.mock("@/lib/action-helpers", () => ({
  dict: async () => ({ errors: { unauthorized: "Unauthorized", shoeNotFound: "Shoe not found" } }),
  inRange: vi.fn(),
  normalizeJournal: vi.fn(),
  normalizeSplits: vi.fn(),
  refreshAll: mocks.refreshAll,
}));

import { setShoeRetiredAction } from "@/features/gear/server/actions";

beforeEach(() => {
  mocks.requireCurrentUser.mockResolvedValue({ userId: "owner-a" });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("setShoeRetiredAction owner boundary", () => {
  it("does not mutate a guessed shoe that the authenticated owner does not own", async () => {
    // This is the supported server-action path, not a client-provided owner field.
    // The DB boundary has its own two-owner no-op proof in db.owner-scope.test.ts.
    mocks.getShoe.mockResolvedValue(null);

    await expect(setShoeRetiredAction(90210, true)).resolves.toEqual({
      ok: false,
      error: "Shoe not found",
    });
    expect(mocks.getShoe).toHaveBeenCalledWith({ userId: "owner-a" }, 90210);
    expect(mocks.setShoeRetired).not.toHaveBeenCalled();
    expect(mocks.refreshAll).not.toHaveBeenCalled();
  });
});
