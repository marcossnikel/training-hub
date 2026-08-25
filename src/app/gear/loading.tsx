import { Skeleton } from "@/components/ui/skeleton";

/** Static shell only — see the note in src/app/loading.tsx. */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:py-10">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="mt-4 h-11 w-full max-w-xl" />
      <Skeleton className="mt-3 h-6 w-full max-w-2xl" />

      {/* Shoes / Bikes tab pills */}
      <div className="mt-6">
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-7 w-20 rounded-full" />
          <Skeleton className="h-7 w-20 rounded-full" />
        </div>
      </div>

      <div className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Skeleton className="h-9 w-32" />
            <Skeleton className="mt-2 h-4 w-64" />
          </div>
          <Skeleton className="h-8 w-24" />
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
