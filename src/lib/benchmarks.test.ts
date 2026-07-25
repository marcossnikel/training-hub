import { describe, expect, it } from "vitest";
import {
  bestEffortRecords,
  bestEffortsByDistance,
  estimateCriticalSpeed,
  pickReferenceEffort,
  predictRaceTimes,
  RIEGEL_FATIGUE_EXPONENT,
  type RunEffort,
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
