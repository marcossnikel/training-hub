import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDateWithYear, fmtDuration, fmtKm } from "@/lib/format";
import { fillStr, type Dict, type Lang } from "@/lib/i18n";
import type {
  ComparableActivityResult,
  ComparableActivitySummary,
} from "@/lib/comparable-activity";

type ComparableCopy = Dict["comparableActivity"];

function signedPercent(value: number): string {
  const percent = Math.round(value * 1_000) / 10;
  if (Object.is(percent, -0) || percent === 0) return "0.0%";
  return `${percent > 0 ? "+" : "−"}${Math.abs(percent).toFixed(1)}%`;
}

function deltaDescription(value: number, t: ComparableCopy): string {
  if (value > 0) return t.longer;
  if (value < 0) return t.shorter;
  return t.same;
}

function ActivityEvidence({
  activity,
  label,
  activityLabel,
  linkLabel,
  lang,
  t,
}: {
  activity: ComparableActivitySummary;
  label: string;
  activityLabel: string;
  linkLabel: string;
  lang: Lang;
  t: ComparableCopy;
}) {
  return (
    <section aria-label={label} className="rounded-lg border bg-muted/35 p-4">
      <Link
        href={`/activity/${activity.id}`}
        aria-label={linkLabel}
        className="focus-ring block rounded-sm transition-colors duration-150 hover:text-primary motion-reduce:transition-none"
      >
        <span className="label-micro">{label}</span>
        <span className="mt-1 block text-sm font-medium underline-offset-4 hover:underline">
          {activityLabel}
        </span>
        <span className="mt-1 block text-sm text-muted-foreground">
          {fmtDateWithYear(activity.startedAt, lang)}
        </span>
      </Link>
      <dl className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <dt className="label-micro">{t.distance}</dt>
          <dd className="mt-1 font-mono text-sm tabular-nums">{fmtKm(activity.distanceKm, 2)}</dd>
        </div>
        <div>
          <dt className="label-micro">{t.movingTime}</dt>
          <dd className="mt-1 font-mono text-sm tabular-nums">
            {fmtDuration(activity.movingTimeS)}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function MethodDisclosure({ t }: { t: ComparableCopy }) {
  return (
    <details className="mt-6 rounded-xl border bg-card px-4 py-3">
      <summary className="focus-ring w-fit cursor-pointer rounded-sm font-medium transition-colors duration-150 hover:text-primary motion-reduce:transition-none">
        {t.method}
      </summary>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        {t.methodDetail}
      </p>
    </details>
  );
}

function MatchView({
  result,
  lang,
  t,
}: {
  result: Extract<ComparableActivityResult, { state: "match" }>;
  lang: Lang;
  t: ComparableCopy;
}) {
  const { match } = result;
  const sportFamily = t.sportFamily[match.sportFamily];
  return (
    <>
      <Card>
        <CardHeader>
          <p className="label-micro">{sportFamily}</p>
          <CardTitle as="h1" className="text-2xl">
            {t.title}
          </CardTitle>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {fillStr(t.matchExplanation, { sportFamily })}
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <ActivityEvidence
              activity={match.source}
              label={t.source}
              activityLabel={fillStr(t.sourceActivity, { id: match.source.id })}
              linkLabel={fillStr(t.openSource, { id: match.source.id })}
              lang={lang}
              t={t}
            />
            <ActivityEvidence
              activity={match.candidate}
              label={t.prior}
              activityLabel={fillStr(t.priorActivity, { id: match.candidate.id })}
              linkLabel={fillStr(t.openPrior, { id: match.candidate.id })}
              lang={lang}
              t={t}
            />
          </div>
          <dl className="mt-4 grid gap-3 rounded-lg border bg-muted/35 p-4 sm:grid-cols-2">
            <div>
              <dt className="label-micro">{t.distance}</dt>
              <dd className="mt-1 font-mono text-sm tabular-nums">
                {signedPercent(match.signedDistanceDelta)}
              </dd>
              <p className="mt-1 text-xs text-muted-foreground">
                {deltaDescription(match.signedDistanceDelta, t)}
              </p>
            </div>
            <div>
              <dt className="label-micro">{t.movingTime}</dt>
              <dd className="mt-1 font-mono text-sm tabular-nums">
                {signedPercent(match.signedMovingTimeDelta)}
              </dd>
              <p className="mt-1 text-xs text-muted-foreground">
                {deltaDescription(match.signedMovingTimeDelta, t)}
              </p>
            </div>
          </dl>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{t.thresholds}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t.limitation}</p>
        </CardContent>
      </Card>
      <MethodDisclosure t={t} />
    </>
  );
}

function NoMatchView({
  source,
  lang,
  t,
}: {
  source: ComparableActivitySummary;
  lang: Lang;
  t: ComparableCopy;
}) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle as="h1" className="text-2xl">
            {t.noMatchTitle}
          </CardTitle>
          <p className="text-sm leading-relaxed text-muted-foreground">{t.noMatchBody}</p>
        </CardHeader>
        <CardContent>
          <ActivityEvidence
            activity={source}
            label={t.source}
            activityLabel={fillStr(t.sourceActivity, { id: source.id })}
            linkLabel={fillStr(t.openSource, { id: source.id })}
            lang={lang}
            t={t}
          />
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{t.noMatchMethod}</p>
        </CardContent>
      </Card>
      <MethodDisclosure t={t} />
    </>
  );
}

export function ComparableActivityView({
  source,
  result,
  lang,
  t,
}: {
  source: ComparableActivitySummary;
  result: ComparableActivityResult;
  lang: Lang;
  t: ComparableCopy;
}) {
  return result.state === "match" ? (
    <MatchView result={result} lang={lang} t={t} />
  ) : (
    <NoMatchView source={source} lang={lang} t={t} />
  );
}
