// @vitest-environment jsdom
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TotalsTable } from "@/components/totals-table";
import { dictionaries } from "@/lib/i18n";
import { periodTotals, type TotalsActivity } from "@/lib/totals";

afterEach(cleanup);

// Saturday 25 July 2026, so "This week" is the week of Monday the 20th.
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 25, 9));
});
afterAll(() => {
  vi.useRealTimers();
});

function activity(
  startedAt: Date,
  fields: Partial<Omit<TotalsActivity, "started_at">> = {}
): TotalsActivity {
  return {
    started_at: startedAt.toISOString(),
    tss: 50,
    moving_time_s: 3600,
    distance_km: 10,
    elevation_gain_m: 100,
    ...fields,
  };
}

/** Two weeks of real-shaped data: this week bigger than last on every metric. */
function renderWeeks() {
  const rows = periodTotals(
    [
      activity(new Date(2026, 6, 21), { tss: 60.8, moving_time_s: 3332, distance_km: 10.03 }),
      activity(new Date(2026, 6, 22), { tss: 48.2, moving_time_s: 2711, distance_km: 20.6 }),
      activity(new Date(2026, 6, 14), { tss: 59.1, moving_time_s: 3069, distance_km: 9.51 }),
    ],
    "weeks",
    2
  );
  return render(<TotalsTable rows={rows} period="weeks" lang="en" t={dictionaries.en} />);
}

describe("TotalsTable", () => {
  it("labels each period and prints its totals", () => {
    renderWeeks();
    expect(screen.getByText("This week")).toBeTruthy();
    expect(screen.getByText("Last week")).toBeTruthy();
    // 60.8 + 48.2 load, 3332 + 2711 s, 10.03 + 20.6 km, 2 x 100 m, 2 sessions.
    expect(screen.getByText("109")).toBeTruthy();
    expect(screen.getByText("1h 41m")).toBeTruthy();
    expect(screen.getByText("30.6 km")).toBeTruthy();
    expect(screen.getByText("200 m")).toBeTruthy();
  });

  it("colors a gain positive and leaves a drop neutral", () => {
    renderWeeks();
    expect(screen.getByText("+50").style.color).toBe("var(--positive)");
    expect(screen.getByText("+21.1 km").style.color).toBe("var(--positive)");
    // 6043 s this week against 3069 s last week, in hours to one decimal.
    expect(screen.getByText("+0.8 h").style.color).toBe("var(--positive)");
  });

  it("marks a drop with the muted color, not a warning color", () => {
    const rows = periodTotals(
      [
        activity(new Date(2026, 6, 21), { tss: 40, distance_km: 5 }),
        activity(new Date(2026, 6, 14), { tss: 100, distance_km: 15 }),
      ],
      "weeks",
      2
    );
    render(<TotalsTable rows={rows} period="weeks" lang="en" t={dictionaries.en} />);
    const drop = screen.getByText("-60");
    expect(drop.style.color).toBe("var(--muted-foreground)");
    expect(screen.getByText("-10.0 km").style.color).toBe("var(--muted-foreground)");
  });

  it("stays quiet where nothing changed", () => {
    const rows = periodTotals([], "weeks", 2);
    const { container } = render(
      <TotalsTable rows={rows} period="weeks" lang="en" t={dictionaries.en} />
    );
    // Zero rows still occupy their slot, but print no delta at all.
    expect(screen.getAllByText("0.0 km")).toHaveLength(2);
    expect(container.querySelectorAll("tbody span")).toHaveLength(0);
  });

  it("labels months when grouped by month", () => {
    const rows = periodTotals([activity(new Date(2026, 5, 10))], "months", 2);
    render(<TotalsTable rows={rows} period="months" lang="en" t={dictionaries.en} />);
    expect(screen.getByText("Jul")).toBeTruthy();
    expect(screen.getByText("Jun")).toBeTruthy();
  });

  it("scrolls horizontally rather than overflowing a narrow screen", () => {
    const { container } = renderWeeks();
    expect(container.querySelector(".overflow-x-auto")).toBeTruthy();
  });
});
