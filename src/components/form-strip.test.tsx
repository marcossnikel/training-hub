// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FormStrip } from "@/components/form-strip";
import { dictionaries } from "@/lib/i18n";
import { STATE_COLOR } from "@/lib/zones";

afterEach(cleanup);

const ctlTrend = [40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53];

function renderStrip(overrides: Partial<Parameters<typeof FormStrip>[0]> = {}) {
  return render(
    <FormStrip
      tsb={-14.4}
      ctl={53.2}
      ctlTrend={ctlTrend}
      week={{ thisWeek: 210.4, trailing: { avg: 305.2, weeks: 4 } }}
      t={dictionaries.en}
      {...overrides}
    />
  );
}

describe("FormStrip", () => {
  it("shows rounded form, its state color, fitness and the week's load in context", () => {
    renderStrip();
    const tsb = screen.getByText("-14");
    expect(tsb.style.color).toBe(STATE_COLOR.productive);
    expect(screen.getByText("Productive").style.color).toBe(STATE_COLOR.productive);
    expect(screen.getByText("53")).toBeTruthy();
    expect(screen.getByText("210 / avg 305 (4 wk)")).toBeTruthy();
  });

  it("signs a positive form value", () => {
    renderStrip({ tsb: 7.6 });
    expect(screen.getByText("+8").style.color).toBe(STATE_COLOR.fresh);
  });

  it("says how many complete weeks the average actually covers", () => {
    renderStrip({ week: { thisWeek: 265, trailing: { avg: 180, weeks: 2 } } });
    expect(screen.getByText("265 / avg 180 (2 wk)")).toBeTruthy();
  });

  it("links the whole strip to /fitness with the values in its accessible name", () => {
    renderStrip();
    const link = screen.getByRole("link", { name: /form and fitness/i });
    expect(link.getAttribute("href")).toBe("/fitness");
    // The numbers the strip exists to convey are part of the link's accessible
    // name, not hidden behind an aria-label that would replace them.
    expect(screen.getByRole("link", { name: /-14/ })).toBe(link);
    expect(screen.getByRole("link", { name: /Productive/ })).toBe(link);
    expect(screen.getByRole("link", { name: /210 \/ avg 305 \(4 wk\)/ })).toBe(link);
  });

  it("draws a sparkline point per trailing CTL day", () => {
    renderStrip();
    const spark = screen.getByRole("img", { name: /14-day fitness trend/i });
    const polyline = spark.querySelector("polyline");
    expect(polyline?.getAttribute("points")?.split(" ")).toHaveLength(ctlTrend.length);
  });

  it("keeps the end dot's full extent inside the sparkline box", () => {
    // Rising CTL puts the dot at the top-right corner, where clipping bites.
    renderStrip();
    const spark = screen.getByRole("img", { name: /14-day fitness trend/i });
    const attr = (element: Element | null, name: string) => Number(element?.getAttribute(name));
    const circle = spark.querySelector("circle");
    // Outer edge of the dot = r plus half the stroke drawn around it.
    const outer = attr(circle, "r") + attr(circle, "stroke-width") / 2;
    expect(attr(circle, "cx") + outer).toBeLessThanOrEqual(attr(spark, "width"));
    expect(attr(circle, "cy") - outer).toBeGreaterThanOrEqual(0);
  });

  it("omits the sparkline when there is no trend to draw", () => {
    renderStrip({ ctlTrend: [] });
    expect(screen.queryByRole("img", { name: /14-day fitness trend/i })).toBeNull();
    expect(screen.getByText("53")).toBeTruthy();
  });

  it("drops the average when there is no complete trailing week to compare against", () => {
    renderStrip({ week: { thisWeek: 90, trailing: null } });
    expect(screen.getByText("90")).toBeTruthy();
    expect(screen.queryByText(/avg/)).toBeNull();
  });
});
