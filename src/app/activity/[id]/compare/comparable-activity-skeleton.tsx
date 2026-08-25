import { Skeleton } from "@/components/ui/skeleton";

/** Static, hierarchy-preserving route fallback without fabricated activity values. */
export function ComparableActivitySkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading comparable prior activity"
      className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-5 lg:py-12"
    >
      <Skeleton className="h-4 w-56" />
      <Skeleton className="mt-4 h-14 w-full max-w-xl" />
      <Skeleton className="mt-3 h-5 w-full max-w-2xl" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.8fr)_minmax(240px,0.72fr)]">
        <div>
          <div className="grid gap-3 md:grid-cols-2">
            <Skeleton className="h-64 w-full rounded-2xl" />
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
          <Skeleton className="mt-3 h-28 w-full rounded-xl" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-10 w-full rounded-full" />
        </div>
      </div>
    </div>
  );
}
