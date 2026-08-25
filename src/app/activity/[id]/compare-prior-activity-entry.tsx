"use client";

import Link, { useLinkStatus } from "next/link";
import { createPortal } from "react-dom";
import { ComparableActivitySkeleton } from "./compare/comparable-activity-skeleton";

function ComparableActivityNavigationFallback() {
  const { pending } = useLinkStatus();
  if (!pending || typeof document === "undefined") return null;

  // The dynamic comparison route normally uses its nested loading.tsx boundary.
  // When its RSC payload has not arrived yet, Next exposes this Link-specific
  // pending state first. Reuse the exact route fallback so the click has clear,
  // truthful feedback instead of leaving the detail page inert.
  return createPortal(
    <div className="fixed inset-x-0 top-14 z-30 min-h-[calc(100dvh-3.5rem)] bg-background">
      <ComparableActivitySkeleton />
    </div>,
    document.body
  );
}

export function ComparePriorActivityEntry({
  activityId,
  children,
}: Readonly<{ activityId: number; children: string }>) {
  return (
    <Link
      href={`/activity/${activityId}/compare`}
      prefetch={false}
      className="focus-ring inline-flex rounded-md border bg-card px-3 py-2 text-sm font-medium transition-colors duration-150 hover:bg-muted motion-reduce:transition-none"
    >
      {children}
      <ComparableActivityNavigationFallback />
    </Link>
  );
}
