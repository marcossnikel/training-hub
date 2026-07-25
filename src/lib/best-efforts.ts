// Strava's per-run best efforts ("400m", "1K", "5K", "Half-Marathon", …) turned
// into the rows `activity_best_efforts` stores. Pure: validation, normalisation
// and dedup only, so the lazy detail path (`ensureActivityDetail`) and the local
// backfill script (`scripts/backfill-best-efforts.ts`) agree on exactly what a
// storable effort row is.
//
// The payload interface lives here, next to the transform that consumes it, and
// src/lib/strava.ts re-exports it so every existing import site is unchanged.
// That keeps the dependency one-way (strava.ts -> best-efforts.ts, the same shape
// as streams.ts/normalizeStreams): this module never imports the fetch layer.

/**
 * A fastest sub-segment Strava found inside a run ("5K", "1 mile", …), with the
 * athlete's all-time rank for that distance when the effort made the top three.
 */
export interface StravaBestEffort {
  name: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  pr_rank: number | null;
  start_date_local?: string;
}

/**
 * One `activity_best_efforts` row, in the table's own column names. Unique within
 * its activity by `name`, which is the upsert key.
 */
export interface BestEffortRow {
  name: string;
  distance_m: number;
  elapsed_time_s: number;
  moving_time_s: number;
  pr_rank: number | null;
}

/**
 * A stored `activity_best_efforts` row as READERS see it: the write shape above plus
 * the activity it belongs to (name, race flag, date), which every consumer needs to
 * display or rank the effort. Column names are kept, so the row travels from the
 * query to the pure engines unmapped.
 */
export interface StoredBestEffort extends BestEffortRow {
  activity_name: string | null;
  is_race: boolean;
  /** The activity's local calendar stamp, for display. */
  date: string | null;
}

/** A positive, finite duration in whole seconds, or 0 when the value is unusable. */
function seconds(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

/** Strava ranks only the top three; anything else (0, null, junk) means "not a PR". */
function prRank(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * Normalises a detail payload's `best_efforts[]` into storable rows, dropping
 * anything that cannot be read as an effort (no name, no positive duration, no
 * positive distance — a zero-length or timeless "effort" would poison the pace and
 * VDOT math downstream). Strava reports moving and elapsed time identically here,
 * so a missing one is filled from the other rather than stored as 0.
 *
 * Duplicate names within one payload are collapsed to the FASTEST of them: the
 * table holds one row per (activity, name), so a slower duplicate must never
 * overwrite a faster sibling. Payload order (Strava's ascending distance) is kept.
 */
export function bestEffortRows(efforts: StravaBestEffort[] | null | undefined): BestEffortRow[] {
  if (!Array.isArray(efforts)) return [];
  const byName = new Map<string, BestEffortRow>();
  for (const effort of efforts) {
    const name = typeof effort?.name === "string" ? effort.name.trim() : "";
    if (!name) continue;
    const moving = seconds(effort.moving_time);
    const elapsed = seconds(effort.elapsed_time);
    const movingTimeS = moving || elapsed;
    const elapsedTimeS = elapsed || moving;
    if (movingTimeS === 0) continue;
    const distanceM =
      typeof effort.distance === "number" && Number.isFinite(effort.distance) ? effort.distance : 0;
    if (distanceM <= 0) continue;
    const row: BestEffortRow = {
      name,
      distance_m: distanceM,
      elapsed_time_s: elapsedTimeS,
      moving_time_s: movingTimeS,
      pr_rank: prRank(effort.pr_rank),
    };
    const current = byName.get(name);
    if (!current || row.moving_time_s < current.moving_time_s) byName.set(name, row);
  }
  return [...byName.values()];
}

/**
 * The time a chip or badge reads off a payload effort: moving time, falling back to
 * elapsed — the same rule `bestEffortRows` stores, so what is displayed and what is
 * compared against the table can never disagree. 0 when neither is usable.
 */
export function effortTimeS(effort: StravaBestEffort): number {
  return seconds(effort.moving_time) || seconds(effort.elapsed_time);
}

/**
 * The effort names on one activity that have earned a "personal record" badge.
 *
 * Two conditions, both required, because neither source is trustworthy alone:
 *
 * 1. Strava said `pr_rank = 1`. Strava ranks against the athlete's FULL history,
 *    which we do not have (only a fraction of activities carry a detail payload),
 *    so this is the only signal that can speak for all-time.
 * 2. No stored effort at that name is faster. Strava's rank is FROZEN at the moment
 *    the detail was first fetched (`saveActivityDetail` writes only when
 *    `detail_json` is empty) and is never refreshed, so a `pr_rank = 1` really means
 *    "was the record when this run was first read". The live table already holds two
 *    activities both claiming pr_rank = 1 at 10K, 15K, 20K and the half marathon,
 *    and a 1-mile row ranked 1 that a later run beat by 169 s. Cross-checking the
 *    stored times demotes those stale claims instead of showing two records.
 *
 * The pair is deliberately CONSERVATIVE: it can miss a badge (a genuine record whose
 * payload was fetched before it was one) but it cannot show a record that our own
 * data contradicts. An effort with no stored row to check against gets no badge.
 */
export function prBadgeEffortNames(
  efforts: readonly StravaBestEffort[],
  fastestStored: readonly Pick<StoredBestEffort, "name" | "moving_time_s">[]
): Set<string> {
  const fastestByName = new Map<string, number>();
  for (const row of fastestStored) {
    const current = fastestByName.get(row.name);
    if (current === undefined || row.moving_time_s < current) {
      fastestByName.set(row.name, row.moving_time_s);
    }
  }
  const names = new Set<string>();
  for (const effort of efforts) {
    if (effort?.pr_rank !== 1) continue;
    const time = effortTimeS(effort);
    const fastest = fastestByName.get(effort.name);
    if (time > 0 && fastest !== undefined && time <= fastest) names.add(effort.name);
  }
  return names;
}
