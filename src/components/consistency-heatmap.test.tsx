// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ConsistencyHeatmapCard } from "@/components/consistency-heatmap";
import { consistencyHeatmap } from "@/lib/consistency";
import { dictionaries } from "@/lib/i18n";
import { eachDay } from "@/lib/format";

afterEach(cleanup);

// Saturday 25 July 2026, built from local components so the grid is the same in
// any process timezone.
const now = new Date(2026, 6, 25, 9);

function series(loads: Record<string, number> = {}) {
  return eachDay("2025-07-21", "2026-07-25").map((date) => ({ date, load: loads[date] ?? 0 }));
}

function renderCard(
  loads: Record<string, number> = {},
  sessions: Record<string, number> = {},
  lang: "en" | "pt" = "en"
) {
  const heatmap = consistencyHeatmap(series(loads), new Map(Object.entries(sessions)), now);
  return render(<ConsistencyHeatmapCard heatmap={heatmap} lang={lang} t={dictionaries[lang]} />);
}

const WEEK = {
  "2026-07-20": 10,
  "2026-07-21": 20,
  "2026-07-22": 30,
  "2026-07-23": 40,
  "2026-07-24": 50,
  "2026-07-25": 60,
};

describe("ConsistencyHeatmapCard", () => {
  it("draws one cell per day of the trailing year", () => {
    const { container } = renderCard(WEEK);
    expect(container.querySelectorAll("rect")).toHaveLength(370);
  });

  it("starts collapsed and needs no client JS to open", () => {
    const { container } = renderCard(WEEK);
    const details = container.querySelector("details");
    expect(details).toBeTruthy();
    expect(details?.hasAttribute("open")).toBe(false);
    // A native <details> plus native <title> tooltips: nothing here is wired to
    // an event handler, so the card works with JS disabled.
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  it("fills an empty day with the muted token and an active day with the accent", () => {
    const { container } = renderCard(WEEK);
    const cells = [...container.querySelectorAll("rect")];
    const rest = cells[0];
    const hardest = cells[cells.length - 1];
    expect(rest.getAttribute("fill")).toBe("var(--muted)");
    expect(rest.getAttribute("opacity")).toBeNull();
    expect(hardest.getAttribute("fill")).toBe("var(--primary)");
    // The heaviest day of the year is the top of the four opacity steps.
    expect(hardest.getAttribute("opacity")).toBe("1");
  });

  it("steps opacity by load quartile, using no colour but the accent", () => {
    const { container } = renderCard(WEEK);
    // Quartiles of 10..60 cut at 22.5 / 35 / 47.5, so the six days land in the
    // four steps of the single accent colour.
    const active = [...container.querySelectorAll('rect[fill="var(--primary)"]')];
    expect(active.map((cell) => cell.getAttribute("opacity"))).toEqual([
      "0.3",
      "0.3",
      "0.5",
      "0.75",
      "1",
      "1",
    ]);
  });

  it("titles each cell with its date, load and session count", () => {
    const { container } = renderCard(WEEK, { "2026-07-25": 2, "2026-07-24": 1 });
    const titles = [...container.querySelectorAll("title")].map((node) => node.textContent);
    expect(titles).toContain("25 Jul 2026 · 60 TSS · 2 sessions");
    expect(titles).toContain("24 Jul 2026 · 50 TSS · 1 session");
    expect(titles).toContain("21 Jul 2025 · rest day");
  });

  it("labels the months along the top", () => {
    renderCard(WEEK);
    // Twelve labels, August 2025 through July 2026.
    expect(screen.getByText("Jan")).toBeTruthy();
    expect(screen.getByText("Dec")).toBeTruthy();
    expect(screen.getAllByText(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/)).toHaveLength(
      12
    );
  });

  it("prints the current streak and active days beside the title", () => {
    renderCard(WEEK);
    // Six consecutive days ending today; 6 active days in the trailing 4 weeks.
    expect(screen.getByText("Streak 6 d · 1.5 active days/wk")).toBeTruthy();
  });

  it("says so when there is no streak at all", () => {
    renderCard({ "2026-07-20": 30 });
    expect(screen.getByText("No streak · 0.3 active days/wk")).toBeTruthy();
  });

  it("translates its labels and month names", () => {
    const { container } = renderCard(WEEK, { "2026-07-25": 2 }, "pt");
    expect(screen.getByText("Consistência")).toBeTruthy();
    expect(screen.getByText("Sequência 6 d · 1.5 dias ativos/sem")).toBeTruthy();
    expect(screen.getByText("Dez")).toBeTruthy();
    const titles = [...container.querySelectorAll("title")].map((node) => node.textContent);
    expect(titles).toContain("25 Jul 2026 · 60 TSS · 2 sessões");
    expect(titles).toContain("21 Jul 2025 · dia de descanso");
  });

  it("scrolls horizontally rather than squashing a year onto a phone", () => {
    const { container } = renderCard(WEEK);
    expect(container.querySelector(".overflow-x-auto")).toBeTruthy();
  });
});
