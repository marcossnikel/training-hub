import { describe, expect, it } from "vitest";
import {
  bestEffortRows,
  effortTimeS,
  prBadgeEffortNames,
  type StravaBestEffort,
} from "@/lib/best-efforts";

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

  // Both duplicate orders are covered on purpose: with only the faster duplicate
  // last, "keep the fastest" and "keep whichever came last" are indistinguishable.
  it("collapses a duplicated name to the fastest of them when the SLOWER one comes last", () => {
    const rows = bestEffortRows([
      effort({ name: "1K", distance: 1000, moving_time: 280, elapsed_time: 282, pr_rank: 1 }),
      effort({ name: "5K", distance: 5000, moving_time: 1200, elapsed_time: 1200 }),
      effort({ name: "1K", distance: 1000, moving_time: 300, elapsed_time: 300, pr_rank: 3 }),
      effort({ name: "5K", distance: 5000, moving_time: 1260, elapsed_time: 1260, pr_rank: 2 }),
    ]);

    expect(rows.map((row) => row.name)).toEqual(["1K", "5K"]);
    expect(rows[0]).toEqual({
      name: "1K",
      distance_m: 1000,
      elapsed_time_s: 282,
      moving_time_s: 280,
      pr_rank: 1,
    });
    expect(rows[1]).toEqual({
      name: "5K",
      distance_m: 5000,
      elapsed_time_s: 1200,
      moving_time_s: 1200,
      pr_rank: null,
    });
  });

  it("collapses a duplicated name to the fastest of them when the FASTER one comes last", () => {
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

describe("effortTimeS", () => {
  it("prefers moving time and falls back to elapsed", () => {
    expect(effortTimeS(effort({ moving_time: 1190, elapsed_time: 1200 }))).toBe(1190);
    expect(effortTimeS(effort({ moving_time: 0, elapsed_time: 1200 }))).toBe(1200);
    expect(effortTimeS(effort({ moving_time: 0, elapsed_time: 0 }))).toBe(0);
  });
});

describe("prBadgeEffortNames", () => {
  it("badges a rank-1 effort that no stored row beats", () => {
    const names = prBadgeEffortNames(
      [effort({ name: "10K", distance: 10000, moving_time: 2735, pr_rank: 1 })],
      [{ name: "10K", moving_time_s: 2735 }]
    );
    expect([...names]).toEqual(["10K"]);
  });

  it("demotes a rank-1 effort a later run has beaten", () => {
    // The real staleness case: pr_rank is frozen when detail is first fetched, so an
    // old "1 mile" #1 of 581 s survives in the payload even though 412 s is stored.
    const names = prBadgeEffortNames(
      [effort({ name: "1 mile", distance: 1609, moving_time: 581, pr_rank: 1 })],
      [{ name: "1 mile", moving_time_s: 412 }]
    );
    expect(names.size).toBe(0);
  });

  it("badges only the fastest of two activities both claiming rank 1", () => {
    // Both the 2735 s and the 2809 s 10K carry pr_rank = 1 in the live table.
    const fastest = [{ name: "10K", moving_time_s: 2735 }];
    expect(
      prBadgeEffortNames([effort({ name: "10K", moving_time: 2809, pr_rank: 1 })], fastest).size
    ).toBe(0);
    expect(
      prBadgeEffortNames([effort({ name: "10K", moving_time: 2735, pr_rank: 1 })], fastest).size
    ).toBe(1);
  });

  it("ignores ranks other than 1", () => {
    const fastest = [{ name: "5K", moving_time_s: 1351 }];
    expect(prBadgeEffortNames([effort({ moving_time: 1351, pr_rank: 2 })], fastest).size).toBe(0);
    expect(prBadgeEffortNames([effort({ moving_time: 1351, pr_rank: null })], fastest).size).toBe(
      0
    );
  });

  it("withholds the badge when nothing is stored to check against", () => {
    expect(prBadgeEffortNames([effort({ pr_rank: 1 })], []).size).toBe(0);
    expect(
      prBadgeEffortNames(
        [effort({ name: "5K", pr_rank: 1 })],
        [{ name: "10K", moving_time_s: 2735 }]
      ).size
    ).toBe(0);
  });

  it("keeps the fastest stored time when handed several rows per name", () => {
    const names = prBadgeEffortNames(
      [effort({ moving_time: 1351, pr_rank: 1 })],
      [
        { name: "5K", moving_time_s: 1400 },
        { name: "5K", moving_time_s: 1351 },
      ]
    );
    expect([...names]).toEqual(["5K"]);
  });
});
