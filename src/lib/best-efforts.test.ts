import { describe, expect, it } from "vitest";
import { bestEffortRows, type StravaBestEffort } from "@/lib/best-efforts";

function effort(overrides: Partial<StravaBestEffort> = {}): StravaBestEffort {
  return {
    name: "5K",
    distance: 5000,
    moving_time: 1200,
    elapsed_time: 1200,
    pr_rank: null,
    ...overrides,
  };
}

describe("bestEffortRows", () => {
  it("maps a payload effort onto the table's columns", () => {
    // Shape and values taken from a real cached payload (activity 12, "1K").
    expect(
      bestEffortRows([
        { name: "1K", distance: 1000, moving_time: 291, elapsed_time: 291, pr_rank: 2 },
      ])
    ).toEqual([
      { name: "1K", distance_m: 1000, elapsed_time_s: 291, moving_time_s: 291, pr_rank: 2 },
    ]);
  });

  it("keeps Strava's ascending-distance order across a full run payload", () => {
    const rows = bestEffortRows([
      effort({ name: "400m", distance: 400, moving_time: 105, elapsed_time: 105 }),
      effort({ name: "1K", distance: 1000, moving_time: 291, elapsed_time: 291 }),
      effort({ name: "1 mile", distance: 1609, moving_time: 461, elapsed_time: 461 }),
    ]);

    expect(rows.map((row) => row.name)).toEqual(["400m", "1K", "1 mile"]);
  });

  it("returns nothing for a missing, null or non-array payload", () => {
    expect(bestEffortRows(undefined)).toEqual([]);
    expect(bestEffortRows(null)).toEqual([]);
    expect(bestEffortRows([])).toEqual([]);
    expect(bestEffortRows("nope" as unknown as StravaBestEffort[])).toEqual([]);
  });

  it("drops efforts without a usable name, duration or distance", () => {
    expect(
      bestEffortRows([
        effort({ name: "" }),
        effort({ name: "   " }),
        effort({ name: undefined as unknown as string }),
        effort({ moving_time: 0, elapsed_time: 0 }),
        effort({ moving_time: -5, elapsed_time: -5 }),
        effort({ distance: 0 }),
        effort({ distance: undefined as unknown as number }),
      ])
    ).toEqual([]);
  });

  it("trims the name and rounds fractional durations to whole seconds", () => {
    expect(
      bestEffortRows([effort({ name: " 5K ", moving_time: 1200.4, elapsed_time: 1201.6 })])
    ).toEqual([
      { name: "5K", distance_m: 5000, elapsed_time_s: 1202, moving_time_s: 1200, pr_rank: null },
    ]);
  });

  it("fills a missing time from the other one, in both directions", () => {
    const [fromElapsed] = bestEffortRows([effort({ moving_time: 0, elapsed_time: 1210 })]);
    expect(fromElapsed).toMatchObject({ moving_time_s: 1210, elapsed_time_s: 1210 });

    const [fromMoving] = bestEffortRows([effort({ moving_time: 1190, elapsed_time: 0 })]);
    expect(fromMoving).toMatchObject({ moving_time_s: 1190, elapsed_time_s: 1190 });
  });

  it("normalises pr_rank: only a positive integer counts as a PR", () => {
    const ranks = bestEffortRows([
      effort({ name: "a", pr_rank: 1 }),
      effort({ name: "b", pr_rank: 3 }),
      effort({ name: "c", pr_rank: 0 }),
      effort({ name: "d", pr_rank: null }),
      effort({ name: "e", pr_rank: undefined as unknown as number }),
      effort({ name: "f", pr_rank: 1.5 }),
    ]).map((row) => row.pr_rank);

    expect(ranks).toEqual([1, 3, null, null, null, null]);
  });

  it("collapses a duplicated name to the fastest of them, keeping its position", () => {
    const rows = bestEffortRows([
      effort({ name: "1K", distance: 1000, moving_time: 300, elapsed_time: 300, pr_rank: 3 }),
      effort({ name: "5K", distance: 5000, moving_time: 1200, elapsed_time: 1200 }),
      effort({ name: "1K", distance: 1000, moving_time: 280, elapsed_time: 282, pr_rank: 1 }),
    ]);

    expect(rows.map((row) => row.name)).toEqual(["1K", "5K"]);
    expect(rows[0]).toEqual({
      name: "1K",
      distance_m: 1000,
      elapsed_time_s: 282,
      moving_time_s: 280,
      pr_rank: 1,
    });
  });
});
