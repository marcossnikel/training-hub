import { describe, expect, it } from "vitest";
import { FULL_RESOLUTION, normalizeStreams } from "./streams";

/** Strava's key_by_type payload shape: one `{ data }` per requested channel. */
const payload = (channels: Record<string, number[]>): Record<string, { data: number[] }> =>
  Object.fromEntries(Object.entries(channels).map(([key, data]) => [key, { data }]));

const seq = (n: number, fn: (i: number) => number) => Array.from({ length: n }, (_, i) => fn(i));

describe("normalizeStreams channels", () => {
  it("carries grade_smooth through as gradePct", () => {
    // The whole point of requesting the channel. Without this mapping every
    // stream falls back to differentiating altitude, which is the lower-precision
    // path the metrics ladder records as version 1/2 rather than 3 — and because
    // `ensureActivityStreams` never fetches over a cached stream, an activity
    // that lands on the fallback is stranded there permanently.
    const streams = normalizeStreams(
      payload({
        distance: [0, 100, 200],
        time: [0, 30, 60],
        grade_smooth: [1.5, -2.5, 0],
      })
    );
    expect(streams?.gradePct).toEqual([1.5, -2.5, 0]);
  });

  it("leaves gradePct null when the payload has no grade channel", () => {
    const streams = normalizeStreams(payload({ distance: [0, 100], time: [0, 30] }));
    expect(streams?.gradePct).toBeNull();
  });

  it("treats grade_smooth as a usable stream on its own", () => {
    // `present` decides whether the payload is worth keeping at all; a channel
    // missing from that list makes a grade-only payload normalize to null.
    const streams = normalizeStreams(payload({ grade_smooth: [3, 4, 5] }));
    expect(streams?.gradePct).toEqual([3, 4, 5]);
    expect(streams?.n).toBe(3);
  });

  it("maps every channel to its own field", () => {
    const streams = normalizeStreams(
      payload({
        distance: [0, 1000],
        time: [0, 300],
        heartrate: [120, 160],
        velocity_smooth: [4, 5],
        watts: [200, 250],
        cadence: [80, 90],
        altitude: [10, 40],
        grade_smooth: [2, 3],
      })
    );
    expect(streams).toEqual({
      n: 2,
      distanceKm: [0, 1],
      timeS: [0, 300],
      heartrate: [120, 160],
      // 1000 / velocity, rounded: 4 m/s is 250 s/km, 5 m/s is 200 s/km.
      paceSPerKm: [250, 200],
      watts: [200, 250],
      cadence: [80, 90],
      altitudeM: [10, 40],
      gradePct: [2, 3],
    });
  });

  it("reports a stopped sample as no pace at all, not an infinite one", () => {
    const streams = normalizeStreams(payload({ time: [0, 1, 2], velocity_smooth: [3, 0, -1] }));
    expect(streams?.paceSPerKm).toEqual([333, null, null]);
  });

  it("is null for a payload with nothing in it", () => {
    expect(normalizeStreams({})).toBeNull();
    expect(normalizeStreams(payload({ heartrate: [] }))).toBeNull();
  });
});

describe("normalizeStreams downsampling", () => {
  it("thins to maxPoints on the distance grid, keeping the first and last sample", () => {
    const n = 1000;
    const streams = normalizeStreams(
      payload({
        distance: seq(n, (i) => i),
        time: seq(n, (i) => i),
        grade_smooth: seq(n, (i) => i / 100),
      }),
      400
    );
    expect(streams?.n).toBe(400);
    expect(streams?.timeS[0]).toBe(0);
    expect(streams?.timeS[399]).toBe(n - 1);
    expect(streams?.gradePct?.[399]).toBeCloseTo((n - 1) / 100, 6);
  });

  it("keeps every sample at FULL_RESOLUTION, which is what the metrics read", () => {
    const n = 3600;
    const streams = normalizeStreams(
      payload({ time: seq(n, (i) => i), watts: seq(n, (i) => i % 300) }),
      FULL_RESOLUTION
    );
    expect(streams?.n).toBe(n);
    expect(streams?.watts?.[1234]).toBe(1234 % 300);
  });

  it("aligns channels of differing length on the same [0,1] grid", () => {
    // Strava returns a shorter channel when a sensor dropped in and out; sampling
    // each by fraction keeps sample i of every series describing the same moment.
    const streams = normalizeStreams(
      payload({ distance: seq(100, (i) => i * 10), heartrate: [100, 200] })
    );
    expect(streams?.n).toBe(100);
    expect(streams?.heartrate?.[0]).toBe(100);
    expect(streams?.heartrate?.[99]).toBe(200);
  });
});
