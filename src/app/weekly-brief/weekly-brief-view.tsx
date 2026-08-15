import Link from "next/link";
import { ActivityIcon, BookOpenIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDateWithYear, fmtDuration } from "@/lib/format";
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

function SourceRow({ source }: { source: WeeklyBriefSource }) {
  const date = fmtDateWithYear(`${source.date}T12:00:00Z`);
  const sport = source.sportType ?? "Activity";
  return (
    <li className="grid gap-2 border-t py-3 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-4">
      <span className="text-sm text-muted-foreground">
        {date} · {sport}
      </span>
      <span className="font-mono text-sm tabular-nums">{fmtDuration(source.movingTimeS)}</span>
      <Link
        className="focus-ring w-fit rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline"
        href={`/activity/${source.id}`}
      >
        Open {date} {sport} activity
      </Link>
    </li>
  );
}

function EvidenceGroup({ heading, sources }: { heading: string; sources: WeeklyBriefSource[] }) {
  const id = heading === "Current-week evidence" ? "current-week-evidence" : "baseline-evidence";
  return (
    <section aria-labelledby={id} className="mt-5 first:mt-2">
      <h3 id={id} className="label-micro">
        {heading}
      </h3>
      <ul className="mt-2">
        {sources.map((source) => (
          <SourceRow key={`${source.id}-${source.date}`} source={source} />
        ))}
      </ul>
    </section>
  );
}

function Observation({ observation }: { observation: WeeklyBriefObservation }) {
  return (
    <>
      <Card>
        <CardHeader>
          <p className="label-micro">Comparison</p>
          <CardTitle className="text-xl leading-snug">{observation.copy}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Current: {rangeLabel(observation.currentWindow.start, observation.currentWindow.end)}.
            Baseline: {rangeLabel(observation.baselineWindow.start, observation.baselineWindow.end)}
            .
          </p>
          {observation.limitation ? (
            <p className="text-sm text-muted-foreground">{observation.limitation}</p>
          ) : null}
        </CardHeader>
        <CardContent>
          <h2 className="font-display text-lg font-semibold">Evidence</h2>
          <EvidenceGroup heading="Current-week evidence" sources={observation.sources.current} />
          <EvidenceGroup heading="Baseline evidence" sources={observation.sources.baseline} />
        </CardContent>
      </Card>
      <details className="mt-6 rounded-xl border bg-card px-4 py-3">
        <summary className="focus-ring w-fit cursor-pointer rounded-sm font-medium">
          How this comparison is calculated
        </summary>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          This uses confirmed activity from the most recent completed Monday–Sunday week and
          compares it with the four completed weeks before it. Activities without a valid positive
          moving time are excluded.
        </p>
      </details>
    </>
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
        className="focus-ring rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        href="/"
      >
        Review recent activities
      </Link>
    </EmptyState>
  );
}

export { rangeLabel };
