import { Skeleton } from "@/components/ui/skeleton";

export default function ConnectionActivationLoading() {
  return (
    <main className="min-h-svh bg-background px-4 py-8">
      <div className="mx-auto max-w-2xl rounded-2xl border bg-card p-6 sm:p-10">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-5 h-24 w-full" />
        <Skeleton className="mt-8 h-36 w-full rounded-2xl" />
      </div>
    </main>
  );
}
