import { describe, expect, it } from "vitest";
import {
  bucketKeys,
  curveSeries,
  curveWindowStart,
  paceBucketForDistanceM,
  seedCurvePoints,
  showPowerCurve,
  type CurveBucketBest,
} from "./curves";

describe("paceBucketForDistanceM", () => {
  it("matches Strava's rounded effort distances", () => {
    expect(paceBucketForDistanceM(400)).toBe("400m");
    expect(paceBucketForDistanceM(1000)).toBe("1k");
    // Strava stores whole metres: 1609 for the mile, 21097 for the half.
    expect(paceBucketForDistanceM(1609)).toBe("1mi");
    expect(paceBucketForDistanceM(1609.34)).toBe("1mi");
    expect(paceBucketForDistanceM(5000)).toBe("5k");
    expect(paceBucketForDistanceM(10000)).toBe("10k");
    expect(paceBucketForDistanceM(21097)).toBe("half");
  });

  it("rejects the effort distances that are not buckets", () => {
    for (const distance of [805, 3219, 15000, 16090, 20000, 30000, 42195]) {
      expect(paceBucketForDistanceM(distance)).toBeNull();
    }
  });

  it("rejects unusable distances", () => {
    expect(paceBucketForDistanceM(0)).toBeNull();
    expect(paceBucketForDistanceM(-400)).toBeNull();
    expect(paceBucketForDistanceM(Number.NaN)).toBeNull();
  });
});

describe("seedCurvePoints", () => {
  it("maps bucket distances to elapsed pace, in bucket order", () => {
    const points = seedCurvePoints([
      { distance_m: 5000, elapsed_time_s: 1250 },
      { distance_m: 400, elapsed_time_s: 80 },
      { distance_m: 1000, elapsed_time_s: 230 },
    ]);
    expect(points.map((p) => p.bucket)).toEqual(["400m", "1k", "5k"]);
    expect(points.every((p) => p.kind === "pace")).toBe(true);
    expect(points[0].value).toBeCloseTo(200, 6);
    expect(points[1].value).toBeCloseTo(230, 6);
    expect(points[2].value).toBeCloseTo(250, 6);
  });

  it("drops efforts at distances that are not buckets", () => {
    const points = seedCurvePoints([
      { distance_m: 805, elapsed_time_s: 200 },
      { distance_m: 15000, elapsed_time_s: 4500 },
    ]);
    expect(points).toEqual([]);
  });

  it("keeps the fastest of two efforts landing in the same bucket", () => {
    const points = seedCurvePoints([
      { distance_m: 1000, elapsed_time_s: 300 },
      { distance_m: 1000, elapsed_time_s: 240 },
    ]);
    expect(points).toHaveLength(1);
    expect(points[0].value).toBeCloseTo(240, 6);
  });

  it("ignores rows with no usable time", () => {
    expect(seedCurvePoints([{ distance_m: 1000, elapsed_time_s: 0 }])).toEqual([]);
  });
});

describe("curveSeries", () => {
  const best = (bucket: string, value: number): CurveBucketBest => ({
    bucket,
    value,
    activityName: `run ${bucket}`,
    date: "2026-07-01T10:00:00Z",
  });

  it("orders points by bucket and pairs the two series", () => {
    const series = curveSeries(
      "pace",
      [best("1k", 240), best("400m", 80)],
      [best("400m", 78), best("1k", 235), best("5k", 1300)]
    );
    expect(series.map((p) => p.bucket)).toEqual(["400m", "1k", "5k"]);
    expect(series[0].windowed?.value).toBe(80);
    expect(series[0].allTime.value).toBe(78);
    // A bucket the window never reached still plots its all-time point.
    expect(series[2].windowed).toBeNull();
  });

  it("drops buckets no activity has ever reached", () => {
    const series = curveSeries("power", [], [best("5s", 700), best("20m", 210)]);
    expect(series.map((p) => p.bucket)).toEqual(["5s", "20m"]);
  });

  it("ignores a windowed bucket with no all-time row, which cannot happen", () => {
    expect(curveSeries("pace", [best("1k", 240)], [])).toEqual([]);
  });
});

describe("bucketKeys", () => {
  it("lists each kind's buckets in ascending order", () => {
    expect(bucketKeys("pace")).toEqual(["400m", "1k", "1mi", "5k", "10k", "half"]);
    expect(bucketKeys("power")).toEqual(["5s", "1m", "5m", "8m", "20m", "60m"]);
  });
});

describe("curveWindowStart", () => {
  it("subtracts the window from now", () => {
    expect(curveWindowStart(90, new Date("2026-07-24T12:00:00Z"))).toBe("2026-04-25T12:00:00.000Z");
  });

  it("is unbounded for an infinite window", () => {
    expect(curveWindowStart(Number.POSITIVE_INFINITY, new Date())).toBeNull();
  });
});

describe("showPowerCurve", () => {
  it("hides the panel until enough rides carry a power point", () => {
    // Two rides in the whole history have a real meter today, and a
    // duration curve drawn from two rides reads as a capability claim.
    expect(showPowerCurve(0)).toBe(false);
    expect(showPowerCurve(2)).toBe(false);
    expect(showPowerCurve(9)).toBe(false);
    expect(showPowerCurve(10)).toBe(true);
    expect(showPowerCurve(40)).toBe(true);
  });
});
