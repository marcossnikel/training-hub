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
import { PmcChart, STATE_COLOR, type PmcMarker, type PmcSeriesPoint } from "@/components/pmc-chart";

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
