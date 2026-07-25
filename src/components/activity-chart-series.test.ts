import { describe, expect, it } from "vitest";
import { buildSeries, zoneOfBounds } from "@/components/activity-chart-series";
import { en } from "@/lib/i18n/en";
import { hrZones, paceZones, zoneIndexOf, type AthleteThresholds } from "@/lib/fitness";
import type { ActivityStreams } from "@/lib/streams";

// Real athlete reference values: LTHR 176, threshold pace 4:29/km (269 s/km).
const thresholds: AthleteThresholds = {
  maxHr: 190,
  restingHr: 45,
  lthr: 176,
  thresholdPaceSPerKm: 269,
  ftpW: 250,
  restingHrEstimated: false,
  ftpProvisional: false,
  updatedAt: null,
};

const N = 3;

function makeStreams(overrides: Partial<ActivityStreams>): ActivityStreams {
  return {
    n: N,
    distanceKm: Array.from({ length: N }, (_, i) => i),
    timeS: Array.from({ length: N }, (_, i) => i * 60),
    heartrate: null,
    paceSPerKm: null,
    watts: null,
    cadence: null,
    altitudeM: null,
    ...overrides,
  };
}

// Strava stores run cadence in the same field a bike fills with crank rpm, so the
// chart has to choose a unit and stick to it: doubled spm for runs, raw rpm for
// everything else.
const cadenceOf = (isRun: boolean, cadence: (number | null)[]) => {
  const series = buildSeries(makeStreams({ cadence }), en, isRun, thresholds).find(
    (s) => s.key === "cadence"
  );
  if (!series) throw new Error("cadence series missing");
  return series;
};

const seriesOf = (
  key: "heartRate" | "pace",
  isRun: boolean,
  th: AthleteThresholds = thresholds
) => {
  const series = buildSeries(
    makeStreams({ heartrate: [120, 150, 175], paceSPerKm: [400, 300, 260] }),
    en,
    isRun,
    th
  ).find((s) => s.key === key);
  if (!series) throw new Error(`${key} series missing`);
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

describe("buildSeries zoneBounds", () => {
  it("gives heart rate the Friel bpm boundaries, ascending with the zone", () => {
    expect(seriesOf("heartRate", true).zoneBounds).toEqual([143, 158, 165, 176]);
    // Any sport with a trace gets HR bands, not just runs.
    expect(seriesOf("heartRate", false).zoneBounds).toEqual([143, 158, 165, 176]);
  });

  it("gives a run's pace the s/km boundaries, descending as the zone rises", () => {
    expect(seriesOf("pace", true).zoneBounds).toEqual([332, 299, 286, 269]);
  });

  it("leaves pace unzoned on other sports and when a threshold is unset", () => {
    // A walk or a ride has a pace stream, but the pace zones are built from a
    // running threshold pace, so classifying against them would be nonsense.
    expect(seriesOf("pace", false).zoneBounds).toBeUndefined();
    expect(
      seriesOf("pace", true, { ...thresholds, thresholdPaceSPerKm: 0 }).zoneBounds
    ).toBeUndefined();
    expect(seriesOf("heartRate", true, { ...thresholds, lthr: 0 }).zoneBounds).toBeUndefined();
  });

  it("leaves every other series unzoned", () => {
    const keys = buildSeries(
      makeStreams({ watts: [100, 200, 300], cadence: [80, 85, 90], altitudeM: [10, 20, 30] }),
      en,
      true,
      thresholds
    )
      .filter((s) => s.zoneBounds)
      .map((s) => s.key);
    expect(keys).toEqual([]);
  });
});

describe("zoneOfBounds", () => {
  it("classifies heart rates exactly like zoneIndexOf on the same zones", () => {
    const bounds = seriesOf("heartRate", true).zoneBounds!;
    const zones = hrZones(thresholds);
    for (const hr of [90, 142, 143, 157, 158, 164, 165, 175, 176, 210]) {
      expect(zoneOfBounds(hr, bounds, false)).toBe(zoneIndexOf(hr, zones));
    }
  });

  it("classifies paces exactly like zoneIndexOf, where a smaller value is faster", () => {
    const bounds = seriesOf("pace", true).zoneBounds!;
    const zones = paceZones(thresholds);
    for (const pace of [420, 333, 332, 331, 300, 299, 290, 286, 270, 269, 240]) {
      expect(zoneOfBounds(pace, bounds, true)).toBe(zoneIndexOf(pace, zones));
    }
  });
});
