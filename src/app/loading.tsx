import { Skeleton } from "@/components/ui/skeleton";

/**
 * Every route here is dynamic, and a dynamic route is only prefetched when it
 * has a loading.js (see next/dist/docs/01-app/02-guides/prefetching.md). So this
 * file has to stay a *static* shell: no getDict/getLang, no cookies(), no DB.
 * Any request-time API in here would disqualify it and forfeit the benefit,
 * which is also why it carries no text and therefore no i18n keys.
 *
 * Mirrors the log page shell: title block, filter pills, then week groups.
 */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Skeleton className="h-9 w-52" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <Skeleton className="h-8 w-28" />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-1.5">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-7 w-20 rounded-full" />
        ))}
      </div>

      <div className="mt-6 space-y-6">
        {Array.from({ length: 3 }, (_, week) => (
          <div key={week}>
            <Skeleton className="h-4 w-40" />
            <div className="mt-2 space-y-1.5">
              {Array.from({ length: 4 }, (_, row) => (
                <Skeleton key={row} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
