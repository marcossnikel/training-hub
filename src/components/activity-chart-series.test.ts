import { describe, expect, it } from "vitest";
import { buildSeries } from "@/components/activity-chart-series";
import { en } from "@/lib/i18n/en";
import type { ActivityStreams } from "@/lib/streams";

// Strava stores run cadence in the same field a bike fills with crank rpm, so the
// chart has to choose a unit and stick to it: doubled spm for runs, raw rpm for
// everything else.
function streams(cadence: (number | null)[]): ActivityStreams {
  const n = cadence.length;
  return {
    n,
    distanceKm: Array.from({ length: n }, (_, i) => i),
    timeS: Array.from({ length: n }, (_, i) => i * 60),
    heartrate: null,
    paceSPerKm: null,
    watts: null,
    cadence,
    altitudeM: null,
  };
}

const cadenceOf = (isRun: boolean, cadence: (number | null)[]) => {
  const series = buildSeries(streams(cadence), en, isRun).find((s) => s.key === "cadence");
  if (!series) throw new Error("cadence series missing");
  return series;
};

describe("buildSeries cadence", () => {
  it("doubles a run's one-leg cadence into steps per minute", () => {
    const series = cadenceOf(true, [86.5, null, 90]);
    expect(series.unit).toBe("spm");
    expect(series.data).toEqual([173, null, 180]);
    // The formatter labels the already-doubled value instead of doubling again.
    expect(series.fmt(173)).toBe("173 spm");
    expect(series.tick(173)).toBe("173");
  });

  it("leaves a ride's crank cadence in rpm", () => {
    const series = cadenceOf(false, [86.5, null, 90]);
    expect(series.unit).toBe("rpm");
    expect(series.data).toEqual([86.5, null, 90]);
    expect(series.fmt(86.5)).toBe("87 rpm");
  });
});
