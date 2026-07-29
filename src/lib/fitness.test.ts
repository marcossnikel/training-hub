import { describe, expect, it } from "vitest";
import {
  easyHardPct,
  hrZones,
  paceZones,
  powerZones,
  zoneBoundsOf,
  zoneIndexOf,
  zoneSeconds,
  type AthleteThresholds,
} from "@/lib/fitness";

// Real athlete reference values from PROGRESS.md: LTHR 176, threshold pace
// 4:29/km (269 s/km), max HR 190.
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

describe("hrZones", () => {
  it("computes Friel bpm cut points for LTHR 176", () => {
    const zones = hrZones(thresholds);
    expect(zones.map((z) => [z.min, z.max])).toEqual([
      [null, 143],
      [143, 158],
      [158, 165],
      [165, 176],
      [176, null],
    ]);
  });
});

describe("paceZones", () => {
  it("computes s/km cut points for threshold pace 269", () => {
    const zones = paceZones(thresholds);
    expect(zones.map((z) => [z.min, z.max])).toEqual([
      [332, null],
      [299, 332],
      [286, 299],
      [269, 286],
      [null, 269],
    ]);
  });
});

describe("powerZones", () => {
  it("computes %FTP watt cut points for FTP 250", () => {
    const zones = powerZones(thresholds);
    expect(zones.map((z) => [z.min, z.max])).toEqual([
      [null, 138],
      [138, 188],
      [188, 225],
      [225, 263],
      [263, null],
    ]);
  });
});

describe("zoneIndexOf", () => {
  it("classifies heart rates with min inclusive and max exclusive", () => {
    const zones = hrZones(thresholds);
    expect(zoneIndexOf(120, zones)).toBe(0);
    expect(zoneIndexOf(143, zones)).toBe(1);
    expect(zoneIndexOf(157, zones)).toBe(1);
    expect(zoneIndexOf(158, zones)).toBe(2);
    expect(zoneIndexOf(176, zones)).toBe(4);
    expect(zoneIndexOf(210, zones)).toBe(4);
  });

  it("classifies paces, where a smaller value is faster", () => {
    const zones = paceZones(thresholds);
    expect(zoneIndexOf(400, zones)).toBe(0); // slow jog
    expect(zoneIndexOf(332, zones)).toBe(0);
    expect(zoneIndexOf(331, zones)).toBe(1);
    expect(zoneIndexOf(290, zones)).toBe(2);
    expect(zoneIndexOf(269, zones)).toBe(3); // threshold pace itself
    expect(zoneIndexOf(240, zones)).toBe(4);
  });

  it("classifies power against the %FTP bands", () => {
    const zones = powerZones(thresholds);
    expect(zoneIndexOf(100, zones)).toBe(0);
    expect(zoneIndexOf(200, zones)).toBe(2);
    expect(zoneIndexOf(250, zones)).toBe(3);
    expect(zoneIndexOf(300, zones)).toBe(4);
  });

  it("returns -1 when no zone matches", () => {
    expect(zoneIndexOf(150, [{ zone: 1, min: 200, max: 220 }])).toBe(-1);
  });
});

describe("zoneBoundsOf", () => {
  it("reads the ascending bpm boundaries off the HR zones", () => {
    const bounds = zoneBoundsOf(hrZones(thresholds), false);
    expect(bounds).toEqual([143, 158, 165, 176]);
    // Each boundary is where zoneIndexOf switches to the next zone up.
    bounds!.forEach((bound, i) => {
      expect(zoneIndexOf(bound, hrZones(thresholds))).toBe(i + 1);
      expect(zoneIndexOf(bound - 1, hrZones(thresholds))).toBe(i);
    });
  });

  it("reads the descending s/km boundaries off the pace zones", () => {
    const bounds = zoneBoundsOf(paceZones(thresholds), true);
    expect(bounds).toEqual([332, 299, 286, 269]);
    // Same rule on an inverted scale: at the boundary the athlete is in the
    // faster zone, one second per km slower and they are in the slower one.
    bounds!.forEach((bound, i) => {
      expect(zoneIndexOf(bound, paceZones(thresholds))).toBe(i);
      expect(zoneIndexOf(bound - 1, paceZones(thresholds))).toBe(i + 1);
    });
  });

  it("returns null rather than a short list when the zone set is malformed", () => {
    // A short list would shift every band colour and tooltip label by one zone
    // with nothing to signal it, so it must not be representable.
    expect(zoneBoundsOf(hrZones(thresholds).slice(0, 4), false)).toBeNull();
    const openMiddle = hrZones(thresholds).map((z) => (z.zone === 3 ? { ...z, max: null } : z));
    expect(zoneBoundsOf(openMiddle, false)).toBeNull();
    // Reading the wrong end of each zone also comes back empty-handed: HR zone
    // 1 has no min, pace zone 1 has no max.
    expect(zoneBoundsOf(hrZones(thresholds), true)).toBeNull();
    expect(zoneBoundsOf(paceZones(thresholds), false)).toBeNull();
  });
});

describe("zoneSeconds", () => {
  it("attributes each interval to the zone of its leading sample", () => {
    // 3 minutes: one in Z1, one in Z2, one in Z4. The final sample opens no
    // interval, so its zone (Z5) gets nothing.
    const zoneSec = zoneSeconds([0, 60, 120, 180], [130, 150, 170, 200], hrZones(thresholds));
    expect(zoneSec).toEqual([60, 60, 0, 60, 0]);
  });

  it("sums to the elapsed span the samples cover", () => {
    const zoneSec = zoneSeconds([0, 10, 20, 30], [150, 150, 150, 150], hrZones(thresholds));
    expect(zoneSec?.reduce((a, b) => a + b, 0)).toBe(30);
  });

  it("skips null samples, null timestamps and non-advancing time", () => {
    const zoneSec = zoneSeconds(
      [0, 30, 60, 60, 90, null, 150],
      [400, null, 260, 260, 260, 260, 260],
      paceZones(thresholds)
    );
    // 30 s of jogging (Z1), then 30 s faster than threshold (Z5). The null pace,
    // the zero-length interval and the null timestamp contribute nothing.
    expect(zoneSec).toEqual([30, 0, 0, 0, 30]);
  });

  it("returns null when no sample could be classified", () => {
    expect(zoneSeconds([0, 60, 120], [null, null, null], hrZones(thresholds))).toBeNull();
    expect(zoneSeconds([], [], hrZones(thresholds))).toBeNull();
  });
});

describe("easyHardPct", () => {
  it("splits Z1-2 from Z3-5", () => {
    expect(easyHardPct([600, 1800, 400, 200, 0])).toEqual({ easyPct: 80, hardPct: 20 });
  });

  it("always sums to 100 despite rounding", () => {
    const split = easyHardPct([1, 1, 1, 0, 0]);
    expect(split).toEqual({ easyPct: 67, hardPct: 33 });
  });

  it("returns null for an empty distribution", () => {
    expect(easyHardPct([0, 0, 0, 0, 0])).toBeNull();
  });
});
