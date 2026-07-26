import { describe, expect, it } from "vitest";
import {
  computeDecoupling,
  computeDecouplingHalves,
  computeEf,
  efBasisFor,
  meaningfulGap,
  splitGap,
} from "./analysis";
import type { ActivityStreams } from "./streams";

/**
 * A synthetic cached stream: one sample every `stepS` seconds from 0 to
 * `durationS`, with heart rate, pace and watts written by callbacks of elapsed
 * time so a test can describe drift declaratively.
 */
function streamOf({
  durationS,
  stepS = 10,
  hr,
  paceSPerKm,
  watts,
}: {
  durationS: number;
  stepS?: number;
  hr?: (t: number) => number | null;
  paceSPerKm?: (t: number) => number | null;
  watts?: (t: number) => number | null;
}): ActivityStreams {
  const times: number[] = [];
  for (let t = 0; t <= durationS; t += stepS) times.push(t);
  const series = (fn?: (t: number) => number | null) => (fn ? times.map(fn) : null);
  return {
    n: times.length,
    timeS: times,
    distanceKm: times.map(() => null),
    heartrate: series(hr),
    paceSPerKm: series(paceSPerKm),
    watts: series(watts),
    cadence: null,
    altitudeM: null,
    gradePct: null,
  };
}

const HOUR_S = 3600;

describe("computeEf", () => {
  it("divides ride power by heart rate", () => {
    expect(computeEf({ basis: "power", watts: 210, avgHr: 140 })).toBeCloseTo(1.5, 5);
  });

  it("divides run speed in metres per minute by heart rate", () => {
    // 10 km in 50 min = 200 m/min.
    expect(
      computeEf({ basis: "speed", distanceKm: 10, movingTimeS: 3000, avgHr: 150 })
    ).toBeCloseTo(200 / 150, 5);
  });

  it("measures a run against its grade-adjusted pace when one is supplied", () => {
    // The same 10 km in 50 min, but the hills made it worth a 250 s/km effort:
    // 240 m/min rather than the 200 m/min the clock shows.
    expect(
      computeEf({ basis: "speed", distanceKm: 10, movingTimeS: 3000, avgHr: 150, gapSPerKm: 250 })
    ).toBeCloseTo(240 / 150, 5);
    // An absent or unusable GAP leaves the raw pace in charge.
    for (const gapSPerKm of [null, undefined, 0]) {
      expect(
        computeEf({ basis: "speed", distanceKm: 10, movingTimeS: 3000, avgHr: 150, gapSPerKm })
      ).toBeCloseTo(200 / 150, 5);
    }
  });

  it("is null without heart rate", () => {
    expect(computeEf({ basis: "power", watts: 210, avgHr: null })).toBeNull();
    expect(computeEf({ basis: "power", watts: 210, avgHr: 0 })).toBeNull();
    expect(
      computeEf({ basis: "speed", distanceKm: 10, movingTimeS: 3000, avgHr: null })
    ).toBeNull();
  });

  it("is null without the output signal", () => {
    expect(computeEf({ basis: "power", watts: null, avgHr: 140 })).toBeNull();
    expect(computeEf({ basis: "power", watts: 0, avgHr: 140 })).toBeNull();
    expect(
      computeEf({ basis: "speed", distanceKm: null, movingTimeS: 3000, avgHr: 150 })
    ).toBeNull();
    expect(computeEf({ basis: "speed", distanceKm: 10, movingTimeS: null, avgHr: 150 })).toBeNull();
  });
});

describe("computeDecoupling", () => {
  it("is zero for a steady run", () => {
    const streams = streamOf({ durationS: HOUR_S, hr: () => 150, paceSPerKm: () => 300 });
    expect(computeDecoupling({ streams, basis: "speed", movingTimeS: HOUR_S })).toBeCloseTo(0, 6);
  });

  it("reports the efficiency lost in the second half of a run", () => {
    // Same pace throughout, heart rate 150 -> 160 exactly at the post-warm-up
    // midpoint: EF falls by 1 - 150/160 = 6.25%.
    const streams = streamOf({
      durationS: HOUR_S,
      hr: (t) => (t <= 1950 ? 150 : 160),
      paceSPerKm: () => 300,
    });
    expect(computeDecoupling({ streams, basis: "speed", movingTimeS: HOUR_S })).toBeCloseTo(
      6.25,
      2
    );
  });

  it("reports negative decoupling when efficiency improves", () => {
    const streams = streamOf({
      durationS: HOUR_S,
      hr: () => 150,
      paceSPerKm: (t) => (t <= 1950 ? 320 : 300),
    });
    const value = computeDecoupling({ streams, basis: "speed", movingTimeS: HOUR_S });
    expect(value).not.toBeNull();
    expect(value as number).toBeLessThan(0);
  });

  it("drops the first five minutes, so a warm-up ramp is not drift", () => {
    // A cold first 5 min would inflate first-half EF and invent decoupling;
    // once dropped, the rest of the effort is perfectly steady.
    const streams = streamOf({
      durationS: HOUR_S,
      hr: (t) => (t < 300 ? 100 : 150),
      paceSPerKm: () => 300,
    });
    expect(computeDecoupling({ streams, basis: "speed", movingTimeS: HOUR_S })).toBeCloseTo(0, 6);
  });

  it("uses watts on the power basis", () => {
    const streams = streamOf({
      durationS: HOUR_S,
      hr: () => 150,
      watts: (t) => (t <= 1950 ? 200 : 180),
    });
    expect(computeDecoupling({ streams, basis: "power", movingTimeS: HOUR_S })).toBeCloseTo(10, 2);
  });

  it("ignores watts on the speed basis (a watch's run power is not a measurement)", () => {
    const streams = streamOf({
      durationS: HOUR_S,
      hr: () => 150,
      paceSPerKm: () => 300,
      watts: (t) => (t <= 1950 ? 300 : 200),
    });
    expect(computeDecoupling({ streams, basis: "speed", movingTimeS: HOUR_S })).toBeCloseTo(0, 6);
  });

  it("is null for efforts under 40 minutes", () => {
    const streams = streamOf({ durationS: 2100, hr: () => 150, paceSPerKm: () => 300 });
    expect(computeDecoupling({ streams, basis: "speed", movingTimeS: 2100 })).toBeNull();
  });

  it("is null without a stream, heart rate or the output signal", () => {
    expect(computeDecoupling({ streams: null, basis: "speed", movingTimeS: HOUR_S })).toBeNull();
    const noHr = streamOf({ durationS: HOUR_S, paceSPerKm: () => 300 });
    expect(computeDecoupling({ streams: noHr, basis: "speed", movingTimeS: HOUR_S })).toBeNull();
    const noWatts = streamOf({ durationS: HOUR_S, hr: () => 150, paceSPerKm: () => 300 });
    expect(computeDecoupling({ streams: noWatts, basis: "power", movingTimeS: HOUR_S })).toBeNull();
  });

  it("is null when the samples carry no usable pace", () => {
    const stopped = streamOf({ durationS: HOUR_S, hr: () => 150, paceSPerKm: () => null });
    expect(computeDecoupling({ streams: stopped, basis: "speed", movingTimeS: HOUR_S })).toBeNull();
  });
});

describe("computeDecouplingHalves", () => {
  it("reports each half's mean heart rate beside the drift", () => {
    const streams = streamOf({
      durationS: HOUR_S,
      hr: (t) => (t <= 1950 ? 150 : 160),
      paceSPerKm: () => 300,
    });
    const halves = computeDecouplingHalves({ streams, basis: "speed", movingTimeS: HOUR_S });
    expect(halves).not.toBeNull();
    expect(halves!.firstHalfHr).toBeCloseTo(150, 6);
    expect(halves!.secondHalfHr).toBeCloseTo(160, 6);
    expect(halves!.driftPct).toBeCloseTo(6.25, 2);
  });

  it("agrees with computeDecoupling on every input, being the same reading", () => {
    const streams = streamOf({
      durationS: HOUR_S,
      hr: (t) => 150 + t / 600,
      paceSPerKm: () => 300,
    });
    const input = { streams, basis: "speed" as const, movingTimeS: HOUR_S };
    expect(computeDecouplingHalves(input)!.driftPct).toBe(computeDecoupling(input));
    const short = { streams, basis: "speed" as const, movingTimeS: 600 };
    expect(computeDecouplingHalves(short)).toBeNull();
    expect(computeDecoupling(short)).toBeNull();
  });
});

describe("efBasisFor", () => {
  it("measures a run on speed", () => {
    expect(efBasisFor("Run", false)).toBe("speed");
    expect(efBasisFor("TrailRun", false)).toBe("speed");
  });

  it("measures a ride on power only when the wattage was measured", () => {
    expect(efBasisFor("Ride", true)).toBe("power");
    expect(efBasisFor("VirtualRide", true)).toBe("power");
    // Strava's estimate would restate speed with extra error.
    expect(efBasisFor("Ride", false)).toBeNull();
  });

  it("gives every other sport no basis", () => {
    expect(efBasisFor("Walk", false)).toBeNull();
    expect(efBasisFor("Swim", false)).toBeNull();
    expect(efBasisFor("WeightTraining", true)).toBeNull();
    expect(efBasisFor(null, false)).toBeNull();
  });
});

describe("splitGap", () => {
  /** A one-kilometre run split at 5:00/km, with no Strava value of its own. */
  const flat: Parameters<typeof splitGap>[0] = {
    gradeAdjustedSpeedMPerS: null,
    paceSPerKm: 300,
    distanceM: 1000,
  };

  it("reports Strava's own grade-adjusted speed as a pace", () => {
    // 2.5 m/s = 400 s/km, deliberately unrelated to the raw pace so the source
    // of the number is unambiguous.
    expect(splitGap({ ...flat, gradeAdjustedSpeedMPerS: 2.5 })).toBe(400);
  });

  it("is sport-agnostic: Strava's value is their number, not our model", () => {
    // A walk's split carries the same field, and nothing here re-derives it.
    expect(splitGap({ ...flat, paceSPerKm: 720, gradeAdjustedSpeedMPerS: 2.5 })).toBe(400);
  });

  it("is null without a usable value from Strava", () => {
    // No local approximation stands behind this any more: the per-sample GAP in
    // stream-metrics.ts is the only grade adjustment this app computes itself.
    expect(splitGap(flat)).toBeNull();
    for (const unusable of [0, -1]) {
      expect(splitGap({ ...flat, gradeAdjustedSpeedMPerS: unusable })).toBeNull();
    }
  });

  it("gives no GAP to a split too short to carry a real grade", () => {
    // A live 9.8 m trailing fragment, and just under the 100 m floor.
    expect(splitGap({ ...flat, distanceM: 9.8, gradeAdjustedSpeedMPerS: 2.5 })).toBeNull();
    expect(splitGap({ ...flat, distanceM: 99, gradeAdjustedSpeedMPerS: 2.5 })).toBeNull();
    // Exactly at the floor is adjusted.
    expect(splitGap({ ...flat, distanceM: 100, gradeAdjustedSpeedMPerS: 2.5 })).toBe(400);
  });

  it("gives no GAP when Strava's own value only reprints the raw pace", () => {
    // Activity 754: every split's grade-adjusted speed equals its average speed.
    expect(splitGap({ ...flat, gradeAdjustedSpeedMPerS: 1000 / 300 })).toBeNull();
    // Half a second per km apart still renders as the same 5:00/km.
    expect(splitGap({ ...flat, gradeAdjustedSpeedMPerS: 1000 / 300.5 })).toBeNull();
    // A full second per km apart is a difference the table can show.
    expect(splitGap({ ...flat, gradeAdjustedSpeedMPerS: 1000 / 301 })).toBe(301);
  });

  it("is null without a usable raw pace or distance to compare against", () => {
    expect(splitGap({ ...flat, paceSPerKm: null, gradeAdjustedSpeedMPerS: 2.5 })).toBeNull();
    expect(splitGap({ ...flat, distanceM: 0, gradeAdjustedSpeedMPerS: 2.5 })).toBeNull();
    expect(splitGap({ ...flat, distanceM: null, gradeAdjustedSpeedMPerS: 2.5 })).toBeNull();
  });
});

describe("meaningfulGap", () => {
  it("suppresses an adjustment that would reprint the pace beside it", () => {
    // The whole-activity tile has the same failure the splits table has: on 14 of
    // the 32 streamed runs here the GAP rounds to exactly the pace next to it
    // (activity 14 renders 5:05 / 5:05, activity 48 6:16 / 6:16) while the EF
    // tooltip switches to claiming a grade adjustment of 0.02%.
    expect(meaningfulGap(305, 305)).toBeNull();
    expect(meaningfulGap(305.4, 305)).toBeNull();
    expect(meaningfulGap(304.6, 305)).toBeNull();
  });

  it("passes an adjustment the m:ss can actually show, in either direction", () => {
    expect(meaningfulGap(304, 305)).toBe(304);
    expect(meaningfulGap(306, 305)).toBe(306);
    expect(meaningfulGap(240, 305)).toBe(240);
  });

  it("is null when there is no pace to compare against, or no GAP", () => {
    expect(meaningfulGap(300, null)).toBeNull();
    expect(meaningfulGap(null, 300)).toBeNull();
    expect(meaningfulGap(undefined, undefined)).toBeNull();
    expect(meaningfulGap(300, 0)).toBeNull();
    expect(meaningfulGap(0, 300)).toBeNull();
  });
});
