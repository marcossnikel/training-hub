"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, CheckCircle2Icon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtDateWithYear, fmtDuration, fmtElev, fmtKm } from "@/lib/format";
import type { Lang } from "@/lib/i18n";
import type { StravaImportStatusSnapshot } from "@/lib/db/strava-import-jobs";
import type { ActivationSummary } from "./connection-activation";
import {
  completeConnectionActivationAction,
  dismissConnectionActivationAction,
} from "./connection-activation-actions";

const stageCopy = {
  fetching_activities: "Reading committed activity pages",
  classifying_history: "Classifying your imported history",
  materializing_gear: "Matching imported gear",
  aggregating_summary: "Preparing your summary",
  completed: "Import complete",
} as const;

function ProgressExperience({ initial }: { initial: StravaImportStatusSnapshot }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [retrying, setRetrying] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

  useEffect(() => {
    if (initial.job.status === "completed" || initial.job.status === "failed") return;
    let active = true;
    let timer: number | undefined;
    const advance = async () => {
      const response = await fetch("/api/strava/import", { method: "POST", cache: "no-store" });
      if (!active || !response.ok) return;
      const next = (await response.json()) as StravaImportStatusSnapshot;
      setStatus(next);
      if (next.job.status === "completed") router.refresh();
      else if (next.job.status !== "failed") timer = window.setTimeout(advance, 650);
    };
    timer = window.setTimeout(advance, 650);
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [initial.job.status, router]);

  const imported =
    status.counters.historical_confirmed_created + status.counters.new_pending_created;
  return (
    <main className="th-foundation min-h-svh bg-background px-4 py-5 sm:px-6 sm:py-8">
      <section
        className="mx-auto w-full max-w-2xl rounded-2xl border bg-card p-6 sm:p-10"
        aria-labelledby="connection-activation-heading"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Strava connection
            </p>
            <h1
              ref={heading}
              tabIndex={-1}
              id="connection-activation-heading"
              className="focus-ring mt-4 rounded-sm text-4xl leading-[1.04] font-semibold tracking-[-0.04em] outline-none sm:text-5xl"
            >
              Your history is becoming available.
            </h1>
          </div>
          <form action={dismissConnectionActivationAction}>
            <Button variant="ghost" type="submit">
              Skip for now
            </Button>
          </form>
        </div>
        <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
          This reflects committed local records only. You can leave safely and reopen it from
          Settings while the import resumes.
        </p>
        <div className="mt-8 rounded-2xl border bg-muted/40 p-5">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium">{stageCopy[status.job.stage]}</p>
            <p className="font-mono text-xs tabular-nums text-muted-foreground">
              {status.pagesCommitted} committed page{status.pagesCommitted === 1 ? "" : "s"}
            </p>
          </div>
          <div
            role="progressbar"
            aria-label="Import progress is indeterminate while the provider total is unknown"
            aria-valuetext="The provider total is not known yet"
            className="mt-4 h-1 overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full w-2/5 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
          </div>
          <p role="status" aria-live="polite" className="mt-4 text-sm text-muted-foreground">
            {imported} imported · {status.counters.already_present} already present ·{" "}
            {status.counters.skipped_invalid} skipped invalid records
          </p>
          {status.job.status === "failed" ? (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <p role="alert" className="text-sm text-destructive">
                The import paused safely. Retry continues from the last committed page.
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={retrying}
                onClick={async () => {
                  setRetrying(true);
                  const response = await fetch("/api/strava/import", {
                    method: "POST",
                    cache: "no-store",
                  });
                  if (response.ok) {
                    setStatus((await response.json()) as StravaImportStatusSnapshot);
                    router.refresh();
                  }
                  setRetrying(false);
                }}
              >
                <RefreshCwIcon aria-hidden /> Retry import
              </Button>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function SummaryExperience({ summary, lang }: { summary: ActivationSummary; lang: Lang }) {
  const completed = useRef(false);
  useEffect(() => {
    if (completed.current) return;
    completed.current = true;
    void completeConnectionActivationAction();
  }, []);
  const sports = Object.entries(summary.sportMix).filter(([, count]) => count > 0);
  return (
    <main className="th-foundation min-h-svh bg-background px-4 py-5 sm:px-6 sm:py-8">
      <section
        className="mx-auto w-full max-w-3xl rounded-2xl border bg-card p-6 sm:p-10"
        aria-labelledby="activation-summary-heading"
      >
        <p className="font-mono text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Activation summary
        </p>
        <h1
          id="activation-summary-heading"
          className="mt-4 text-4xl leading-[1.04] font-semibold tracking-[-0.04em] sm:text-5xl"
        >
          Your imported training has a starting point.
        </h1>
        {summary.coverage ? (
          <p className="mt-5 text-base leading-7 text-muted-foreground">
            Confirmed records from {fmtDateWithYear(summary.coverage.oldest, lang)} through{" "}
            {fmtDateWithYear(summary.coverage.newest, lang)}. Calendar-year wording waits for a
            confirmed athlete timezone.
          </p>
        ) : (
          <p className="mt-5 text-base leading-7 text-muted-foreground">
            The completed import did not add confirmed activity summaries yet.
          </p>
        )}
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Fact
            label="Confirmed history"
            value={String(summary.confirmed)}
            detail="Committed activity summaries"
          />
          {summary.distanceKm > 0 ? (
            <Fact
              label="Distance"
              value={fmtKm(summary.distanceKm, 1)}
              detail="Imported confirmed activities"
            />
          ) : null}
          {summary.movingTimeS > 0 ? (
            <Fact
              label="Moving time"
              value={fmtDuration(summary.movingTimeS)}
              detail="Imported confirmed activities"
            />
          ) : null}
          {summary.elevationM > 0 ? (
            <Fact
              label="Elevation"
              value={fmtElev(summary.elevationM)}
              detail="Imported confirmed activities"
            />
          ) : null}
        </div>
        {sports.length ? (
          <section className="mt-8">
            <h2 className="text-lg font-semibold">Sport families</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {sports.map(([family, count]) => `${count} ${family}`).join(" · ")} · from confirmed
              imported summaries
            </p>
          </section>
        ) : null}
        {summary.recent ? (
          <section className="mt-8 rounded-2xl border bg-muted/40 p-5">
            <h2 className="text-lg font-semibold">Recent consistency</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {summary.recent.sessions} sessions across {summary.recent.activeDays} active days,{" "}
              {summary.recent.fromDay}–{summary.recent.throughDay}. This is a summary-ready view,
              not an enrichment metric.
            </p>
            <Button asChild variant="outline" className="mt-4">
              <Link href="/performance">
                Open the populated consistency heatmap <ArrowRightIcon aria-hidden />
              </Link>
            </Button>
          </section>
        ) : null}
        <section className="mt-8 grid gap-3 sm:grid-cols-3">
          <Evidence href="/" label="Training Log" detail="Confirmed imported activity records" />
          <Evidence
            href="/performance"
            label="Performance"
            detail="Summary-derived trends and consistency"
          />
          <Evidence
            href="/gear"
            label="Gear"
            detail={`${summary.gearCount} imported gear record${summary.gearCount === 1 ? "" : "s"}`}
          />
        </section>
        {summary.pending > 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">
            {summary.pending} newer activity{summary.pending === 1 ? " is" : "ies are"} pending
            review and intentionally excluded from this summary.
          </p>
        ) : null}
      </section>
    </main>
  );
}

function Fact({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] tabular-nums">{value}</p>
      <p className="mt-2 font-mono text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function Evidence({ href, label, detail }: { href: string; label: string; detail: string }) {
  return (
    <Link
      href={href}
      className="focus-ring rounded-2xl border bg-card p-4 transition-colors hover:bg-muted"
    >
      <CheckCircle2Icon aria-hidden className="size-4 text-primary" />
      <p className="mt-3 font-medium">{label}</p>
      <p className="mt-1 text-sm leading-5 text-muted-foreground">{detail}</p>
    </Link>
  );
}

export function ConnectionActivationFlow({
  status,
  summary,
  lang,
}: {
  status: StravaImportStatusSnapshot;
  summary: ActivationSummary | null;
  lang: Lang;
}) {
  return summary ? (
    <SummaryExperience summary={summary} lang={lang} />
  ) : (
    <ProgressExperience initial={status} />
  );
}
