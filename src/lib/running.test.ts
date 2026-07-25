import { describe, expect, it } from "vitest";
import { runMetrics } from "./running";

function activity(raw: object | null, sportType: string | null = "Run") {
  return { sport_type: sportType, raw_json: raw ? JSON.stringify(raw) : null };
}

describe("runMetrics", () => {
  it("reads the raw one-leg cadence and derives stride from the payload's average speed", () => {
    // 3 m/s at 90 rpm = 180 spm = 3 steps/s, so exactly 1 m per step.
    const { avgCadence, strideM } = runMetrics(activity({ average_cadence: 90, average_speed: 3 }));
    expect(avgCadence).toBe(90);
    expect(strideM).toBeCloseTo(1, 10);
  });

  it("puts stride in the plausible range of a real recorded run", () => {
    // Live sample: 3.33 m/s (5:00/km) at 170 spm.
    const { strideM } = runMetrics(activity({ average_cadence: 85, average_speed: 3.33 }));
    expect(strideM).not.toBeNull();
    expect(strideM as number).toBeGreaterThan(0.8);
    expect(strideM as number).toBeLessThan(1.4);
  });

  it("returns nulls without a cadence reading", () => {
    expect(runMetrics(activity(null))).toEqual({ avgCadence: null, strideM: null });
    expect(runMetrics(activity({ average_speed: 3 }))).toEqual({
      avgCadence: null,
      strideM: null,
    });
    expect(runMetrics(activity({ average_cadence: 0, average_speed: 3 }))).toEqual({
      avgCadence: null,
      strideM: null,
    });
  });

  it("survives a malformed payload", () => {
    expect(runMetrics({ sport_type: "Run", raw_json: "{not json" })).toEqual({
      avgCadence: null,
      strideM: null,
    });
  });

  it("survives valid JSON that is not an object", () => {
    for (const raw_json of ["null", "3", '"nope"']) {
      expect(runMetrics({ sport_type: "Run", raw_json })).toEqual({
        avgCadence: null,
        strideM: null,
      });
    }
  });

  it("keeps cadence but drops stride when average speed is missing or zero", () => {
    expect(runMetrics(activity({ average_cadence: 85 }))).toEqual({
      avgCadence: 85,
      strideM: null,
    });
    expect(runMetrics(activity({ average_cadence: 85, average_speed: 0 }))).toEqual({
      avgCadence: 85,
      strideM: null,
    });
  });

  it("ignores non-run sports, whose cadence must never be read as steps", () => {
    const payload = { average_cadence: 85, average_speed: 3 };
    expect(runMetrics(activity(payload, "Walk"))).toEqual({ avgCadence: null, strideM: null });
    expect(runMetrics(activity(payload, "Rowing"))).toEqual({ avgCadence: null, strideM: null });
    expect(runMetrics(activity(payload, "Ride"))).toEqual({ avgCadence: null, strideM: null });
    expect(runMetrics(activity(payload, null))).toEqual({ avgCadence: null, strideM: null });
  });
});
