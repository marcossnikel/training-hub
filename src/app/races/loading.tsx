import { Skeleton } from "@/components/ui/skeleton";

/** Static shell only — see the note in src/app/loading.tsx. */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Skeleton className="h-9 w-32" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        {/* Compare button */}
        <Skeleton className="h-8 w-28" />
      </div>

      {/* Races grouped by year. */}
      <div className="mt-6 space-y-8">
        {Array.from({ length: 2 }, (_, year) => (
          <div key={year}>
            <Skeleton className="h-5 w-16" />
            <div className="mt-3 space-y-2">
              {Array.from({ length: 3 }, (_, row) => (
                <Skeleton key={row} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
