import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shared by the segment loader and the in-route Suspense boundary. It mirrors
 * the weekly brief hierarchy without inventing an observation or evidence.
 */
export function WeeklyBriefSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-5 lg:py-12"
      aria-label="Loading weekly brief"
      aria-busy="true"
    >
      <Skeleton className="h-4 w-64" />
      <Skeleton className="mt-4 h-14 w-72" />
      <Skeleton className="mt-3 h-5 w-full max-w-2xl" />
      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.75fr)_minmax(250px,0.85fr)]">
        <div className="rounded-2xl border p-5">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-4 h-14 w-full" />
          <Skeleton className="mt-3 h-5 w-5/6" />
          <Skeleton className="mt-5 h-20 w-full rounded-xl" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-52 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
