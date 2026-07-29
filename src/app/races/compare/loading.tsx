import { Skeleton } from "@/components/ui/skeleton";

/** Static shell only — see the note in src/app/loading.tsx. */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      {/* Back link */}
      <Skeleton className="h-4 w-24" />

      <Skeleton className="mt-5 h-9 w-56" />
      <Skeleton className="mt-2 h-4 w-80" />

      {/* The two race pickers, then the side-by-side panels. */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-52 w-full rounded-xl" />
        <Skeleton className="h-52 w-full rounded-xl" />
      </div>
      <Skeleton className="mt-4 h-64 w-full rounded-xl" />
    </div>
  );
}
