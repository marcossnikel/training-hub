// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { VdotCard } from "@/components/vdot-card";
import { dictionaries } from "@/lib/i18n";
import type { VdotTrend } from "@/lib/benchmarks";

afterEach(cleanup);

/** 12 months ending Jul 2026, all empty unless `values` names them. */
function trend(current: number | null, values: Record<string, number> = {}): VdotTrend {
  const months = Array.from({ length: 12 }, (_, i) => {
    const date = new Date(2025, 7 + i, 1);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return { month, vdot: values[month] ?? null };
  });
  return { current, months };
}

function renderCard(value: VdotTrend) {
  return render(<VdotCard trend={value} lang="en" t={dictionaries.en} />);
}

describe("VdotCard", () => {
  it("shows the current VDOT to one decimal with its window", () => {
    renderCard(trend(49.81, { "2026-07": 49.81 }));
    expect(screen.getByText("Current VDOT")).toBeTruthy();
    // The tile, plus the two axis labels of a one-month series at the same value.
    expect(screen.getAllByText("49.8")).toHaveLength(3);
    expect(screen.getByText("Best of the last 90 days")).toBeTruthy();
  });

  it("draws one dot per measured month and breaks the line at the empty ones", () => {
    // Sep and Oct measured, then nothing until Jul: two runs of months, so two
    // polylines, and no line drawn across the eight-month hole between them.
    renderCard(trend(47.2, { "2025-09": 45, "2025-10": 46, "2026-07": 47.2 }));
    const chart = screen.getByRole("img", { name: /Best VDOT per month over the last 12 months/i });
    expect(chart.querySelectorAll("circle")).toHaveLength(3);
    const segments = [...chart.querySelectorAll("polyline")].map((p) => p.getAttribute("points"));
    expect(segments).toHaveLength(2);
    expect(segments[1]?.split(" ")).toHaveLength(1);
    // The value labels name the plotted extremes, not a padded axis.
    const labels = [...chart.querySelectorAll("text")].map((node) => node.textContent);
    expect(labels).toContain("47.2");
    expect(labels).toContain("45.0");
  });

  it("labels the span's first and last month and titles each dot", () => {
    renderCard(trend(47.2, { "2026-06": 45.5, "2026-07": 47.2 }));
    expect(screen.getByText("Aug 2025")).toBeTruthy();
    expect(screen.getByText("Jul 2026")).toBeTruthy();
    // Native <title> per dot, so a lone month is readable with no JS.
    const chart = screen.getByRole("img", { name: /Best VDOT per month/i });
    const titles = [...chart.querySelectorAll("title")].map((node) => node.textContent);
    expect(titles).toEqual(["Jun 2026 · VDOT 45.5", "Jul 2026 · VDOT 47.2"]);
  });

  it("keeps the trend when no recent effort qualifies", () => {
    renderCard(trend(null, { "2025-09": 45 }));
    expect(screen.getByText("–")).toBeTruthy();
    expect(screen.getByText("No qualifying effort in the last 90 days")).toBeTruthy();
    expect(screen.getByRole("img", { name: /Best VDOT per month/i })).toBeTruthy();
  });

  it("renders nothing when no month in the window was measured", () => {
    const { container } = renderCard(trend(null));
    expect(container.innerHTML).toBe("");
  });
});
