import { describe, expect, it } from "vitest";
import {
  buildSeries,
  paceExtent,
  panelExtent,
  zoneBands,
  type SeriesDef,
} from "@/components/activity-chart-series";
import { en } from "@/lib/i18n/en";
import { hrZones, paceZones, zoneBoundsOf, type AthleteThresholds } from "@/lib/fitness";
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
    gradePct: null,
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

describe("buildSeries zones", () => {
  // The chart holds the athlete's Zone[] and reads its boundaries through
  // fitness.ts, so a boundary can never disagree with the classification.
  const boundsOf = (series: SeriesDef) =>
    series.zones ? zoneBoundsOf(series.zones, series.invert) : null;

  it("gives heart rate the Friel bpm zones, with boundaries ascending by zone", () => {
    expect(seriesOf("heartRate", true).zones).toEqual(hrZones(thresholds));
    expect(boundsOf(seriesOf("heartRate", true))).toEqual([143, 158, 165, 176]);
    // Any sport with a trace gets HR bands, not just runs.
    expect(seriesOf("heartRate", false).zones).toEqual(hrZones(thresholds));
  });

  it("gives a run's pace the s/km zones, with boundaries descending as the zone rises", () => {
    expect(seriesOf("pace", true).zones).toEqual(paceZones(thresholds));
    expect(boundsOf(seriesOf("pace", true))).toEqual([332, 299, 286, 269]);
  });

  it("leaves pace unzoned on other sports and when a threshold is unset", () => {
    // A walk or a ride has a pace stream, but the pace zones are built from a
    // running threshold pace, so classifying against them would be nonsense.
    expect(seriesOf("pace", false).zones).toBeUndefined();
    expect(seriesOf("pace", true, { ...thresholds, thresholdPaceSPerKm: 0 }).zones).toBeUndefined();
    expect(seriesOf("heartRate", true, { ...thresholds, lthr: 0 }).zones).toBeUndefined();
  });

  it("leaves every other series unzoned", () => {
    const keys = buildSeries(
      makeStreams({ watts: [100, 200, 300], cadence: [80, 85, 90], altitudeM: [10, 20, 30] }),
      en,
      true,
      thresholds
    )
      .filter((s) => s.zones)
      .map((s) => s.key);
    expect(keys).toEqual([]);
  });
});

// Activity 1245 (a treadmill ergo test) is the worst real case: velocity_smooth
// drops to a crawl while the athlete stands on the belt, and streams.ts turns
// that into 1000/v with no ceiling.
const PACE_1245_MIN = 169;
const PACE_1245_MAX = 8333;
const PACE_1245_MEDIAN = 243;
// The four pace-zone boundaries for a 4:29/km threshold, in zone order.
const PACE_BOUNDS = [332, 299, 286, 269] as const;

describe("paceExtent", () => {
  it("keeps a stopped-GPS outlier from owning the scale (activity 1245)", () => {
    // A stream whose median is 243 s/km with the real extremes at both ends.
    const data = [PACE_1245_MAX, PACE_1245_MIN, ...Array(20).fill(PACE_1245_MEDIAN)];
    const [lo, hi] = paceExtent(data)!;
    // Bounded to 0.6x-1.6x the median instead of stretching to 8333 s/km.
    expect(lo).toBeCloseTo(151.4, 1);
    expect(hi).toBeCloseTo(406.4, 1);
    // The whole zone range stays on the scale, which the raw extent (0-8986)
    // squeezed into the top 4% of the panel.
    for (const bound of PACE_BOUNDS) {
      expect(bound).toBeGreaterThan(lo);
      expect(bound).toBeLessThan(hi);
    }
  });

  it("leaves a stream that carries no outlier on its own scale", () => {
    // A steady run: every sample is inside the window, so nothing is bounded.
    const data = [280, 290, 300, 310, 320];
    expect(paceExtent(data)).toEqual([276.8, 323.2]);
  });

  it("survives a degenerate stream (every sample equal, or none at all)", () => {
    expect(paceExtent([300, 300, 300])).toEqual([299, 301]);
    expect(paceExtent([null, null])).toBeNull();
  });

  it("is the pace panel's extent, and only the pace panel's", () => {
    const streams = makeStreams({
      paceSPerKm: [PACE_1245_MAX, PACE_1245_MIN, PACE_1245_MEDIAN],
      heartrate: [120, 150, 175],
    });
    const series = buildSeries(streams, en, true, thresholds);
    const pace = series.find((s) => s.key === "pace")!;
    const hr = series.find((s) => s.key === "heartRate")!;
    expect(panelExtent(pace)).toEqual(paceExtent(pace.data));
    // Heart rate (and every other series) keeps its full raw range.
    expect(panelExtent(hr)).toEqual([115.6, 179.4]);
  });

  it("spans the grade-adjusted overlay too, which shares the scale", () => {
    // A steady 6% climb at a constant 330 s/km. The overlay plots 241 s/km,
    // nowhere near the recorded trace's own range — scaling the panel to the
    // recorded trace alone pins every one of those samples to the panel border,
    // where a dashed line lying flat along the top reads as "the terrain was
    // constant here".
    const streams = makeStreams({
      paceSPerKm: [330, 330, 330],
      gradePct: [6, 6, 6],
    });
    const pace = buildSeries(streams, en, true, thresholds).find((s) => s.key === "pace")!;
    expect(pace.overlay).toBeDefined();
    const [lo, hi] = panelExtent(pace)!;
    for (const v of [...pace.data, ...pace.overlay!.data]) {
      expect(v).not.toBeNull();
      expect(v!).toBeGreaterThanOrEqual(lo);
      expect(v!).toBeLessThanOrEqual(hi);
    }
    // And it is genuinely wider than the recorded trace's own degenerate extent.
    expect(hi - lo).toBeGreaterThan(80);
  });
});

describe("zoneBands", () => {
  const TOP = 8;
  const PANEL_H = 68;
  const BOTTOM = TOP + PANEL_H;

  it("clamps a hairline-thin zone instead of dropping it (activity 1245, raw extent)", () => {
    // The extent the pace panel had before paceExtent bounded it: 169-8333
    // padded by 8%. Z3 (286-299 s/km) works out to 0.099 units of a 68-unit
    // panel, which the old `h > 0.1` guard skipped, silently losing a zone the
    // panel does reach.
    const wide: [number, number] = [0, 8986.28];
    const bands = zoneBands([...PACE_BOUNDS], wide, true, TOP);
    expect(bands.map((b) => b.zi)).toEqual([0, 1, 2, 3, 4]);
    for (const band of bands) expect(band.h).toBeGreaterThanOrEqual(1);
    // Every band stays inside the panel.
    for (const band of bands) {
      expect(band.y).toBeGreaterThanOrEqual(TOP);
      expect(band.y + band.h).toBeLessThanOrEqual(BOTTOM);
    }
  });

  it("omits only the zones the panel's extent never reaches", () => {
    // 300-310 s/km: Z2 (299-332) is the only zone in range.
    const bands = zoneBands([...PACE_BOUNDS], [300, 310], true, TOP);
    expect(bands.map((b) => b.zi)).toEqual([1]);
    expect(bands[0].y).toBeCloseTo(TOP, 5);
    expect(bands[0].h).toBeCloseTo(PANEL_H, 5);
  });

  it("stacks the bands of an inverted panel fastest-first from the top", () => {
    // A pace panel spanning every zone: Z5 (fastest) sits at the top edge and
    // Z1 (slowest) at the bottom, with no gaps between them.
    const bands = zoneBands([...PACE_BOUNDS], [250, 400], true, TOP);
    expect(bands.map((b) => b.zi)).toEqual([0, 1, 2, 3, 4]);
    const z1 = bands[0];
    const z5 = bands[4];
    expect(z1.y + z1.h).toBeCloseTo(BOTTOM, 5);
    expect(z5.y).toBeCloseTo(TOP, 5);
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i].y + bands[i].h).toBeCloseTo(bands[i - 1].y, 5);
    }
  });

  it("stacks a plain panel's bands the other way up", () => {
    // Heart rate, 130-180 bpm: the boundaries ascend rather than descend, and
    // the panel is not inverted, so Z1 still lands at the bottom and Z5 at the
    // top — the band order must not depend on which way the scale runs.
    const bands = zoneBands([143, 158, 165, 176], [130, 180], false, TOP);
    expect(bands.map((b) => b.zi)).toEqual([0, 1, 2, 3, 4]);
    expect(bands[0].y + bands[0].h).toBeCloseTo(BOTTOM, 5);
    expect(bands[4].y).toBeCloseTo(TOP, 5);
  });
});
