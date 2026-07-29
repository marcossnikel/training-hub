import { Skeleton } from "@/components/ui/skeleton";

/** Static shell only — see the note in src/app/loading.tsx. */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="mt-2 h-4 w-80" />

      {/* Zones card, then the best-efforts / critical-speed / prediction cards. */}
      <div className="mt-6 space-y-4">
        <Skeleton className="h-56 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
        <Skeleton className="h-44 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  );
}
