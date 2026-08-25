import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";

// Shared layout for the shoes/bikes collection pages: the title + summary line,
// the add-gear trigger, the empty state, and the active + retired card grids.
// Each page fetches its own data and supplies already-rendered cards + trigger.
export function GearCollection({
  title,
  summary,
  addTrigger,
  empty,
  active,
  retired,
}: {
  title: string;
  summary: React.ReactNode;
  addTrigger: React.ReactNode;
  empty: { icon: LucideIcon; title: string; body: string; action: React.ReactNode } | null;
  active: React.ReactNode;
  retired: { label: string; cards: React.ReactNode } | null;
}) {
  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.025em]">{title}</h2>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{summary}</p>
        </div>
        {addTrigger}
      </div>

      {empty ? (
        <div className="mt-6">
          <EmptyState icon={empty.icon} title={empty.title} description={empty.body}>
            {empty.action}
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{active}</div>
          {retired ? (
            <section className="mt-10">
              <h3 className="text-lg font-semibold text-muted-foreground">{retired.label}</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{retired.cards}</div>
            </section>
          ) : null}
        </>
      )}
    </section>
  );
}
