import { describe, expect, it } from "vitest";
import { performanceHref, performanceQueryState } from "./performance-query-state";

describe("Performance query state", () => {
  it("uses canonical defaults and preserves the unrelated control", () => {
    expect(performanceQueryState({ period: "invalid", window: ["90d"] })).toEqual({
      period: "weeks",
      window: null,
    });
    expect(performanceHref({ period: "months", window: "6m" })).toBe(
      "/performance?period=months&window=6m"
    );
    expect(performanceHref({ period: "weeks", window: null })).toBe("/performance");
  });
});
