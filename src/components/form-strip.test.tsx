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
      week={{ thisWeek: 210.4, trailingAvg: 305.2 }}
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
    expect(screen.getByText("210 / avg 305")).toBeTruthy();
  });

  it("signs a positive form value", () => {
    renderStrip({ tsb: 7.6 });
    expect(screen.getByText("+8").style.color).toBe(STATE_COLOR.fresh);
  });

  it("links the whole strip to /fitness", () => {
    renderStrip();
    const link = screen.getByRole("link", { name: /form and fitness/i });
    expect(link.getAttribute("href")).toBe("/fitness");
  });

  it("draws a sparkline point per trailing CTL day", () => {
    renderStrip();
    const spark = screen.getByRole("img", { name: /14-day fitness trend/i });
    const polyline = spark.querySelector("polyline");
    expect(polyline?.getAttribute("points")?.split(" ")).toHaveLength(ctlTrend.length);
  });

  it("drops the average when there is no trailing week to compare against", () => {
    renderStrip({ week: { thisWeek: 90, trailingAvg: null } });
    expect(screen.getByText("90")).toBeTruthy();
    expect(screen.queryByText(/avg/)).toBeNull();
  });
});
