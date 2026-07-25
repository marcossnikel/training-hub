import { describe, expect, it } from "vitest";
import {
  availableLoadSports,
  computeAcwr,
  computeLoad,
  computePmc,
  dailyLoadSeries,
  easyHardPct,
  FORM_TREND_DAYS,
  formSnapshot,
  formState,
  hrZones,
  loadSport,
  paceZones,
  powerZones,
  projectPmc,
  weekLoadVsTrailing,
  weeklyLoadTotal,
  weeklyMonotony,
  weeklySportLoad,
  zoneBoundsOf,
  zoneIndexOf,
  zoneSeconds,
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

    // Fewer than 7 days of history: rampRate is null throughout.
    expect(pmc.map((p) => p.rampRate)).toEqual([null, null, null]);
  });
});

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

describe("computePmc rampRate", () => {
  it("is null for the first 7 days, then ctl[i] - ctl[i-7] beyond that", () => {
    const daily = Array.from({ length: 10 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, "0")}`,
      load: 50,
    }));
    const pmc = computePmc(daily);

    for (let i = 0; i < 7; i++) {
      expect(pmc[i].rampRate).toBeNull();
    }
    for (let i = 7; i < pmc.length; i++) {
      expect(pmc[i].rampRate).toBe(round1(pmc[i].ctl - pmc[i - 7].ctl));
    }
    // Constant positive load steadily builds CTL, so the ramp is positive
    // once it becomes defined.
    expect(pmc[7].rampRate).toBeGreaterThan(0);
  });

  it("tracks a sharp load increase (ramp rises when recent CTL outpaces CTL a week ago)", () => {
    const daily = [
      ...Array.from({ length: 20 }, (_, i) => ({ date: `d${i}`, load: 20 })),
      ...Array.from({ length: 10 }, (_, i) => ({ date: `d${20 + i}`, load: 100 })),
    ];
    const pmc = computePmc(daily);
    const last = pmc[pmc.length - 1];
    expect(last.rampRate).not.toBeNull();
    expect(last.rampRate as number).toBeGreaterThan(0);
  });
});

describe("projectPmc", () => {
  const last = {
    date: "2026-01-10",
    load: 0,
    ctl: 42,
    atl: 60,
    tsb: -5,
    rampRate: null,
  };

  it("projects the day AFTER the last point and keeps the dates sequential", () => {
    const projected = projectPmc(last, 3, 0);
    expect(projected.map((p) => p.date)).toEqual(["2026-01-11", "2026-01-12", "2026-01-13"]);
    expect(projectPmc(last, 0, 50)).toEqual([]);
  });

  it("decay-only (rest) projection matches the hand-computed EWMA", () => {
    const projected = projectPmc(last, 2, 0);

    // Day 1: CTL 42 - 42/42 = 41, ATL 60 - 60/7 = 51.43, TSB = last CTL - last ATL.
    expect(projected[0].ctl).toBe(41);
    expect(projected[0].atl).toBe(51.4);
    expect(projected[0].tsb).toBe(-18);

    // Day 2: CTL 41 - 41/42 = 40.02, ATL 51.43 * 6/7 = 44.08, TSB 41 - 51.43.
    expect(projected[1].ctl).toBe(40);
    expect(projected[1].atl).toBe(44.1);
    expect(projected[1].tsb).toBe(-10.4);

    // Load is carried on every projected point so the scenario is self-describing.
    expect(projected.map((p) => p.load)).toEqual([0, 0]);
  });

  it("rests toward zero fitness and positive form under zero load", () => {
    const projected = projectPmc(last, 120, 0);
    const end = projected[projected.length - 1];
    expect(end.ctl).toBeLessThan(last.ctl);
    expect(end.atl).toBeCloseTo(0, 1);
    // Fatigue decays ~6x faster than fitness, so form ends up positive.
    expect(end.tsb).toBeGreaterThan(0);
  });

  it("steady-load projection converges toward the dailyLoad-implied CTL/ATL", () => {
    const dailyLoad = 50;
    const projected = projectPmc(last, 500, dailyLoad);
    const end = projected[projected.length - 1];
    expect(end.ctl).toBeCloseTo(dailyLoad, 1);
    expect(end.atl).toBeCloseTo(dailyLoad, 1);
    // At steady state fitness equals fatigue, so form settles at zero.
    expect(end.tsb).toBeCloseTo(0, 1);
  });

  it("has a null rampRate until the 7-day lookback falls inside the projection", () => {
    const projected = projectPmc(last, 10, 50);
    for (let i = 0; i < 7; i++) {
      expect(projected[i].rampRate).toBeNull();
    }
    for (let i = 7; i < projected.length; i++) {
      expect(projected[i].rampRate).toBe(round1(projected[i].ctl - projected[i - 7].ctl));
    }
  });
});

describe("computeAcwr", () => {
  it("is null with no history (mirrors the pre-refactor db/readiness.ts loadState behavior)", () => {
    expect(computeAcwr([])).toBeNull();
  });

  it("is null when the chronic mean is exactly 0, even with plenty of history", () => {
    const daily = Array.from({ length: 30 }, (_, i) => ({ date: `d${i}`, load: 0 }));
    expect(computeAcwr(daily)).toBeNull();
  });

  it("does NOT return null merely for under 28 days of history (short-history case)", () => {
    // Only 3 days total: both the acute and chronic windows fall back to all
    // available days, so acute === chronic and the ratio is 1, not null.
    const daily = [
      { date: "2026-01-01", load: 40 },
      { date: "2026-01-02", load: 60 },
      { date: "2026-01-03", load: 50 },
    ];
    expect(computeAcwr(daily)).toBeCloseTo(1, 6);
  });

  it("is 1 at exactly 7 days of history (acute and chronic windows are identical)", () => {
    const daily = [10, 20, 30, 40, 50, 60, 70].map((load, i) => ({ date: `d${i}`, load }));
    expect(computeAcwr(daily)).toBeCloseTo(1, 6);
  });

  it("computes acute:chronic from the last 7 vs last 28 available days beyond a month", () => {
    // 21 easy days at load 20, then 7 harder days at load 60.
    const daily = [
      ...Array.from({ length: 21 }, (_, i) => ({ date: `a${i}`, load: 20 })),
      ...Array.from({ length: 7 }, (_, i) => ({ date: `b${i}`, load: 60 })),
    ];
    // acute = mean(last 7) = 60; chronic = mean(last 28) = (21*20 + 7*60)/28 = 30.
    expect(computeAcwr(daily)).toBeCloseTo(2, 6);
  });
});

describe("weeklyMonotony", () => {
  const days = (loads: number[]) => loads.map((load, i) => ({ date: `d${i}`, load }));

  it("computes Foster monotony and strain from a hand-computed week", () => {
    // loads 70, 50, 60, 40, 80, 0, 100 -> total 400, mean 400/7 = 57.142857,
    // population variance 6142.857/7 = 877.551, stddev 29.62349.
    // monotony = 57.142857 / 29.62349 = 1.928971; strain = 400 * that = 771.59.
    const result = weeklyMonotony(days([70, 50, 60, 40, 80, 0, 100]));
    expect(result.load7d).toBe(400);
    expect(result.monotony as number).toBeCloseTo(1.92897, 4);
    expect(result.strain as number).toBeCloseTo(771.59, 1);
  });

  it("scores a grindy same-load week high", () => {
    // loads 55, 45, 50, 50, 50, 50, 50 -> mean 50, variance 50/7 = 7.142857,
    // stddev 2.672612, monotony 50 / 2.672612 = 18.7083.
    const result = weeklyMonotony(days([55, 45, 50, 50, 50, 50, 50]));
    expect(result.monotony as number).toBeCloseTo(18.7083, 3);
    expect(result.strain as number).toBeCloseTo(350 * 18.7083, 1);
  });

  it("uses only the trailing 7 days of a longer series", () => {
    const long = days([...Array.from({ length: 30 }, () => 200), 70, 50, 60, 40, 80, 0, 100]);
    expect(weeklyMonotony(long)).toEqual(weeklyMonotony(days([70, 50, 60, 40, 80, 0, 100])));
  });

  it("is null for a flat week (stddev under 1 TSS would explode the ratio)", () => {
    expect(weeklyMonotony(days([50, 50, 50, 50, 50, 50, 50]))).toEqual({
      monotony: null,
      strain: null,
      load7d: 350,
    });
  });

  it("is null with fewer than 4 days carrying load", () => {
    const result = weeklyMonotony(days([0, 0, 0, 0, 60, 40, 80]));
    expect(result.monotony).toBeNull();
    expect(result.strain).toBeNull();
    expect(result.load7d).toBe(180);
  });

  it("is null with no history at all", () => {
    expect(weeklyMonotony([])).toEqual({ monotony: null, strain: null, load7d: 0 });
  });

  it("works on a short history using the days available", () => {
    // 5 days only: mean 40, variance 1000/5 = 200, stddev 14.142136,
    // monotony 40 / 14.142136 = 2.828427.
    const result = weeklyMonotony(days([20, 30, 40, 50, 60]));
    expect(result.load7d).toBe(200);
    expect(result.monotony as number).toBeCloseTo(2.8284, 3);
  });
});

describe("weeklySportLoad", () => {
  // Local (no Z) timestamps so the local-day conversion is timezone-stable.
  // 2026-01-05 and 2026-01-12 are Mondays.
  const loads = [
    { started_at: "2026-01-05T07:00:00", tss: 60, sport_type: "Run" },
    { started_at: "2026-01-07T18:00:00", tss: 40, sport_type: "TrailRun" },
    { started_at: "2026-01-08T18:00:00", tss: 30, sport_type: "VirtualRide" },
    { started_at: "2026-01-09T18:00:00", tss: 10, sport_type: "WeightTraining" },
    { started_at: "2026-01-11T09:00:00", tss: 20, sport_type: "Walk" },
    { started_at: "2026-01-14T06:00:00", tss: 55, sport_type: "Run" },
  ];

  it("buckets load by Monday and sport, folding everything but runs and rides into other", () => {
    expect(weeklySportLoad(loads, { from: "2026-01-05", to: "2026-01-18" })).toEqual([
      { date: "2026-01-05", load: { run: 100, bike: 30, other: 30 } },
      { date: "2026-01-12", load: { run: 55, bike: 0, other: 0 } },
    ]);
  });

  it("keeps each stack's total identical to the daily series' total for that week", () => {
    const weeks = weeklySportLoad(loads, { from: "2026-01-05", to: "2026-01-11" });
    const daily = dailyLoadSeries(loads).filter(
      (d) => d.date >= "2026-01-05" && d.date <= "2026-01-11"
    );
    expect(weeks.map(weeklyLoadTotal)).toEqual([daily.reduce((sum, d) => sum + d.load, 0)]);
  });

  it("excludes rows outside the range and keeps rest weeks as zero stacks", () => {
    // Range starts mid-week (Wednesday), so the first bar is still keyed to its
    // Monday but only counts the in-range days; 2026-01-19 has no activity.
    expect(weeklySportLoad(loads, { from: "2026-01-07", to: "2026-01-25" })).toEqual([
      { date: "2026-01-05", load: { run: 40, bike: 30, other: 30 } },
      { date: "2026-01-12", load: { run: 55, bike: 0, other: 0 } },
      { date: "2026-01-19", load: { run: 0, bike: 0, other: 0 } },
    ]);
  });

  it("treats a missing sport_type as other", () => {
    expect(
      weeklySportLoad([{ started_at: "2026-01-05T07:00:00", tss: 25, sport_type: null }], {
        from: "2026-01-05",
        to: "2026-01-11",
      })
    ).toEqual([{ date: "2026-01-05", load: { run: 0, bike: 0, other: 25 } }]);
  });
});

describe("loadSport", () => {
  it("keeps runs and rides and folds every other sport into other", () => {
    expect(loadSport("Run")).toBe("run");
    expect(loadSport("TrailRun")).toBe("run");
    expect(loadSport("VirtualRide")).toBe("bike");
    expect(loadSport("EBikeRide")).toBe("bike");
    expect(loadSport("WeightTraining")).toBe("other");
    expect(loadSport("Walk")).toBe("other");
    expect(loadSport("Swim")).toBe("other");
    expect(loadSport("Elliptical")).toBe("other");
  });

  it("treats a missing sport as other", () => {
    expect(loadSport(null)).toBe("other");
    expect(loadSport(undefined)).toBe("other");
  });
});

describe("availableLoadSports", () => {
  it("returns sports carrying positive load in stacking order", () => {
    expect(
      availableLoadSports([
        { tss: 10, sport_type: "WeightTraining" },
        { tss: 30, sport_type: "VirtualRide" },
        { tss: 60, sport_type: "Run" },
      ])
    ).toEqual(["run", "bike", "other"]);
  });

  it("omits sports whose rows all carry zero load", () => {
    expect(
      availableLoadSports([
        { tss: 60, sport_type: "Run" },
        { tss: 0, sport_type: "VirtualRide" },
        { tss: 0, sport_type: "Walk" },
      ])
    ).toEqual(["run"]);
  });

  it("keeps a sport that has any positive row", () => {
    expect(
      availableLoadSports([
        { tss: 0, sport_type: "Ride" },
        { tss: 5, sport_type: "Ride" },
      ])
    ).toEqual(["bike"]);
  });

  it("is empty when nothing carries load", () => {
    expect(availableLoadSports([])).toEqual([]);
    expect(availableLoadSports([{ tss: 0, sport_type: "Run" }])).toEqual([]);
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

describe("powerZones", () => {
  it("computes %FTP watt cut points for FTP 250", () => {
    const zones = powerZones(thresholds);
    expect(zones.map((z) => [z.min, z.max])).toEqual([
      [null, 138],
      [138, 188],
      [188, 225],
      [225, 263],
      [263, null],
    ]);
  });
});

describe("zoneIndexOf", () => {
  it("classifies heart rates with min inclusive and max exclusive", () => {
    const zones = hrZones(thresholds);
    expect(zoneIndexOf(120, zones)).toBe(0);
    expect(zoneIndexOf(143, zones)).toBe(1);
    expect(zoneIndexOf(157, zones)).toBe(1);
    expect(zoneIndexOf(158, zones)).toBe(2);
    expect(zoneIndexOf(176, zones)).toBe(4);
    expect(zoneIndexOf(210, zones)).toBe(4);
  });

  it("classifies paces, where a smaller value is faster", () => {
    const zones = paceZones(thresholds);
    expect(zoneIndexOf(400, zones)).toBe(0); // slow jog
    expect(zoneIndexOf(332, zones)).toBe(0);
    expect(zoneIndexOf(331, zones)).toBe(1);
    expect(zoneIndexOf(290, zones)).toBe(2);
    expect(zoneIndexOf(269, zones)).toBe(3); // threshold pace itself
    expect(zoneIndexOf(240, zones)).toBe(4);
  });

  it("classifies power against the %FTP bands", () => {
    const zones = powerZones(thresholds);
    expect(zoneIndexOf(100, zones)).toBe(0);
    expect(zoneIndexOf(200, zones)).toBe(2);
    expect(zoneIndexOf(250, zones)).toBe(3);
    expect(zoneIndexOf(300, zones)).toBe(4);
  });

  it("returns -1 when no zone matches", () => {
    expect(zoneIndexOf(150, [{ zone: 1, min: 200, max: 220 }])).toBe(-1);
  });
});

describe("zoneBoundsOf", () => {
  it("reads the ascending bpm boundaries off the HR zones", () => {
    const bounds = zoneBoundsOf(hrZones(thresholds), false);
    expect(bounds).toEqual([143, 158, 165, 176]);
    // Each boundary is where zoneIndexOf switches to the next zone up.
    bounds!.forEach((bound, i) => {
      expect(zoneIndexOf(bound, hrZones(thresholds))).toBe(i + 1);
      expect(zoneIndexOf(bound - 1, hrZones(thresholds))).toBe(i);
    });
  });

  it("reads the descending s/km boundaries off the pace zones", () => {
    const bounds = zoneBoundsOf(paceZones(thresholds), true);
    expect(bounds).toEqual([332, 299, 286, 269]);
    // Same rule on an inverted scale: at the boundary the athlete is in the
    // faster zone, one second per km slower and they are in the slower one.
    bounds!.forEach((bound, i) => {
      expect(zoneIndexOf(bound, paceZones(thresholds))).toBe(i);
      expect(zoneIndexOf(bound - 1, paceZones(thresholds))).toBe(i + 1);
    });
  });

  it("returns null rather than a short list when the zone set is malformed", () => {
    // A short list would shift every band colour and tooltip label by one zone
    // with nothing to signal it, so it must not be representable.
    expect(zoneBoundsOf(hrZones(thresholds).slice(0, 4), false)).toBeNull();
    const openMiddle = hrZones(thresholds).map((z) => (z.zone === 3 ? { ...z, max: null } : z));
    expect(zoneBoundsOf(openMiddle, false)).toBeNull();
    // Reading the wrong end of each zone also comes back empty-handed: HR zone
    // 1 has no min, pace zone 1 has no max.
    expect(zoneBoundsOf(hrZones(thresholds), true)).toBeNull();
    expect(zoneBoundsOf(paceZones(thresholds), false)).toBeNull();
  });
});

describe("zoneSeconds", () => {
  it("attributes each interval to the zone of its leading sample", () => {
    // 3 minutes: one in Z1, one in Z2, one in Z4. The final sample opens no
    // interval, so its zone (Z5) gets nothing.
    const zoneSec = zoneSeconds([0, 60, 120, 180], [130, 150, 170, 200], hrZones(thresholds));
    expect(zoneSec).toEqual([60, 60, 0, 60, 0]);
  });

  it("sums to the elapsed span the samples cover", () => {
    const zoneSec = zoneSeconds([0, 10, 20, 30], [150, 150, 150, 150], hrZones(thresholds));
    expect(zoneSec?.reduce((a, b) => a + b, 0)).toBe(30);
  });

  it("skips null samples, null timestamps and non-advancing time", () => {
    const zoneSec = zoneSeconds(
      [0, 30, 60, 60, 90, null, 150],
      [400, null, 260, 260, 260, 260, 260],
      paceZones(thresholds)
    );
    // 30 s of jogging (Z1), then 30 s faster than threshold (Z5). The null pace,
    // the zero-length interval and the null timestamp contribute nothing.
    expect(zoneSec).toEqual([30, 0, 0, 0, 30]);
  });

  it("returns null when no sample could be classified", () => {
    expect(zoneSeconds([0, 60, 120], [null, null, null], hrZones(thresholds))).toBeNull();
    expect(zoneSeconds([], [], hrZones(thresholds))).toBeNull();
  });
});

describe("easyHardPct", () => {
  it("splits Z1-2 from Z3-5", () => {
    expect(easyHardPct([600, 1800, 400, 200, 0])).toEqual({ easyPct: 80, hardPct: 20 });
  });

  it("always sums to 100 despite rounding", () => {
    const split = easyHardPct([1, 1, 1, 0, 0]);
    expect(split).toEqual({ easyPct: 67, hardPct: 33 });
  });

  it("returns null for an empty distribution", () => {
    expect(easyHardPct([0, 0, 0, 0, 0])).toBeNull();
  });
});

describe("weekLoadVsTrailing", () => {
  // Gap-filled series starting Monday 1 Jun 2026, one load per day.
  const from = (start: string, loads: number[]) => {
    const [y, m, d] = start.split("-").map(Number);
    return loads.map((load, i) => {
      const date = new Date(y, m - 1, d + i);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
        date.getDate()
      ).padStart(2, "0")}`;
      return { date: key, load };
    });
  };

  it("compares this week's load-to-date with the four preceding full weeks", () => {
    // 4 full weeks of 7 days at 10/20/30/40 TSS a day (70/140/210/280 totals),
    // then Mon-Wed of the current week at 50 each.
    const daily = from("2026-06-01", [
      ...Array.from({ length: 7 }, () => 10),
      ...Array.from({ length: 7 }, () => 20),
      ...Array.from({ length: 7 }, () => 30),
      ...Array.from({ length: 7 }, () => 40),
      50,
      50,
      50,
    ]);
    expect(daily[daily.length - 1].date).toBe("2026-07-01"); // Wednesday
    expect(weekLoadVsTrailing(daily)).toEqual({
      thisWeek: 150,
      trailing: { avg: (70 + 140 + 210 + 280) / 4, weeks: 4 },
    });
  });

  it("averages the four most recent complete weeks and no more", () => {
    // Six complete weeks (10/20/30/40/50/60 a day) then Monday of this week, so
    // the cap has to bite: averaging every covered week would give 245.
    const daily = from("2026-05-18", [
      ...Array.from({ length: 7 }, () => 10),
      ...Array.from({ length: 7 }, () => 20),
      ...Array.from({ length: 7 }, () => 30),
      ...Array.from({ length: 7 }, () => 40),
      ...Array.from({ length: 7 }, () => 50),
      ...Array.from({ length: 7 }, () => 60),
      5,
    ]);
    expect(daily[daily.length - 1].date).toBe("2026-06-29"); // Monday
    expect(weekLoadVsTrailing(daily)).toEqual({
      thisWeek: 5,
      // Weeks at 30/40/50/60 a day; the 10 and 20 weeks are outside the window.
      trailing: { avg: (210 + 280 + 350 + 420) / 4, weeks: 4 },
    });
  });

  it("averages only the preceding weeks the series fully covers", () => {
    // Series starts on the Monday two weeks back, so only those two count.
    const daily = from("2026-06-15", [
      ...Array.from({ length: 7 }, () => 10),
      ...Array.from({ length: 7 }, () => 30),
      60,
    ]);
    expect(weekLoadVsTrailing(daily)).toEqual({
      thisWeek: 60,
      trailing: { avg: (70 + 210) / 2, weeks: 2 },
    });
  });

  it("ignores a preceding week whose first days predate the series", () => {
    // Starts on a Tuesday: that week is incomplete, so no week is averaged.
    const daily = from("2026-06-23", [10, 10, 10, 10, 10, 10, 25]);
    expect(weekLoadVsTrailing(daily)).toEqual({ thisWeek: 25, trailing: null });
  });

  it("honours a custom window and counts rest days as zero", () => {
    const daily = from("2026-06-08", [
      ...Array.from({ length: 7 }, () => 20),
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      15,
    ]);
    expect(weekLoadVsTrailing(daily, 1)).toEqual({ thisWeek: 15, trailing: { avg: 0, weeks: 1 } });
    expect(weekLoadVsTrailing(daily, 2)).toEqual({ thisWeek: 15, trailing: { avg: 70, weeks: 2 } });
  });

  it("is empty-safe", () => {
    expect(weekLoadVsTrailing([])).toEqual({ thisWeek: 0, trailing: null });
  });
});

describe("formSnapshot", () => {
  // Ascending daily load, so every day has a distinct CTL and an off-by-one in
  // the selection cannot hide behind equal values.
  const series = (days: number) =>
    computePmc(
      Array.from({ length: days }, (_, i) => ({
        date: `2026-06-${String(i + 1).padStart(2, "0")}`,
        load: 10 * (i + 1),
      }))
    );

  it("reads the last PMC day plus its trailing CTL window, oldest first", () => {
    const pmc = series(20);
    const snapshot = formSnapshot(pmc);
    expect(snapshot?.tsb).toBe(pmc[19].tsb);
    expect(snapshot?.ctl).toBe(pmc[19].ctl);
    expect(pmc[18].ctl).not.toBe(pmc[19].ctl);
    expect(snapshot?.ctlTrend).toHaveLength(FORM_TREND_DAYS);
    expect(snapshot?.ctlTrend[0]).toBe(pmc[20 - FORM_TREND_DAYS].ctl);
    expect(snapshot?.ctlTrend[FORM_TREND_DAYS - 1]).toBe(pmc[19].ctl);
  });

  it("keeps the whole history when it is shorter than the window", () => {
    const pmc = series(5);
    expect(formSnapshot(pmc)?.ctlTrend).toEqual(pmc.map((point) => point.ctl));
  });

  it("is null for an empty PMC, so the log renders no strip at all", () => {
    expect(formSnapshot([])).toBeNull();
  });
});
