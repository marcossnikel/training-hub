// @vitest-environment jsdom
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TotalsTable } from "@/components/totals-table";
import { dictionaries } from "@/lib/i18n";
import { periodTotals, type TotalsActivity } from "@/lib/totals";

afterEach(cleanup);

// Saturday 25 July 2026 at midday UTC, so "This week" is the week of Monday the
// 20th in any process timezone.
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-25T12:00:00Z"));
});
afterAll(() => {
  vi.useRealTimers();
});

/** Midday UTC on a given day: a literal instant, so the bucket never moves with the process timezone. */
function at(y: number, m: number, d: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${y}-${pad(m)}-${pad(d)}T12:00:00Z`;
}

const THIS_WEEK = at(2026, 7, 21);
const LAST_WEEK = at(2026, 7, 14);

function activity(
  startedAt: string,
  fields: Partial<Omit<TotalsActivity, "started_at">> = {}
): TotalsActivity {
  return {
    started_at: startedAt,
    started_at_local: null,
    sport_type: "Run",
    moving_time_s: 3600,
    distance_km: 10,
    elevation_gain_m: 100,
    ...fields,
  };
}

function renderTwoWeeks(activities: TotalsActivity[]) {
  const rows = periodTotals(activities, "weeks", 2);
  return render(<TotalsTable rows={rows} period="weeks" lang="en" t={dictionaries.en} />);
}

/** Two weeks of real-shaped data: this week bigger than last on every metric. */
function renderWeeks() {
  return renderTwoWeeks([
    activity(THIS_WEEK, { moving_time_s: 3332, distance_km: 10.03 }),
    activity(at(2026, 7, 22), { moving_time_s: 2711, distance_km: 20.6 }),
    activity(LAST_WEEK, { moving_time_s: 3069, distance_km: 9.51 }),
  ]);
}

function cellsOf(container: HTMLElement, row: number): HTMLTableCellElement[] {
  return [...container.querySelectorAll("tbody tr")[row].querySelectorAll("td")];
}

/** What one row prints on its value line, period label first (no deltas). */
function valuesOf(container: HTMLElement, row: number): string[] {
  return cellsOf(container, row).map((cell) => cell.childNodes[0]?.textContent ?? "");
}

/** The delta lines one row prints, in column order; absent deltas are simply missing. */
function deltasOf(container: HTMLElement, row: number): string[] {
  return cellsOf(container, row)
    .map((cell) => cell.querySelector("span")?.textContent)
    .filter((text): text is string => text != null);
}

describe("TotalsTable", () => {
  it("labels each period and prints its totals", () => {
    renderWeeks();
    expect(screen.getByText("This week")).toBeTruthy();
    expect(screen.getByText("Last week")).toBeTruthy();
    // 3332 + 2711 s, 10.03 + 20.6 km, 2 x 100 m, 2 sessions.
    expect(screen.getByText("1h 41m")).toBeTruthy();
    expect(screen.getByText("30.6 km")).toBeTruthy();
    expect(screen.getByText("200 m")).toBeTruthy();
  });

  it("colors a gain positive and leaves a drop neutral", () => {
    renderWeeks();
    expect(screen.getByText("+21.1 km").style.color).toBe("var(--positive)");
    // 101 min this week against 51 min last week, in the same h/m unit the
    // Hours values print in.
    expect(screen.getByText("+50m").style.color).toBe("var(--positive)");
  });

  it("marks a drop with the muted color, not a warning color", () => {
    renderTwoWeeks([
      activity(THIS_WEEK, { distance_km: 5 }),
      activity(LAST_WEEK, { distance_km: 15 }),
    ]);
    const drop = screen.getByText("-10.0 km");
    expect(drop.style.color).toBe("var(--muted-foreground)");
  });

  it("stays quiet where nothing changed", () => {
    const { container } = renderTwoWeeks([]);
    // Zero rows still occupy their slot, but print no delta at all.
    expect(screen.getAllByText("0.0 km")).toHaveLength(2);
    expect(container.querySelectorAll("tbody span")).toHaveLength(0);
  });

  it("prints a zero period as zeros, so a rest week does not read as missing data", () => {
    // An illness week after a training week: every column, Hours included, shows
    // a real zero rather than the absent-value dash.
    const { container } = renderTwoWeeks([activity(LAST_WEEK)]);
    expect(valuesOf(container, 0)).toEqual(["This week", "0h 00m", "0.0 km", "0 m", "0"]);
    expect(valuesOf(container, 0).join(" ")).not.toContain("–");
  });

  it("reports an hours change at the minute precision the hours values print in", () => {
    const { container } = renderTwoWeeks([
      activity(THIS_WEEK, { moving_time_s: 25_920 }),
      activity(LAST_WEEK, { moving_time_s: 25_860 }),
    ]);
    expect(valuesOf(container, 0)[1]).toBe("7h 12m");
    expect(valuesOf(container, 1)[1]).toBe("7h 11m");
    expect(deltasOf(container, 0)).toEqual(["+1m"]);
  });

  it("labels months when grouped by month", () => {
    const rows = periodTotals([activity(at(2026, 6, 10))], "months", 2);
    render(<TotalsTable rows={rows} period="months" lang="en" t={dictionaries.en} />);
    expect(screen.getByText("Jul")).toBeTruthy();
    expect(screen.getByText("Jun")).toBeTruthy();
  });

  it("scrolls horizontally rather than overflowing a narrow screen", () => {
    const { container } = renderWeeks();
    expect(container.querySelector(".overflow-x-auto")).toBeTruthy();
  });
});
