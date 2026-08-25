// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { WeeklyBriefView } from "./weekly-brief-view";
import { buildWeeklyBrief } from "@/lib/weekly-brief";

afterEach(cleanup);

describe("WeeklyBriefView", () => {
  it("renders the evaluator copy, limitation, and owner-scoped source route", () => {
    const result = buildWeeklyBrief({
      asOfWeekStart: "2026-08-03",
      activities: (
        [
          ["2026-07-07", 3600],
          ["2026-07-14", 3600],
          ["2026-07-21", 3600],
          ["2026-08-04", 7200],
        ] as Array<[string, number]>
      ).map(([date, movingTimeS], index) => ({
        id: index + 1,
        startedAt: `${date}T08:00:00Z`,
        sportType: "Run",
        movingTimeS,
        confirmed: true,
      })),
    });
    render(<WeeklyBriefView result={result} />);
    fireEvent.click(screen.getByText("Review the 4 source activities"));
    expect(screen.getByRole("heading", { name: "Evidence" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Current-week evidence" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Baseline evidence" })).toBeTruthy();
    expect(
      within(screen.getByRole("region", { name: "Current-week evidence" }))
        .getByRole("link", { name: "Open 4 Aug 2026 Run activity" })
        .getAttribute("href")
    ).toBe("/activity/4");
    expect(
      screen.getByText("Baseline has activity in 3 of the previous 4 completed weeks.")
    ).toBeTruthy();
    expect(screen.getByText("Method, not a verdict")).toBeTruthy();
  });

  it("renders the exact no-insight exit without an invented observation", () => {
    const result = buildWeeklyBrief({
      asOfWeekStart: "2026-08-03",
      activities: ["2026-07-07", "2026-07-14", "2026-07-21", "2026-07-28", "2026-08-04"].map(
        (date, index) => ({
          id: index + 1,
          startedAt: `${date}T08:00:00Z`,
          sportType: "Run",
          movingTimeS: 3600,
          confirmed: true,
        })
      ),
    });
    render(<WeeklyBriefView result={result} />);
    expect(screen.getByRole("heading", { name: "No clear weekly change yet" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Review recent activities" }).getAttribute("href")
    ).toBe("/");
    expect(screen.queryByRole("heading", { name: "Evidence" })).toBeNull();
  });
});
