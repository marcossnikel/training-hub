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
