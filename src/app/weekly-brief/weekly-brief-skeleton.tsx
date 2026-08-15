import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shared by the segment loader and the in-route Suspense boundary. It mirrors
 * the weekly brief hierarchy without inventing an observation or evidence.
 */
export function WeeklyBriefSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6"
      aria-label="Loading weekly brief"
      aria-busy="true"
    >
      <Skeleton className="h-10 w-48" />
      <Skeleton className="mt-2 h-4 w-56" />
      <div className="mt-6 rounded-xl border p-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-3 h-7 w-full" />
        <Skeleton className="mt-2 h-4 w-5/6" />
        <Skeleton className="mt-8 h-5 w-20" />
        <Skeleton className="mt-3 h-14 w-full" />
        <Skeleton className="mt-2 h-14 w-full" />
      </div>
    </div>
  );
}
