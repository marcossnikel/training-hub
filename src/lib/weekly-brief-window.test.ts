import { describe, expect, it } from "vitest";
import { mostRecentCompletedWeeklyBriefPeriod } from "@/lib/weekly-brief-window";

describe("mostRecentCompletedWeeklyBriefPeriod", () => {
  it("selects the prior full Monday-Sunday week and exactly four preceding weeks", () => {
    expect(mostRecentCompletedWeeklyBriefPeriod(new Date("2026-08-15T12:00:00Z"))).toEqual({
      asOfWeekStart: "2026-08-03",
      fromDay: "2026-07-06",
      toDay: "2026-08-10",
    });
  });
});
