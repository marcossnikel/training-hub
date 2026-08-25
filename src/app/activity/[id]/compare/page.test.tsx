import { Suspense } from "react";
import { describe, expect, it } from "vitest";
import ComparableActivityPage, { ComparableActivityContent } from "./page";
import { ComparableActivitySkeleton } from "./comparable-activity-skeleton";
import Loading from "./loading";

describe("ComparableActivityPage", () => {
  it("puts route auth and owner-scoped data work behind the shared comparison fallback", async () => {
    const page = await ComparableActivityPage({
      params: Promise.resolve({ id: "42" }),
      searchParams: Promise.resolve({}),
    });
    expect(page.type).toBe(Suspense);
    expect(page.props.fallback.type).toBe(ComparableActivitySkeleton);
    expect(page.props.fallback.props.routeBoundary).toBeUndefined();
    expect(page.props.children).toBeInstanceOf(Promise);
    await expect(page.props.children).resolves.toMatchObject({
      type: ComparableActivityContent,
      props: { id: "42" },
    });
  });

  it("marks only the route boundary fallback", () => {
    const loading = Loading();
    expect(loading.type).toBe(ComparableActivitySkeleton);
    expect(loading.props.routeBoundary).toBe(true);
  });
});
