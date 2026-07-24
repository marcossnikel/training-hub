import { describe, expect, it } from "vitest";
import {
  computeLoad,
  computePmc,
  formState,
  hrZones,
  paceZones,
  type AthleteThresholds,
  type LoadActivity,
} from "@/lib/fitness";

// Real athlete reference values from PROGRESS.md: LTHR 176, threshold pace
// 4:29/km (269 s/km), max HR 190.
const thresholds: AthleteThresholds = {
  maxHr: 190,
  restingHr: 45,
  lthr: 176,
  thresholdPaceSPerKm: 269,
  ftpW: 250,
  restingHrEstimated: false,
  ftpProvisional: false,
  updatedAt: null,
};

function activity(overrides: Partial<LoadActivity>): LoadActivity {
  return {
    sport_type: null,
    moving_time_s: null,
    distance_km: null,
    avg_hr: null,
    avg_pace_s_per_km: null,
    rpe: null,
    raw_json: null,
    ...overrides,
  };
}

describe("computeLoad method priority", () => {
  it("prefers power for a ride with real device power, HR and an FTP", () => {
    const load = computeLoad(
      activity({
        sport_type: "Ride",
        moving_time_s: 3600,
        avg_hr: 150,
        raw_json: JSON.stringify({
          average_watts: 200,
          weighted_average_watts: 210,
          device_watts: true,
        }),
      }),
      thresholds
    );
    expect(load?.method).toBe("power");
  });

  it("ignores estimated (non-device) ride power and falls back to HR", () => {
    // Strava-estimated wattage: watts present but device_watts is false. This
    // must not produce a high-confidence power TSS; it should fall through to
    // pace (n/a for rides) → HR.
    const load = computeLoad(
      activity({
        sport_type: "Ride",
        moving_time_s: 3600,
        avg_hr: 150,
        raw_json: JSON.stringify({
          average_watts: 200,
          weighted_average_watts: 210,
          device_watts: false,
        }),
      }),
      thresholds
    );
    expect(load?.method).not.toBe("power");
    expect(load?.method).toBe("hr");
  });

  it("uses pace for a run with pace and HR", () => {
    const load = computeLoad(
      activity({
        sport_type: "Run",
        moving_time_s: 3600,
        avg_hr: 150,
        avg_pace_s_per_km: 300,
      }),
      thresholds
    );
    expect(load?.method).toBe("pace");
  });

  it("falls back to HR when only heart rate is present", () => {
    const load = computeLoad(
      activity({ sport_type: "Swim", moving_time_s: 3600, avg_hr: 140 }),
      thresholds
    );
    expect(load?.method).toBe("hr");
  });

  it("falls back to RPE when only RPE is present", () => {
    const load = computeLoad(
      activity({ sport_type: "Workout", moving_time_s: 3600, rpe: 5 }),
      thresholds
    );
    expect(load?.method).toBe("rpe");
  });

  it("returns null when no usable signal is present", () => {
    const load = computeLoad(activity({ sport_type: "Workout", moving_time_s: 3600 }), thresholds);
    expect(load).toBeNull();
  });

  it("returns null when moving time is not positive", () => {
    const load = computeLoad(
      activity({ sport_type: "Run", moving_time_s: 0, avg_pace_s_per_km: 300, avg_hr: 150 }),
      thresholds
    );
    expect(load).toBeNull();
  });
});

describe("computeLoad known race TSS (Jundiaí HM)", () => {
  it("computes rTSS from pace for a half marathon at ~4:39/km", () => {
    // ~21.2 km GPS distance at 279 s/km (4:39/km). Only moving_time_s and pace
    // drive rTSS: hours * IF^2 * 100 with IF = thresholdPace / pace.
    const paceSPerKm = 279;
    const distanceKm = 21.2;
    const movingTimeS = Math.round(distanceKm * paceSPerKm); // 5915 s

    const load = computeLoad(
      activity({
        sport_type: "Run",
        moving_time_s: movingTimeS,
        distance_km: distanceKm,
        avg_pace_s_per_km: paceSPerKm,
      }),
      thresholds
    );

    expect(load?.method).toBe("pace");
    // IF = 269 / 279 ≈ 0.964
    expect(load?.intensityFactor).toBeCloseTo(0.964, 2);
    // TSS ≈ 152.7 (PROGRESS.md ground truth), tolerance ±0.5
    expect(load?.tss).toBeCloseTo(152.7, 0);
  });
});

describe("computePmc EWMA", () => {
  it("matches hand-computed CTL/ATL/TSB over a deterministic series", () => {
    const pmc = computePmc([
      { date: "2026-01-01", load: 100 },
      { date: "2026-01-02", load: 50 },
      { date: "2026-01-03", load: 75 },
    ]);

    // Day 0: CTL = 100/42, ATL = 100/7, TSB = 0 on the first day.
    expect(pmc[0].tsb).toBe(0);
    expect(pmc[0].ctl).toBe(2.4);
    expect(pmc[0].atl).toBe(14.3);

    // Day 1: EWMA of prior toward today's load; TSB = prior CTL - prior ATL.
    expect(pmc[1].ctl).toBe(3.5);
    expect(pmc[1].atl).toBe(19.4);
    expect(pmc[1].tsb).toBe(-11.9);

    // Day 2.
    expect(pmc[2].ctl).toBe(5.2);
    expect(pmc[2].atl).toBe(27.3);
    expect(pmc[2].tsb).toBe(-15.9);
  });
});

describe("formState bands", () => {
  it("is transition above +20", () => {
    expect(formState(25).key).toBe("transition");
    expect(formState(20.1).key).toBe("transition");
  });

  it("is fresh in (+5, +20]", () => {
    expect(formState(20).key).toBe("fresh");
    expect(formState(6).key).toBe("fresh");
    expect(formState(5.1).key).toBe("fresh");
  });

  it("is neutral within [-10, 5]", () => {
    expect(formState(5).key).toBe("neutral");
    expect(formState(0).key).toBe("neutral");
    expect(formState(-10).key).toBe("neutral");
  });

  it("is productive within [-30, -10)", () => {
    expect(formState(-10.1).key).toBe("productive");
    expect(formState(-30).key).toBe("productive");
  });

  it("is fatigued below -30", () => {
    expect(formState(-30.1).key).toBe("fatigued");
    expect(formState(-40).key).toBe("fatigued");
  });
});

describe("hrZones", () => {
  it("computes Friel bpm cut points for LTHR 176", () => {
    const zones = hrZones(thresholds);
    expect(zones.map((z) => [z.min, z.max])).toEqual([
      [null, 143],
      [143, 158],
      [158, 165],
      [165, 176],
      [176, null],
    ]);
  });
});

describe("paceZones", () => {
  it("computes s/km cut points for threshold pace 269", () => {
    const zones = paceZones(thresholds);
    expect(zones.map((z) => [z.min, z.max])).toEqual([
      [332, null],
      [299, 332],
      [286, 299],
      [269, 286],
      [null, 269],
    ]);
  });
});
