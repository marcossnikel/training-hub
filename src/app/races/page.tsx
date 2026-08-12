import Link from "next/link";
import { GitCompareIcon, MedalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { FeelingBadge } from "@/components/feeling-badge";
import { listRaces } from "@/lib/db";
import { getDict } from "@/lib/lang";
import { fmtDate, fmtDuration, fmtKm, fmtPace, fmtPaceShort, localStartedAt } from "@/lib/format";
import { fillStr } from "@/lib/i18n";
import { raceCategory } from "@/lib/races";
import { isRunSport } from "@/lib/validate";
import { requireCurrentUser } from "@/lib/auth";

export const metadata = { title: "Races" };

export default async function RacesPage() {
  const owner = await requireCurrentUser();
  if (!owner) return null;
  const { lang, t } = await getDict();
  const races = await listRaces(owner);

  // Fastest half marathon for the subtitle headline, when there is one.
  const halves = races.filter((r) => raceCategory(r) === "half" && r.avg_pace_s_per_km);
  const fastestHalf = halves.reduce<null | (typeof halves)[number]>((best, r) => {
    if (!best || (r.avg_pace_s_per_km ?? Infinity) < (best.avg_pace_s_per_km ?? Infinity)) return r;
    return best;
  }, null);

  // Group by calendar year, newest first.
  const groups: Array<{ year: string; items: typeof races }> = [];
  for (const race of races) {
    const year = (localStartedAt(race) ?? race.created_at).slice(0, 4);
    const group = groups.find((g) => g.year === year);
    if (group) group.items.push(race);
    else groups.push({ year, items: [race] });
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-bold">{t.racesPage.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {races.length === 0
              ? t.racesPage.empty
              : fastestHalf
                ? fillStr(t.racesPage.subtitle, {
                    n: races.length,
                    distance: t.racesPage.categories.half.toLowerCase(),
                    pace: fmtPace(fastestHalf.avg_pace_s_per_km),
                  })
                : fillStr(t.racesPage.subtitlePlain, { n: races.length })}
          </p>
        </div>
        {races.length >= 2 ? (
          <Button asChild variant="outline" size="sm">
            <Link href="/races/compare">
              <GitCompareIcon data-icon="inline-start" aria-hidden />
              {t.racesPage.compare}
            </Link>
          </Button>
        ) : null}
      </div>

      {races.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={MedalIcon}
            title={t.racesPage.empty}
            description={t.racesPage.emptyBody}
          />
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {groups.map((group) => (
            <section key={group.year}>
              <h2 className="border-b pb-2 font-display text-base font-medium">{group.year}</h2>
              <ul className="mt-1.5 divide-y divide-border/50">
                {group.items.map((race) => {
                  const category = raceCategory(race);
                  const run = isRunSport(race.sport_type);
                  return (
                    <li key={race.id}>
                      <Link
                        href={`/activity/${race.id}`}
                        className="group/row -mx-2 grid grid-cols-[70px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg px-2 py-3 transition-colors hover:bg-accent/50 sm:grid-cols-[80px_110px_minmax(0,1fr)_auto]"
                      >
                        <span className="font-mono text-xs whitespace-nowrap tabular-nums text-muted-foreground">
                          {fmtDate(localStartedAt(race), lang)}
                        </span>

                        <span className="hidden sm:block">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            <MedalIcon className="size-3" aria-hidden />
                            {t.racesPage.categories[category]}
                          </span>
                        </span>

                        <span className="min-w-0">
                          <span className="truncate text-sm font-medium transition-colors group-hover/row:text-primary">
                            {race.name ?? t.log.untitled}
                          </span>
                          <span className="mt-0.5 block truncate font-mono text-xs tabular-nums text-muted-foreground">
                            {fmtKm(race.distance_km)}
                            {run && race.avg_pace_s_per_km ? (
                              <> · {fmtPace(race.avg_pace_s_per_km)}</>
                            ) : null}
                            {race.moving_time_s ? <> · {fmtDuration(race.moving_time_s)}</> : null}
                            {race.avg_hr ? <> · {Math.round(race.avg_hr)} bpm</> : null}
                          </span>
                        </span>

                        <span className="flex items-center justify-end gap-2">
                          {race.goal_pace_s_per_km ? (
                            <span className="hidden font-mono text-xs tabular-nums text-muted-foreground md:inline">
                              {fillStr(t.racesPage.goalPace, {
                                pace: fmtPaceShort(race.goal_pace_s_per_km),
                              })}
                            </span>
                          ) : null}
                          {race.feeling ? (
                            <FeelingBadge feeling={race.feeling} label={t.feelings[race.feeling]} />
                          ) : null}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
