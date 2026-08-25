import { Suspense } from "react";
import { describe, expect, it } from "vitest";
import WeeklyBriefPage, { WeeklyBriefContent } from "./page";
import { WeeklyBriefSkeleton } from "./weekly-brief-skeleton";

describe("WeeklyBriefPage", () => {
  it("puts authenticated route work behind the shared weekly brief fallback", () => {
    const page = WeeklyBriefPage();

    expect(page.type).toBe(Suspense);
    expect(page.props.fallback.type).toBe(WeeklyBriefSkeleton);
    expect(page.props.children.type).toBe(WeeklyBriefContent);
  });
});
