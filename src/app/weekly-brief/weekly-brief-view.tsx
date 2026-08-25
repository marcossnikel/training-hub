import Link from "next/link";
import { ActivityIcon, BookOpenIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { fmtDateWithYear, fmtDuration, fmtHoursMin } from "@/lib/format";
import type {
  WeeklyBriefObservation,
  WeeklyBriefResult,
  WeeklyBriefSource,
} from "@/lib/weekly-brief";

function rangeLabel(start: string, end: string): string {
  const inclusiveEnd = new Date(`${end}T12:00:00Z`);
  inclusiveEnd.setUTCDate(inclusiveEnd.getUTCDate() - 1);
  return `${fmtDateWithYear(`${start}T12:00:00Z`)} – ${fmtDateWithYear(inclusiveEnd.toISOString())}`;
}

function SourceRow({ source, record = false }: { source: WeeklyBriefSource; record?: boolean }) {
  const date = fmtDateWithYear(`${source.date}T12:00:00Z`);
  const sport = source.sportType ?? "Activity";
  return (
    <li>
      <Link
        aria-label={record ? `Week record: ${date} ${sport}` : `Open ${date} ${sport} activity`}
        href={`/activity/${source.id}`}
        className="focus-ring flex items-center justify-between gap-4 rounded-lg bg-muted px-3 py-3 transition-colors hover:bg-accent motion-reduce:transition-none"
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium">{sport}</span>
          <span className="mt-0.5 block font-mono text-xs text-muted-foreground">{date}</span>
        </span>
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          {fmtDuration(source.movingTimeS)}
        </span>
      </Link>
    </li>
  );
}

function EvidenceGroup({ heading, sources }: { heading: string; sources: WeeklyBriefSource[] }) {
  const id = heading === "Current-week evidence" ? "current-week-evidence" : "baseline-evidence";
  return (
    <section aria-labelledby={id} className="mt-5 first:mt-2">
      <h3 id={id} className="font-mono text-xs font-medium text-muted-foreground uppercase">
        {heading}
      </h3>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {sources.map((source) => (
          <SourceRow key={`${source.id}-${source.date}`} source={source} />
        ))}
      </ul>
    </section>
  );
}

function observationMetrics(observation: WeeklyBriefObservation) {
  const sourceCount = observation.sources.current.length + observation.sources.baseline.length;
  if (observation.kind === "training_time_change") {
    return [
      { label: "Current", value: fmtHoursMin(observation.values.currentMovingTimeS) },
      {
        label: "Baseline median",
        value: fmtHoursMin(observation.values.baselineMedianMovingTimeS),
      },
      { label: "Source", value: `${sourceCount} activities` },
    ];
  }
  if (observation.kind === "session_frequency_change") {
    return [
      { label: "Current", value: `${observation.values.currentSessions} sessions` },
      { label: "Baseline median", value: `${observation.values.baselineMedianSessions} sessions` },
      { label: "Source", value: `${sourceCount} activities` },
    ];
  }
  if (observation.kind === "sport_mix_change") {
    return [
      { label: "Current share", value: `${Math.round(observation.values.currentShare * 100)}%` },
      { label: "Baseline share", value: `${Math.round(observation.values.baselineShare * 100)}%` },
      { label: "Source", value: `${sourceCount} activities` },
    ];
  }
  return [
    { label: "Longest session", value: fmtHoursMin(observation.values.longestSessionMovingTimeS) },
    { label: "Week total", value: fmtHoursMin(observation.values.weeklyMovingTimeS) },
    { label: "Source", value: `${sourceCount} activities` },
  ];
}

function Observation({ observation }: { observation: WeeklyBriefObservation }) {
  const metrics = observationMetrics(observation);
  const totalSources = observation.sources.current.length + observation.sources.baseline.length;
  return (
    <section className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.75fr)_minmax(250px,0.85fr)]">
      <article className="rounded-2xl border bg-card p-4 shadow-[0_8px_20px_rgba(23,24,21,0.05)] sm:p-5">
        <p className="font-mono text-xs text-muted-foreground uppercase">
          Week in context ·{" "}
          {rangeLabel(observation.currentWindow.start, observation.currentWindow.end)}
        </p>
        <h2 className="mt-4 text-2xl leading-[1.2] font-semibold tracking-[-0.025em]">
          {observation.copy}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Based on {observation.baselineWeeksWithActivity} completed Monday–Sunday weeks and{" "}
          {observation.sources.current.length} confirmed current-week activities.
        </p>

        <dl className="mt-5 grid gap-2 rounded-xl bg-muted p-3 sm:grid-cols-3">
          {metrics.map((metric) => (
            <div key={metric.label} className="flex items-center justify-between gap-4 sm:block">
              <dt className="font-mono text-xs text-muted-foreground">{metric.label}</dt>
              <dd className="mt-1 text-base font-medium tabular-nums">{metric.value}</dd>
            </div>
          ))}
        </dl>

        {observation.limitation ? (
          <p className="mt-3 rounded-xl bg-state-amber-bg px-3 py-2.5 text-sm leading-6 text-state-amber-fg">
            {observation.limitation}
          </p>
        ) : null}

        <details className="mt-4">
          <summary className="focus-ring w-fit rounded-sm text-sm font-medium underline-offset-4 hover:text-primary hover:underline">
            Review the {totalSources} source activities
          </summary>
          <div className="mt-4 border-t pt-4">
            <h3 className="text-lg font-semibold">Evidence</h3>
            <EvidenceGroup heading="Current-week evidence" sources={observation.sources.current} />
            <EvidenceGroup heading="Baseline evidence" sources={observation.sources.baseline} />
          </div>
        </details>
      </article>

      <aside aria-label="Weekly brief provenance" className="space-y-3">
        <section className="rounded-2xl border bg-card p-4">
          <h2 className="text-xl font-semibold tracking-[-0.02em]">Week record</h2>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            {rangeLabel(observation.currentWindow.start, observation.currentWindow.end)} · completed
          </p>
          <ul className="mt-4 space-y-2">
            {observation.sources.current.map((source) => (
              <SourceRow key={`record-${source.id}-${source.date}`} source={source} record />
            ))}
          </ul>
        </section>
        <section className="rounded-xl bg-muted p-4">
          <h2 className="text-sm font-semibold">Method, not a verdict</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            The most recent completed Monday–Sunday week is compared with the previous four
            completed weeks. Invalid moving time stays excluded; sparse history stays visible next
            to the observation.
          </p>
        </section>
      </aside>
    </section>
  );
}

export function WeeklyBriefView({ result }: { result: WeeklyBriefResult }) {
  if (result.state === "observations") return <Observation observation={result.observations[0]} />;
  const insufficient = result.state === "insufficient_history";
  return (
    <EmptyState
      icon={insufficient ? BookOpenIcon : ActivityIcon}
      title={insufficient ? "Not enough completed-week history yet" : "No clear weekly change yet"}
      description={
        insufficient
          ? "This brief needs confirmed activity in at least 3 of the previous 4 completed weeks."
          : "The confirmed activity in this completed week did not meet the current observation thresholds."
      }
    >
      <Link
        className="focus-ring rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
        href="/"
      >
        Review recent activities
      </Link>
    </EmptyState>
  );
}

export { rangeLabel };
