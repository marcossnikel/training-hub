import { many, sqliteBool } from "./helpers";
import { sportCategory } from "../sports";
import type { RunEffort } from "../benchmarks";
import type { OwnerContext } from "../owner-context";

interface RunEffortRow {
  name: string | null;
  sport_type: string | null;
  distance_km: number | null;
  moving_time_s: number | null;
  is_race: number;
  date: string | null;
}

/**
 * Confirmed RUN efforts as whole-activity summaries for the benchmarks engine:
 * distance, moving time, the race flag, name and the local calendar date. This
 * is summary data only — no stream tables are read (per-second streams are
 * cached for only a handful of activities), so the engine works from what every
 * confirmed activity carries.
 *
 * The run filter reuses the canonical `sportCategory` bucketer (a substring
 * match SQL cannot express) after SQL narrows to confirmed rows with a positive
 * distance and moving time. `is_race` is decoded to a real boolean at this read
 * seam, and the display date prefers the local wall-clock stamp.
 */
export async function listRunEfforts(owner: OwnerContext): Promise<RunEffort[]> {
  const rows = await many<RunEffortRow>(
    `SELECT name, sport_type, distance_km, moving_time_s, is_race,
            COALESCE(started_at_local, started_at) AS date
     FROM activities
     WHERE user_id = ? AND status = 'confirmed' AND distance_km > 0 AND moving_time_s > 0
     ORDER BY started_at DESC`,
    [owner.userId]
  );
  return rows
    .filter((row) => sportCategory(row.sport_type) === "run")
    .map((row) => ({
      distanceKm: row.distance_km ?? 0,
      movingTimeS: row.moving_time_s ?? 0,
      isRace: sqliteBool(row.is_race),
      name: row.name,
      // Preserve the real sport so the engine can drop trail from road efforts.
      sportType: row.sport_type,
      date: row.date,
    }));
}
