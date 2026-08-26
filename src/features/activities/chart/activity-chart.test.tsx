// @vitest-environment jsdom
//
// Component test: runs ONLY in jsdom via the pragma above. All other
// `src/**/*.test.ts` suites keep the node environment from vitest.config.ts.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ActivityChart } from "./activity-chart";
import { LAP_STRIP_GAP, LAP_STRIP_H, PAD_L, PANEL_H, PLOT_W, TOP, VBW } from "./model";
import type { LapWindow } from "@/lib/laps";
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
    gradePct: null,
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

// The lap strip's rects carry their lap label, so they stay selectable apart
// from the zone bands sharing the same SVG.
const stripOf = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("rect[data-lap-strip]")).map((r) => ({
    label: r.getAttribute("data-lap-strip"),
    x: Number(r.getAttribute("x")),
    w: Number(r.getAttribute("width")),
    y: Number(r.getAttribute("y")),
    h: Number(r.getAttribute("height")),
    opacity: Number(r.getAttribute("opacity")),
  }));

const highlightOf = (container: HTMLElement) => container.querySelector("rect[data-lap-highlight]");

/** The lap the tooltip header names, or null when it names none. */
const tooltipLap = (container: HTMLElement) =>
  container.querySelector("div.font-mono.font-medium > span")?.textContent ?? null;

/** Puts the SVG at one client px per viewBox unit, so a clientX IS a viewBox x. */
const atUnitScale = (svg: Element) => {
  svg.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: VBW, bottom: 200, width: VBW, height: 200 }) as DOMRect;
};

describe("ActivityChart lap strip", () => {
  // A run whose distance does NOT advance linearly with time (slow first half,
  // fast second), so the two x-axes map the same lap to different spans.
  const streams = makeStreams({
    distanceKm: [0, 0.5, 1, 3, 4],
    timeS: [0, 300, 600, 900, 1200],
    heartrate: [120, 150, 160, 166, 180],
  });
  const laps: LapWindow[] = [
    { label: "1", startS: 0, endS: 600 },
    { label: "2", startS: 600, endS: 900 },
    { label: "3", startS: 900, endS: 1200 },
  ];

  const chart = (props: { laps?: LapWindow[] }) => (
    <ActivityChart
      activityId={1}
      streams={streams}
      isRun={true}
      isRide={false}
      thresholds={thresholds}
      {...props}
    />
  );

  it("draws one alternating rect per lap and pushes the panels below the strip", () => {
    const { container } = render(chart({ laps }));
    const strip = stripOf(container);
    expect(strip.map((r) => r.label)).toEqual(["1", "2", "3"]);
    // Adjacent laps tile the axis without gaps, inside the plot area.
    expect(strip[0].x).toBeCloseTo(PAD_L, 1);
    expect(strip[2].x + strip[2].w).toBeCloseTo(PAD_L + PLOT_W, 1);
    for (let i = 1; i < strip.length; i++) {
      expect(strip[i].x).toBeCloseTo(strip[i - 1].x + strip[i - 1].w, 1);
    }
    // Alternating tints, all on the strip's own band above the panels.
    expect(strip.map((r) => r.opacity)).toEqual([0.15, 0.3, 0.15]);
    for (const r of strip) {
      expect(r.y).toBe(TOP);
      expect(r.h).toBe(LAP_STRIP_H);
    }
    // The first panel now starts below the strip: its top zone band moved down.
    const plotTop = TOP + LAP_STRIP_H + LAP_STRIP_GAP;
    const bands = bandsOf(container);
    expect(bands[bands.length - 1].y).toBeCloseTo(plotTop, 0);
  });

  it("draws no strip and leaves the geometry alone without laps", () => {
    const { container } = render(chart({}));
    expect(stripOf(container)).toHaveLength(0);
    const bands = bandsOf(container);
    expect(bands[bands.length - 1].y).toBeCloseTo(TOP, 0);
  });

  it("maps lap windows through each x-axis: seconds directly, distance interpolated", () => {
    // Distance is the default axis here. Lap 1 covers 0–600 s, which the stream
    // says is 0–1 km of the 4 km total: a quarter of the plot, not the half its
    // 600 of 1200 seconds would take on the time axis.
    const { container } = render(chart({ laps }));
    const byDistance = stripOf(container);
    expect(byDistance[0].w).toBeCloseTo(PLOT_W / 4, 1);

    fireEvent.click(screen.getByRole("button", { name: "Time" }));
    const byTime = stripOf(container);
    expect(byTime[0].w).toBeCloseTo(PLOT_W / 2, 1);
  });

  it("highlights the hovered lap across every panel", () => {
    const { container } = render(chart({ laps }));
    expect(highlightOf(container)).toBeNull();

    const second = container.querySelectorAll("rect[data-lap-strip]")[1];
    fireEvent.pointerOver(second);
    const highlight = highlightOf(container)!;
    expect(highlight.getAttribute("data-lap-highlight")).toBe("2");
    // Spans the panels' full stack, from their top down to the x-axis. Only heart
    // rate is present in this stream, so that stack is one panel tall.
    const plotTop = TOP + LAP_STRIP_H + LAP_STRIP_GAP;
    expect(Number(highlight.getAttribute("y"))).toBeCloseTo(plotTop, 1);
    expect(Number(highlight.getAttribute("height"))).toBeCloseTo(PANEL_H, 1);

    // Leaving the strip drops the highlight again.
    fireEvent.pointerOut(second);
    expect(highlightOf(container)).toBeNull();
  });

  it("heads the tooltip with the lap the crosshair is in, not the pinned one", () => {
    const { container } = render(chart({ laps }));
    const svg = screen.getByRole("img", { name: "Analysis" });
    atUnitScale(svg);

    // Pin lap 2 (600–900 s) the way a reader inspecting it does.
    fireEvent.click(container.querySelectorAll("rect[data-lap-strip]")[1]);
    expect(highlightOf(container)?.getAttribute("data-lap-highlight")).toBe("2");

    // Crosshair on the first sample, 0 s, which lap 1 contains. The pin keeps its
    // highlight, but the header has to name where the crosshair actually sits: it
    // used to read "Lap 2" over a sample ten minutes outside lap 2.
    fireEvent.pointerMove(svg, { clientX: PAD_L });
    expect(highlightOf(container)?.getAttribute("data-lap-highlight")).toBe("2");
    expect(tooltipLap(container)).toBe("Lap 1");

    // And on the last sample, 1200 s, which is past lap 3's end: no lap to name.
    fireEvent.pointerMove(svg, { clientX: PAD_L + PLOT_W });
    expect(tooltipLap(container)).toBeNull();
    expect(highlightOf(container)?.getAttribute("data-lap-highlight")).toBe("2");
  });

  it("pins a lap on click, keeps it after the pointer leaves, and clears it on Escape", () => {
    const { container } = render(chart({ laps }));
    const svg = screen.getByRole("img", { name: "Analysis" });
    const third = container.querySelectorAll("rect[data-lap-strip]")[2];

    fireEvent.click(third);
    fireEvent.pointerOut(third);
    expect(highlightOf(container)?.getAttribute("data-lap-highlight")).toBe("3");

    // Clicking the pinned lap again unpins it.
    fireEvent.click(third);
    expect(highlightOf(container)).toBeNull();

    fireEvent.click(third);
    fireEvent.keyDown(svg, { key: "Escape" });
    expect(highlightOf(container)).toBeNull();
  });

  it("clears a pin from Escape pressed while a strip rect holds focus", () => {
    const { container } = render(chart({ laps }));
    const svg = screen.getByRole("img", { name: "Analysis" });
    const third = container.querySelectorAll("rect[data-lap-strip]")[2];
    fireEvent.click(third);
    expect(highlightOf(container)?.getAttribute("data-lap-highlight")).toBe("3");
    // Clicking a rect hands focus to the chart, which is what makes the key path
    // work in browsers that do not focus what the mouse pressed (Safari).
    expect(document.activeElement).toBe(svg);

    // The key starts at the rect the click left focused, so it has to reach the
    // chart's handler by bubbling. Depending on the SVG itself being focused made
    // Escape browser-dependent, and a pin unclearable when it was not.
    fireEvent.keyDown(third, { key: "Escape" });
    expect(highlightOf(container)).toBeNull();
  });

  it("surfaces the lap under the arrow-key cursor and pins it with Enter", () => {
    const { container } = render(chart({ laps }));
    const svg = screen.getByRole("img", { name: "Analysis" });
    const rects = () => container.querySelectorAll("rect[data-lap-strip]");

    // One step right lands on the 300 s sample, inside lap 1.
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(highlightOf(container)?.getAttribute("data-lap-highlight")).toBe("1");
    // The next lands on 600 s, lap 2's first second.
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(highlightOf(container)?.getAttribute("data-lap-highlight")).toBe("2");
    expect(tooltipLap(container)).toBe("Lap 2");

    // Enter pins whatever the cursor surfaced, and unpins it on the second press.
    fireEvent.keyDown(svg, { key: "Enter" });
    expect(rects()[1].getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(svg, { key: "Enter" });
    expect(rects()[1].getAttribute("aria-pressed")).toBe("false");
  });

  it("names each segment with its own elapsed span", () => {
    // Activity 1245's first two laps: lap 2 is 513 s elapsed against the 364 s of
    // moving time its table row shows, so the rect is 8:33 of the axis wide while
    // the row reads 6:04. The name is where that difference is explained.
    const { container } = render(
      chart({
        laps: [
          { label: "1", startS: 0, endS: 338 },
          { label: "2", startS: 338, endS: 851 },
        ],
      })
    );
    const second = container.querySelectorAll("rect[data-lap-strip]")[1];
    expect(second.getAttribute("aria-label")).toBe("Lap 2, 8:33 elapsed");
    expect(second.querySelector("title")?.textContent).toBe("Lap 2, 8:33 elapsed");
    expect(second.getAttribute("role")).toBe("button");
  });

  it("clamps a lap window ending past the stream's last sample to the plot edge", () => {
    // Every cached activity's laps overrun their stream by a second or two, so
    // the last window's end maps outside the plot on both axes.
    const overrun: LapWindow[] = [
      { label: "1", startS: 0, endS: 600 },
      { label: "2", startS: 600, endS: 1205 },
    ];
    const { container } = render(chart({ laps: overrun }));
    const rightEdge = () => {
      const bars = stripOf(container);
      const last = bars[bars.length - 1];
      return last.x + last.w;
    };
    expect(rightEdge()).toBeCloseTo(PAD_L + PLOT_W, 1);

    fireEvent.click(screen.getByRole("button", { name: "Time" }));
    // 1205 s of a 1200 s stream maps 5/1200 of the plot past its right edge.
    expect(rightEdge()).toBeCloseTo(PAD_L + PLOT_W, 1);
  });

  it("reserves no strip band when not one lap window maps onto the axis", () => {
    // Distances but no times: the distance axis cannot place any window (every
    // edge interpolates to null), so nothing renders — and nothing may shift down
    // for a strip that is not there.
    const { container } = render(
      <ActivityChart
        activityId={1}
        streams={makeStreams({
          timeS: Array.from({ length: N }, () => null),
          heartrate: [120, 150, 160, 166, 180],
        })}
        isRun={true}
        isRide={false}
        thresholds={thresholds}
        laps={laps}
      />
    );
    expect(stripOf(container)).toHaveLength(0);
    const bands = bandsOf(container);
    expect(bands[bands.length - 1].y).toBeCloseTo(TOP, 0);
  });

  it("drops a pin whose lap stops rendering on the other axis", () => {
    // A distance stream that stalls through lap 2 (1 km at both 600 s and 900 s):
    // the lap has a span on the time axis and none on the distance one.
    const stalled = makeStreams({
      distanceKm: [0, 0.5, 1, 1, 4],
      timeS: [0, 300, 600, 900, 1200],
      heartrate: [120, 150, 160, 166, 180],
    });
    const { container } = render(
      <ActivityChart
        activityId={1}
        streams={stalled}
        isRun={true}
        isRide={false}
        thresholds={thresholds}
        laps={laps}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Time" }));
    fireEvent.click(container.querySelectorAll("rect[data-lap-strip]")[1]);
    expect(highlightOf(container)?.getAttribute("data-lap-highlight")).toBe("2");

    // The distance axis draws no rect for lap 2, so the pin goes with it...
    fireEvent.click(screen.getByRole("button", { name: "Distance" }));
    expect(stripOf(container).map((r) => r.label)).toEqual(["1", "3"]);
    expect(highlightOf(container)).toBeNull();

    // ...and does not reappear when the axis that could draw it comes back.
    fireEvent.click(screen.getByRole("button", { name: "Time" }));
    expect(highlightOf(container)).toBeNull();
  });
});

// The selection's own attributes, so its rects never answer the zone-band or
// lap-strip selectors above (and they never answer these).
const bandOf = (container: HTMLElement) => container.querySelector("rect[data-selection-band]");
const edgesOf = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("line[data-selection-edge]")).map((l) => ({
    edge: l.getAttribute("data-selection-edge"),
    x: Number(l.getAttribute("x1")),
  }));
const metricsOf = (container: HTMLElement) =>
  container.querySelector("[data-selection-metrics]")?.textContent ?? null;

describe("ActivityChart drag selection", () => {
  // Evenly spaced samples on both axes, so a viewBox x maps to a known index:
  // sample i sits at PAD_L + i * PLOT_W / 4.
  const streams = makeStreams({
    distanceKm: [0, 1, 2, 3, 4],
    timeS: [0, 300, 600, 900, 1200],
    heartrate: [120, 140, 160, 180, 200],
    paceSPerKm: [300, 300, 240, 240, 300],
    altitudeM: [100, 110, 105, 130, 120],
  });

  const setup = (props: { isRide?: boolean; laps?: LapWindow[] } = {}) => {
    const rendered = render(
      <ActivityChart
        activityId={1}
        streams={streams}
        isRun={!props.isRide}
        isRide={props.isRide ?? false}
        thresholds={thresholds}
        laps={props.laps}
      />
    );
    const svg = screen.getByRole("img", { name: "Analysis" });
    atUnitScale(svg);
    return { ...rendered, svg };
  };

  /** Presses at one viewBox x and drags to another, as a mouse does. */
  const drag = (svg: Element, fromX: number, toX: number) => {
    fireEvent.pointerDown(svg, { clientX: fromX });
    fireEvent.pointerMove(svg, { clientX: toX });
    fireEvent.pointerUp(svg, { clientX: toX });
  };

  it("bands the dragged range and reports its metrics", () => {
    const { container, svg } = setup();
    expect(bandOf(container)).toBeNull();
    expect(metricsOf(container)).toBeNull();

    // Samples 0 to 2: 600 s and 2 km of clock and ground, HR 120 / 140 / 160,
    // pace 300 / 300 / 240 s/km, and a 10 m rise followed by a 5 m drop.
    drag(svg, PAD_L, PAD_L + PLOT_W / 2);

    const band = bandOf(container)!;
    expect(band.getAttribute("data-selection-band")).toBe("0-2");
    expect(Number(band.getAttribute("x"))).toBeCloseTo(PAD_L, 1);
    expect(Number(band.getAttribute("width"))).toBeCloseTo(PLOT_W / 2, 1);
    // Edge lines at both ends, spanning the panels down to the axis.
    expect(edgesOf(container).map((e) => e.edge)).toEqual(["start", "end"]);
    expect(edgesOf(container)[1].x).toBeCloseTo(PAD_L + PLOT_W / 2, 1);

    const metrics = metricsOf(container)!;
    expect(metrics).toContain("10:00"); // duration
    expect(metrics).toContain("2.00 km");
    // Two 300 s intervals at the mean of their ends: (130 + 150) / 2 = 140 bpm.
    // The old left-endpoint weighting read 130, leaving the range's own last
    // sample out of its average.
    expect(metrics).toContain("140 bpm");
    expect(metrics).toContain("160 bpm"); // max HR
    // Moving pace: 300 s at 300 s/km then 300 s at the mean of 300 and 240,
    // so 600 s over 1 + 300/270 km = 284 s/km.
    expect(metrics).toContain("4:44 /km");
    expect(metrics).toContain("10 m"); // positive altitude deltas only
    expect(metrics).not.toContain("W");
  });

  it("reads a ride's range in watts instead of pace", () => {
    const rideStreams = { ...streams, watts: [100, 200, 300, 400, 500] };
    render(
      <ActivityChart
        activityId={1}
        streams={rideStreams}
        isRun={false}
        isRide={true}
        thresholds={thresholds}
      />
    );
    const svg = screen.getByRole("img", { name: "Analysis" });
    atUnitScale(svg);
    drag(svg, PAD_L, PAD_L + PLOT_W / 2);
    const metrics = document.querySelector("[data-selection-metrics]")!.textContent!;
    expect(metrics).toContain("200 W"); // (150*300 + 250*300) / 600
    expect(metrics).not.toContain("/km");
  });

  it("leaves a plain click alone: hover moves, nothing is selected", () => {
    const { container, svg } = setup();
    // A press that travels less than the drag threshold is still a click.
    fireEvent.pointerDown(svg, { clientX: PAD_L + PLOT_W / 4 });
    fireEvent.pointerMove(svg, { clientX: PAD_L + PLOT_W / 4 + 4 });
    fireEvent.pointerUp(svg, { clientX: PAD_L + PLOT_W / 4 + 4 });
    expect(bandOf(container)).toBeNull();
    expect(metricsOf(container)).toBeNull();
    // The crosshair moved to the pressed sample, exactly as before.
    expect(container.querySelector("[data-selection-edge]")).toBeNull();
    expect(screen.getByText("1.00 km")).toBeTruthy(); // tooltip header, sample 1
  });

  it("clears the band on the next press, and keeps it when the drag ends", () => {
    const { container, svg } = setup();
    drag(svg, PAD_L, PAD_L + PLOT_W);
    expect(bandOf(container)?.getAttribute("data-selection-band")).toBe("0-4");
    // A press outside the band drops it (it either starts a new one or is a click).
    fireEvent.pointerDown(svg, { clientX: PAD_L + PLOT_W / 4 });
    expect(bandOf(container)).toBeNull();
  });

  it("extends the band from the keyboard cursor with Shift+Arrow", () => {
    const { container, svg } = setup();
    // Cursor to sample 1 without selecting anything.
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(bandOf(container)).toBeNull();

    // Shift anchors on where the cursor stood and extends as it moves.
    fireEvent.keyDown(svg, { key: "ArrowRight", shiftKey: true });
    expect(bandOf(container)?.getAttribute("data-selection-band")).toBe("1-2");
    fireEvent.keyDown(svg, { key: "ArrowRight", shiftKey: true });
    expect(bandOf(container)?.getAttribute("data-selection-band")).toBe("1-3");
    expect(metricsOf(container)).toContain("10:00"); // samples 1 to 3 = 600 s
    // Extending back the way it came keeps the same anchor.
    fireEvent.keyDown(svg, { key: "ArrowLeft", shiftKey: true });
    expect(bandOf(container)?.getAttribute("data-selection-band")).toBe("1-2");
  });

  it("bands a drag that runs right to left the same as one running left to right", () => {
    const { container, svg } = setup();
    drag(svg, PAD_L + PLOT_W, PAD_L + PLOT_W / 2);
    expect(bandOf(container)?.getAttribute("data-selection-band")).toBe("2-4");
    // The band is drawn from the lower sample regardless of which end was pressed.
    expect(Number(bandOf(container)!.getAttribute("x"))).toBeCloseTo(PAD_L + PLOT_W / 2, 1);
    expect(Number(bandOf(container)!.getAttribute("width"))).toBeCloseTo(PLOT_W / 2, 1);
    expect(metricsOf(container)).toContain("10:00"); // samples 2 to 4 = 600 s
  });

  it("a plain cursor key drops the band and re-anchors, as a plain press does", () => {
    const { container, svg } = setup();
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    fireEvent.keyDown(svg, { key: "ArrowRight", shiftKey: true });
    fireEvent.keyDown(svg, { key: "ArrowRight", shiftKey: true });
    expect(bandOf(container)?.getAttribute("data-selection-band")).toBe("1-3");

    // An unshifted key used to leave the band behind while the crosshair walked
    // on, so band and cursor drifted apart and the next Shift+Arrow reused the
    // abandoned anchor. It clears, like the pointer path.
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(bandOf(container)).toBeNull();
    expect(metricsOf(container)).toBeNull();

    // And the next range gesture anchors where the cursor now stands (sample 4),
    // not on the anchor the reader left behind: 3-4, never 1-3.
    fireEvent.keyDown(svg, { key: "ArrowLeft", shiftKey: true });
    expect(bandOf(container)?.getAttribute("data-selection-band")).toBe("3-4");
  });

  it("selects nothing when a range gesture lands on one sample", () => {
    const { container, svg } = setup();
    // End then Shift+ArrowRight clamps to the same last sample. A 1-unit band
    // reporting that sample's instantaneous values as range averages is a lie;
    // there is simply no range yet.
    fireEvent.keyDown(svg, { key: "End" });
    fireEvent.keyDown(svg, { key: "ArrowRight", shiftKey: true });
    expect(bandOf(container)).toBeNull();
    expect(edgesOf(container)).toHaveLength(0);
    expect(metricsOf(container)).toBeNull();

    // Reaching a second sample is what makes it a range.
    fireEvent.keyDown(svg, { key: "ArrowLeft", shiftKey: true });
    expect(bandOf(container)?.getAttribute("data-selection-band")).toBe("3-4");
  });

  it("Escape peels the band on screen, never an anchor with no band", () => {
    const laps: LapWindow[] = [
      { label: "1", startS: 0, endS: 600 },
      { label: "2", startS: 600, endS: 1200 },
    ];
    const { container, svg } = setup({ laps });
    fireEvent.click(container.querySelectorAll("rect[data-lap-strip]")[1]);
    // A range gesture that clamped onto one sample leaves an anchor and no band.
    fireEvent.keyDown(svg, { key: "End" });
    fireEvent.keyDown(svg, { key: "ArrowRight", shiftKey: true });
    expect(bandOf(container)).toBeNull();

    // So the first Escape has the pinned lap to clear, and clears it.
    fireEvent.keyDown(svg, { key: "Escape" });
    expect(highlightOf(container)).toBeNull();
  });

  it("hides the readout with the chart when every series is switched off", () => {
    const { container, svg } = setup();
    drag(svg, PAD_L, PAD_L + PLOT_W / 2);
    expect(metricsOf(container)).toBeTruthy();

    // Selecting a range and THEN hiding every panel unmounted the SVG but left the
    // readout on screen with no band, no crosshair and nothing to press Escape on.
    for (const name of ["Heart rate", "Pace", "Elevation"])
      fireEvent.click(screen.getByRole("button", { name }));
    expect(screen.queryByRole("img", { name: "Analysis" })).toBeNull();
    expect(metricsOf(container)).toBeNull();

    // And the range does not come back with the panels; the reader starts over.
    fireEvent.click(screen.getByRole("button", { name: "Heart rate" }));
    expect(screen.getByRole("img", { name: "Analysis" })).toBeTruthy();
    expect(metricsOf(container)).toBeNull();
    expect(bandOf(container)).toBeNull();
  });

  it("measures the drag threshold in client pixels, not viewBox units", () => {
    const { container, svg } = setup();
    // A phone-width column: 380 client px across a 760-unit viewBox, so one px is
    // two units and the old 6-unit threshold fired after 3 px of thumb jitter.
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 380, bottom: 200, width: 380, height: 200 }) as DOMRect;

    // 5 px of travel, which is 10 viewBox units and crosses onto another sample.
    fireEvent.pointerDown(svg, { clientX: 150 });
    fireEvent.pointerMove(svg, { clientX: 155 });
    expect(bandOf(container)).toBeNull();

    // 10 px is a drag at any rendered width.
    fireEvent.pointerMove(svg, { clientX: 160 });
    fireEvent.pointerUp(svg, { clientX: 160 });
    expect(bandOf(container)?.getAttribute("data-selection-band")).toBe("1-2");
  });

  it("Escape clears the selection before the pinned lap", () => {
    const laps: LapWindow[] = [
      { label: "1", startS: 0, endS: 600 },
      { label: "2", startS: 600, endS: 1200 },
    ];
    const { container, svg } = setup({ laps });

    fireEvent.click(container.querySelectorAll("rect[data-lap-strip]")[1]);
    drag(svg, PAD_L, PAD_L + PLOT_W / 2);
    expect(bandOf(container)).toBeTruthy();
    expect(highlightOf(container)?.getAttribute("data-lap-highlight")).toBe("2");

    // One press peels the newest overlay: the range goes, the pinned lap stays.
    fireEvent.keyDown(svg, { key: "Escape" });
    expect(bandOf(container)).toBeNull();
    expect(highlightOf(container)?.getAttribute("data-lap-highlight")).toBe("2");

    // The next press clears the pin, exactly as it did before selections existed.
    fireEvent.keyDown(svg, { key: "Escape" });
    expect(highlightOf(container)).toBeNull();
  });

  it("still pins a lap when the press lands on the strip", () => {
    const laps: LapWindow[] = [
      { label: "1", startS: 0, endS: 600 },
      { label: "2", startS: 600, endS: 1200 },
    ];
    const { container } = setup({ laps });
    const second = container.querySelectorAll("rect[data-lap-strip]")[1];
    // The press bubbles to the chart's own pointer-down handler first; the click
    // that follows must still reach the rect and pin it.
    fireEvent.pointerDown(second, { clientX: PAD_L + PLOT_W / 2 });
    fireEvent.pointerUp(second, { clientX: PAD_L + PLOT_W / 2 });
    fireEvent.click(second);
    expect(highlightOf(container)?.getAttribute("data-lap-highlight")).toBe("2");
    expect(bandOf(container)).toBeNull();
  });

  it("does not also pin the lap a drag started and ended inside", () => {
    const laps: LapWindow[] = [
      { label: "1", startS: 0, endS: 600 },
      { label: "2", startS: 600, endS: 1200 },
    ];
    const { container } = setup({ laps });
    const second = container.querySelectorAll("rect[data-lap-strip]")[1];
    // A browser fires `click` on the common ancestor of pointer-down and pointer-up,
    // so a drag from 55% to 95% of the plot — both inside lap 2's rect — dispatches
    // the rect's click as well and used to select AND pin in one gesture. On touch
    // it is the normal case: implicit pointer capture keeps events on the rect.
    fireEvent.pointerDown(second, { clientX: PAD_L + PLOT_W * 0.55 });
    fireEvent.pointerMove(second, { clientX: PAD_L + PLOT_W * 0.95 });
    fireEvent.pointerUp(second, { clientX: PAD_L + PLOT_W * 0.95 });
    fireEvent.click(second);

    expect(bandOf(container)?.getAttribute("data-selection-band")).toBe("2-4");
    expect(highlightOf(container)).toBeNull();
    expect(second.getAttribute("aria-pressed")).toBe("false");

    // The very next genuine click still pins, so T17's gesture is intact.
    fireEvent.click(second);
    expect(highlightOf(container)?.getAttribute("data-lap-highlight")).toBe("2");
  });

  it("prints no distance and no pace for a range the athlete stood still in", () => {
    // Activity 1245 samples 103 to 107: a lab treadmill pinned at 1.164 km for 165 s
    // of clock with the velocity stream reading zero throughout. Dividing the range's
    // duration by its distance printed nothing here and 1408:20 /km one sample wider.
    const stalled = makeStreams({
      n: 6,
      timeS: [428, 432, 585, 589, 593, 597],
      distanceKm: [1.164, 1.164, 1.164, 1.164, 1.164, 1.166],
      paceSPerKm: [null, null, null, null, null, 2778],
      heartrate: [126, 123, 120, 118, 118, 118],
    });
    const { container } = render(
      <ActivityChart
        activityId={1}
        streams={stalled}
        isRun={true}
        isRide={false}
        thresholds={thresholds}
      />
    );
    const svg = screen.getByRole("img", { name: "Analysis" });
    atUnitScale(svg);
    // The time axis, the only one that spreads these samples out.
    fireEvent.click(screen.getByRole("button", { name: "Time" }));
    drag(svg, PAD_L, PAD_L + (165 / 169) * PLOT_W);

    expect(bandOf(container)?.getAttribute("data-selection-band")).toBe("0-4");
    const metrics = metricsOf(container)!;
    expect(metrics).toContain("2:45"); // 165 s of clock, which did pass
    expect(metrics).toContain("121 bpm"); // (4*124.5 + 153*121.5 + 4*119 + 4*118) / 165
    // No distance entry printing "0.00 km" beside a duration, and no pace at all.
    expect(metrics).not.toContain("km");

    // One sample wider the stream creeps 2 m, which is a span that advanced but
    // not by enough to print: same readout, not "Distance 0.00 km".
    drag(svg, PAD_L, PAD_L + PLOT_W);
    expect(bandOf(container)?.getAttribute("data-selection-band")).toBe("0-5");
    expect(metricsOf(container)).toContain("2:49");
    expect(metricsOf(container)).not.toContain("km");
  });

  it("drops a band whose edge stops plotting on the other axis", () => {
    // Distance stalls across the last two samples, so a band that ends there has
    // no width on the distance axis; a null edge sample drops it outright.
    const timeOnlyTail = makeStreams({
      distanceKm: [0, 1, 2, null, null],
      timeS: [0, 300, 600, 900, 1200],
      heartrate: [120, 140, 160, 180, 200],
    });
    const { container } = render(
      <ActivityChart
        activityId={1}
        streams={timeOnlyTail}
        isRun={true}
        isRide={false}
        thresholds={thresholds}
      />
    );
    const svg = screen.getByRole("img", { name: "Analysis" });
    atUnitScale(svg);
    fireEvent.click(screen.getByRole("button", { name: "Time" }));
    drag(svg, PAD_L + PLOT_W * 0.5, PAD_L + PLOT_W);
    expect(bandOf(container)?.getAttribute("data-selection-band")).toBe("2-4");

    fireEvent.click(screen.getByRole("button", { name: "Distance" }));
    expect(bandOf(container)).toBeNull();
    expect(metricsOf(container)).toBeNull();
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

describe("ActivityChart grade-adjusted pace overlay", () => {
  const hilly = (gradePct: (number | null)[]) =>
    makeStreams({ paceSPerKm: [330, 330, 330, 330, 330], gradePct });

  /** The dashed second trace drawn inside the pace panel, if any. */
  const overlay = (container: HTMLElement) => container.querySelector('[data-overlay="pace"]');

  /** Every y in a path's `d`, so a trace can be checked against the panel edges. */
  const ysOf = (el: Element) =>
    Array.from((el.getAttribute("d") ?? "").matchAll(/[ML]([\d.]+),([\d.]+)/g)).map((m) =>
      Number(m[2])
    );

  it("draws a dashed GAP trace above the pace trace, on the panel's own scale", () => {
    const { container } = render(
      <ActivityChart
        activityId={1}
        streams={hilly([6, 6, 6, 6, 6])}
        isRun={true}
        isRide={false}
        thresholds={thresholds}
      />
    );
    const path = overlay(container);
    expect(path).not.toBeNull();
    // Same colour as the pace series it rides with; the dash and the reduced
    // opacity are what separate them, and both are load-bearing — opacity alone
    // reads as "the same line, further away" once the traces cross.
    expect(path!.getAttribute("stroke")).toBe("var(--chart-2)");
    expect(path!.getAttribute("stroke-dasharray")).toBeTruthy();
    expect(Number(path!.getAttribute("opacity"))).toBeCloseTo(0.6, 6);

    const paceTrace = Array.from(container.querySelectorAll("path")).find(
      (el) => !el.hasAttribute("data-overlay") && (el.getAttribute("d") ?? "").startsWith("M")
    )!;
    const gapYs = ysOf(path!);
    const paceYs = ysOf(paceTrace);
    expect(gapYs.length).toBeGreaterThan(1);
    // On an inverted panel a faster pace plots higher, so the GAP of a climb
    // sits above the recorded pace.
    expect(Math.max(...gapYs)).toBeLessThan(Math.min(...paceYs));
    // And it sits INSIDE the panel. The pace here is a constant 330 s/km, so a
    // panel scaled to the recorded trace alone spans 329-331 and pins this
    // 241 s/km overlay flat against the top border, which is the one thing a
    // grade-adjusted trace must never look like.
    expect(Math.min(...gapYs)).toBeGreaterThan(TOP + 1);
    expect(Math.max(...paceYs)).toBeLessThan(TOP + PANEL_H - 1);
  });

  it("has no overlay on a run with no grade", () => {
    const { container: flat } = render(
      <ActivityChart
        activityId={1}
        streams={makeStreams({ paceSPerKm: [330, 330, 330, 330, 330] })}
        isRun={true}
        isRide={false}
        thresholds={thresholds}
      />
    );
    expect(overlay(flat)).toBeNull();
  });

  it("has no overlay on a ride, even once its pace panel is switched on", () => {
    // A ride's defaults never enable the pace panel, so asserting on the default
    // render proves nothing about the sport gate — the overlay would be absent
    // either way. Turn the panel on first: the trace appears, the overlay must
    // not, because the cost polynomial behind it is running economy and a bike's
    // gearing breaks the link between grade and pace it rests on.
    const { container: ride } = render(
      <ActivityChart
        activityId={2}
        streams={hilly([6, 6, 6, 6, 6])}
        isRun={false}
        isRide={true}
        thresholds={thresholds}
      />
    );
    expect(pressed("Pace")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Pace" }));
    expect(pressed("Pace")).toBe("true");
    // The pace panel really is on screen now (its axis label is drawn), so the
    // absence below is the sport gate and not an unrendered panel.
    expect(ride.textContent).toContain("min/km");
    expect(overlay(ride)).toBeNull();
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
    gradePct: null,
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
