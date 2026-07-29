import { Skeleton } from "@/components/ui/skeleton";

/**
 * The route that needed this most: the page awaits ensureActivityDetail and
 * ensureActivityStreams, which are live Strava HTTP calls on a cache miss.
 *
 * Static shell only — no getDict/getLang, no cookies(), no DB. See the note in
 * src/app/loading.tsx.
 */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      {/* Back link */}
      <Skeleton className="h-4 w-28" />

      <div className="mt-5">
        <Skeleton className="h-4 w-64" />
        <Skeleton className="mt-2 h-9 w-3/4" />
      </div>

      {/* Metrics strip */}
      <div className="mt-6 grid grid-cols-3 gap-x-4 gap-y-3 sm:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i}>
            <Skeleton className="h-3 w-14" />
            <Skeleton className="mt-1.5 h-6 w-20" />
          </div>
        ))}
      </div>

      {/* The analysis chart, then the stack of detail cards. */}
      <div className="mt-6 space-y-4">
        <Skeleton className="h-64 w-full rounded-xl" />
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
