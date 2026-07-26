import { afterEach, describe, expect, it, vi } from "vitest";

// T3.7 — saveThresholdsAction must PERSIST the thresholds synchronously and DEFER
// the expensive full-history recompute to after() (post-response), not await it in
// the request path (G7.3). Node-env unit tests. `after` (next/server) is replaced
// with a capturing stub so we can prove the recompute is SCHEDULED, not awaited: at
// the moment the action returns, the thresholds are saved but recomputeAllLoads has
// not run; running the captured callback is what triggers it.
//
// The real after() timing — the callback firing after the HTTP response is flushed,
// extended on serverless via waitUntil — is a Next runtime behaviour verified
// against node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md,
// and is not itself unit-testable here. These tests lock the request-path contract.

const mocks = vi.hoisted(() => {
  const afterCallbacks: Array<() => void | Promise<void>> = [];
  return {
    afterCallbacks,
    after: vi.fn((cb: () => void | Promise<void>) => {
      afterCallbacks.push(cb);
    }),
    saveAthleteThresholds: vi.fn(async () => {}),
    recomputeAllLoads: vi.fn(async () => ({ count: 3 })),
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

vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}));
// Only the two DB functions saveThresholdsAction touches are stubbed; actions.ts
// imports many more names from ./db, but none are referenced on this code path.
vi.mock("./db", () => ({
  saveAthleteThresholds: mocks.saveAthleteThresholds,
  recomputeAllLoads: mocks.recomputeAllLoads,
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
  mocks.afterCallbacks.length = 0;
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
    // The recompute is SCHEDULED via after(), not awaited: it has not run yet.
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.recomputeAllLoads).not.toHaveBeenCalled();
  });

  it("runs the full recompute only when the after() callback fires post-response", async () => {
    await saveThresholdsAction(VALID);
    expect(mocks.recomputeAllLoads).not.toHaveBeenCalled();

    expect(mocks.afterCallbacks).toHaveLength(1);
    await mocks.afterCallbacks[0]();

    expect(mocks.recomputeAllLoads).toHaveBeenCalledTimes(1);
  });

  it("logs and does not throw when the deferred recompute fails (thresholds stay saved)", async () => {
    mocks.recomputeAllLoads.mockRejectedValueOnce(new Error("recompute boom"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await saveThresholdsAction(VALID);
    expect(result).toEqual({ ok: true });
    expect(mocks.saveAthleteThresholds).toHaveBeenCalledTimes(1);

    // The post-response task must swallow-and-log, never reject.
    const [cb] = mocks.afterCallbacks;
    await expect(cb()).resolves.toBeUndefined();

    expect(
      errorSpy.mock.calls.some((call) =>
        String(call[0]).includes("actions.saveThresholds.recompute")
      )
    ).toBe(true);

    errorSpy.mockRestore();
  });

  it("does not persist or schedule anything when thresholds are invalid", async () => {
    const result = await saveThresholdsAction({ ...VALID, maxHr: 300 });

    expect(result.ok).toBe(false);
    expect(mocks.saveAthleteThresholds).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.recomputeAllLoads).not.toHaveBeenCalled();
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
    // Recompute is scheduled post-response, not awaited.
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.recomputeAllLoads).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range pace without reading or writing thresholds", async () => {
    const result = await applyThresholdPaceAction(700);

    expect(result.ok).toBe(false);
    expect(mocks.getAthleteThresholds).not.toHaveBeenCalled();
    expect(mocks.saveAthleteThresholds).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
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
    // FTP divides power-method TSS, so the recompute is scheduled post-response.
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.recomputeAllLoads).not.toHaveBeenCalled();

    await mocks.afterCallbacks[0]();
    expect(mocks.recomputeAllLoads).toHaveBeenCalledTimes(1);
  });

  it("rejects an out-of-range FTP without reading or writing thresholds", async () => {
    const result = await applyFtpAction(900);

    expect(result.ok).toBe(false);
    expect(mocks.getAthleteThresholds).not.toHaveBeenCalled();
    expect(mocks.saveAthleteThresholds).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });
});
