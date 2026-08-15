import { Skeleton } from "@/components/ui/skeleton";

/**
 * This dynamic root can resolve to either a guest landing or an authenticated
 * log. Its route loading boundary must therefore be safe for a guest: static,
 * reading-first, and without activity-like rows or invented metrics. It has no
 * request APIs, so Next can stream it while the session branch resolves.
 */
export default function Loading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading Training Hub"
      className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16"
    >
      <div className="max-w-2xl">
        <Skeleton className="h-11 w-full max-w-xl sm:h-14" />
        <Skeleton className="mt-6 h-5 w-full" />
        <Skeleton className="mt-2 h-5 w-11/12" />
        <Skeleton className="mt-8 h-10 w-48" />
      </div>
      <div className="mt-16 max-w-2xl space-y-12">
        {Array.from({ length: 5 }, (_, index) => (
          <section key={index} aria-hidden="true">
            <Skeleton className="h-6 w-52" />
            <Skeleton className="mt-4 h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-5/6" />
          </section>
        ))}
      </div>
    </div>
  );
}
