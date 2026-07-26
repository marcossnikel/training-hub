import { describe, expect, it } from "vitest";
import {
  avgGapSPerKm,
  computeStreamMetrics,
  fullResMetricsVersion,
  gapPaceSeries,
  gradePctSeries,
  hasAnyMetric,
  METRICS_VERSION_FULL_RES,
  METRICS_VERSION_FULL_RES_NO_GRADE,
  metricsActivityOf,
  normalizedPower,
  paceAdjustmentFactor,
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
    gradePct: null,
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
  avgPaceSPerKm: 300,
  avgHr: 150,
  powerW: null,
  hasRealPower: false,
};

const RIDE: MetricsActivity = {
  sportType: "Ride",
  distanceKm: 40,
  movingTimeS: 3600,
  avgPaceSPerKm: 90,
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

describe("computeStreamMetrics grade-adjusted pace", () => {
  const hilly = () =>
    routeOf({ durationS: 3600, paceSPerKm: 300, gradePct: () => 5, useGradeStream: true });

  it("stores a run's GAP and measures its efficiency factor against it", () => {
    const metrics = computeStreamMetrics({ streams: hilly(), activity: RUN }, THRESHOLDS);
    expect(metrics.avgGapSPerKm).not.toBeNull();
    expect(metrics.avgGapSPerKm!).toBeLessThan(300);
    // EF reads the GAP rather than the 12 km / 60 min summary average, so the
    // climb counts as the extra work it was instead of as a slow hour.
    expect(metrics.ef).toBeCloseTo(60000 / metrics.avgGapSPerKm! / 150, 6);
    expect(metrics.ef!).toBeGreaterThan(200 / 150);
  });

  it("leaves a ride's GAP null and its metrics untouched", () => {
    const stream = { ...hilly(), watts: hilly().timeS.map(() => 210) };
    const metrics = computeStreamMetrics({ streams: stream, activity: RIDE }, THRESHOLDS);
    expect(metrics.avgGapSPerKm).toBeNull();
    // The cost polynomial is running economy; a ride's EF stays watts per beat.
    expect(metrics.ef).toBeCloseTo(210 / 140, 6);
  });

  it("leaves it null for a run whose stream carries no grade", () => {
    const stream = streamOf({ durationS: 3600, stepS: 10, hr: () => 150 });
    expect(
      computeStreamMetrics({ streams: stream, activity: RUN }, THRESHOLDS).avgGapSPerKm
    ).toBeNull();
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
      avg_pace_s_per_km: 90,
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
      avg_pace_s_per_km: 90,
      avg_hr: 140,
      raw_json: JSON.stringify({ average_watts: 190 }),
    });
    expect(activity.hasRealPower).toBe(false);
    expect(activity.powerW).toBeNull();
  });

  it("carries the stored average pace through, since the GAP scales THAT", () => {
    // Not `moving_time_s / distance_km`: the stored distance is rounded to two
    // decimals, so re-deriving the pace from it lands 1.2 s/km off here.
    const activity = metricsActivityOf({
      sport_type: "Run",
      distance_km: 0.91,
      moving_time_s: 241,
      avg_pace_s_per_km: 266,
      avg_hr: 150,
      raw_json: null,
    });
    expect(activity.avgPaceSPerKm).toBe(266);
    expect(activity.movingTimeS! / activity.distanceKm!).toBeCloseTo(264.8, 1);
  });
});

/**
 * A synthetic run over ground: one sample per second at a constant pace, on a
 * route whose grade at each second is given by `gradePct`. Distance and altitude
 * are integrated from it, so the altitude fallback and Strava's own channel can
 * be tested against the same route. `useGradeStream` decides which of the two
 * the stream carries.
 */
function routeOf({
  durationS,
  paceSPerKm,
  gradePct,
  useGradeStream,
}: {
  durationS: number;
  paceSPerKm: number;
  gradePct: (t: number) => number;
  useGradeStream: boolean;
}): ActivityStreams {
  const times: number[] = [];
  const distanceKm: number[] = [];
  const altitudeM: number[] = [];
  const grades: number[] = [];
  let km = 0;
  let alt = 100;
  for (let t = 0; t <= durationS; t += 1) {
    times.push(t);
    distanceKm.push(km);
    altitudeM.push(alt);
    const g = gradePct(t);
    grades.push(g);
    const stepKm = 1 / paceSPerKm;
    km += stepKm;
    alt += stepKm * 1000 * (g / 100);
  }
  return {
    n: times.length,
    timeS: times,
    distanceKm,
    heartrate: times.map(() => 150),
    paceSPerKm: times.map(() => paceSPerKm),
    watts: null,
    cadence: null,
    altitudeM,
    gradePct: useGradeStream ? grades : null,
  };
}

describe("paceAdjustmentFactor", () => {
  it("is exactly 1 on the flat", () => {
    expect(paceAdjustmentFactor(0)).toBe(1);
  });

  it("matches Minetti's cost ratio at the reference grades", () => {
    expect(paceAdjustmentFactor(-10)).toBeCloseTo(0.5976961, 6);
    expect(paceAdjustmentFactor(-5)).toBeCloseTo(0.7627566, 6);
    expect(paceAdjustmentFactor(5)).toBeCloseTo(1.3014434, 6);
    expect(paceAdjustmentFactor(10)).toBeCloseTo(1.6578372, 6);
  });

  it("costs more uphill than flat and less downhill, monotonically through zero", () => {
    expect(paceAdjustmentFactor(-10)).toBeLessThan(paceAdjustmentFactor(-5));
    expect(paceAdjustmentFactor(-5)).toBeLessThan(1);
    expect(paceAdjustmentFactor(5)).toBeGreaterThan(1);
    expect(paceAdjustmentFactor(10)).toBeGreaterThan(paceAdjustmentFactor(5));
  });

  it("turns back up on a very steep descent, where braking costs again", () => {
    // The curve bottoms out near -20%; steeper than that is more expensive, not
    // less. This is the behaviour the deleted linear approximation could not
    // express, and the reason a plunging descent no longer reads as free speed.
    expect(paceAdjustmentFactor(-25)).toBeGreaterThan(paceAdjustmentFactor(-20));
  });

  it("clamps beyond thirty percent in both directions", () => {
    expect(paceAdjustmentFactor(45)).toBe(paceAdjustmentFactor(30));
    expect(paceAdjustmentFactor(-45)).toBe(paceAdjustmentFactor(-30));
  });

  it("treats a non-finite grade as flat rather than propagating it", () => {
    // A zero-length distance step upstream can produce either; neither is a
    // slope, so neither may adjust a pace.
    expect(paceAdjustmentFactor(NaN)).toBe(1);
    expect(paceAdjustmentFactor(Infinity)).toBe(1);
    expect(paceAdjustmentFactor(-Infinity)).toBe(1);
  });
});

/**
 * A stream written point by point: cumulative metres and altitude, at a constant
 * pace unless a point overrides its own clock. The counterpart to `routeOf` for
 * cases that need a specific SAMPLE SPACING or a broken clock — the grade window
 * is measured in ground, so how far apart the samples sit is the thing under
 * test in several of these.
 */
function trackOf(
  points: Array<{ m: number; alt: number; t?: number }>,
  paceSPerKm = 300
): ActivityStreams {
  return {
    n: points.length,
    timeS: points.map((p) => p.t ?? (p.m / 1000) * paceSPerKm),
    distanceKm: points.map((p) => p.m / 1000),
    heartrate: null,
    paceSPerKm: points.map(() => paceSPerKm),
    watts: null,
    cadence: null,
    altitudeM: points.map((p) => p.alt),
    gradePct: null,
  };
}

/** Every grade the fallback managed to measure, nulls dropped. */
const measured = (stream: ActivityStreams): number[] =>
  (gradePctSeries(stream) ?? []).filter((g): g is number => g != null);

describe("gradePctSeries", () => {
  it("prefers Strava's own channel verbatim", () => {
    const stream = routeOf({
      durationS: 60,
      paceSPerKm: 300,
      gradePct: () => 6,
      useGradeStream: true,
    });
    expect(gradePctSeries(stream)).toBe(stream.gradePct);
  });

  it("falls back to altitude when the channel is present but carries no reading", () => {
    // Strava returns the key with every sample null on an activity with no
    // elevation trace. Taken verbatim that yields a ratio of exactly 1 and a
    // stored GAP indistinguishable from a real flat-road measurement.
    const stream = routeOf({
      durationS: 600,
      paceSPerKm: 300,
      gradePct: () => 6,
      useGradeStream: false,
    });
    const empty = { ...stream, gradePct: new Array(stream.n).fill(null) };
    expect(gradePctSeries(empty)![300]).toBeCloseTo(6, 4);
    // And the consequence the empty channel would have had: no adjustment at all.
    expect(avgGapSPerKm(empty, { avgPaceSPerKm: 300 })!).toBeLessThan(295);
  });

  it("differentiates altitude over distance when the channel is absent", () => {
    const stream = routeOf({
      durationS: 600,
      paceSPerKm: 300,
      gradePct: () => 6,
      useGradeStream: false,
    });
    const derived = gradePctSeries(stream);
    expect(derived).not.toBeNull();
    // Every interior sample recovers the 6% the route was built with.
    expect(derived![300]).toBeCloseTo(6, 6);
  });

  it("keeps a short roller instead of averaging it flat", () => {
    // Grade flips between +8% and -8% every 20 m of ground. The window is ten
    // metres, so it reads most of that swing; widening it towards the 250 m the
    // five-SAMPLE window used to span would pull every reading towards zero,
    // which is exactly the error that made this fallback understate the
    // adjustment two- to fourfold.
    const stream = routeOf({
      durationS: 600,
      paceSPerKm: 300,
      gradePct: (t) => (Math.floor(t / 6) % 2 === 0 ? 8 : -8),
      useGradeStream: false,
    });
    const grades = measured(stream);
    expect(Math.max(...grades)).toBeGreaterThan(6.5);
    expect(Math.min(...grades)).toBeLessThan(-6.5);
  });

  it("does not read an altimeter step as a slope", () => {
    // Flat ground sampled every two metres, with one 0.5 m barometric step. Over
    // the one-METRE run the old floor allowed, that step reads as 25% of grade;
    // over ten metres it is the 5% it really is. This is the floor that kept
    // production activity 31's derived series inside +/-30% instead of -140%.
    const points = Array.from({ length: 40 }, (_, i) => ({
      m: i * 2,
      alt: i < 20 ? 100 : 100.5,
    }));
    expect(Math.max(...measured(trackOf(points)).map(Math.abs))).toBeLessThanOrEqual(5.1);
  });

  it("widens past an impossible reading rather than losing the climb under it", () => {
    // A steady 12% climb sampled every twelve metres, with one sample's altitude
    // 4 m low. The shortest window reads +45% off that sample, past anything a
    // runner climbs and past the polynomial's fitted range; doubled to 24 m it
    // resolves back to +28.7%, near the real climb. Discarding the sample
    // instead throws away ground that was genuinely covered.
    const points = Array.from({ length: 30 }, (_, i) => ({
      m: i * 12,
      alt: i * 1.44 - (i === 10 ? 4 : 0),
    }));
    const derived = gradePctSeries(trackOf(points))!;
    expect(derived[10]).toBeCloseTo(28.67, 1);
  });

  it("gives no grade at all to a wall steeper than the polynomial was fitted to", () => {
    // 400 m at 45%, then flat, sampled every twenty metres. Widening is bounded,
    // so the samples inside the wall stay null rather than being averaged against
    // the flat beyond it until they look like a merely steep climb.
    const points = Array.from({ length: 40 }, (_, i) => ({
      m: i * 20,
      alt: i <= 20 ? i * 9 : 180,
    }));
    expect(gradePctSeries(trackOf(points))![5]).toBeNull();
  });

  it("is null when the stream carries neither grade nor altitude", () => {
    expect(gradePctSeries(streamOf({ durationS: 60, hr: () => 150 }))).toBeNull();
  });
});

describe("gapPaceSeries", () => {
  it("divides each sample's pace by its cost factor", () => {
    const stream = routeOf({
      durationS: 60,
      paceSPerKm: 360,
      gradePct: () => 10,
      useGradeStream: true,
    });
    const gap = gapPaceSeries(stream);
    expect(gap![10]).toBeCloseTo(360 / 1.6578372, 5);
  });

  it("is null without a pace stream", () => {
    const stream = routeOf({
      durationS: 60,
      paceSPerKm: 360,
      gradePct: () => 10,
      useGradeStream: true,
    });
    expect(gapPaceSeries({ ...stream, paceSPerKm: null })).toBeNull();
  });
});

describe("fullResMetricsVersion", () => {
  it("certifies version 3 only for a payload that really carried grade", () => {
    const stream = routeOf({
      durationS: 60,
      paceSPerKm: 300,
      gradePct: () => 6,
      useGradeStream: true,
    });
    expect(fullResMetricsVersion(stream)).toBe(METRICS_VERSION_FULL_RES);
    // No channel (an indoor run), and a channel Strava returned empty: both are
    // the altitude fallback's rung, whatever keys the request asked for.
    expect(fullResMetricsVersion({ ...stream, gradePct: null })).toBe(
      METRICS_VERSION_FULL_RES_NO_GRADE
    );
    expect(fullResMetricsVersion({ ...stream, gradePct: new Array(stream.n).fill(null) })).toBe(
      METRICS_VERSION_FULL_RES_NO_GRADE
    );
  });
});

describe("avgGapSPerKm", () => {
  /** A run whose summary row reports `paceSPerKm`, which is what the page shows. */
  const summary = (paceSPerKm: number) => ({ avgPaceSPerKm: paceSPerKm });

  it("is exactly the activity's own pace on a flat run", () => {
    const stream = routeOf({
      durationS: 1800,
      paceSPerKm: 300,
      gradePct: () => 0,
      useGradeStream: true,
    });
    expect(avgGapSPerKm(stream, summary(300))).toBe(300);
  });

  it("scales the pace the page shows, not the one the rounded distance implies", () => {
    // Production activity 53: 241 s over a distance STORED as 0.91 km, on
    // constant altitude. `movingTimeS / distanceKm` is 264.8 s/km where the
    // stored pace is 266, so scaling the former printed "Pace 4:26 / GAP 4:25"
    // on a run with a terrain ratio of exactly 1.
    const stream = routeOf({
      durationS: 241,
      paceSPerKm: 266,
      gradePct: () => 0,
      useGradeStream: true,
    });
    expect(avgGapSPerKm(stream, summary(266))).toBe(266);
    expect(avgGapSPerKm(stream, { avgPaceSPerKm: null })).toBeNull();
  });

  it("is faster than the raw pace on an uphill-heavy run", () => {
    // Half the run at +8%, half flat: the climbing half is worth far more than
    // the clock says, so the flat-ground equivalent is quicker.
    const stream = routeOf({
      durationS: 1800,
      paceSPerKm: 360,
      gradePct: (t) => (t < 900 ? 8 : 0),
      useGradeStream: true,
    });
    const gap = avgGapSPerKm(stream, summary(360))!;
    expect(gap).toBeLessThan(360);
    expect(gap).toBeGreaterThan(200);
  });

  it("is slower than the raw pace on a descending run", () => {
    const stream = routeOf({
      durationS: 1800,
      paceSPerKm: 300,
      gradePct: () => -6,
      useGradeStream: true,
    });
    expect(avgGapSPerKm(stream, summary(300))!).toBeGreaterThan(300);
  });

  it("makes rolling terrain cost more than the flat it averages out to", () => {
    // Equal ground up and down nets to zero elevation change, and the split-level
    // approximation this replaces read that as flat. It is not: the climbs cost
    // more than the descents give back, so the same pace was harder work.
    const stream = routeOf({
      durationS: 1800,
      paceSPerKm: 330,
      gradePct: (t) => (Math.floor(t / 120) % 2 === 0 ? 5 : -5),
      useGradeStream: true,
    });
    expect(avgGapSPerKm(stream, summary(330))!).toBeLessThan(330);
  });

  it("agrees within a few percent whether grade comes from Strava or from altitude", () => {
    const args = { durationS: 1800, paceSPerKm: 360, gradePct: (t: number) => (t < 900 ? 8 : 0) };
    const fromStream = avgGapSPerKm(routeOf({ ...args, useGradeStream: true }), summary(360))!;
    const fromAltitude = avgGapSPerKm(routeOf({ ...args, useGradeStream: false }), summary(360))!;
    expect(Math.abs(fromAltitude - fromStream) / fromStream).toBeLessThan(0.03);
  });

  it("charges each segment the grade of the ground IT crosses", () => {
    // Twenty-metre samples, a 4 m climb over the first segment and level after.
    // Sample 0's grade is +20%, sample 1's is 0. Crediting the segment leaving
    // sample 0 to sample 1's grade instead leaves the whole route reading flat,
    // and the last sample — which has no forward window and so no grade — must
    // still contribute the ground it covered rather than being dropped.
    const stream = trackOf([
      { m: 0, alt: 0 },
      { m: 20, alt: 4 },
      { m: 40, alt: 4 },
      { m: 60, alt: 4 },
    ]);
    expect(gradePctSeries(stream)![0]).toBeCloseTo(20, 6);
    const gap = avgGapSPerKm(stream, summary(300))!;
    // 20% costs 2.502 flat metres per metre, so 1/3 of the route at that price:
    // 60 m of ground for 20 * 2.502 + 40 = 90.05 flat-equivalent metres.
    expect(gap).toBeCloseTo(300 * (60 / (20 * paceAdjustmentFactor(20) + 40)), 6);
    expect(gap).toBeLessThan(230);
  });

  it("throws away the fabricated slope of a GPS jump", () => {
    // Half a kilometre and a hundred metres of climb crossed in two seconds:
    // 4 s/km, which nobody runs. Admitted, that one segment carries a third of
    // the route's distance at a 20% grade and drags the GAP from 5:00 to 3:20.
    const flat = (from: number, count: number, alt: number, t0: number) =>
      Array.from({ length: count }, (_, i) => ({
        m: from + i * 10,
        alt,
        t: t0 + i * 3,
      }));
    const stream = trackOf([...flat(0, 51, 100, 0), ...flat(1000, 51, 200, 152)]);
    expect(avgGapSPerKm(stream, summary(300))).toBeCloseTo(300, 6);
  });

  it("ignores a stall, rather than letting it drag the adjustment towards flat", () => {
    // A 6% climb sampled every five metres. Halfway up, the athlete stands still
    // for two minutes: the clock advances, the odometer does not, and the
    // barometer wanders a metre either way while it happens. None of that is
    // terrain, and none of it may move the answer.
    const climb = (from: number, count: number, t0: number) =>
      Array.from({ length: count }, (_, i) => ({
        m: from + i * 5,
        alt: (from + i * 5) * 0.06,
        t: t0 + i * 1.5,
      }));
    const clean = trackOf([...climb(0, 30, 0), ...climb(150, 31, 45)]);
    const stalled = trackOf([
      ...climb(0, 30, 0),
      // Twenty-four samples pinned at 150 m, altitude drifting +/-1 m.
      ...Array.from({ length: 24 }, (_, i) => ({
        m: 150,
        alt: 9 + Math.sin(i) * 1,
        t: 45 + i * 5,
      })),
      ...climb(150, 31, 165),
    ]);
    const reference = avgGapSPerKm(clean, summary(300))!;
    // The reference is a real adjustment, so agreeing with it says something.
    expect(reference).toBeLessThan(240);
    expect(avgGapSPerKm(stalled, summary(300))!).toBeCloseTo(reference, 3);
  });

  it("is null without grade, or without an average pace to scale", () => {
    const flat = streamOf({ durationS: 600, hr: () => 150 });
    expect(avgGapSPerKm(flat, summary(300))).toBeNull();
    const stream = routeOf({
      durationS: 600,
      paceSPerKm: 300,
      gradePct: () => 4,
      useGradeStream: true,
    });
    expect(avgGapSPerKm(stream, { avgPaceSPerKm: null })).toBeNull();
    expect(avgGapSPerKm(stream, { avgPaceSPerKm: 0 })).toBeNull();
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
