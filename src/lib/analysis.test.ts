import { describe, expect, it } from "vitest";
import { computeDecoupling, computeEf, splitGap } from "./analysis";
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

describe("splitGap", () => {
  /** A flat one-kilometre run split at 5:00/km, with no Strava value of its own. */
  const flat: Parameters<typeof splitGap>[0] = {
    gradeAdjustedSpeedMPerS: null,
    paceSPerKm: 300,
    elevationDiffM: 0,
    distanceM: 1000,
    sportType: "Run",
  };

  it("prefers Strava's own grade-adjusted speed and does not mark it approximate", () => {
    // 2.5 m/s = 400 s/km, deliberately unrelated to the raw pace so the source
    // of the number is unambiguous.
    expect(splitGap({ ...flat, gradeAdjustedSpeedMPerS: 2.5 })).toEqual({
      paceSPerKm: 400,
      approximate: false,
    });
  });

  it("uses Strava's value on a non-run, because it is their number and not our model", () => {
    expect(splitGap({ ...flat, sportType: "Walk", gradeAdjustedSpeedMPerS: 2.5 })).toEqual({
      paceSPerKm: 400,
      approximate: false,
    });
  });

  it("makes an uphill split faster than its raw pace", () => {
    // +5% over a kilometre = 50 m of climb.
    const gap = splitGap({ ...flat, elevationDiffM: 50 });
    expect(gap?.paceSPerKm).toBeLessThan(300);
    expect(gap?.paceSPerKm).toBeCloseTo(300 / 1.165, 6);
    expect(gap?.approximate).toBe(true);
  });

  it("makes a downhill split slower than its raw pace", () => {
    const gap = splitGap({ ...flat, elevationDiffM: -50 });
    expect(gap?.paceSPerKm).toBeGreaterThan(300);
    expect(gap?.paceSPerKm).toBeCloseTo(300 / 0.91, 6);
  });

  it("clamps grade beyond ten percent in both directions", () => {
    const steepUp = splitGap({ ...flat, elevationDiffM: 300 });
    expect(steepUp?.paceSPerKm).toBeCloseTo(300 / 1.33, 6);
    const steepDown = splitGap({ ...flat, elevationDiffM: -300 });
    expect(steepDown?.paceSPerKm).toBeCloseTo(300 / 0.82, 6);
  });

  it("adjusts a grade sitting exactly on the clamp boundary", () => {
    // Exactly +10% and exactly -10% are inside the clamp: the boundary value is
    // adjusted in full and matches what a steeper grade clamps down to.
    const up = splitGap({ ...flat, elevationDiffM: 100 });
    expect(up?.paceSPerKm).toBeCloseTo(300 / 1.33, 6);
    expect(up?.paceSPerKm).toBe(splitGap({ ...flat, elevationDiffM: 300 })?.paceSPerKm);
    const down = splitGap({ ...flat, elevationDiffM: -100 });
    expect(down?.paceSPerKm).toBeCloseTo(300 / 0.82, 6);
    expect(down?.paceSPerKm).toBe(splitGap({ ...flat, elevationDiffM: -300 })?.paceSPerKm);
  });

  it("falls back to the approximation when Strava's value is present but unusable", () => {
    for (const unusable of [0, -1]) {
      expect(splitGap({ ...flat, elevationDiffM: 50, gradeAdjustedSpeedMPerS: unusable })).toEqual({
        paceSPerKm: 300 / 1.165,
        approximate: true,
      });
      // ...and on a non-run there is no fallback to reach, so there is no GAP.
      expect(
        splitGap({
          ...flat,
          sportType: "Walk",
          elevationDiffM: 50,
          gradeAdjustedSpeedMPerS: unusable,
        })
      ).toBeNull();
    }
  });

  it("does not approximate a non-run: the coefficients are running economy", () => {
    // A kilometre walked at 12:00/km with 50 m of climb would otherwise be
    // credited 102 s/km by a model of running.
    expect(
      splitGap({ ...flat, sportType: "Walk", paceSPerKm: 720, elevationDiffM: 50 })
    ).toBeNull();
    expect(splitGap({ ...flat, sportType: "Swim", elevationDiffM: 50 })).toBeNull();
    expect(splitGap({ ...flat, sportType: "Workout", elevationDiffM: 50 })).toBeNull();
    expect(splitGap({ ...flat, sportType: null, elevationDiffM: 50 })).toBeNull();
  });

  it("gives no GAP to a split too short to carry a real grade", () => {
    // A live 9.8 m trailing fragment: a 0.2 m delta reads as a 2% grade.
    expect(splitGap({ ...flat, distanceM: 9.8, elevationDiffM: 0.2 })).toBeNull();
    // Just under the 100 m floor, at a grade that would otherwise be adjusted.
    expect(splitGap({ ...flat, distanceM: 99, elevationDiffM: 4.95 })).toBeNull();
    // Exactly at the floor, same +5%, is adjusted.
    expect(splitGap({ ...flat, distanceM: 100, elevationDiffM: 5 })).toEqual({
      paceSPerKm: 300 / 1.165,
      approximate: true,
    });
  });

  it("gives no GAP when Strava's own value only reprints the raw pace", () => {
    // Activity 754: every split's grade-adjusted speed equals its average speed.
    expect(splitGap({ ...flat, gradeAdjustedSpeedMPerS: 1000 / 300 })).toBeNull();
    // Half a second per km apart still renders as the same 5:00/km.
    expect(splitGap({ ...flat, gradeAdjustedSpeedMPerS: 1000 / 300.5 })).toBeNull();
    // A full second per km apart is a difference the table can show.
    expect(splitGap({ ...flat, gradeAdjustedSpeedMPerS: 1000 / 301 })).toEqual({
      paceSPerKm: 301,
      approximate: false,
    });
  });

  it("gives no GAP when the approximation is a no-op", () => {
    // A flat outdoor split, and an indoor split whose payload carries a literal
    // 0 rather than null, both adjust to exactly the raw pace.
    expect(splitGap(flat)).toBeNull();
    // A 0.2 m delta over a kilometre is well under a second per km of credit.
    expect(splitGap({ ...flat, elevationDiffM: 0.2 })).toBeNull();
  });

  it("is null for an indoor split, which has no elevation to adjust by", () => {
    expect(splitGap({ ...flat, elevationDiffM: null })).toBeNull();
  });

  it("is null without a usable raw pace or distance", () => {
    expect(splitGap({ ...flat, paceSPerKm: null, elevationDiffM: 50 })).toBeNull();
    expect(splitGap({ ...flat, distanceM: 0, elevationDiffM: 50 })).toBeNull();
    expect(splitGap({ ...flat, distanceM: null, elevationDiffM: 50 })).toBeNull();
  });
});
