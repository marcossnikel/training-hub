import { describe, expect, it } from "vitest";
import {
  bestEffortRecords,
  bestEffortsByDistance,
  currentVdot,
  estimateCriticalSpeed,
  pickReferenceEffort,
  predictRaceTimes,
  RIEGEL_FATIGUE_EXPONENT,
  SEGMENT_DISTANCE_BY_NAME,
  vdotFromEffort,
  vdotTrend,
  MIN_VDOT_DISTANCE_M,
  VDOT_TREND_MONTHS,
  type RunEffort,
  type VdotEffort,
} from "@/lib/benchmarks";
import type { StoredBestEffort } from "@/lib/best-efforts";

function effort(overrides: Partial<RunEffort> = {}): RunEffort {
  return {
    distanceKm: 10,
    movingTimeS: 2400,
    isRace: false,
    name: null,
    sportType: "Run",
    date: null,
    ...overrides,
  };
}

function stored(overrides: Partial<StoredBestEffort> = {}): StoredBestEffort {
  return {
    name: "5K",
    distance_m: 5000,
    moving_time_s: 1200,
    elapsed_time_s: 1200,
    pr_rank: null,
    activity_name: "Interval session",
    is_race: false,
    date: "2026-07-01T10:00:00Z",
    ...overrides,
  };
}

describe("bestEffortsByDistance", () => {
  it("picks the fastest whole-activity effort at each distance", () => {
    const efforts = [
      effort({ distanceKm: 5, movingTimeS: 1200 }), // 5k in 20:00
      effort({ distanceKm: 5, movingTimeS: 1140 }), // 5k in 19:00 (faster)
      effort({ distanceKm: 10, movingTimeS: 2520 }), // 10k in 42:00
    ];
    const best = bestEffortsByDistance(efforts);

    expect(best.map((b) => b.distance)).toEqual(["5k", "10k"]);
    const fiveK = best.find((b) => b.distance === "5k");
    expect(fiveK?.movingTimeS).toBe(1140);
    const tenK = best.find((b) => b.distance === "10k");
    expect(tenK?.movingTimeS).toBe(2520);
  });

  it("excludes trail-named and sub-distance efforts", () => {
    const best = bestEffortsByDistance([
      effort({ distanceKm: 10, movingTimeS: 2520, name: "Serra Trail Run" }),
    ]);
    expect(best).toEqual([]);
  });

  it("excludes a TrailRun sport even when the name says nothing about trail", () => {
    // A half-length effort. As a "Run" it is a half best effort; as a "TrailRun"
    // it must be dropped from road benchmarks even though the name is neutral.
    const road = bestEffortsByDistance([
      effort({ distanceKm: 21, movingTimeS: 6000, sportType: "Run", name: "Sunday Long" }),
    ]);
    expect(road.map((b) => b.distance)).toEqual(["half"]);

    const trail = bestEffortsByDistance([
      effort({ distanceKm: 21, movingTimeS: 6000, sportType: "TrailRun", name: "Sunday Long" }),
    ]);
    expect(trail).toEqual([]);
  });

  it("only counts efforts within tolerance of the standard distance", () => {
    // A 3 km jog buckets into the "5k" UI band but is far from 5000 m: excluded.
    expect(bestEffortsByDistance([effort({ distanceKm: 3, movingTimeS: 900 })])).toEqual([]);
    // A genuine 5.0 km and a 4.8 km (within ±10%) both count as a 5k.
    expect(
      bestEffortsByDistance([effort({ distanceKm: 5.0, movingTimeS: 1200 })]).map((b) => b.distance)
    ).toEqual(["5k"]);
    expect(
      bestEffortsByDistance([effort({ distanceKm: 4.8, movingTimeS: 1200 })]).map((b) => b.distance)
    ).toEqual(["5k"]);
    // Boundary at ±10%: 4.5 km (exactly 10% short) is included; 4.49 km is not.
    expect(
      bestEffortsByDistance([effort({ distanceKm: 4.5, movingTimeS: 1200 })]).map((b) => b.distance)
    ).toEqual(["5k"]);
    expect(bestEffortsByDistance([effort({ distanceKm: 4.49, movingTimeS: 1200 })])).toEqual([]);
  });
});

describe("bestEffortRecords", () => {
  it("prefers a faster stored segment over the whole-activity effort", () => {
    const records = bestEffortRecords(
      [effort({ distanceKm: 5, movingTimeS: 1300 })],
      [stored({ moving_time_s: 1250, activity_name: "Tempo run" })]
    );
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      distance: "5k",
      movingTimeS: 1250,
      distanceKm: 5,
      source: "segment",
      name: "Tempo run",
    });
  });

  it("keeps the whole-activity effort when the fastest stored segment is slower", () => {
    // The acceptance property: the card can only get faster, never slower. Only a
    // fraction of runs have a cached payload, so the stored 5K may come from an easy
    // run while the whole-activity ladder holds a 5 km race.
    const records = bestEffortRecords(
      [effort({ distanceKm: 5, movingTimeS: 1140, isRace: true, name: "City 5k" })],
      [stored({ moving_time_s: 1500 })]
    );
    expect(records[0]).toMatchObject({ movingTimeS: 1140, source: "activity", name: "City 5k" });
  });

  it("takes an exact segment over an UNDER-DISTANCE whole activity with a smaller time", () => {
    // The live 10k case: 45:12 over 9.86 km is inside the ±10% band but was never a
    // 10 km, so a true 10.00 km segment in 45:35 is both faster per km and honest.
    // Pace is the ranking key precisely so the shorter run cannot win on raw time.
    const records = bestEffortRecords(
      [effort({ distanceKm: 9.86, movingTimeS: 2712 })],
      [stored({ name: "10K", distance_m: 10000, moving_time_s: 2735 })]
    );
    expect(records[0]).toMatchObject({ movingTimeS: 2735, distanceKm: 10, source: "segment" });
    expect(records[0].paceSPerKm).toBeLessThan(2712 / 9.86);
  });

  it("takes an exact segment over an OVER-DISTANCE whole activity with the same or worse time", () => {
    // The live half case: the whole activity covered 21.20 km in 1:38:32 (5912 s),
    // which reads 0.17 s/km "faster" than a true 21097 m segment in 1:38:07 (5887 s)
    // only because it ran 100 m further. It took 25 s LONGER to cover the distance,
    // so the pace edge is a rounding artifact and the segment must keep the row.
    const records = bestEffortRecords(
      [effort({ distanceKm: 21.2, movingTimeS: 5912, isRace: true, name: "Half marathon" })],
      [stored({ name: "Half-Marathon", distance_m: 21097, moving_time_s: 5887 })]
    );
    expect(records[0]).toMatchObject({ movingTimeS: 5887, distanceKm: 21.097, source: "segment" });
    // The whole activity was the faster PACE and still lost — the check is raw time.
    expect(5912 / 21.2).toBeLessThan(records[0].paceSPerKm);
  });

  it("keeps an over-distance whole activity that beat the segment on raw time too", () => {
    // Same shape as above but the activity genuinely ran the distance faster: 1:36:40
    // over 21.20 km beats the 1:38:07 segment on both time and pace, so it wins.
    const records = bestEffortRecords(
      [effort({ distanceKm: 21.2, movingTimeS: 5800 })],
      [stored({ name: "Half-Marathon", distance_m: 21097, moving_time_s: 5887 })]
    );
    expect(records[0]).toMatchObject({ movingTimeS: 5800, distanceKm: 21.2, source: "activity" });
  });

  it("falls back to the whole-activity ladder for distances with no stored row", () => {
    const records = bestEffortRecords(
      [effort({ distanceKm: 5, movingTimeS: 1300 }), effort({ distanceKm: 10, movingTimeS: 2700 })],
      [stored({ moving_time_s: 1250 })]
    );
    expect(records.map((r) => [r.distance, r.source])).toEqual([
      ["5k", "segment"],
      ["10k", "activity"],
    ]);
  });

  it("reports a stored segment at a distance never run as a whole activity", () => {
    const records = bestEffortRecords([], [stored({ name: "Half-Marathon", distance_m: 21097 })]);
    expect(records.map((r) => r.distance)).toEqual(["half"]);
  });

  it("keeps the segment on an exact pace tie, being the truer measurement", () => {
    const records = bestEffortRecords(
      [effort({ distanceKm: 5, movingTimeS: 1200 })],
      [stored({ moving_time_s: 1200 })]
    );
    expect(records[0].source).toBe("segment");
  });

  it("ignores stored names that are not standard distances", () => {
    // 20K is 1097 m short of a half marathon: mapping it would manufacture a
    // falsely fast half. 1K/1 mile/10 mile are not distances the ladder reports.
    const records = bestEffortRecords(
      [],
      [
        stored({ name: "20K", distance_m: 20000, moving_time_s: 5000 }),
        stored({ name: "10 mile", distance_m: 16090, moving_time_s: 4000 }),
        stored({ name: "1K", distance_m: 1000, moving_time_s: 200 }),
        stored({ name: "400m", distance_m: 400, moving_time_s: 70 }),
      ]
    );
    expect(records).toEqual([]);
  });

  // The assertion above cannot tell "not in the map" from "in the map but outside the
  // length tolerance": every row it passes is also the wrong length for the distance a
  // bad mapping would give it. These two pin the mapping on its own.
  it("pins the Strava-name mapping itself", () => {
    expect(SEGMENT_DISTANCE_BY_NAME).toEqual({
      "5K": "5k",
      "10K": "10k",
      "15K": "15k",
      "HALF-MARATHON": "half",
      "30K": "30k",
      MARATHON: "marathon",
    });
    // Keys are matched uppercased, so a lowercase key could never be found.
    for (const key of Object.keys(SEGMENT_DISTANCE_BY_NAME)) expect(key).toBe(key.toUpperCase());
    // "12k" has no Strava equivalent and must always fall back to whole activities.
    expect(Object.values(SEGMENT_DISTANCE_BY_NAME)).not.toContain("12k");
  });

  it("rejects a 20K row even when its length would pass as a half marathon", () => {
    // Tolerance-independent teeth for the mapping: a "20K" row measured at a genuine
    // 21097 m is INSIDE the 0.1% half-marathon band, so the only thing that can reject
    // it is the name not mapping to `half`.
    expect(
      bestEffortRecords([], [stored({ name: "20K", distance_m: 21097, moving_time_s: 5000 })])
    ).toEqual([]);
  });

  it("matches names case-insensitively but rejects a length that is not the distance", () => {
    expect(bestEffortRecords([], [stored({ name: "half-marathon", distance_m: 21097.5 })])).toEqual(
      [expect.objectContaining({ distance: "half" })]
    );
    // Only Strava's own rounding slack is allowed: 4900 m is not a 5K segment.
    expect(bestEffortRecords([], [stored({ distance_m: 4900 })])).toEqual([]);
  });

  it("drops stored rows with no usable distance or time", () => {
    expect(bestEffortRecords([], [stored({ moving_time_s: 0 })])).toEqual([]);
    expect(bestEffortRecords([], [stored({ distance_m: 0 })])).toEqual([]);
  });

  it("ranks stored rows by pace and carries the activity's race flag and date", () => {
    const records = bestEffortRecords(
      [],
      [
        stored({ moving_time_s: 1400, is_race: false, date: "2026-01-01T10:00:00Z" }),
        stored({ moving_time_s: 1320, is_race: true, date: "2026-02-02T10:00:00Z" }),
      ]
    );
    expect(records[0]).toMatchObject({
      movingTimeS: 1320,
      isRace: true,
      date: "2026-02-02T10:00:00Z",
      paceSPerKm: 264,
    });
  });

  it("returns records shortest to longest", () => {
    const records = bestEffortRecords(
      [effort({ distanceKm: 10, movingTimeS: 2700 })],
      [
        stored({ name: "30K", distance_m: 30000, moving_time_s: 9000 }),
        stored({ name: "5K", moving_time_s: 1250 }),
      ]
    );
    expect(records.map((r) => r.distance)).toEqual(["5k", "10k", "30k"]);
  });
});

describe("estimateCriticalSpeed", () => {
  // Two maximal race efforts define the line exactly:
  //   5 km in 20:00        -> (1200 s, 5000 m)
  //   half in 1:35:00      -> (5700 s, 21097.5 m)
  // CS  = (21097.5 - 5000) / (5700 - 1200) = 16097.5 / 4500 = 3.57722 m/s
  // D'  = 5000 - CS*1200 = 707.33 m
  // pace = 1000 / CS = 279.55 s/km
  it("fits CS, D' and threshold pace from two race distances", () => {
    const result = estimateCriticalSpeed([
      effort({ distanceKm: 5, movingTimeS: 1200, isRace: true }),
      effort({ distanceKm: 21.0975, movingTimeS: 5700, isRace: true }),
    ]);

    expect(result).not.toBeNull();
    expect(result!.cs).toBeCloseTo(3.5772, 3);
    expect(result!.dPrime).toBeCloseTo(707.33, 1);
    expect(result!.thresholdPaceSPerKm).toBeCloseTo(279.55, 1);
    expect(result!.rSquared).toBeCloseTo(1, 6);
    expect(result!.points).toHaveLength(2);
  });

  it("returns null with fewer than two distinct race distances", () => {
    // One race distance plus a faster NON-race effort at another distance:
    // non-race efforts are ignored, leaving a single race distance.
    const result = estimateCriticalSpeed([
      effort({ distanceKm: 10, movingTimeS: 2400, isRace: true }),
      effort({ distanceKm: 5, movingTimeS: 1000, isRace: false }),
    ]);
    expect(result).toBeNull();
  });

  it("returns null when two races share the same distance", () => {
    const result = estimateCriticalSpeed([
      effort({ distanceKm: 5, movingTimeS: 1200, isRace: true }),
      effort({ distanceKm: 5.05, movingTimeS: 1180, isRace: true }),
    ]);
    expect(result).toBeNull();
  });

  it("excludes a TrailRun race from the fit", () => {
    // 5k race + a 21 km TrailRun race: with trail dropped only ONE road distance
    // remains, so the fit is under-determined. As a plain Run it would fit.
    const withTrail = estimateCriticalSpeed([
      effort({ distanceKm: 5, movingTimeS: 1200, isRace: true, sportType: "Run" }),
      effort({ distanceKm: 21.0975, movingTimeS: 5700, isRace: true, sportType: "TrailRun" }),
    ]);
    expect(withTrail).toBeNull();

    const withRoad = estimateCriticalSpeed([
      effort({ distanceKm: 5, movingTimeS: 1200, isRace: true, sportType: "Run" }),
      effort({ distanceKm: 21.0975, movingTimeS: 5700, isRace: true, sportType: "Run" }),
    ]);
    expect(withRoad).not.toBeNull();
    expect(withRoad!.points).toHaveLength(2);
  });

  it("ignores non-race efforts so easy runs do not bias the fit", () => {
    const races = [
      effort({ distanceKm: 5, movingTimeS: 1200, isRace: true }),
      effort({ distanceKm: 21.0975, movingTimeS: 5700, isRace: true }),
    ];
    const withEasyRun = [...races, effort({ distanceKm: 10, movingTimeS: 3600, isRace: false })];

    const racesOnly = estimateCriticalSpeed(races);
    const withRun = estimateCriticalSpeed(withEasyRun);
    expect(withRun!.cs).toBeCloseTo(racesOnly!.cs, 6);
    expect(withRun!.points).toHaveLength(2);
  });
});

describe("predictRaceTimes (Riegel)", () => {
  // From a 10k in 40:00 (2400 s), predict a half marathon:
  //   t2 = 2400 * (21097.5 / 10000)^1.06 = 5295.37 s (~1:28:15)
  it("predicts a half-marathon time from a 10k reference", () => {
    const [half] = predictRaceTimes({ distanceKm: 10, movingTimeS: 2400 }, ["half"]);
    expect(half.distance).toBe("half");
    expect(half.predictedTimeS).toBeCloseTo(5295.37, 1);
    // pace = 5295.37 / 21.0975 km ~= 251.0 s/km
    expect(half.paceSPerKm).toBeCloseTo(251.0, 0);
  });

  it("uses the named 1.06 fatigue exponent", () => {
    const [tenK] = predictRaceTimes({ distanceKm: 5, movingTimeS: 1200 }, ["10k"]);
    const expected = 1200 * Math.pow(10000 / 5000, RIEGEL_FATIGUE_EXPONENT);
    expect(tenK.predictedTimeS).toBeCloseTo(2501.92, 1);
    expect(tenK.predictedTimeS).toBeCloseTo(expected, 6);
  });

  it("returns [] for a reference with no distance or time", () => {
    expect(predictRaceTimes({ distanceKm: 0, movingTimeS: 1200 })).toEqual([]);
    expect(predictRaceTimes({ distanceKm: 10, movingTimeS: 0 })).toEqual([]);
  });
});

describe("pickReferenceEffort", () => {
  it("prefers the fastest race over a faster easy run", () => {
    const ref = pickReferenceEffort([
      effort({ distanceKm: 5, movingTimeS: 1000, isRace: false, name: "Fast interval block" }),
      effort({ distanceKm: 10, movingTimeS: 2400, isRace: true, name: "10k race" }),
      effort({ distanceKm: 21.0975, movingTimeS: 5700, isRace: true, name: "Half race" }),
    ]);
    // Races only: 10k @ 240 s/km beats the half @ ~270 s/km.
    expect(ref?.name).toBe("10k race");
  });

  it("falls back to the fastest standard-distance run when there are no races", () => {
    const ref = pickReferenceEffort([
      effort({ distanceKm: 10, movingTimeS: 2700, name: "Easy" }),
      effort({ distanceKm: 10, movingTimeS: 2400, name: "Tempo" }),
    ]);
    expect(ref?.name).toBe("Tempo");
  });

  it("returns null when there is no standard-distance effort", () => {
    expect(pickReferenceEffort([])).toBeNull();
  });
});

describe("vdotFromEffort (Daniels-Gilbert)", () => {
  // Published VDOT table anchors. These are the ground truth for the formula: if
  // an implementation change moves them, the change is wrong.
  it("matches the published table at 5k and 10k", () => {
    // Precision 0 is exactly the "within 0.5" tolerance the anchors are stated with.
    expect(vdotFromEffort(5000, 20 * 60)).toBeCloseTo(49.8, 0);
    expect(vdotFromEffort(10000, 40 * 60)).toBeCloseTo(52, 0);
  });

  it("reads a real half marathon for what it is", () => {
    // Jundiaí HM: 21.2 km at 4:39/km (279 s/km). ~46 is CORRECT — the same runner's
    // 20:00 5k would be ~49.8, and a half run 40 s/km slower than 5k pace is a
    // lower VDOT. The formula must not be tuned to flatter the longer race.
    expect(vdotFromEffort(21200, 21.2 * 279)).toBeCloseTo(46.2, 0);
  });

  it("pins the fast-decaying term of the sustainable-fraction curve", () => {
    // An anchor at the SHORT end, right on the qualifying floor: 1500 m in 5:00.
    // 0.2989558·e^(-0.1932605·t) contributes ~0.114 of the denominator at 5 minutes
    // but only ~0.006 at 20, so with 20-minute-plus anchors alone that coefficient
    // could be wrong by 17% (0.35) with every other assertion still green. Value
    // computed from the published curves, not looked up in a table.
    expect(vdotFromEffort(1500, 5 * 60)).toBeCloseTo(54.46, 1);
  });

  it("rises with speed at a fixed distance and falls as the same pace is held longer", () => {
    expect(vdotFromEffort(5000, 19 * 60)).toBeGreaterThan(vdotFromEffort(5000, 20 * 60));
    // 4:00/km for 10k is a harder effort than 4:00/km for 5k.
    expect(vdotFromEffort(10000, 2400)).toBeGreaterThan(vdotFromEffort(5000, 1200));
  });
});

describe("vdotTrend", () => {
  const asOf = new Date(2026, 6, 24); // 24 Jul 2026, local

  function vdotEffort(date: string, distanceM: number, timeS: number): VdotEffort {
    return { date, distance_m: distanceM, moving_time_s: timeS };
  }

  it("reports the best VDOT of the trailing 90 days as current", () => {
    const trend = vdotTrend(
      [
        vdotEffort("2026-07-20T07:00:00", 5000, 20 * 60), // ~49.8, recent
        vdotEffort("2026-07-10T07:00:00", 5000, 22 * 60), // slower, also recent
        vdotEffort("2026-01-05T07:00:00", 5000, 18 * 60), // faster but long past
      ],
      asOf
    );
    expect(trend.current).toBeCloseTo(49.8, 1);
  });

  it("ignores efforts shorter than the qualifying distance", () => {
    // A 1 km segment in 3:00 is a far faster pace than any 5k, so if the distance
    // gate leaked it would dominate both the current value and its month.
    const trend = vdotTrend([vdotEffort("2026-07-20T07:00:00", 1000, 180)], asOf);
    expect(trend.current).toBeNull();
    expect(trend.months.every((m) => m.vdot === null)).toBe(true);
  });

  it("keeps the 1500 m boundary itself", () => {
    // The literal, not the constant: fed MIN_VDOT_DISTANCE_M this test passes at any
    // value the constant might drift to, and the 1000 m test above only catches 800.
    const trend = vdotTrend([vdotEffort("2026-07-20T07:00:00", 1500, 300)], asOf);
    expect(trend.current).not.toBeNull();
  });

  it("pins the qualifying floor at 1500 m", () => {
    // The VALUE itself, because /performance generates its "efforts under N m are
    // ignored" copy from this constant and nothing else asserts what N is.
    expect(MIN_VDOT_DISTANCE_M).toBe(1500);
  });

  it("counts both ends of the 90-day window, and no day more", () => {
    // 90 days ending 24 Jul 2026 runs from 26 Apr 2026 inclusive. The edge day counts;
    // the day before it — the 91st — does not.
    const edge = vdotTrend([vdotEffort("2026-04-26T07:00:00", 5000, 20 * 60)], asOf);
    expect(edge.current).toBeCloseTo(49.8, 1);
    const outside = vdotTrend([vdotEffort("2026-04-25T07:00:00", 5000, 20 * 60)], asOf);
    expect(outside.current).toBeNull();
  });

  it("returns 12 months ending in the current one, oldest first", () => {
    const { months } = vdotTrend([], asOf);
    expect(months).toHaveLength(VDOT_TREND_MONTHS);
    expect(months[0].month).toBe("2025-08");
    expect(months[11].month).toBe("2026-07");
    expect(months.every((m) => m.vdot === null)).toBe(true);
    expect(vdotTrend([], asOf).current).toBeNull();
  });

  it("keeps each month's best and leaves months with no effort null", () => {
    // The month's BEST effort is listed FIRST and its worst last, because
    // listBestEffortsForVdot returns rows date ASC: with the better one last, a
    // last-row-wins bug would pass this test and silently turn the trend into a
    // "most recent run" chart.
    const { months } = vdotTrend(
      [
        vdotEffort("2026-07-02T07:00:00", 5000, 20 * 60), // the month's best
        vdotEffort("2026-07-20T07:00:00", 5000, 21 * 60), // later, slower
        vdotEffort("2026-04-12T07:00:00", 10000, 44 * 60),
      ],
      asOf
    );
    const byMonth = new Map(months.map((m) => [m.month, m.vdot]));
    expect(byMonth.get("2026-07")).toBeCloseTo(vdotFromEffort(5000, 1200), 6);
    expect(byMonth.get("2026-04")).toBeCloseTo(vdotFromEffort(10000, 2640), 6);
    // Sparse coverage is the norm, so the untouched months stay explicitly empty.
    expect(byMonth.get("2026-05")).toBeNull();
    expect(byMonth.get("2026-06")).toBeNull();
  });

  it("gaps a month whose best effort was beaten inside the trailing window", () => {
    // The live June 2026 shape: a strong April, then a submaximal month. VDOT is only
    // defined for maximal efforts and fitness cannot fall 10 points and recover in
    // four weeks, so June is missing data, not a collapse — it must not be plotted.
    const { months, current } = vdotTrend(
      [
        vdotEffort("2026-04-12T07:00:00", 21097, 5887), // ~46.1, genuine
        vdotEffort("2026-06-27T07:00:00", 20000, 6977), // ~35.4, easy long run
        vdotEffort("2026-07-05T07:00:00", 30000, 8726), // ~45.1, genuine
      ],
      asOf
    );
    const byMonth = new Map(months.map((m) => [m.month, m.vdot]));
    expect(byMonth.get("2026-04")).toBeCloseTo(46.13, 1);
    expect(byMonth.get("2026-06")).toBeNull();
    expect(byMonth.get("2026-07")).toBeCloseTo(45.11, 1);
    // The chart's floor is now a real reading, so the four-point series stays legible.
    const plotted = months.filter((m) => m.vdot !== null).map((m) => m.vdot as number);
    expect(Math.min(...plotted)).toBeGreaterThan(45);
    // The last plotted month is the same number the tile shows: same window, same rows.
    expect(byMonth.get("2026-07")).toBe(current);
  });

  it("still shows a month that is lower than a LATER one, which is progression", () => {
    // The look-back must not become a look-ahead: an April below July is exactly what
    // improving looks like, and suppressing it would erase the trend it exists to show.
    const { months } = vdotTrend(
      [
        vdotEffort("2026-01-10T07:00:00", 5000, 23 * 60),
        vdotEffort("2026-07-10T07:00:00", 5000, 20 * 60),
      ],
      asOf
    );
    const byMonth = new Map(months.map((m) => [m.month, m.vdot]));
    expect(byMonth.get("2026-01")).toBeCloseTo(vdotFromEffort(5000, 23 * 60), 6);
    expect(byMonth.get("2026-07")).toBeCloseTo(vdotFromEffort(5000, 20 * 60), 6);
  });

  it("ignores efforts dated after asOf, so the tile and the chart see one dataset", () => {
    // A skewed watch clock (or the UTC/local mix in the row dates) can date a row past
    // today. Unbounded, it would feed `current` with no month to land in, and the card
    // would vanish while the zones agent was still handed the value.
    const { months, current } = vdotTrend([vdotEffort("2026-08-02T07:00:00", 5000, 18 * 60)], asOf);
    expect(current).toBeNull();
    expect(months.every((m) => m.vdot === null)).toBe(true);
  });

  it("reports the same current value whether or not the trend is built", () => {
    // The zones agent reads `currentVdot` and /performance reads `vdotTrend`; the two
    // must never quote the athlete different numbers.
    const rows = [
      vdotEffort("2026-07-05T07:00:00", 30000, 8726),
      vdotEffort("2026-06-27T07:00:00", 20000, 6977),
      vdotEffort("2026-04-12T07:00:00", 21097, 5887),
    ];
    expect(currentVdot(rows, asOf)).toBe(vdotTrend(rows, asOf).current);
    expect(currentVdot([], asOf)).toBeNull();
  });

  it("drops efforts outside the 12-month window and undated rows", () => {
    const { months, current } = vdotTrend(
      [
        vdotEffort("2025-07-20T07:00:00", 5000, 18 * 60), // 13 months back
        { date: null, distance_m: 5000, moving_time_s: 1080 },
      ],
      asOf
    );
    expect(months.every((m) => m.vdot === null)).toBe(true);
    expect(current).toBeNull();
  });
});
