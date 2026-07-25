// @vitest-environment jsdom
//
// Component test: runs ONLY in jsdom via the pragma above. All other
// `src/**/*.test.ts` suites keep the node environment from vitest.config.ts.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ActivityChart } from "@/components/activity-chart";
import { PANEL_H, TOP } from "@/components/activity-chart-series";
import { paceZones, zoneSeconds, type AthleteThresholds } from "@/lib/fitness";
import type { ActivityStreams } from "@/lib/streams";

afterEach(cleanup);

// LTHR 176 => HR zone boundaries 143 / 158 / 165 / 176 bpm.
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

const N = 5;
const ramp = (a: number, b: number) =>
  Array.from({ length: N }, (_, i) => a + ((b - a) * i) / (N - 1));

// Base grid every activity shares (distance + time present), with all optional
// series absent by default so each case turns on only what it needs.
function makeStreams(overrides: Partial<ActivityStreams>): ActivityStreams {
  return {
    n: N,
    distanceKm: ramp(0, 4),
    timeS: ramp(0, 1200),
    heartrate: null,
    paceSPerKm: null,
    watts: null,
    cadence: null,
    altitudeM: null,
    ...overrides,
  };
}

const pressed = (name: string) => screen.getByRole("button", { name }).getAttribute("aria-pressed");

describe("ActivityChart default-series resync on activity change", () => {
  it("resyncs the default selected series when the activity changes (client nav reuses the instance)", () => {
    // Activity A, a run: HR + pace + elevation present. Run default emphasizes
    // heart rate / pace / elevation. No power/cadence streams => no such toggles.
    const runStreams = makeStreams({
      heartrate: ramp(120, 160),
      paceSPerKm: ramp(300, 280),
      altitudeM: ramp(10, 40),
    });

    const { rerender } = render(
      <ActivityChart
        activityId={1}
        streams={runStreams}
        isRun={true}
        isRide={false}
        thresholds={thresholds}
      />
    );

    // Sanity: the run's own default is active on first mount.
    expect(pressed("Pace")).toBe("true");
    expect(pressed("Heart rate")).toBe("true");
    expect(pressed("Elevation")).toBe("true");
    expect(screen.queryByRole("button", { name: "Power" })).toBeNull();

    // Activity B, a ride: power + HR + cadence + elevation present. Ride
    // default emphasizes power / heart rate / cadence / elevation.
    const rideStreams = makeStreams({
      watts: ramp(180, 240),
      heartrate: ramp(130, 165),
      cadence: ramp(80, 92),
      altitudeM: ramp(5, 30),
    });

    // Re-render the SAME instance (same tree position) with B's props, exactly
    // as client-side navigation between two /activity/[id] pages would.
    rerender(
      <ActivityChart
        activityId={2}
        streams={rideStreams}
        isRun={false}
        isRide={true}
        thresholds={thresholds}
      />
    );

    // The chart must now show the NEW activity's default (power + cadence),
    // not the stale run default carried over from A.
    expect(pressed("Power")).toBe("true");
    expect(pressed("Cadence")).toBe("true");
    expect(pressed("Heart rate")).toBe("true");
  });

  it("selects the time axis when the new activity has no distance stream", () => {
    // Activity A: a normal run with a distance stream (distance axis default).
    const withDistance = makeStreams({
      heartrate: ramp(120, 160),
      altitudeM: ramp(10, 40),
    });
    const { rerender, container } = render(
      <ActivityChart
        activityId={1}
        streams={withDistance}
        isRun={true}
        isRide={false}
        thresholds={thresholds}
      />
    );
    expect(pressed("Distance")).toBe("true");

    // Activity B: a treadmill run — time present, distance stream all null. The
    // resync used to force xMode back to "distance", leaving an empty x-axis and
    // a blank chart. It must fall back to the time axis instead.
    const timeOnly = makeStreams({
      distanceKm: Array.from({ length: N }, () => null),
      timeS: ramp(0, 1200),
      heartrate: ramp(120, 160),
    });
    rerender(
      <ActivityChart
        activityId={2}
        streams={timeOnly}
        isRun={true}
        isRide={false}
        thresholds={thresholds}
      />
    );

    // Time is the active x-axis; the distance toggle is absent (no usable data).
    expect(pressed("Time")).toBe("true");
    expect(screen.queryByRole("button", { name: "Distance" })).toBeNull();
    // A series is actually drawn, not a blank chart.
    expect(container.querySelectorAll("path").length).toBeGreaterThan(0);
  });
});

// The zone bands are tagged with their zone number, so these selectors keep
// hold of exactly the bands as other rects join the SVG (T17's lap strip next).
const bandsOf = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("rect[data-zone-band]")).map((r) => ({
    zone: r.getAttribute("data-zone-band"),
    fill: r.getAttribute("fill"),
    y: Number(r.getAttribute("y")),
    h: Number(r.getAttribute("height")),
  }));

/** The panel-height share of each zone's band, in zone order (0 when absent). */
const bandShares = (container: HTMLElement) => {
  const shares = new Array(5).fill(0);
  for (const band of bandsOf(container)) shares[Number(band.zone) - 1] = band.h / PANEL_H;
  return shares;
};

describe("ActivityChart zone bands", () => {
  const hrOnly = makeStreams({ heartrate: [120, 150, 160, 166, 180] });

  it("shades each zone the panel reaches, clamped to the panel and coloured in zone order", () => {
    const { container } = render(
      <ActivityChart
        activityId={1}
        streams={hrOnly}
        isRun={true}
        isRide={false}
        thresholds={thresholds}
      />
    );
    const bands = bandsOf(container);
    // 120–180 bpm spans Z1 to Z5, so all five bands are drawn, bottom (Z1) up.
    expect(bands.map((b) => b.fill)).toEqual([
      "var(--primary)",
      "var(--chart-2)",
      "var(--chart-3)",
      "var(--chart-4)",
      "var(--chart-5)",
    ]);
    for (const b of bands) expect(b.h).toBeGreaterThan(0);
    // Stacked without gaps or overlap, and inside the panel's y extent. The
    // rects carry one decimal like every other coordinate in the chart, so
    // adjacent edges meet to within that rounding rather than exactly.
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i].y + bands[i].h).toBeCloseTo(bands[i - 1].y, 0);
    }
    const lowest = bands[0];
    const highest = bands[bands.length - 1];
    expect(lowest.y + lowest.h).toBeCloseTo(TOP + PANEL_H, 0);
    expect(highest.y).toBeCloseTo(TOP, 0);
  });

  it("drops the bands of zones the panel never reaches", () => {
    // A steady easy run: 120–130 bpm never leaves Z1, so only Z1 is shaded.
    const { container } = render(
      <ActivityChart
        activityId={1}
        streams={makeStreams({ heartrate: ramp(120, 130) })}
        isRun={true}
        isRide={false}
        thresholds={thresholds}
      />
    );
    expect(bandsOf(container).map((b) => b.fill)).toEqual(["var(--primary)"]);
  });

  it("draws nothing when the threshold the zones need is unset", () => {
    const { container } = render(
      <ActivityChart
        activityId={1}
        streams={hrOnly}
        isRun={true}
        isRide={false}
        thresholds={{ ...thresholds, lthr: 0 }}
      />
    );
    expect(bandsOf(container)).toHaveLength(0);
  });

  it("names the hovered sample's zone in the tooltip", () => {
    render(
      <ActivityChart
        activityId={1}
        streams={hrOnly}
        isRun={true}
        isRide={false}
        thresholds={thresholds}
      />
    );
    // Keyboard cursor to the second sample (150 bpm => Z2, 143–157).
    fireEvent.keyDown(screen.getByRole("img", { name: "Analysis" }), { key: "ArrowRight" });
    expect(screen.getByText("Z2")).toBeTruthy();
  });
});

describe("ActivityChart inverted pace panel", () => {
  // Only pace is present, so the run default renders that single panel.
  const paceOnly = (pace: (number | null)[]) => makeStreams({ paceSPerKm: pace });

  /** The trace's y coordinates, in sample order, read off the drawn path. */
  const traceY = (container: HTMLElement) =>
    Array.from(container.querySelectorAll("path")).flatMap((path) =>
      Array.from((path.getAttribute("d") ?? "").matchAll(/[ML]([\d.]+),([\d.]+)/g)).map((m) =>
        Number(m[2])
      )
    );

  it("puts Z5 where fast paces plot and Z1 where slow ones do", () => {
    // A run sweeping 6:40/km down to 4:00/km passes through all five zones. On
    // an inverted panel a faster (smaller) pace plots HIGHER, so the band order
    // has to flip with it: Z5 at the top edge, Z1 at the bottom.
    const { container } = render(
      <ActivityChart
        activityId={1}
        streams={paceOnly([400, 340, 300, 280, 240])}
        isRun={true}
        isRide={false}
        thresholds={thresholds}
      />
    );
    const bands = bandsOf(container);
    expect(bands.map((b) => b.zone)).toEqual(["1", "2", "3", "4", "5"]);
    expect(bands.map((b) => b.fill)).toEqual([
      "var(--primary)",
      "var(--chart-2)",
      "var(--chart-3)",
      "var(--chart-4)",
      "var(--chart-5)",
    ]);
    const z1 = bands[0];
    const z5 = bands[4];
    expect(z1.y + z1.h).toBeCloseTo(TOP + PANEL_H, 1); // Z1 on the bottom edge
    expect(z5.y).toBeCloseTo(TOP, 1); // Z5 on the top edge

    // And the trace agrees: the slowest sample is drawn inside the Z1 band, the
    // fastest inside the Z5 band. This is what a flipped band order breaks.
    const ys = traceY(container);
    const slowest = ys[0];
    const fastest = ys[ys.length - 1];
    expect(slowest).toBeGreaterThanOrEqual(z1.y);
    expect(slowest).toBeLessThanOrEqual(z1.y + z1.h);
    expect(fastest).toBeGreaterThanOrEqual(z5.y);
    expect(fastest).toBeLessThanOrEqual(z5.y + z5.h);
  });

  it("shades the single zone in range when every sample is identical", () => {
    // A degenerate extent (min === max, widened to +/-1 s/km): only the zone the
    // pace sits in is in range, and it takes the whole panel.
    const { container } = render(
      <ActivityChart
        activityId={1}
        streams={paceOnly([300, 300, 300, 300, 300])}
        isRun={true}
        isRide={false}
        thresholds={thresholds}
      />
    );
    const bands = bandsOf(container);
    expect(bands.map((b) => b.zone)).toEqual(["2"]); // 5:00/km is Z2 (299-332)
    expect(bands[0].y).toBeCloseTo(TOP, 1);
    expect(bands[0].h).toBeCloseTo(PANEL_H, 1);
  });
});

/** A pace stream written compactly, with "-" for a sample the GPS dropped. */
const paceStream = (samples: string) =>
  samples.split(" ").map((v) => (v === "-" ? null : Number(v)));

// Real cached pace streams (s/km) with their sample times, thinned to every 4th
// sample. Activity 267 is a 10k race with walk breaks (one stopped-GPS sample at
// 746 s/km); activity 1245 is a treadmill ergo test whose stopped-belt samples
// reach 3571 s/km here and 8333 s/km at full resolution.
const PACE_267 = paceStream(
  "- 255 270 262 266 275 255 269 269 255 256 291 275 286 251 298 303 256 284 287 289 305 307 301 267 267 248 267 270 287 321 275 272 272 278 286 294 282 279 275 291 301 314 296 301 314 309 282 385 294 746 327 338 286 318 301 325 307 331 362 342 333 376 397 276 345 347 735 336 521 352 291 292 325 333 296 352 781 254 259 267 287 289 275 298 260 282 265 287 267 388 198 234 230 266 556 455 251 265 225"
);
const TIME_267 = [
  0, 30, 59, 89, 118, 148, 177, 207, 236, 266, 295, 325, 354, 384, 413, 443, 472, 502, 531, 561,
  590, 620, 650, 679, 709, 738, 768, 797, 827, 856, 886, 915, 945, 974, 1004, 1033, 1063, 1092,
  1122, 1151, 1181, 1210, 1240, 1270, 1299, 1329, 1358, 1388, 1417, 1447, 1476, 1506, 1535, 1565,
  1594, 1624, 1653, 1683, 1712, 1742, 1771, 1801, 1830, 1860, 1890, 1919, 1949, 1978, 2008, 2037,
  2067, 2096, 2126, 2155, 2185, 2214, 2244, 2273, 2303, 2332, 2362, 2391, 2421, 2450, 2480, 2510,
  2539, 2569, 2598, 2628, 2657, 2687, 2716, 2746, 2775, 2805, 2834, 2864, 2893, 2923,
];
const PACE_1245 = paceStream(
  "- 1724 543 602 3571 420 379 370 352 325 303 345 246 242 244 246 249 251 250 251 251 245 238 - - - - 2778 442 463 467 365 373 424 299 250 248 251 248 251 249 248 246 240 243 242 246 242 245 248 249 246 245 242 236 240 238 238 238 239 238 236 238 235 233 233 234 230 228 231 228 228 229 227 222 218 188 222 226 226 203 182 170 172 179 236 179 185 187 189 - - - - - - - - - -"
);
const TIME_1245 = [
  0, 17, 33, 50, 67, 83, 100, 116, 133, 150, 166, 183, 200, 216, 233, 249, 266, 283, 299, 316, 333,
  349, 366, 383, 399, 416, 432, 597, 614, 630, 647, 664, 680, 697, 713, 730, 747, 763, 780, 797,
  813, 830, 847, 863, 880, 896, 913, 930, 946, 963, 980, 996, 1013, 1029, 1046, 1063, 1079, 1096,
  1113, 1129, 1146, 1163, 1179, 1196, 1212, 1229, 1246, 1262, 1279, 1296, 1312, 1329, 1345, 1362,
  1379, 1395, 1412, 1429, 1445, 1462, 1479, 1495, 1512, 1528, 1545, 1562, 1578, 1595, 1612, 1628,
  1645, 1661, 1678, 1695, 1711, 1728, 1745, 1761, 1778, 1795,
];

describe("ActivityChart pace bands on real streams", () => {
  const paceStreams = (pace: (number | null)[], time: (number | null)[]): ActivityStreams => ({
    n: pace.length,
    distanceKm: pace.map(() => null),
    timeS: time,
    heartrate: null,
    paceSPerKm: pace,
    watts: null,
    cadence: null,
    altitudeM: null,
  });

  it.each([
    { id: 267, pace: PACE_267, time: TIME_267 },
    { id: 1245, pace: PACE_1245, time: TIME_1245 },
  ])(
    "activity $id: every zone is shaded, in the proportions its zone card reports",
    ({ pace, time }) => {
      const { container } = render(
        <ActivityChart
          activityId={1}
          streams={paceStreams(pace, time)}
          isRun={true}
          isRide={false}
          thresholds={thresholds}
        />
      );
      const shares = bandShares(container);
      // Not one zone the workout passed through is missing: on the raw extent
      // activity 1245's Z3 came out a fraction of a unit tall (0.099 at full
      // resolution) and was dropped outright.
      expect(shares.every((share) => share > 0)).toBe(true);
      // No zone owns the panel any more (Z1 had 84% of activity 267's and 96%
      // of activity 1245's).
      expect(Math.max(...shares)).toBeLessThan(0.5);

      // The band heights are pace-range shares and the T11 card's are time
      // shares, so they never match exactly; what must not happen is the two
      // telling opposite stories on the same page. Off by at most a third of
      // the panel, against 0.53 (267) and 0.73 (1245) before the fix.
      const zoneSec = zoneSeconds(time, pace, paceZones(thresholds))!;
      const total = zoneSec.reduce((a, b) => a + b, 0);
      shares.forEach((share, zi) => {
        expect(Math.abs(share - zoneSec[zi] / total)).toBeLessThan(0.35);
      });
    }
  );
});
