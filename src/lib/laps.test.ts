import { describe, expect, it } from "vitest";
import { distanceAtTime, lapWindows } from "./laps";
import type { StravaLap } from "./strava";

/** A lap as Strava sends one, with only the fields the windows are built from. */
function lap(fields: Partial<StravaLap>): StravaLap {
  return fields;
}

/** Laps starting `startS` seconds apart on a fixed instant, each `durations[i]` long. */
function paced(durations: number[], gapS = 0): StravaLap[] {
  const base = Date.parse("2026-07-21T10:00:00Z");
  let offset = 0;
  return durations.map((elapsed, i) => {
    const start = new Date(base + offset * 1000).toISOString();
    offset += elapsed + gapS;
    return lap({ lap_index: i + 1, elapsed_time: elapsed, start_date: start });
  });
}

describe("lapWindows", () => {
  it("lays contiguous laps end to end from zero", () => {
    expect(lapWindows(paced([300, 120, 240]))).toEqual([
      { label: "1", startS: 0, endS: 300 },
      { label: "2", startS: 300, endS: 420 },
      { label: "3", startS: 420, endS: 660 },
    ]);
  });

  it("keeps the pause between two laps out of both windows", () => {
    // A 20 s auto-pause between laps belongs to neither lap's elapsed time. The
    // start dates place lap 2 after it, so lap 2 still lines up with the stream.
    expect(lapWindows(paced([300, 120], 20))).toEqual([
      { label: "1", startS: 0, endS: 300 },
      { label: "2", startS: 320, endS: 440 },
    ]);
  });

  it("accumulates durations when the laps carry no start dates", () => {
    const laps = [
      lap({ lap_index: 1, elapsed_time: 300 }),
      lap({ lap_index: 2, elapsed_time: 120 }),
    ];
    expect(lapWindows(laps)).toEqual([
      { label: "1", startS: 0, endS: 300 },
      { label: "2", startS: 300, endS: 420 },
    ]);
  });

  it("accumulates from the last known start when one lap's date is missing", () => {
    const dated = paced([300, 120, 240]);
    const laps = [dated[0], lap({ lap_index: 2, elapsed_time: 120 }), dated[2]];
    expect(lapWindows(laps)).toEqual([
      { label: "1", startS: 0, endS: 300 },
      { label: "2", startS: 300, endS: 420 },
      { label: "3", startS: 420, endS: 660 },
    ]);
  });

  it("falls back to moving time when elapsed time is missing, and drops a lap with neither", () => {
    const laps = [
      lap({ lap_index: 1, moving_time: 300 }),
      lap({ lap_index: 2 }),
      lap({ lap_index: 3, elapsed_time: 60 }),
    ];
    expect(lapWindows(laps)).toEqual([
      { label: "1", startS: 0, endS: 300 },
      { label: "3", startS: 300, endS: 360 },
    ]);
  });

  it("never lets a lap start before the previous one ended", () => {
    // Overlapping start dates (the second lap's date predates the first lap's
    // end) would otherwise draw two lap rects on top of each other.
    const base = Date.parse("2026-07-21T10:00:00Z");
    const laps = [
      lap({ lap_index: 1, elapsed_time: 300, start_date: new Date(base).toISOString() }),
      lap({
        lap_index: 2,
        elapsed_time: 120,
        start_date: new Date(base + 200_000).toISOString(),
      }),
    ];
    const windows = lapWindows(laps);
    expect(windows[1].startS).toBe(300);
    expect(windows[0].endS).toBeLessThanOrEqual(windows[1].startS);
  });

  it("numbers laps by position when Strava sends no lap index", () => {
    expect(
      lapWindows([lap({ elapsed_time: 60 }), lap({ elapsed_time: 60 })]).map((w) => w.label)
    ).toEqual(["1", "2"]);
  });

  it("returns nothing for no laps", () => {
    expect(lapWindows([])).toEqual([]);
  });
});

describe("distanceAtTime", () => {
  const timeS = [0, 60, 120, 180];
  const distanceKm = [0, 0.2, 0.5, 0.9];

  it("returns the sample's own distance at a sample time", () => {
    expect(distanceAtTime(timeS, distanceKm, 120)).toBeCloseTo(0.5, 6);
  });

  it("interpolates between the two samples that bracket the time", () => {
    // Halfway through the 60–120 s sample gap, which covers 0.2 → 0.5 km.
    expect(distanceAtTime(timeS, distanceKm, 90)).toBeCloseTo(0.35, 6);
  });

  it("clamps to the stream's first and last distance outside its range", () => {
    expect(distanceAtTime([30, 60], [0.1, 0.2], 0)).toBeCloseTo(0.1, 6);
    expect(distanceAtTime(timeS, distanceKm, 1_000)).toBeCloseTo(0.9, 6);
  });

  it("skips samples missing a time or a distance", () => {
    const sparse = distanceAtTime([0, null, 120, 180], [0, 0.2, null, 0.9], 60);
    // Only 0 s / 0 km and 180 s / 0.9 km are usable, so 60 s is a third of the way.
    expect(sparse).toBeCloseTo(0.3, 6);
  });

  it("returns null when no sample carries both a time and a distance", () => {
    expect(distanceAtTime([null, null], [0.1, 0.2], 10)).toBeNull();
    expect(distanceAtTime([], [], 10)).toBeNull();
  });
});
