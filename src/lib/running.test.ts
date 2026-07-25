import { describe, expect, it } from "vitest";
import { runMetrics } from "./running";

function activity(raw: object | null, distanceKm: number | null, movingTimeS: number | null) {
  return {
    raw_json: raw ? JSON.stringify(raw) : null,
    distance_km: distanceKm,
    moving_time_s: movingTimeS,
  };
}

describe("runMetrics", () => {
  it("reads the raw one-leg cadence and derives stride from doubled steps", () => {
    // 10 km in 50:00 = 3.333 m/s; 86.3 rpm = 172.6 spm = 2.877 steps/s.
    const { avgCadence, strideM } = runMetrics(activity({ average_cadence: 86.3 }, 10, 3000));
    expect(avgCadence).toBe(86.3);
    expect(strideM).toBeCloseTo(1.159, 3);
  });

  it("puts stride in the plausible range of a real recorded run", () => {
    // Live sample: 5 km in 25:00 at 170 spm.
    const { strideM } = runMetrics(activity({ average_cadence: 85 }, 5, 1500));
    expect(strideM).not.toBeNull();
    expect(strideM as number).toBeGreaterThan(0.8);
    expect(strideM as number).toBeLessThan(1.4);
  });

  it("returns nulls without a cadence reading", () => {
    expect(runMetrics(activity(null, 10, 3000))).toEqual({ avgCadence: null, strideM: null });
    expect(runMetrics(activity({}, 10, 3000))).toEqual({ avgCadence: null, strideM: null });
    expect(runMetrics(activity({ average_cadence: 0 }, 10, 3000))).toEqual({
      avgCadence: null,
      strideM: null,
    });
  });

  it("survives a malformed payload", () => {
    expect(runMetrics({ raw_json: "{not json", distance_km: 10, moving_time_s: 3000 })).toEqual({
      avgCadence: null,
      strideM: null,
    });
  });

  it("keeps cadence but drops stride when distance or time is missing", () => {
    expect(runMetrics(activity({ average_cadence: 85 }, null, 3000))).toEqual({
      avgCadence: 85,
      strideM: null,
    });
    expect(runMetrics(activity({ average_cadence: 85 }, 10, 0))).toEqual({
      avgCadence: 85,
      strideM: null,
    });
  });
});
