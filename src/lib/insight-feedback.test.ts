import { describe, expect, it } from "vitest";
import {
  comparableActivityInsightReference,
  normalizeInsightNote,
  weeklyBriefInsightReference,
} from "./insight-feedback";
import { buildWeeklyBrief } from "./weekly-brief";
import { matchComparablePriorActivity } from "./comparable-activity";

describe("server-derived insight feedback references", () => {
  it("makes a stable weekly key from the delivered window and evidence ids", () => {
    const result = buildWeeklyBrief({
      asOfWeekStart: "2026-08-03",
      activities: ["2026-07-07", "2026-07-14", "2026-07-21", "2026-08-04"].map((date, index) => ({
        id: index + 1,
        startedAt: `${date}T08:00:00Z`,
        sportType: "Run",
        movingTimeS: index === 3 ? 7_200 : 3_600,
        confirmed: true,
      })),
    });
    const reference = weeklyBriefInsightReference(result);
    expect(reference).toMatchObject({
      kind: "weekly_brief",
      version: "v1",
      evaluatedAt: "2026-08-10T00:00:00.000Z",
    });
    expect(reference?.key).toContain("training_time_change:2026-08-03:2026-07-06");
  });

  it("only returns a comparable reference for a delivered reliable match", () => {
    const source = {
      id: 12,
      sportType: "Run",
      startedAt: "2026-08-10T08:00:00Z",
      distanceKm: 10,
      movingTimeS: 3_000,
    };
    const result = matchComparablePriorActivity({
      source,
      candidates: [{ ...source, id: 9, startedAt: "2026-08-07T08:00:00Z" }],
      asOf: "2026-08-11T00:00:00Z",
    });
    expect(comparableActivityInsightReference(result, "2026-08-11T00:00:00Z")).toMatchObject({
      kind: "comparable_prior_activity",
      key: "comparable:v1:run:12:9",
    });
    expect(
      comparableActivityInsightReference({ state: "no_match" }, "2026-08-11T00:00:00Z")
    ).toBeNull();
  });

  it("limits notes without converting arbitrary input to customer text", () => {
    expect(normalizeInsightNote("  clear evidence  ")).toBe("clear evidence");
    expect(normalizeInsightNote(" ")).toBeNull();
    expect(normalizeInsightNote("x".repeat(501))).toBe("invalid");
    expect(normalizeInsightNote({ note: "no" })).toBe("invalid");
  });
});
