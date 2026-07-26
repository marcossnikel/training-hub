import { describe, expect, it } from "vitest";
import { buildBlock, type BlockActivity } from "./blocks";
import type { AthleteThresholds } from "./fitness";

// LTHR 176 → HR zone bounds 143 / 158 / 165 / 176.
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

const RACE_START = "2026-06-01T09:00:00Z";

/** A run inside the race week of a 4-week block. */
function run(overrides: Partial<BlockActivity> = {}): BlockActivity {
  return {
    started_at: "2026-05-27T09:00:00Z",
    sport_type: "Run",
    distance_km: 12,
    moving_time_s: 3600,
    avg_hr: 150,
    avg_pace_s_per_km: 300,
    ...overrides,
  };
}

describe("buildBlock time in zone", () => {
  it("drops a whole session into its average heart rate's zone without stored metrics", () => {
    const block = buildBlock([run()], RACE_START, 4, THRESHOLDS);
    // 150 bpm sits in Z2, so the full hour lands there — the old estimate.
    expect(block.zoneSec).toEqual([0, 3600, 0, 0, 0]);
  });

  it("prefers the persisted per-sample distribution when the activity has one", () => {
    const block = buildBlock(
      [run({ hrZoneSec: [600, 1200, 400, 900, 500] })],
      RACE_START,
      4,
      THRESHOLDS
    );
    // The interval session's hard reps are visible instead of averaged away.
    expect(block.zoneSec).toEqual([600, 1200, 400, 900, 500]);
    expect(block.easySec).toBe(1800);
    expect(block.hardSec).toBe(1800);
  });

  it("mixes measured and estimated activities in one block", () => {
    const block = buildBlock(
      [run({ hrZoneSec: [600, 600, 600, 600, 600] }), run({ avg_hr: 170 })],
      RACE_START,
      4,
      THRESHOLDS
    );
    // 170 bpm is Z4, so the second run's whole hour adds there.
    expect(block.zoneSec).toEqual([600, 600, 600, 4200, 600]);
  });

  it("ignores a stored distribution that is not five zones", () => {
    const block = buildBlock([run({ hrZoneSec: [600, 600] })], RACE_START, 4, THRESHOLDS);
    expect(block.zoneSec).toEqual([0, 3600, 0, 0, 0]);
  });

  it("still counts a quality run off its average heart rate", () => {
    const block = buildBlock(
      [run({ avg_hr: 170, hrZoneSec: [3600, 0, 0, 0, 0] }), run({ avg_hr: 140 })],
      RACE_START,
      4,
      THRESHOLDS
    );
    // The Z4 average marks the first run as quality even though its measured
    // seconds all sit in Z1; the easy run stays out of the count.
    expect(block.qualityRuns).toBe(1);
    expect(block.runs).toBe(2);
  });

  it("adds nothing to zone time for an activity with neither", () => {
    const block = buildBlock([run({ avg_hr: null })], RACE_START, 4, THRESHOLDS);
    expect(block.zoneSec).toEqual([0, 0, 0, 0, 0]);
    expect(block.totalHours).toBe(1);
  });
});
