// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ConsistencyHeatmapCard } from "@/components/consistency-heatmap";
import { consistencyHeatmap } from "@/lib/consistency";
import { dictionaries } from "@/lib/i18n";
import { eachDay } from "@/lib/format";

afterEach(cleanup);

// Saturday 25 July 2026. Built from local wall-clock components, and always
// INSIDE a test rather than at module scope, so it is the same calendar day under
// the zone the test itself is pinned to.
function saturday() {
  return new Date(2026, 6, 25, 9);
}

function series(loads: Record<string, number> = {}) {
  return eachDay("2025-07-21", "2026-07-25").map((date) => ({ date, load: loads[date] ?? 0 }));
}

function renderCard(
  loads: Record<string, number> = {},
  sessions: Record<string, number> = {},
  lang: "en" | "pt" = "en",
  now = saturday()
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

// Rendered under both a zone that shifts at a civil hour and one that shifts at
// local MIDNIGHT (America/Santiago), pinned here so the guard holds whatever the
// ambient TZ is: with the old day-stepping eachDay, Santiago drew 369 cells and
// lost today's square along with the streak and active-days figures.
describe.each(["UTC", "America/Santiago"])("ConsistencyHeatmapCard under TZ=%s", (tz) => {
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = tz;
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

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

  it("says a session without computable load carries no load, instead of 0 TSS", () => {
    // A strength or soccer session with no TSS leaves the cell on --muted, because
    // the grid paints load and the streak counts load. The title must not then
    // claim "0 TSS" beside "1 session": empty square, "no load" tooltip.
    const { container } = renderCard(WEEK, { "2026-07-19": 1 });
    const titles = [...container.querySelectorAll("title")].map((node) => node.textContent);
    expect(titles).toContain("19 Jul 2026 · no load · 1 session");
    const cell = [...container.querySelectorAll("rect")].find((rect) =>
      rect.querySelector("title")?.textContent?.startsWith("19 Jul 2026")
    );
    expect(cell?.getAttribute("fill")).toBe("var(--muted)");
  });

  it("drops a month label the viewBox would clip instead of drawing a stub", () => {
    // 1 August 2026 falls in the current week, so its label would start at x=676
    // in a 686-unit viewBox and render as a truncated "Aug". Twelve labels are
    // drawn (Sep 2025 through Jul 2026) and only one "Aug" — the 2025 one.
    renderCard(WEEK, {}, "en", new Date(2026, 7, 1, 9));
    expect(screen.getAllByText(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/)).toHaveLength(
      12
    );
    expect(screen.getAllByText("Aug")).toHaveLength(1);
    const labels = [...document.querySelectorAll("text")];
    expect(labels.every((label) => Number(label.getAttribute("x")) <= 686 - 16)).toBe(true);
  });

  it("scrolls horizontally rather than squashing a year onto a phone", () => {
    const { container } = renderCard(WEEK);
    expect(container.querySelector(".overflow-x-auto")).toBeTruthy();
  });
});
