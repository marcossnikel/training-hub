import { describe, expect, it } from "vitest";
import { computeDecoupling, computeEf } from "./analysis";
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
