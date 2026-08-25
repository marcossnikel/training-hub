import Link from "next/link";
import { Button } from "@/components/ui/button";
import { fmtDateWithYear, fmtDuration, fmtKm, fmtPace } from "@/lib/format";
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
  muted = false,
}: {
  activity: ComparableActivitySummary;
  label: string;
  activityLabel: string;
  linkLabel: string;
  lang: Lang;
  t: ComparableCopy;
  muted?: boolean;
}) {
  const pace =
    activity.distanceKm !== null && activity.distanceKm > 0 && activity.movingTimeS !== null
      ? activity.movingTimeS / activity.distanceKm
      : null;
  return (
    <section
      aria-label={label}
      className={muted ? "rounded-2xl border bg-muted p-4" : "rounded-2xl border bg-card p-4"}
    >
      <p className="font-mono text-xs text-muted-foreground uppercase">
        {label} · {fmtDateWithYear(activity.startedAt, lang)}
      </p>
      <Link
        href={`/activity/${activity.id}`}
        aria-label={linkLabel}
        className="focus-ring mt-3 block w-fit rounded-sm text-xl font-semibold tracking-[-0.02em] underline-offset-4 hover:text-primary hover:underline"
      >
        {activityLabel}
      </Link>
      <dl className="mt-5 space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <dt className="text-xs text-muted-foreground">{t.distance}</dt>
            <p className="font-mono text-xs text-muted-foreground">{t.confirmedMetric}</p>
          </div>
          <dd className="text-[1.75rem] leading-8 font-semibold tracking-[-0.035em] tabular-nums">
            {fmtKm(activity.distanceKm, 2)}
          </dd>
        </div>
        <div className="flex items-end justify-between gap-4">
          <div>
            <dt className="text-xs text-muted-foreground">{t.movingTime}</dt>
            <p className="font-mono text-xs text-muted-foreground">{t.recordedDuration}</p>
          </div>
          <dd className="text-[1.75rem] leading-8 font-semibold tracking-[-0.035em] tabular-nums">
            {fmtDuration(activity.movingTimeS)}
          </dd>
        </div>
        <div className="flex items-end justify-between gap-4">
          <div>
            <dt className="text-xs text-muted-foreground">{t.pace}</dt>
            <p className="font-mono text-xs text-muted-foreground">{t.derivedMetric}</p>
          </div>
          <dd className="text-[1.75rem] leading-8 font-semibold tracking-[-0.035em] tabular-nums">
            {fmtPace(pace)}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function MethodDisclosure({ t }: { t: ComparableCopy }) {
  return (
    <details className="mt-4 rounded-xl border bg-card px-4 py-3">
      <summary className="focus-ring w-fit rounded-sm text-sm font-medium transition-colors hover:text-primary motion-reduce:transition-none">
        {t.method}
      </summary>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t.methodDetail}</p>
    </details>
  );
}

function SourceAside({
  source,
  candidate,
  t,
}: {
  source: ComparableActivitySummary;
  candidate: ComparableActivitySummary | null;
  t: ComparableCopy;
}) {
  return (
    <aside aria-label={t.sourceActivities} className="space-y-4 lg:border-l lg:pl-6">
      <div>
        <p className="font-mono text-xs text-muted-foreground uppercase">{t.evidenceEyebrow}</p>
        <h2 className="mt-4 text-2xl font-semibold tracking-[-0.025em]">{t.traceTitle}</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{t.traceBody}</p>
      </div>
      <section className="rounded-2xl border bg-card p-4">
        <h3 className="text-sm font-medium">{t.sourceActivities}</h3>
        <ul className="mt-3 space-y-2 text-sm">
          <li>
            <Link
              className="focus-ring rounded-sm hover:text-primary hover:underline"
              href={`/activity/${source.id}`}
            >
              {fillStr(t.sourceActivity, { id: source.id })} ↗
            </Link>
          </li>
          {candidate ? (
            <li>
              <Link
                className="focus-ring rounded-sm hover:text-primary hover:underline"
                href={`/activity/${candidate.id}`}
              >
                {fillStr(t.priorActivity, { id: candidate.id })} ↗
              </Link>
            </li>
          ) : null}
        </ul>
      </section>
      <Button asChild className="h-10 w-full rounded-full px-4">
        <Link href={`/activity/${source.id}`}>{t.viewCurrent}</Link>
      </Button>
    </aside>
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
      <header className="max-w-3xl">
        <p className="font-mono text-xs text-muted-foreground uppercase">
          Activity · {fmtDateWithYear(match.source.startedAt, lang)} · Comparable prior
        </p>
        <h1 className="font-narrative mt-4 max-w-2xl text-[3.25rem] leading-[1.02] font-normal tracking-[-0.035em]">
          {t.headline}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-6 text-muted-foreground">{t.intro}</p>
      </header>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1.8fr)_minmax(240px,0.72fr)]">
        <main>
          <p className="sr-only">{fillStr(t.matchExplanation, { sportFamily })}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <ActivityEvidence
              activity={match.source}
              label={t.source}
              activityLabel={fillStr(t.sourceActivity, { id: match.source.id })}
              linkLabel={fillStr(t.openSource, { id: match.source.id })}
              lang={lang}
              t={t}
              muted
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

          <section className="mt-3 rounded-xl bg-state-amber-bg p-4 text-state-amber-fg">
            <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
              <h2 className="text-sm font-semibold">{t.whyThisOne}</h2>
              <div>
                <p className="text-sm leading-6">{t.thresholds}</p>
                <dl className="mt-2 grid gap-2 font-mono text-xs sm:grid-cols-2">
                  <div>
                    <dt>{t.distance}</dt>
                    <dd>
                      <span>{signedPercent(match.signedDistanceDelta)}</span>
                      <span aria-hidden> · </span>
                      <span>{deltaDescription(match.signedDistanceDelta, t)}</span>
                    </dd>
                  </div>
                  <div>
                    <dt>{t.movingTime}</dt>
                    <dd>
                      <span>{signedPercent(match.signedMovingTimeDelta)}</span>
                      <span aria-hidden> · </span>
                      <span>{deltaDescription(match.signedMovingTimeDelta, t)}</span>
                    </dd>
                  </div>
                </dl>
                <p className="mt-2 text-sm leading-6">{t.limitation}</p>
              </div>
            </div>
          </section>
          <MethodDisclosure t={t} />
        </main>

        <SourceAside source={match.source} candidate={match.candidate} t={t} />
      </div>
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
      <header className="max-w-3xl">
        <p className="font-mono text-xs text-muted-foreground uppercase">
          Activity · {fmtDateWithYear(source.startedAt, lang)} · Comparable prior
        </p>
        <h1 className="font-narrative mt-4 text-[3.25rem] leading-[1.02] font-normal tracking-[-0.035em]">
          {t.noMatchTitle}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-6 text-muted-foreground">{t.noMatchBody}</p>
      </header>
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1.8fr)_minmax(240px,0.72fr)]">
        <main>
          <ActivityEvidence
            activity={source}
            label={t.source}
            activityLabel={fillStr(t.sourceActivity, { id: source.id })}
            linkLabel={fillStr(t.openSource, { id: source.id })}
            lang={lang}
            t={t}
            muted
          />
          <p className="mt-3 rounded-xl bg-state-amber-bg p-4 text-sm leading-6 text-state-amber-fg">
            {t.noMatchMethod}
          </p>
          <MethodDisclosure t={t} />
        </main>
        <SourceAside source={source} candidate={null} t={t} />
      </div>
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
