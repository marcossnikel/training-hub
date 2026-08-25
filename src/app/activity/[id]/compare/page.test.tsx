import { Suspense } from "react";
import { describe, expect, it } from "vitest";
import ComparableActivityPage, { ComparableActivityContent } from "./page";
import { ComparableActivitySkeleton } from "./comparable-activity-skeleton";

describe("ComparableActivityPage", () => {
  it("puts route auth and owner-scoped data work behind the shared comparison fallback", () => {
    const page = ComparableActivityPage({
      params: Promise.resolve({ id: "42" }),
      searchParams: Promise.resolve({}),
    });
    expect(page.type).toBe(Suspense);
    expect(page.props.fallback.type).toBe(ComparableActivitySkeleton);
    expect(page.props.children).toBeInstanceOf(Promise);
    return expect(page.props.children).resolves.toMatchObject({
      type: ComparableActivityContent,
      props: { id: "42" },
    });
  });
});
