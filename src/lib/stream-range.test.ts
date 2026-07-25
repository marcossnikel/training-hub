import { describe, expect, it } from "vitest";
import { rangeMetrics } from "./stream-range";
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
    // Pace needs no pace stream: the range's duration over its distance is it.
    expect(m.avgPaceSPerKm).toBeCloseTo(240, 6);
    expect(m.elevationGainM).toBeNull();
  });

  it("reports null for a single-sample range and for an empty stream", () => {
    const s = streams({ timeS: [0, 60, 120], distanceKm: [0, 0.2, 0.4] });
    expect(rangeMetrics(s, 2, 2).durationS).toBeNull();
    expect(rangeMetrics(s, 2, 2).distanceKm).toBeNull();
    const none = rangeMetrics({ ...s, n: 0 }, 0, 0);
    expect(none.durationS).toBeNull();
    expect(none.avgHr).toBeNull();
  });
});

describe("rangeMetrics averages", () => {
  it("weights each sample by how long it was in force, not by sample count", () => {
    // Sample 0 holds for 60 s at 140 bpm, sample 1 for 240 s at 160 bpm. The
    // plain mean of the three samples inside the range is 156.7; the
    // time-weighted answer is (140*60 + 160*240) / 300 = 156.
    const m = rangeMetrics(streams({ timeS: [0, 60, 300], heartrate: [140, 160, 170] }), 0, 2);
    expect(m.avgHr).toBeCloseTo(156, 6);
    expect(m.maxHr).toBe(170);
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

  it("prices pace off the range's own duration and distance", () => {
    const m = rangeMetrics(
      streams({
        timeS: [0, 60, 120, 180, 240],
        distanceKm: [0, 0.2, 0.45, 0.7, 1],
        // One crawling-GPS sample, the kind the cached streams are full of.
        paceSPerKm: [300, 9000, 240, 240, 300],
      }),
      0,
      4
    );
    // 240 s over 1 km is 4:00/km, and no single sample can drag that.
    expect(m.avgPaceSPerKm).toBeCloseTo(240, 6);
  });

  it("falls back to the time-weighted pace mean when the range has no distance", () => {
    // 300 s/km for 60 s, a dropped sample, then 240 s/km for 120 s. The null
    // contributes nothing, so the weights are the 60 s and 120 s intervals of
    // the two samples that do carry a pace: (300*60 + 240*120) / 180 = 260.
    const m = rangeMetrics(
      streams({ timeS: [0, 60, 120, 240, 300], paceSPerKm: [300, null, 240, 260, 260] }),
      0,
      3
    );
    expect(m.avgPaceSPerKm).toBeCloseTo(260, 6);
  });

  it("averages power the same way, for the ride readout", () => {
    const m = rangeMetrics(streams({ timeS: [0, 30, 90, 150], watts: [200, 100, 100, 400] }), 0, 2);
    // 200 W for 30 s then 100 W for 60 s => 133.3 W, while the sample mean is 133.3 too;
    // the third sample is outside the range and must not pull the average up.
    expect(m.avgPowerW).toBeCloseTo((200 * 30 + 100 * 60) / 90, 6);
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
