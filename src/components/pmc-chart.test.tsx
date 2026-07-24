// @vitest-environment jsdom
//
// Component test: runs ONLY in jsdom via the pragma above. All other
// `src/**/*.test.ts` suites keep the node environment from vitest.config.ts.
//
// G8.4: the PMC chart must be keyboard-navigable like activity-chart — the SVG
// is focusable and arrow keys move the active point (which surfaces the hover
// tooltip), not pointer-only.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  PmcChart,
  STATE_COLOR,
  type PmcMarker,
  type PmcProjection,
  type PmcSeriesPoint,
} from "@/components/pmc-chart";
import type { WeeklySportLoad } from "@/lib/fitness";

afterEach(cleanup);

// Distinct CTL values (11, 22, 33) so a rounded tooltip value maps to exactly
// one point and never collides with an axis label (loadMax/tsbMax round to 50).
const points: PmcSeriesPoint[] = [
  { date: "2026-01-01", load: 40, ctl: 11, atl: 5, tsb: 6 },
  { date: "2026-01-02", load: 50, ctl: 22, atl: 7, tsb: 15 },
  { date: "2026-01-03", load: 60, ctl: 33, atl: 9, tsb: 24 },
];

describe("PmcChart keyboard navigation (G8.4)", () => {
  it("is focusable and arrow keys move the active point across the series", () => {
    render(<PmcChart points={points} weekly={[]} />);

    const svg = screen.getByRole("img", { name: /fitness/i });

    // Focusable like activity-chart's chart SVG (pointer-only had no tabindex).
    expect(svg.getAttribute("tabindex")).toBe("0");

    // No active point before any interaction: the tooltip values are absent.
    expect(screen.queryByText("11")).toBeNull();

    // ArrowRight from no selection activates the first point.
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(screen.getByText("11")).toBeTruthy();

    // ArrowRight again advances to the second point.
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(screen.getByText("22")).toBeTruthy();
    expect(screen.queryByText("11")).toBeNull();

    // End jumps to the last point; Home returns to the first.
    fireEvent.keyDown(svg, { key: "End" });
    expect(screen.getByText("33")).toBeTruthy();
    fireEvent.keyDown(svg, { key: "Home" });
    expect(screen.getByText("11")).toBeTruthy();
  });

  it("ArrowLeft from no selection activates the LAST point", () => {
    render(<PmcChart points={points} weekly={[]} />);
    const svg = screen.getByRole("img", { name: /fitness/i });

    // No active point yet.
    expect(screen.queryByText("33")).toBeNull();

    // From no selection ArrowLeft wraps to the end (index n-1), not the first.
    fireEvent.keyDown(svg, { key: "ArrowLeft" });
    expect(screen.getByText("33")).toBeTruthy();
    expect(screen.queryByText("11")).toBeNull();
  });
});

describe("PmcChart TSB form-zone bands (T01)", () => {
  it("colors the tooltip TSB value via STATE_COLOR for the hovered day's form state", () => {
    render(<PmcChart points={points} weekly={[]} />);
    const svg = screen.getByRole("img", { name: /fitness/i });

    // Last point has tsb = 24, which is above the +20 transition boundary.
    fireEvent.keyDown(svg, { key: "End" });
    const tsbValue = screen.getByText("24");
    expect(tsbValue.style.color).toBe(STATE_COLOR.transition);
  });

  it("renders a right-edge label only for bands tall enough to hold one, but always draws the band rect", () => {
    const { container } = render(<PmcChart points={points} weekly={[]} />);
    // tsb values (6, 15, 24) round tsbMax up to 50, at which the transition
    // band (20..50, the widest) clears the label-height threshold while the
    // fixed-width fresh (5..20) and neutral (-10..5) bands are too thin for a
    // label at this scale. weekly={[]} means these are the only <rect>s.
    expect(screen.getByText("Transition")).toBeTruthy();
    expect(screen.queryByText("Fresh")).toBeNull();
    expect(screen.queryByText("Neutral")).toBeNull();
    expect(container.querySelectorAll("rect").length).toBe(5);
  });
});

describe("PmcChart race and goal markers (T02)", () => {
  // athlete_goals is empty in live data today, so the goal-marker path (a
  // fixture, not real data) is this suite's only coverage until a goal exists.
  const markers: PmcMarker[] = [
    { date: "2026-01-02", kind: "race", label: "Hoka 30k" },
    { date: "2026-01-03", kind: "goal", label: "Valencia Marathon" },
  ];

  it("renders a circle for an in-window race marker and a dashed line + label for a goal marker", () => {
    const { container } = render(<PmcChart points={points} weekly={[]} markers={markers} />);

    // Race marker: a small circle distinct from the (unhovered) load axis dots —
    // with no hover active, any circle present must be the race marker.
    expect(container.querySelectorAll("circle").length).toBe(1);

    // Goal marker: dashed vertical line + its label rendered as SVG text.
    const dashedLines = [...container.querySelectorAll("line")].filter(
      (l) => l.getAttribute("stroke-dasharray") === "2 3"
    );
    expect(dashedLines.length).toBe(1);
    expect(screen.getByText("Valencia Marathon")).toBeTruthy();
  });

  it("appends a Race/Goal row to the tooltip when the hovered day lands on a marker date", () => {
    render(<PmcChart points={points} weekly={[]} markers={markers} />);
    const svg = screen.getByRole("img", { name: /fitness/i });

    // First point (2026-01-01) has no marker: no marker row in the tooltip.
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(screen.queryByText("Hoka 30k")).toBeNull();

    // Second point (2026-01-02) matches the race marker.
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(screen.getByText("Race")).toBeTruthy();
    expect(screen.getByText("Hoka 30k")).toBeTruthy();

    // Third point (2026-01-03) matches the goal marker. Its label is present
    // twice at this point (the chart's own always-on label plus the tooltip
    // row), so assert on the count rather than a single unique match.
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(screen.getByText("Goal")).toBeTruthy();
    expect(screen.getAllByText("Valencia Marathon").length).toBe(2);
  });

  it("renders nothing marker-related when markers is omitted (the live athlete_goals-empty case)", () => {
    const { container } = render(<PmcChart points={points} weekly={[]} />);
    expect(container.querySelectorAll("circle").length).toBe(0);
    expect(
      [...container.querySelectorAll("line")].filter(
        (l) => l.getAttribute("stroke-dasharray") === "2 3"
      ).length
    ).toBe(0);
  });
});

describe("PmcChart ramp-rate lane (T03)", () => {
  // rampRate omitted from the base `points` fixture (T01/T02 tests above)
  // renders zero ramp rects, keeping those tests' rect counts unaffected.
  const rampPoints: PmcSeriesPoint[] = [
    { date: "2026-01-01", load: 40, ctl: 11, atl: 5, tsb: 6, rampRate: null },
    { date: "2026-01-02", load: 50, ctl: 22, atl: 7, tsb: 15, rampRate: 4.2 },
    { date: "2026-01-03", load: 60, ctl: 33, atl: 9, tsb: 24, rampRate: -3.7 },
  ];

  it("draws one rect per non-null rampRate point, disambiguated from form bands by opacity 0.15", () => {
    const { container } = render(<PmcChart points={rampPoints} weekly={[]} />);
    const rampRects = [...container.querySelectorAll("rect")].filter(
      (r) => r.getAttribute("opacity") === "0.15"
    );
    // Two points have a non-null rampRate (the first is null).
    expect(rampRects.length).toBe(2);
    // Positive ramp uses --positive, negative uses --chart-2.
    expect(rampRects.some((r) => r.getAttribute("fill") === "var(--positive)")).toBe(true);
    expect(rampRects.some((r) => r.getAttribute("fill") === "var(--chart-2)")).toBe(true);
  });

  it("renders no ramp rects when every point's rampRate is null/absent", () => {
    const { container } = render(<PmcChart points={points} weekly={[]} />);
    const rampRects = [...container.querySelectorAll("rect")].filter(
      (r) => r.getAttribute("opacity") === "0.15"
    );
    expect(rampRects.length).toBe(0);
  });

  it("appends a formatted Ramp row to the tooltip for the hovered day", () => {
    render(<PmcChart points={rampPoints} weekly={[]} />);
    const svg = screen.getByRole("img", { name: /fitness/i });

    // Second point: rampRate 4.2 -> "+4.2 /wk".
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(screen.getByText("+4.2 /wk")).toBeTruthy();

    // Third point: rampRate -3.7 -> "-3.7 /wk" (no leading "+").
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(screen.getByText("-3.7 /wk")).toBeTruthy();
  });

  it("shows no Ramp row when the hovered day's rampRate is null", () => {
    render(<PmcChart points={rampPoints} weekly={[]} />);
    const svg = screen.getByRole("img", { name: /fitness/i });
    fireEvent.keyDown(svg, { key: "Home" });
    expect(screen.queryByText(/\/wk/)).toBeNull();
  });
});

describe("PmcChart stacked weekly load bars (T06)", () => {
  const weekly: WeeklySportLoad[] = [
    { date: "2026-01-05", load: { run: 100, bike: 30, other: 20 } },
    { date: "2026-01-12", load: { run: 55, bike: 0, other: 0 } },
  ];

  const weekSvg = () => screen.getByRole("img", { name: /weekly load/i });
  // Bar segments are the only rects at opacity 0.8 (form bands sit at 0.05-0.08
  // and ramp rects at 0.15), in document order run/bike/other per week.
  const segments = (container: HTMLElement) =>
    [...container.querySelectorAll("rect")].filter((r) => r.getAttribute("opacity") === "0.8");

  it("draws one segment per sport carrying load, heights proportional to the split", () => {
    const { container } = render(<PmcChart points={points} weekly={weekly} />);
    // 3 segments for the mixed week, 1 for the run-only week (zero-load sports
    // are skipped entirely).
    const rects = segments(container);
    expect(rects.length).toBe(4);
    expect(rects.map((r) => r.getAttribute("fill"))).toEqual([
      "var(--primary)",
      "var(--chart-3)",
      "var(--chart-5)",
      "var(--primary)",
    ]);

    const height = (r: Element) => Number(r.getAttribute("height"));
    const [run, bike, other] = rects;
    // run 100 : bike 30 : other 20 within the same week.
    expect(height(bike) / height(run)).toBeCloseTo(0.3, 5);
    expect(height(other) / height(run)).toBeCloseTo(0.2, 5);
  });

  it("shows a per-sport legend and drops the native <title> tooltips", () => {
    const { container } = render(<PmcChart points={points} weekly={weekly} />);
    expect(screen.getByText("Run")).toBeTruthy();
    expect(screen.getByText("Bike")).toBeTruthy();
    expect(screen.getByText("Other")).toBeTruthy();
    expect(container.querySelectorAll("title").length).toBe(0);
  });

  it("is keyboard navigable and its tooltip lists per-sport values plus the total", () => {
    render(<PmcChart points={points} weekly={weekly} />);
    const svg = weekSvg();
    expect(svg.getAttribute("tabindex")).toBe("0");

    // Nothing hovered yet: no total row.
    expect(screen.queryByText("150 TSS")).toBeNull();

    // First week: 100 + 30 + 20 = 150.
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(screen.getByText("100")).toBeTruthy();
    expect(screen.getByText("30")).toBeTruthy();
    expect(screen.getByText("20")).toBeTruthy();
    expect(screen.getByText("150 TSS")).toBeTruthy();

    // Second week is run-only: only the run row, and the total matches it.
    fireEvent.keyDown(svg, { key: "End" });
    expect(screen.getByText("55")).toBeTruthy();
    expect(screen.getByText("55 TSS")).toBeTruthy();
    expect(screen.queryByText("150 TSS")).toBeNull();
  });

  it("renders no weekly section at all when there are no weeks", () => {
    render(<PmcChart points={points} weekly={[]} />);
    expect(screen.queryByRole("img", { name: /weekly load/i })).toBeNull();
  });
});

describe("PmcChart projections (T05)", () => {
  const projection: PmcProjection = {
    steady: [
      { date: "2026-01-04", load: 50, ctl: 34, atl: 12, tsb: 21 },
      { date: "2026-01-05", load: 50, ctl: 35, atl: 14, tsb: 22 },
    ],
    rest: [
      { date: "2026-01-04", load: 0, ctl: 32, atl: 8, tsb: 21 },
      { date: "2026-01-05", load: 0, ctl: 31, atl: 7, tsb: 24 },
    ],
    raceDay: { daysAway: 12, restTsb: 18, steadyTsb: -4 },
  };

  const dashed = (container: HTMLElement, selector: string) =>
    [...container.querySelectorAll(selector)].filter(
      (el) => el.getAttribute("stroke-dasharray") === "4 3"
    );

  it("draws a today divider plus one dashed continuation per scenario series", () => {
    const { container } = render(<PmcChart points={points} weekly={[]} projection={projection} />);

    // CTL + TSB for each of the two scenarios.
    expect(dashed(container, "path").length).toBe(4);
    // The today divider is the only dashed line sharing the projected pattern.
    expect(dashed(container, "line").length).toBe(1);
    expect(screen.getByText("Today")).toBeTruthy();
  });

  it("renders nothing projected when the prop is omitted", () => {
    const { container } = render(<PmcChart points={points} weekly={[]} />);
    expect(dashed(container, "path").length).toBe(0);
    expect(dashed(container, "line").length).toBe(0);
    expect(screen.queryByText("Today")).toBeNull();
  });

  it("shows the race-day readout with each scenario's form colored by its band", () => {
    const { container } = render(<PmcChart points={points} weekly={[]} projection={projection} />);

    expect(container.textContent).toContain(
      "Race in 12 d: projected form +18 resting, -4 at current load"
    );
    // +18 sits in the fresh band, -4 in the neutral one.
    expect(screen.getByText("+18").style.color).toBe(STATE_COLOR.fresh);
    expect(screen.getByText("-4").style.color).toBe(STATE_COLOR.neutral);
  });

  it("omits the readout when no goal falls inside the horizon", () => {
    const { steady, rest } = projection;
    const { container } = render(
      <PmcChart points={points} weekly={[]} projection={{ steady, rest }} />
    );
    expect(container.textContent).not.toContain("projected form");
  });

  it("clamps hover to the last historical point instead of entering the projection", () => {
    render(<PmcChart points={points} weekly={[]} projection={projection} />);
    const svg = screen.getByRole("img", { name: /fitness/i });

    // Walk past the end of the historical series: hover stops on today's point.
    for (let i = 0; i < 6; i++) fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(screen.getByText("33")).toBeTruthy();
    // Projected CTL values never become the hovered point.
    expect(screen.queryByText("34")).toBeNull();
    expect(screen.queryByText("35")).toBeNull();
  });
});
