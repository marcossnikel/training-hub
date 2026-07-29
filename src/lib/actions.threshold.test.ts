import { afterEach, describe, expect, it, vi } from "vitest";

// saveThresholdsAction and the two apply buttons must persist the edit in-request
// and leave the other stored thresholds untouched. Node-env unit tests.
//
// These used to also assert that a full-history TSS recompute was deferred to
// after(); training load was removed from the app, so there is nothing left to
// schedule and the action is now a plain synchronous write.

const mocks = vi.hoisted(() => {
  return {
    saveAthleteThresholds: vi.fn(async () => {}),
    getAthleteThresholds: vi.fn(async () => ({
      maxHr: 195,
      restingHr: 50,
      lthr: 170,
      thresholdPaceSPerKm: 300,
      ftpW: 260,
      restingHrEstimated: true,
      ftpProvisional: false,
      updatedAt: "2026-01-01T00:00:00Z",
    })),
    revalidatePath: vi.fn(),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}));
// Only the two DB functions saveThresholdsAction touches are stubbed; actions.ts
// imports many more names from ./db, but none are referenced on this code path.
vi.mock("./db", () => ({
  saveAthleteThresholds: mocks.saveAthleteThresholds,
  getAthleteThresholds: mocks.getAthleteThresholds,
}));

import {
  applyFtpAction,
  applyThresholdPaceAction,
  saveThresholdsAction,
  type ThresholdsInput,
} from "./actions";

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
  it("persists thresholds synchronously and returns without awaiting the recompute", async () => {
    const result = await saveThresholdsAction(VALID);

    expect(result).toEqual({ ok: true });
    // The edit is written in-request, before the response returns.
    expect(mocks.saveAthleteThresholds).toHaveBeenCalledTimes(1);
    expect(mocks.saveAthleteThresholds).toHaveBeenCalledWith({
      maxHr: 190,
      restingHr: 45,
      lthr: 165,
      thresholdPaceSPerKm: 240,
      ftpW: 250,
      restingHrEstimated: false,
      ftpProvisional: false,
    });
  });

  it("does not persist anything when thresholds are invalid", async () => {
    const result = await saveThresholdsAction({ ...VALID, maxHr: 300 });

    expect(result.ok).toBe(false);
    expect(mocks.saveAthleteThresholds).not.toHaveBeenCalled();
  });
});

describe("applyThresholdPaceAction (pace-only apply)", () => {
  it("changes only the pace, preserving the other thresholds read server-side", async () => {
    const result = await applyThresholdPaceAction(240);

    expect(result).toEqual({ ok: true });
    // It reads the CURRENT thresholds rather than trusting a client snapshot,
    // then writes them back with only the pace changed — so a concurrent edit to
    // maxHr/restingHr/lthr/ftp made after page load is not reverted.
    expect(mocks.getAthleteThresholds).toHaveBeenCalledTimes(1);
    expect(mocks.saveAthleteThresholds).toHaveBeenCalledWith({
      maxHr: 195,
      restingHr: 50,
      lthr: 170,
      thresholdPaceSPerKm: 240,
      ftpW: 260,
      restingHrEstimated: true,
      ftpProvisional: false,
    });
  });

  it("rejects an out-of-range pace without reading or writing thresholds", async () => {
    const result = await applyThresholdPaceAction(700);

    expect(result.ok).toBe(false);
    expect(mocks.getAthleteThresholds).not.toHaveBeenCalled();
    expect(mocks.saveAthleteThresholds).not.toHaveBeenCalled();
  });
});

describe("applyFtpAction (eFTP apply, T28)", () => {
  it("changes only the FTP and clears the provisional flag", async () => {
    mocks.getAthleteThresholds.mockResolvedValueOnce({
      maxHr: 195,
      restingHr: 50,
      lthr: 170,
      thresholdPaceSPerKm: 300,
      ftpW: 150,
      restingHrEstimated: true,
      ftpProvisional: true,
      updatedAt: "2026-01-01T00:00:00Z",
    });

    const result = await applyFtpAction(248.6);

    expect(result).toEqual({ ok: true });
    // Same contract as the pace apply: read the CURRENT thresholds server-side,
    // write them back with one field changed, so a concurrent edit is not lost.
    expect(mocks.getAthleteThresholds).toHaveBeenCalledTimes(1);
    expect(mocks.saveAthleteThresholds).toHaveBeenCalledWith({
      maxHr: 195,
      restingHr: 50,
      lthr: 170,
      thresholdPaceSPerKm: 300,
      // Rounded to whole watts, and no longer a placeholder.
      ftpW: 249,
      restingHrEstimated: true,
      ftpProvisional: false,
    });
  });

  it("rejects an out-of-range FTP without reading or writing thresholds", async () => {
    const result = await applyFtpAction(900);

    expect(result.ok).toBe(false);
    expect(mocks.getAthleteThresholds).not.toHaveBeenCalled();
    expect(mocks.saveAthleteThresholds).not.toHaveBeenCalled();
  });
});
