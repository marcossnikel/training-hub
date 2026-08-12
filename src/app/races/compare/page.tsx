import Link from "next/link";
import { ArrowLeftIcon, GitCompareIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { RaceCompare, type CompareSide, type RaceOption } from "@/components/race-compare";
import { getAthleteThresholds, listBlockActivities, listRaces } from "@/lib/db";
import { getDict } from "@/lib/lang";
import { localStartedAt } from "@/lib/format";
import { analyzeRace, buildBlock } from "@/lib/blocks";
import type { AthleteThresholds } from "@/lib/fitness";
import { raceCategory, type RaceCategory } from "@/lib/races";
import { ensureActivityStreams } from "@/lib/strava";
import { requireCurrentUser } from "@/lib/auth";
import type { OwnerContext } from "@/lib/owner-context";
import type { ActivityWithSplits } from "@/lib/types";

export const metadata = { title: "Compare" };

const WEEK_OPTIONS = [8, 12, 16] as const;
const DEFAULT_WEEKS = 12;
const DAY_MS = 86_400_000;

function parseWeeks(raw: string | string[] | undefined): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return (WEEK_OPTIONS as readonly number[]).includes(n) ? n : DEFAULT_WEEKS;
}

function parseId(raw: string | string[] | undefined): number | null {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(n) ? n : null;
}

/**
 * Default selection: the two most-recent races that share a category, halves
 * first; otherwise the two most recent races. `races` is newest-first.
 */
function defaultPair(races: ActivityWithSplits[]): [ActivityWithSplits, ActivityWithSplits] {
  const halves = races.filter((r) => raceCategory(r) === "half");
  if (halves.length >= 2) return [halves[0], halves[1]];
  const seen = new Map<RaceCategory, ActivityWithSplits>();
  for (const race of races) {
    const cat = raceCategory(race);
    const earlier = seen.get(cat);
    if (earlier) return [earlier, race];
    seen.set(cat, race);
  }
  return [races[0], races[1]];
}

async function buildSide(
  owner: OwnerContext,
  race: ActivityWithSplits,
  weeks: number,
  thresholds: AthleteThresholds
): Promise<CompareSide> {
  const raceStartIso = race.started_at ?? race.created_at;
  const blockStartIso = new Date(Date.parse(raceStartIso) - weeks * 7 * DAY_MS).toISOString();
  const activities = await listBlockActivities(owner, blockStartIso, raceStartIso);
  const block = buildBlock(activities, raceStartIso, weeks, thresholds);
  const streams = await ensureActivityStreams(owner, race);
  const analysis = analyzeRace(race, streams, thresholds);
  return {
    race: {
      id: race.id,
      name: race.name,
      // raceStartIso stays the UTC instant for the block time-window math above;
      // the displayed date prefers the local wall-clock.
      startedAt: localStartedAt(race) ?? race.created_at,
      category: raceCategory(race),
    },
    block,
    analysis,
  };
}

export default async function RaceComparePage({ searchParams }: PageProps<"/races/compare">) {
  const owner = await requireCurrentUser();
  if (!owner) return null;
  const { t } = await getDict();
  const params = await searchParams;
  const races = await listRaces(owner);

  if (races.length < 2) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="font-display text-4xl font-bold">{t.compare.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.compare.subtitle}</p>
        <div className="mt-6">
          <EmptyState
            icon={GitCompareIcon}
            title={t.compare.emptyTitle}
            description={t.compare.emptyBody}
          />
        </div>
      </div>
    );
  }

  const weeks = parseWeeks(params.weeks);
  const idA = parseId(params.a);
  const idB = parseId(params.b);
  let raceA = races.find((r) => r.id === idA) ?? null;
  let raceB = races.find((r) => r.id === idB) ?? null;
  if (!raceA || !raceB || raceA.id === raceB.id) {
    [raceA, raceB] = defaultPair(races);
  }

  const thresholds = await getAthleteThresholds(owner);
  const [sideA, sideB] = await Promise.all([
    buildSide(owner, raceA, weeks, thresholds),
    buildSide(owner, raceB, weeks, thresholds),
  ]);

  const options: RaceOption[] = races.map((r) => ({
    id: r.id,
    name: r.name ?? t.log.untitled,
    category: raceCategory(r),
    startedAt: localStartedAt(r) ?? r.created_at,
  }));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <Link
        href="/races"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeftIcon className="size-3.5" aria-hidden /> {t.racesPage.title}
      </Link>

      <h1 className="mt-5 font-display text-4xl font-bold">{t.compare.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t.compare.subtitle}</p>

      <RaceCompare
        options={options}
        weekOptions={[...WEEK_OPTIONS]}
        weeks={weeks}
        sideA={sideA}
        sideB={sideB}
      />
    </div>
  );
}
