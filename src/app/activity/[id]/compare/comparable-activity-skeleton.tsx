import { Skeleton } from "@/components/ui/skeleton";

/** Static, hierarchy-preserving route fallback without fabricated activity values. */
export function ComparableActivitySkeleton({ routeBoundary = false }: { routeBoundary?: boolean }) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading comparable prior activity"
      data-route-loading-boundary={routeBoundary ? "comparable-prior-activity" : undefined}
      className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6"
    >
      <Skeleton className="h-4 w-36" />
      <div className="mt-6 rounded-xl border p-4 sm:p-6">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-3 h-8 w-64" />
        <Skeleton className="mt-2 h-4 w-full max-w-xl" />
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
        <Skeleton className="mt-4 h-24 w-full" />
      </div>
    </div>
  );
}
