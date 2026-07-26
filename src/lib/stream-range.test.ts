import { describe, expect, it } from "vitest";
import { rangeMetrics } from "./stream-range";
import { fmtPace } from "./format";
import type { ActivityStreams } from "./streams";

/** A stream with only the channels a case needs; the rest absent, as a real one is. */
function streams(overrides: Partial<ActivityStreams>): ActivityStreams {
  const timeS = overrides.timeS ?? [0, 60, 120, 180, 240];
  return {
    n: timeS.length,
    timeS,
    distanceKm: new Array(timeS.length).fill(null),
    heartrate: null,
    paceSPerKm: null,
    watts: null,
    cadence: null,
    altitudeM: null,
    gradePct: null,
    ...overrides,
  };
}

describe("rangeMetrics spans", () => {
  it("reads duration and distance off the range's own endpoints", () => {
    const m = rangeMetrics(
      streams({ timeS: [0, 60, 120, 180, 240], distanceKm: [0, 0.2, 0.45, 0.7, 1] }),
      1,
      3
    );
    expect(m.durationS).toBe(120);
    expect(m.distanceKm).toBeCloseTo(0.5, 6);
  });

  it("takes the indices in either order and clamps them to the stream", () => {
    const s = streams({ timeS: [0, 60, 120, 180, 240], distanceKm: [0, 0.2, 0.45, 0.7, 1] });
    expect(rangeMetrics(s, 3, 1)).toEqual(rangeMetrics(s, 1, 3));
    // A cursor past the last sample selects to the end rather than reading undefined.
    expect(rangeMetrics(s, 0, 99).durationS).toBe(240);
    expect(rangeMetrics(s, -5, 2).durationS).toBe(120);
  });

  it("skips gaps inside the range and reports null when a channel is absent", () => {
    const m = rangeMetrics(
      streams({ timeS: [0, null, 120, null, 240], distanceKm: [0, null, 0.5, null, 1] }),
      0,
      4
    );
    expect(m.durationS).toBe(240);
    expect(m.distanceKm).toBe(1);
    // No heart rate, power or altitude streams at all.
    expect(m.avgHr).toBeNull();
    expect(m.maxHr).toBeNull();
    expect(m.avgPowerW).toBeNull();
    // No velocity stream either: each bridged interval takes its pace from the
    // distance stream's own rise, 0.5 km per 120 s twice over.
    expect(m.avgPaceSPerKm).toBeCloseTo(240, 6);
    expect(m.elevationGainM).toBeNull();
  });

  it("suppresses a span that does not advance, duration and distance alike", () => {
    // A stall: the clock stands still and the distance stream with it. Reporting
    // either as 0 leaves the reader deciding whether the stream broke.
    const stalled = rangeMetrics(
      streams({
        timeS: [100, 100, 100],
        distanceKm: [1.164, 1.164, 1.164],
        heartrate: [140, 150, 160],
      }),
      0,
      2
    );
    expect(stalled.durationS).toBeNull();
    expect(stalled.distanceKm).toBeNull();
    expect(stalled.avgPaceSPerKm).toBeNull();
    // With no interval carrying time, the average is the plain mean of the samples.
    expect(stalled.avgHr).toBeCloseTo(150, 6);

    // A distance stream running backwards (a GPS fix jumping behind) is a span
    // with nothing to report either, while the clock's own span still stands.
    const backwards = rangeMetrics(
      streams({ timeS: [0, 60, 120], distanceKm: [1, 0.9, 0.8] }),
      0,
      2
    );
    expect(backwards.distanceKm).toBeNull();
    expect(backwards.durationS).toBe(120);
  });

  it("reports nothing at all for a one-sample range and for an empty stream", () => {
    // One sample is an instant, not a range: it has no duration, no distance and
    // no interval to weight, so calling its instantaneous values averages would
    // be a lie the tooltip already tells the truth about.
    const s = streams({
      timeS: [0, 60, 120],
      distanceKm: [0, 0.2, 0.4],
      heartrate: [140, 200, 160],
      paceSPerKm: [300, 300, 300],
    });
    expect(rangeMetrics(s, 2, 2)).toEqual({
      durationS: null,
      distanceKm: null,
      avgHr: null,
      maxHr: null,
      avgPaceSPerKm: null,
      avgPowerW: null,
      elevationGainM: null,
    });
    expect(rangeMetrics(s, 1, 1).avgHr).toBeNull();
    expect(rangeMetrics(s, 1, 1).maxHr).toBeNull();
    expect(rangeMetrics(s, 1, 1).avgPaceSPerKm).toBeNull();
    const none = rangeMetrics({ ...s, n: 0 }, 0, 0);
    expect(none.durationS).toBeNull();
    expect(none.avgHr).toBeNull();
  });
});

describe("rangeMetrics averages", () => {
  it("weights each interval by its own seconds, at the mean of its two ends", () => {
    // Interval 0-1 is 60 s between 140 and 160 bpm, interval 1-2 is 240 s between
    // 160 and 170: (150*60 + 165*240) / 300 = 162. Charging each interval to its
    // leading sample instead (zoneSeconds' convention) gives 156 and leaves the
    // 170 bpm sample out of its own range's average.
    const m = rangeMetrics(streams({ timeS: [0, 60, 300], heartrate: [140, 160, 170] }), 0, 2);
    expect(m.avgHr).toBeCloseTo(162, 6);
    expect(m.maxHr).toBe(170);
  });

  it("puts a two-sample average between its two samples", () => {
    // The shortest range this readout can hold: a hill sprint from 140 to 190 bpm.
    // It used to report 140 — an average under every sample but the first.
    const m = rangeMetrics(streams({ timeS: [0, 60], heartrate: [140, 190] }), 0, 1);
    expect(m.avgHr).toBeCloseTo(165, 6);
    expect(m.maxHr).toBe(190);
    expect(m.durationS).toBe(60);
  });

  it("bridges a dropped sample rather than ending the integration", () => {
    // The strap misses the middle sample: one 240 s interval from 140 to 160.
    const m = rangeMetrics(streams({ timeS: [0, 120, 240], heartrate: [140, null, 160] }), 0, 2);
    expect(m.avgHr).toBeCloseTo(150, 6);
  });

  it("falls back to the plain mean when the range carries no timestamps", () => {
    const m = rangeMetrics(
      streams({ timeS: [null, null, null, null, null], heartrate: [140, 150, 160, 170, 180] }),
      0,
      4
    );
    expect(m.avgHr).toBeCloseTo(160, 6);
    expect(m.durationS).toBeNull();
  });

  it("averages power the same way, for the ride readout", () => {
    const m = rangeMetrics(streams({ timeS: [0, 30, 90, 150], watts: [200, 100, 100, 400] }), 0, 2);
    // 30 s between 200 W and 100 W then 60 s at a flat 100 W:
    // (150*30 + 100*60) / 90 = 116.7 W. The 400 W sample is outside the range and
    // must not pull the average up.
    expect(m.avgPowerW).toBeCloseTo((150 * 30 + 100 * 60) / 90, 6);
  });
});

describe("rangeMetrics moving pace", () => {
  it("drops the samples the athlete crawled through instead of letting them lead", () => {
    // One crawling-GPS sample, the kind the cached streams are full of. Both
    // intervals touching it price above the 20:00/km gate and are dropped, so the
    // answer is the two clean intervals: 60 s at 240 s/km plus 60 s at 270 gives
    // 120 s over 0.25 + 0.2222 km = 254.1 s/km. An arithmetic mean of the same
    // samples reads over 20:00/km.
    const m = rangeMetrics(
      streams({
        timeS: [0, 60, 120, 180, 240],
        distanceKm: [0, 0.2, 0.45, 0.7, 1],
        paceSPerKm: [300, 9000, 240, 240, 300],
      }),
      0,
      4
    );
    expect(m.avgPaceSPerKm).toBeCloseTo(120 / (60 / 240 + 60 / 270), 6);
    expect(m.avgPaceSPerKm).toBeCloseTo(254.1176, 3);
  });

  it("treats a stopped sample as a pause, not as a gap to bridge", () => {
    // A treadmill range with no distance stream to check against: the null pace at
    // sample 1 is the stream saying the velocity was zero, so both intervals
    // touching it are out and the answer is the 120 s interval between 240 and 260
    // s/km alone. Bridging it instead would price 180 s of standing still as
    // running. The 300 s/km sample is inside the range and still contributes
    // nothing, because there is no moving interval that touches it.
    const m = rangeMetrics(
      streams({ timeS: [0, 60, 120, 240, 300], paceSPerKm: [300, null, 240, 260, 260] }),
      0,
      3
    );
    expect(m.avgPaceSPerKm).toBeCloseTo(250, 6);
  });

  it("reports no pace at all when nothing in the range was moving", () => {
    // Everything slower than the gate, so there is no pace to print. The clock's
    // own span still stands: the strip shows a duration and no pace.
    const m = rangeMetrics(streams({ timeS: [0, 60, 120], paceSPerKm: [1500, 1600, 1700] }), 0, 2);
    expect(m.avgPaceSPerKm).toBeNull();
    expect(m.durationS).toBe(120);
  });

  // Activity 1245, samples 103 to 108: a lab treadmill test whose belt stopped.
  // The distance stream is pinned at 1.164 km for 165 s of clock and the velocity
  // stream reads zero throughout (streams.ts nulls a non-positive velocity), then
  // sample 108 adds 2 m.
  const TREADMILL_STALL = streams({
    timeS: [428, 432, 585, 589, 593, 597],
    distanceKm: [1.164, 1.164, 1.164, 1.164, 1.164, 1.166],
    paceSPerKm: [null, null, null, null, null, 2778],
    heartrate: [126, 123, 120, 118, 118, 118],
  });

  it("reports no pace across a stall, and the same one sample wider (activity 1245)", () => {
    // Samples 103 to 107. Dividing the range's duration by its distance had no
    // answer here either (the distance span is zero), so the row vanished...
    const stall = rangeMetrics(TREADMILL_STALL, 0, 4);
    expect(stall.avgPaceSPerKm).toBeNull();
    expect(stall.durationS).toBe(165);
    expect(stall.distanceKm).toBeNull();

    // ...and one sample wider, on 2 m of rounding, it printed 1408:20 /km. The
    // gate reads both the same way: the athlete was not advancing.
    const wider = rangeMetrics(TREADMILL_STALL, 0, 5);
    expect(wider.avgPaceSPerKm).toBeNull();
    expect(wider.durationS).toBe(169);
    expect(wider.distanceKm).toBeCloseTo(0.002, 6);
    // The cliff this closes: 169 / 0.002 km is what the division used to print.
    expect(fmtPace(wider.durationS! / wider.distanceKm!)).toBe("1408:20 /km");
  });

  // Activity 12, samples 307 to 309: 8 s of running, then a recording pause the
  // velocity stream cannot see — 18 m of ground across 54 s of clock, with a
  // perfectly ordinary pace sample at each end of it.
  const PAUSED_RUN = streams({
    timeS: [2564, 2573, 2627],
    distanceKm: [7.831, 7.859, 7.877],
    paceSPerKm: [347, 342, 350],
    heartrate: [153, 153, 131],
  });

  it("excludes a pause the velocity stream cannot see, and agrees with the panel (activity 12)", () => {
    const m = rangeMetrics(PAUSED_RUN, 0, 2);
    // Only the first interval was moving: 9 s at the mean of 347 and 342.
    expect(m.avgPaceSPerKm).toBeCloseTo(344.5, 6);
    // Which is inside what the pace panel plots for these very samples, where
    // dividing 63 s of clock by 46 m printed 22:50 /km beside it.
    expect(m.avgPaceSPerKm!).toBeGreaterThanOrEqual(342);
    expect(m.avgPaceSPerKm!).toBeLessThanOrEqual(350);
    expect(fmtPace(m.avgPaceSPerKm)).toBe("5:45 /km");
    expect(fmtPace(m.durationS! / m.distanceKm!)).toBe("22:50 /km");
    expect(m.durationS).toBe(63);
    expect(m.avgHr).toBeCloseTo((153 * 9 + 142 * 54) / 63, 6);
  });
});

// Activity 1246 (an 8.84 km run with walk breaks and stopped-GPS samples), every
// eighth sample of its cached 400. Whole-range, the arithmetic time-weighted mean
// of these pace samples reads 8:57 /km, and duration over distance reads 5:55 —
// on a run whose summary row says 5:42.
const TIME_1246 = [
  0, 61, 121, 182, 243, 303, 364, 425, 485, 546, 607, 667, 737, 797, 962, 1023, 1083, 1144, 1205,
  1265, 1326, 1387, 1447, 1508, 1569, 1629, 1690, 1751, 1811, 1872, 1933, 1993, 2054, 2115, 2175,
  2236, 2296, 2357, 2418, 2478, 2539, 2600, 2660, 2721, 2782, 2842, 2903, 2964, 3024, 3085, 3138,
];
const DIST_1246 = [
  0, 0.147, 0.298, 0.443, 0.592, 0.739, 0.881, 1.031, 1.185, 1.35, 1.515, 1.66, 1.812, 1.969, 2.125,
  2.3, 2.529, 2.75, 2.968, 3.189, 3.414, 3.65, 3.867, 3.925, 4.167, 4.4, 4.641, 4.742, 4.958, 5.185,
  5.433, 5.588, 5.736, 5.991, 6.043, 6.309, 6.476, 6.624, 6.88, 6.939, 7.215, 7.378, 7.546, 7.815,
  7.864, 8.034, 8.213, 8.378, 8.53, 8.711, 8.843,
];
const PACE_1246 = [
  null,
  394,
  472,
  400,
  410,
  446,
  625,
  360,
  442,
  403,
  420,
  481,
  360,
  403,
  391,
  244,
  305,
  291,
  275,
  228,
  269,
  242,
  588,
  250,
  298,
  243,
  216,
  1220,
  226,
  284,
  267,
  4167,
  226,
  255,
  1087,
  234,
  909,
  213,
  238,
  2000,
  233,
  1316,
  198,
  290,
  746,
  347,
  336,
  385,
  556,
  413,
  2632,
];

describe("rangeMetrics moving pace on a real stream (activity 1246)", () => {
  const real = streams({ timeS: TIME_1246, distanceKm: DIST_1246, paceSPerKm: PACE_1246 });

  it("prices the whole range plausibly with samples up to 4167 s/km in it", () => {
    const m = rangeMetrics(real, 0, TIME_1246.length - 1);
    // 6:21 /km over this fixture's 60 s intervals (the cached 400-sample stream,
    // whose intervals are 8 s, reads 5:15). Either way it is a running pace, and
    // nowhere near the 8:57 an arithmetic mean of the same samples reports.
    expect(m.avgPaceSPerKm).toBeCloseTo(381.4, 1);
    expect(fmtPace(m.avgPaceSPerKm)).toBe("6:21 /km");
    expect(m.durationS).toBe(3138);
    expect(m.distanceKm).toBeCloseTo(8.843, 6);
  });

  it("never prints an implausible pace for any window of it", () => {
    // Every window of two samples or more: each either reports a pace inside the
    // gate or reports none. The worst any of them prints is 18:39 /km.
    let worst = 0;
    let suppressed = 0;
    for (let lo = 0; lo < TIME_1246.length; lo++) {
      for (let hi = lo + 1; hi < TIME_1246.length; hi++) {
        const pace = rangeMetrics(real, lo, hi).avgPaceSPerKm;
        if (pace == null) suppressed += 1;
        else worst = Math.max(worst, pace);
      }
    }
    expect(worst).toBeLessThanOrEqual(1200);
    expect(worst).toBeCloseTo(1119, 0);
    expect(suppressed).toBe(6);
  });
});

describe("rangeMetrics elevation gain", () => {
  it("sums only the positive altitude deltas", () => {
    // 10 -> 25 (+15), 25 -> 20 (-5, ignored), 20 -> 30 (+10) = 25 m of climb.
    const m = rangeMetrics(streams({ altitudeM: [10, 25, 20, 30, 5] }), 0, 3);
    expect(m.elevationGainM).toBeCloseTo(25, 6);
  });

  it("reports zero for a descent and bridges dropped samples", () => {
    expect(rangeMetrics(streams({ altitudeM: [50, 40, 30, 20, 10] }), 0, 4).elevationGainM).toBe(0);
    // The gap between 10 m and 20 m is bridged as one +10 rise, never restarted.
    expect(
      rangeMetrics(streams({ altitudeM: [10, null, null, 20, 20] }), 0, 4).elevationGainM
    ).toBeCloseTo(10, 6);
  });

  it("needs two altitudes to say anything", () => {
    expect(
      rangeMetrics(streams({ altitudeM: [10, null, null, null, null] }), 0, 4).elevationGainM
    ).toBeNull();
  });
});
