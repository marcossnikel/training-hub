// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MeanMaxCurve } from "@/components/mean-max-curve";
import { I18nProvider } from "@/components/i18n-provider";
import { curveSeries, type CurveBucketBest } from "@/lib/curves";

afterEach(cleanup);

function best(bucket: string, value: number, name: string): CurveBucketBest {
  return { bucket, value, activityName: name, date: "2026-04-12T08:30:18Z" };
}

function renderCurve(
  kind: "pace" | "power",
  windowed: CurveBucketBest[],
  allTime: CurveBucketBest[]
) {
  return render(
    <I18nProvider lang="en">
      <MeanMaxCurve
        kind={kind}
        points={curveSeries(kind, windowed, allTime)}
        windowLabel="90 days"
      />
    </I18nProvider>
  );
}

describe("MeanMaxCurve", () => {
  it("labels both series and every plotted bucket", () => {
    const { container } = renderCurve(
      "pace",
      [best("400m", 215, "Track Day"), best("1k", 255, "Long run")],
      [best("400m", 215, "Track Day"), best("1k", 253, "Half"), best("5k", 270, "Half")]
    );
    expect(screen.getAllByText("90 days").length).toBeGreaterThan(0);
    expect(screen.getByText("All time")).toBeTruthy();
    for (const label of ["400 m", "1 km", "5 km"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    // Two polylines: the window series breaks at 5 km, all-time spans all three.
    expect(container.querySelectorAll("polyline")).toHaveLength(2);
    // Two dots per bucket the window reached, one where only all-time did.
    expect(container.querySelectorAll("circle")).toHaveLength(5);
  });

  it("draws nothing for a bucket no activity has ever reached", () => {
    renderCurve("power", [], [best("5s", 700, "Zwift"), best("20m", 210, "Zwift")]);
    expect(screen.getByText("5 s")).toBeTruthy();
    expect(screen.queryByText("60 min")).toBeNull();
  });

  it("names the axis extremes in the kind's own unit", () => {
    renderCurve("pace", [], [best("400m", 215, "Track Day"), best("5k", 270, "Half")]);
    expect(screen.getByText("3:35 /km")).toBeTruthy();
    expect(screen.getByText("4:30 /km")).toBeTruthy();
  });

  it("names a flat curve's single value once", () => {
    const { container } = renderCurve("power", [], [best("5s", 700, "Zwift")]);
    expect(screen.getAllByText("700 W")).toHaveLength(1);
    expect(container.querySelectorAll("polyline")).toHaveLength(0);
  });

  // Both panels read "better is UP", and nothing on screen says which way round
  // that is: the labels name the right values wherever they are drawn, so an
  // inverted y axis is invisible to any assertion that only reads text.
  describe("faster and stronger are up", () => {
    const yOf = (label: string) => Number(screen.getByText(label).getAttribute("y"));

    it("puts the fastest pace above the slowest", () => {
      renderCurve("pace", [], [best("400m", 215, "Track Day"), best("5k", 270, "Half")]);
      expect(yOf("3:35 /km")).toBeLessThan(yOf("4:30 /km"));
    });

    it("puts the highest wattage above the lowest", () => {
      renderCurve("power", [], [best("5s", 700, "Zwift"), best("20m", 210, "Zwift")]);
      expect(yOf("700 W")).toBeLessThan(yOf("210 W"));
    });

    it("plots each bucket's dot where its own value belongs", () => {
      // The axis labels sit at the extremes, so they cannot catch a curve drawn
      // right way up at the ends and wrong in between.
      const { container } = renderCurve(
        "pace",
        [],
        [best("400m", 215, "Track"), best("1k", 300, "Tempo"), best("5k", 270, "Half")]
      );
      const cy = [...container.querySelectorAll("circle")].map((c) => Number(c.getAttribute("cy")));
      expect(cy).toHaveLength(3);
      // 400 m is the fastest, then 5 km, then the 1 km: top, middle, bottom.
      expect(cy[0]).toBeLessThan(cy[2]);
      expect(cy[2]).toBeLessThan(cy[1]);
    });
  });

  it("steps through the buckets from the keyboard", () => {
    // Every value, the activity that set it and its date live in the tooltip
    // only, so without this they are pointer-only.
    const { container } = renderCurve(
      "pace",
      [best("400m", 215, "Track Day")],
      [best("400m", 215, "Track Day"), best("1k", 253, "Half")]
    );
    const svg = container.querySelector('svg[role="img"]')!;
    expect(svg.getAttribute("tabindex")).toBe("0");

    // The tooltip writes the activity and its date in one line, hence the match.
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(screen.getAllByText(/Track Day/).length).toBeGreaterThan(0);

    // Home and End reach the ends, and the tooltip follows.
    fireEvent.keyDown(svg, { key: "End" });
    expect(screen.getAllByText(/Half/).length).toBeGreaterThan(0);
    fireEvent.keyDown(svg, { key: "Home" });
    expect(screen.getAllByText(/Track Day/).length).toBeGreaterThan(0);
  });

  it("renders nothing at all when there is no curve", () => {
    // Unreachable from /performance, which checks the length first. Scaling a
    // panel to no values names its axis "Infinity:NaN /km".
    const { container } = renderCurve("pace", [], []);
    expect(container.querySelector("svg[role]")).toBeNull();
    expect(container.textContent).toBe("");
  });
});
