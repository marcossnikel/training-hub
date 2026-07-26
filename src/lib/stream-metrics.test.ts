import { describe, expect, it } from "vitest";
import {
  computeStreamMetrics,
  hasAnyMetric,
  metricsActivityOf,
  normalizedPower,
  parseZoneSecs,
  serializeZoneSecs,
  type MetricsActivity,
} from "./stream-metrics";
import type { AthleteThresholds } from "./fitness";
import type { ActivityStreams } from "./streams";

/**
 * A synthetic stream at an arbitrary sample rate: one sample every `stepS`
 * seconds from 0 to `durationS`, each channel written by a callback of elapsed
 * time. `stepS = 1` stands in for a full-resolution Strava payload.
 */
function streamOf({
  durationS,
  stepS = 1,
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

// LTHR 176 → HR zone bounds 143 / 158 / 165 / 176.
// Threshold pace 300 s/km → pace zone bounds 370 / 333 / 319 / 300 s/km.
const THRESHOLDS: AthleteThresholds = {
  maxHr: 199,
  restingHr: 50,
  lthr: 176,
  thresholdPaceSPerKm: 300,
  ftpW: 200,
  restingHrEstimated: true,
  ftpProvisional: true,
  updatedAt: null,
};

const RUN: MetricsActivity = {
  sportType: "Run",
  distanceKm: 12,
  movingTimeS: 3600,
  avgHr: 150,
  powerW: null,
  hasRealPower: false,
};

const RIDE: MetricsActivity = {
  sportType: "Ride",
  distanceKm: 40,
  movingTimeS: 3600,
  avgHr: 140,
  powerW: 210,
  hasRealPower: true,
};

describe("normalizedPower", () => {
  it("equals the average for a constant power trace", () => {
    const stream = streamOf({ durationS: 1200, watts: () => 200 });
    expect(normalizedPower(stream.timeS, stream.watts!)).toBeCloseTo(200, 6);
  });

  it("exceeds the average when power alternates around it", () => {
    // 60 s at 100 W, 60 s at 300 W, repeated: average 200 W, but the surges cost
    // more than the easy blocks give back.
    const stream = streamOf({
      durationS: 1200,
      watts: (t) => (Math.floor(t / 60) % 2 === 0 ? 100 : 300),
    });
    const np = normalizedPower(stream.timeS, stream.watts!);
    expect(np).not.toBeNull();
    expect(np!).toBeGreaterThan(200);
    // The 30 s window barely smooths 60 s blocks, so it approaches the
    // unsmoothed fourth-power mean of 100/300 W (≈ 252 W) without reaching it.
    expect(np!).toBeLessThan(252);
  });

  // The fourth power and the fourth root are the metric, not an implementation
  // detail: a square/square-root pair (a root-mean-square) or a 1/1 pair (the
  // plain average) both satisfy "above the average, below the unsmoothed
  // quartic mean" while quietly under-reading every surging ride. These two
  // pin the exponents to the one value they can produce together.
  it("is the fourth-power mean of the rolling averages, not a root-mean-square", () => {
    const stream = streamOf({
      durationS: 1200,
      watts: (t) => (Math.floor(t / 60) % 2 === 0 ? 100 : 300),
    });
    // Same trace as above. Fourth power/fourth root: 239.372. Root-mean-square
    // would read 216.237, the plain mean 200, a sixth-power mean 253.195.
    expect(normalizedPower(stream.timeS, stream.watts!)).toBeCloseTo(239.372, 3);
  });

  it("reads a linear ramp at its fourth-power mean", () => {
    // 0 to 400 W over 20 minutes: mean 200 W, quartic mean 264.938,
    // root-mean-square 229.412, sixth-power mean 286.159.
    const stream = streamOf({ durationS: 1200, watts: (t) => (t / 1200) * 400 });
    expect(normalizedPower(stream.timeS, stream.watts!)).toBeCloseTo(264.938, 3);
  });

  it("does not credit a recording gap at the last recorded wattage", () => {
    // 5 min at 300 W, a 20-minute stop (auto-pause: no samples at all), 5 min at
    // 100 W. Holding 300 W across the stop reads 286.97 W — more than the hard
    // block deserves and more than either block was ridden at.
    const timeS: number[] = [];
    const watts: number[] = [];
    for (let t = 0; t <= 300; t++) {
      timeS.push(t);
      watts.push(300);
    }
    for (let t = 0; t <= 300; t++) {
      timeS.push(1500 + t);
      watts.push(100);
    }
    const gapped = normalizedPower(timeS, watts);
    const contiguous = streamOf({ durationS: 600, watts: (t) => (t < 300 ? 300 : 100) });
    const backToBack = normalizedPower(contiguous.timeS, contiguous.watts!)!;

    expect(gapped).toBeCloseTo(254.814, 3);
    // The capped span still credits 30 s of the hard block's wattage across the
    // start of the pause, so the gapped trace reads a little above the same two
    // blocks recorded back to back (251.67 W) — a few watts, not 35.
    expect(gapped!).toBeGreaterThan(backToBack);
    expect(gapped! - backToBack).toBeLessThan(5);
  });

  it("smooths surges shorter than the window", () => {
    // The same 50/50 duty cycle in 5 s blocks: six blocks fit exactly inside the
    // 30 s window, so every rolling average is the plain 200 W and the surges
    // vanish — which is the point of averaging before raising to the fourth.
    const stream = streamOf({
      durationS: 1200,
      watts: (t) => (Math.floor(t / 5) % 2 === 0 ? 100 : 300),
    });
    expect(normalizedPower(stream.timeS, stream.watts!)).toBeCloseTo(200, 6);
  });

  it("is time-weighted, so an irregular sample rate reads the same", () => {
    const dense = streamOf({ durationS: 600, stepS: 1, watts: () => 180 });
    const sparse = streamOf({ durationS: 600, stepS: 7, watts: () => 180 });
    expect(normalizedPower(sparse.timeS, sparse.watts!)).toBeCloseTo(
      normalizedPower(dense.timeS, dense.watts!)!,
      6
    );
  });

  it("is null for a trace shorter than one rolling window", () => {
    const stream = streamOf({ durationS: 20, watts: () => 200 });
    expect(normalizedPower(stream.timeS, stream.watts!)).toBeNull();
  });

  it("is null when the trace has no usable samples", () => {
    expect(normalizedPower([0, 1, 2], [null, null, null])).toBeNull();
  });
});

describe("computeStreamMetrics zone seconds", () => {
  it("attributes heart-rate seconds to the right zones", () => {
    // 600 s at 130 bpm (Z1), 600 s at 150 (Z2), 600 s at 170 (Z4).
    const stream = streamOf({
      durationS: 1800,
      stepS: 10,
      hr: (t) => (t < 600 ? 130 : t < 1200 ? 150 : 170),
    });
    const metrics = computeStreamMetrics({ streams: stream, activity: RUN }, THRESHOLDS);
    expect(metrics.hrZoneSecs).toEqual([600, 600, 0, 600, 0]);
  });

  it("attributes pace seconds to the right zones on a run", () => {
    // 900 s at 420 s/km (Z1, slower than 370), 900 s at 290 (Z5, faster than 300).
    const stream = streamOf({
      durationS: 1800,
      stepS: 10,
      paceSPerKm: (t) => (t < 900 ? 420 : 290),
    });
    const metrics = computeStreamMetrics({ streams: stream, activity: RUN }, THRESHOLDS);
    expect(metrics.paceZoneSecs).toEqual([900, 0, 0, 0, 900]);
  });

  it("gives a ride heart-rate zones but no pace zones", () => {
    const stream = streamOf({ durationS: 600, stepS: 10, hr: () => 150, paceSPerKm: () => 120 });
    const metrics = computeStreamMetrics({ streams: stream, activity: RIDE }, THRESHOLDS);
    expect(metrics.hrZoneSecs).toEqual([0, 600, 0, 0, 0]);
    expect(metrics.paceZoneSecs).toBeNull();
  });

  it("returns null zone arrays when the channel is absent", () => {
    // No heart rate anywhere — not in the stream, not on the activity — so there
    // is nothing to store: no zones, and no efficiency factor to divide.
    const stream = streamOf({ durationS: 600, stepS: 10, watts: () => 100 });
    const metrics = computeStreamMetrics(
      { streams: stream, activity: { ...RUN, avgHr: null } },
      THRESHOLDS
    );
    expect(metrics.hrZoneSecs).toBeNull();
    expect(metrics.paceZoneSecs).toBeNull();
    expect(hasAnyMetric(metrics)).toBe(false);
  });
});

describe("computeStreamMetrics aerobic quality", () => {
  it("reads a run's efficiency factor off its summary averages", () => {
    const stream = streamOf({ durationS: 600, stepS: 10, hr: () => 150 });
    const metrics = computeStreamMetrics({ streams: stream, activity: RUN }, THRESHOLDS);
    // 12 km in 60 min = 200 m/min, over 150 bpm.
    expect(metrics.ef).toBeCloseTo(200 / 150, 6);
  });

  it("reads a ride's efficiency factor off power and heart rate", () => {
    const stream = streamOf({ durationS: 600, stepS: 10, hr: () => 140, watts: () => 210 });
    const metrics = computeStreamMetrics({ streams: stream, activity: RIDE }, THRESHOLDS);
    expect(metrics.ef).toBeCloseTo(210 / 140, 6);
  });

  it("sees drift as positive decoupling on a long run", () => {
    // Steady pace, heart rate climbing after the warm-up: efficiency per beat
    // falls, so the reading is positive.
    const stream = streamOf({
      durationS: 5400,
      stepS: 10,
      hr: (t) => 145 + t / 300,
      paceSPerKm: () => 300,
    });
    const metrics = computeStreamMetrics({ streams: stream, activity: RUN }, THRESHOLDS);
    expect(metrics.decouplingPct).not.toBeNull();
    expect(metrics.decouplingPct!).toBeGreaterThan(0);
  });

  it("gives neither efficiency factor nor decoupling to a sport with no basis", () => {
    const walk: MetricsActivity = { ...RUN, sportType: "Walk" };
    const stream = streamOf({ durationS: 5400, stepS: 10, hr: () => 120, paceSPerKm: () => 600 });
    const metrics = computeStreamMetrics({ streams: stream, activity: walk }, THRESHOLDS);
    expect(metrics.ef).toBeNull();
    expect(metrics.decouplingPct).toBeNull();
    // Heart-rate zones still land: every sport that recorded a trace gets those.
    expect(metrics.hrZoneSecs).not.toBeNull();
  });
});

describe("computeStreamMetrics normalized power", () => {
  it("computes it for a ride with a real power meter", () => {
    const stream = streamOf({ durationS: 1200, watts: () => 190 });
    const metrics = computeStreamMetrics({ streams: stream, activity: RIDE }, THRESHOLDS);
    expect(metrics.npW).toBeCloseTo(190, 6);
  });

  it("leaves it null when the wattage is Strava's estimate", () => {
    const estimated: MetricsActivity = { ...RIDE, hasRealPower: false, powerW: null };
    const stream = streamOf({ durationS: 1200, watts: () => 190 });
    expect(
      computeStreamMetrics({ streams: stream, activity: estimated }, THRESHOLDS).npW
    ).toBeNull();
  });

  it("leaves it null for a run carrying watch power", () => {
    // Strava marks watch run power `device_watts: true` exactly like a bike
    // meter, so this run reaches the metric with hasRealPower set and a full
    // watts stream. Normalizing it would store a ride-shaped number derived
    // from a model of pace: rides only, the same gate `efBasisFor` applies.
    const watchPower: MetricsActivity = { ...RUN, hasRealPower: true, powerW: 280 };
    const stream = streamOf({ durationS: 1200, watts: () => 280 });
    expect(
      computeStreamMetrics({ streams: stream, activity: watchPower }, THRESHOLDS).npW
    ).toBeNull();
    // The run's own metrics are unaffected: speed-based EF still lands.
    expect(
      computeStreamMetrics({ streams: stream, activity: watchPower }, THRESHOLDS).ef
    ).toBeCloseTo(200 / 150, 6);
  });
});

describe("metricsActivityOf", () => {
  it("prefers Strava's weighted average watts on a metered ride", () => {
    const activity = metricsActivityOf({
      sport_type: "Ride",
      distance_km: 40,
      moving_time_s: 3600,
      avg_hr: 140,
      raw_json: JSON.stringify({
        device_watts: true,
        average_watts: 190,
        weighted_average_watts: 205,
      }),
    });
    expect(activity.hasRealPower).toBe(true);
    expect(activity.powerW).toBe(205);
  });

  it("ignores estimated wattage", () => {
    const activity = metricsActivityOf({
      sport_type: "Ride",
      distance_km: 40,
      moving_time_s: 3600,
      avg_hr: 140,
      raw_json: JSON.stringify({ average_watts: 190 }),
    });
    expect(activity.hasRealPower).toBe(false);
    expect(activity.powerW).toBeNull();
  });
});

describe("zone-seconds storage", () => {
  it("round-trips a five-zone array", () => {
    const zoneSecs = [10, 20, 30, 40, 50];
    expect(parseZoneSecs(serializeZoneSecs(zoneSecs))).toEqual(zoneSecs);
    expect(serializeZoneSecs(null)).toBeNull();
  });

  it("rejects anything that is not five finite numbers", () => {
    expect(parseZoneSecs(null)).toBeNull();
    expect(parseZoneSecs("not json")).toBeNull();
    expect(parseZoneSecs("[1,2,3]")).toBeNull();
    expect(parseZoneSecs('[1,2,3,4,"5"]')).toBeNull();
    expect(parseZoneSecs("[1,2,3,4,null]")).toBeNull();
    expect(parseZoneSecs('{"z1":1}')).toBeNull();
  });
});
