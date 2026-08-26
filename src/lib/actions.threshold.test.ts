import { afterEach, describe, expect, it, vi } from "vitest";

// saveThresholdsAction and the two apply buttons must persist the edit in-request
// and leave the other stored thresholds untouched. Node-env unit tests.
//
// These used to also assert that a full-history TSS recompute was deferred to
// after(); training load was removed from the app, so there is nothing left to
// schedule and the action is now a plain synchronous write.

const mocks = vi.hoisted(() => {
  return {
    saveAthleteEnteredParameter: vi.fn(async () => true),
    requireCurrentUser: vi.fn(async (): Promise<{ userId: string } | null> => ({
      userId: "owner-a",
    })),
    revalidatePath: vi.fn(),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}));
vi.mock("@/lib/auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
// The profile boundary receives only the authenticated owner, a fixed parameter
// key and a value. Provenance is never accepted from the browser.
vi.mock("@/lib/db", () => ({
  saveAthleteEnteredParameter: mocks.saveAthleteEnteredParameter,
}));

import {
  applyFtpAction,
  applyThresholdPaceAction,
  saveThresholdsAction,
  type ThresholdsInput,
} from "@/features/activities/server/actions";

const VALID: ThresholdsInput = {
  maxHr: 190,
  restingHr: 45,
  lthr: 165,
  thresholdPaceSPerKm: 240,
  ftpW: 250,
  restingHrEstimated: false,
  ftpProvisional: false,
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("saveThresholdsAction (T3.7)", () => {
  it("rejects a guest before reading or writing domain thresholds", async () => {
    mocks.requireCurrentUser.mockResolvedValueOnce(null);

    const result = await saveThresholdsAction(VALID);

    expect(result.ok).toBe(false);
    expect(mocks.saveAthleteEnteredParameter).not.toHaveBeenCalled();
  });

  it("persists thresholds synchronously and returns without awaiting the recompute", async () => {
    const result = await saveThresholdsAction(VALID);

    expect(result).toEqual({ ok: true });
    // The edit is written in-request, before the response returns.
    expect(mocks.saveAthleteEnteredParameter).toHaveBeenCalledTimes(5);
    expect(mocks.saveAthleteEnteredParameter).toHaveBeenCalledWith(
      { userId: "owner-a" },
      "threshold_pace_sec_per_km",
      240
    );
  });

  it("does not persist anything when thresholds are invalid", async () => {
    const result = await saveThresholdsAction({ ...VALID, maxHr: 300 });

    expect(result.ok).toBe(false);
    expect(mocks.saveAthleteEnteredParameter).not.toHaveBeenCalled();
  });
});

describe("applyThresholdPaceAction (pace-only apply)", () => {
  it("changes only the pace as an athlete-entered parameter", async () => {
    const result = await applyThresholdPaceAction(240);

    expect(result).toEqual({ ok: true });
    expect(mocks.saveAthleteEnteredParameter).toHaveBeenCalledWith(
      { userId: "owner-a" },
      "threshold_pace_sec_per_km",
      240
    );
  });

  it("rejects an out-of-range pace without reading or writing thresholds", async () => {
    const result = await applyThresholdPaceAction(700);

    expect(result.ok).toBe(false);
    expect(mocks.saveAthleteEnteredParameter).not.toHaveBeenCalled();
  });
});

describe("applyFtpAction (eFTP apply, T28)", () => {
  it("changes only the FTP as an athlete-entered parameter", async () => {
    const result = await applyFtpAction(248.6);

    expect(result).toEqual({ ok: true });
    expect(mocks.saveAthleteEnteredParameter).toHaveBeenCalledWith(
      { userId: "owner-a" },
      "cycling_ftp_watts",
      249
    );
  });

  it("rejects an out-of-range FTP without reading or writing thresholds", async () => {
    const result = await applyFtpAction(900);

    expect(result.ok).toBe(false);
    expect(mocks.saveAthleteEnteredParameter).not.toHaveBeenCalled();
  });
});
