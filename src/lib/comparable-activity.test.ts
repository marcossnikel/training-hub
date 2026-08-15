import { describe, expect, it } from "vitest";
import {
  comparableActivityThresholds,
  comparableSportFamily,
  isComparablePriorActivitySource,
  matchComparablePriorActivity,
  type ComparableActivitySummary,
} from "./comparable-activity";

const AS_OF = "2026-08-15T12:00:00Z";

function activity(
  id: number,
  overrides: Partial<ComparableActivitySummary> = {}
): ComparableActivitySummary {
  return {
    id,
    sportType: "Run",
    startedAt: `2026-08-${String(10 - id).padStart(2, "0")}T08:00:00Z`,
    distanceKm: 10,
    movingTimeS: 1_000,
    ...overrides,
  };
}

function match(source: ComparableActivitySummary, candidates: ComparableActivitySummary[]) {
  return matchComparablePriorActivity({ source, candidates, asOf: AS_OF });
}

describe("matchComparablePriorActivity", () => {
  it("includes exact 10% distance and 20% moving-time boundaries", () => {
    const source = activity(1, { startedAt: "2026-08-10T08:00:00Z" });
    const result = match(source, [
      activity(2, {
        startedAt: "2026-08-09T08:00:00Z",
        distanceKm: 11,
        movingTimeS: 1_200,
      }),
    ]);

    expect(result).toMatchObject({
      state: "match",
      match: {
        candidate: { id: 2 },
        distanceDifference: comparableActivityThresholds.distanceDifference,
        movingTimeDifference: comparableActivityThresholds.movingTimeDifference,
        signedDistanceDelta: 0.1,
        signedMovingTimeDelta: 0.2,
      },
    });
  });

  it("rejects values just outside either unrounded reliability boundary", () => {
    const source = activity(1, { startedAt: "2026-08-10T08:00:00Z" });
    expect(
      match(source, [
        activity(2, { startedAt: "2026-08-09T08:00:00Z", distanceKm: 11.0001, movingTimeS: 1_000 }),
      ])
    ).toEqual({ state: "no_match" });
    expect(
      match(source, [
        activity(2, { startedAt: "2026-08-09T08:00:00Z", distanceKm: 10, movingTimeS: 1_200.0001 }),
      ])
    ).toEqual({ state: "no_match" });
  });

  it("uses the current source as the denominator and never produces a limited tier", () => {
    const source = activity(1, { startedAt: "2026-08-10T08:00:00Z", distanceKm: 10 });
    const result = match(source, [
      activity(2, { startedAt: "2026-08-09T08:00:00Z", distanceKm: 9, movingTimeS: 1_000 }),
      activity(3, { startedAt: "2026-08-08T08:00:00Z", distanceKm: 12, movingTimeS: 1_000 }),
    ]);
    expect(result).toMatchObject({
      state: "match",
      match: { candidate: { id: 2 }, distanceDifference: 0.1, signedDistanceDelta: -0.1 },
    });
    expect(
      match(source, [activity(4, { startedAt: "2026-08-07T08:00:00Z", distanceKm: 11.1 })])
    ).toEqual({
      state: "no_match",
    });
  });

  it("uses existing run and ride family semantics without inferring intent", () => {
    const source = activity(1, { startedAt: "2026-08-10T08:00:00Z", sportType: "TrailRun" });
    expect(comparableSportFamily("TrailRun")).toBe("run");
    expect(comparableSportFamily("EBikeRide")).toBe("ride");
    expect(comparableSportFamily("WeightTraining")).toBeNull();
    expect(
      match(source, [
        activity(2, { startedAt: "2026-08-09T08:00:00Z", sportType: "VirtualRun" }),
        activity(3, { startedAt: "2026-08-08T08:00:00Z", sportType: "Ride" }),
      ])
    ).toMatchObject({ state: "match", match: { candidate: { id: 2 }, sportFamily: "run" } });
  });

  it("excludes malformed, future, self, same-or-later, and unsupported records", () => {
    const source = activity(1, { startedAt: "2026-08-10T08:00:00Z" });
    const unusable = [
      activity(1, { startedAt: "2026-08-09T08:00:00Z" }),
      activity(2, { startedAt: "2026-08-10T08:00:00Z" }),
      activity(3, { startedAt: "2026-08-11T08:00:00Z" }),
      activity(4, { startedAt: "2026-08-16T08:00:00Z" }),
      activity(5, { startedAt: "not-an-instant" }),
      activity(6, { distanceKm: 0 }),
      activity(7, { movingTimeS: -1 }),
      activity(8, { distanceKm: Number.NaN }),
      activity(9, { movingTimeS: Number.POSITIVE_INFINITY }),
      activity(10, { sportType: "WeightTraining" }),
    ];
    expect(match(source, unusable)).toEqual({ state: "no_match" });
    expect(isComparablePriorActivitySource(source, AS_OF)).toBe(true);
    expect(
      isComparablePriorActivitySource({ ...source, startedAt: "2026-08-16T08:00:00Z" }, AS_OF)
    ).toBe(false);
    expect(isComparablePriorActivitySource(source, "invalid")).toBe(false);
  });

  it("selects distance, then time, then newest prior instant, then highest id independently of input order", () => {
    const source = activity(1, { startedAt: "2026-08-10T08:00:00Z" });
    const distanceWinner = activity(2, {
      startedAt: "2026-08-02T08:00:00Z",
      distanceKm: 10.1,
      movingTimeS: 1_100,
    });
    const timeWinner = activity(3, {
      startedAt: "2026-08-03T08:00:00Z",
      distanceKm: 10.1,
      movingTimeS: 1_050,
    });
    const newerWinner = activity(4, {
      startedAt: "2026-08-04T08:00:00Z",
      distanceKm: 10.1,
      movingTimeS: 1_050,
    });
    const idWinner = activity(5, {
      startedAt: "2026-08-04T08:00:00Z",
      distanceKm: 10.1,
      movingTimeS: 1_050,
    });
    for (const candidates of [
      [distanceWinner, timeWinner, newerWinner, idWinner],
      [idWinner, newerWinner, timeWinner, distanceWinner],
    ]) {
      expect(match(source, candidates)).toMatchObject({
        state: "match",
        match: { candidate: { id: 5 } },
      });
    }
  });

  it("carries source handles and unrounded signed deltas for presentation", () => {
    const source = activity(1, {
      startedAt: "2026-08-10T08:00:00Z",
      distanceKm: 12,
      movingTimeS: 900,
    });
    const result = match(source, [
      activity(2, {
        startedAt: "2026-08-09T08:00:00Z",
        distanceKm: 11.4,
        movingTimeS: 810,
      }),
    ]);
    expect(result).toMatchObject({
      state: "match",
      match: { source: { id: 1 }, candidate: { id: 2 } },
    });
    if (result.state === "match") {
      expect(result.match.signedDistanceDelta).toBeCloseTo(-0.05);
      expect(result.match.signedMovingTimeDelta).toBeCloseTo(-0.1);
    }
  });
});
