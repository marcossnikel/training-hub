import { cache } from "react";
import { batchWrite, exec, many, one, sqliteBool } from "./helpers";
import { client } from "./client";
import { ensureMigrated } from "./migrations";
import type { BlockActivity } from "../blocks";
import type { SessionStart } from "../consistency";
import type { TotalsActivity } from "../totals";
import type { Activity, ActivityWithSplits, Feeling, SplitInput, SplitWithShoe } from "../types";

// The activities table stores `is_race` as 0/1; SELECT hands it back as a number.
// `ActivityRow` is that raw shape, decoded to the `boolean`-carrying `Activity`
// domain type by `decodeActivity` — the one seam where 0/1 becomes a real boolean.
type ActivityRow = Omit<Activity, "is_race"> & { is_race: number };

function decodeActivity(row: ActivityRow): Activity {
  return { ...row, is_race: sqliteBool(row.is_race) };
}

async function attachSplits(activities: Activity[]): Promise<ActivityWithSplits[]> {
  if (activities.length === 0) return [];
  // Read only the splits for the activities in hand instead of the whole table.
  // Placeholders are built from the count; values stay `?`-bound.
  const ids = activities.map((a) => a.id);
  const placeholders = ids.map(() => "?").join(", ");
  const all = await many<SplitWithShoe>(
    `SELECT sp.id, sp.activity_id, sp.shoe_id, sp.km, sp.note,
            s.name AS shoe_name, s.role AS shoe_role
     FROM activity_splits sp
     LEFT JOIN shoes s ON s.id = sp.shoe_id
     WHERE sp.activity_id IN (${placeholders})
     ORDER BY sp.id`,
    ids
  );
  const byActivity = new Map<number, SplitWithShoe[]>();
  for (const split of all) {
    const list = byActivity.get(split.activity_id);
    if (list) list.push(split);
    else byActivity.set(split.activity_id, [split]);
  }
  return activities.map((a) => ({ ...a, splits: byActivity.get(a.id) ?? [] }));
}

const ACTIVITY_SELECT =
  "SELECT a.*, b.name AS bike_name FROM activities a LEFT JOIN bikes b ON b.id = a.bike_id";

export async function listConfirmedActivities(): Promise<ActivityWithSplits[]> {
  const rows = await many<ActivityRow>(
    `${ACTIVITY_SELECT} WHERE a.status = 'confirmed' ORDER BY a.started_at DESC, a.id DESC`
  );
  return attachSplits(rows.map(decodeActivity));
}

export async function listPendingActivities(): Promise<ActivityWithSplits[]> {
  const rows = await many<ActivityRow>(
    `${ACTIVITY_SELECT} WHERE a.status = 'pending_review' ORDER BY a.started_at ASC, a.id ASC`
  );
  return attachSplits(rows.map(decodeActivity));
}

// Wrapped in React's request-scoped cache() so the root layout and the home page,
// which both read the pending count in one render, share a single query per request.
export const countPending = cache(async (): Promise<number> => {
  const row = await one<{ c: number }>(
    "SELECT COUNT(*) AS c FROM activities WHERE status = 'pending_review'"
  );
  return Number(row?.c ?? 0);
});

export async function getActivity(id: number): Promise<ActivityWithSplits | null> {
  const row = await one<ActivityRow>(`${ACTIVITY_SELECT} WHERE a.id = ?`, [id]);
  if (!row) return null;
  const [withSplits] = await attachSplits([decodeActivity(row)]);
  return withSplits;
}

export async function listRaces(): Promise<ActivityWithSplits[]> {
  const rows = await many<ActivityRow>(
    `${ACTIVITY_SELECT} WHERE a.is_race = 1 ORDER BY a.started_at DESC, a.id DESC`
  );
  return attachSplits(rows.map(decodeActivity));
}

export interface RaceMarkerRow {
  started_at: string;
  name: string | null;
}

/** Confirmed race activities' start date + name, for PMC chart race markers. */
export async function listRaceMarkers(): Promise<RaceMarkerRow[]> {
  return many<RaceMarkerRow>(
    `SELECT started_at, name FROM activities
     WHERE status = 'confirmed' AND is_race = 1 AND started_at IS NOT NULL
     ORDER BY started_at ASC`
  );
}

/** Confirmed activities in [fromIso, toIso), oldest first, for block analysis. */
export async function listBlockActivities(
  fromIso: string,
  toIso: string
): Promise<BlockActivity[]> {
  return many<BlockActivity>(
    `SELECT started_at, sport_type, distance_km, moving_time_s, avg_hr, avg_pace_s_per_km
     FROM activities
     WHERE status = 'confirmed' AND started_at >= ? AND started_at < ?
     ORDER BY started_at ASC`,
    [fromIso, toIso]
  );
}

/**
 * Confirmed activities from a local calendar day onwards, with their persisted
 * load, for the /fitness totals table. Rows come back per activity and ungrouped
 * on purpose: every week/month bucket is built in JS from the athlete's local day
 * (`started_at_local`, falling back to `started_at` — see `periodTotals`),
 * because grouping with SQL strftime would bucket by UTC and drift each period
 * boundary by the athlete's tz offset.
 */
export async function listTotalsActivities(fromDay: string): Promise<TotalsActivity[]> {
  return many<TotalsActivity>(
    `SELECT a.started_at, a.started_at_local, a.sport_type,
            l.tss, a.moving_time_s, a.distance_km, a.elevation_gain_m
     FROM activities a
     LEFT JOIN activity_load l ON l.activity_id = a.id
     WHERE a.status = 'confirmed' AND a.started_at IS NOT NULL
       AND COALESCE(a.started_at_local, a.started_at) >= ?
     ORDER BY a.started_at ASC`,
    // Midnight of the first local day, compared against the very stamp the JS
    // bucketing takes its day key from, so no row is fetched or missed by an
    // offset. Both stamps are Z-suffixed ISO, which sorts lexicographically.
    [`${fromDay}T00:00:00Z`]
  );
}

/**
 * Every confirmed session's start from `fromDay` onwards, for the consistency
 * heatmap's per-day session counts. Ungrouped on purpose: the counts must land on
 * exactly the day key `dailyLoadSeries` gives the same cell's load (the UTC
 * instant read in the process timezone — see the header of src/lib/consistency.ts),
 * and no SQL grouping produces that key. `heatmapFrom` hands over a day of slack
 * ahead of the grid so no process timezone can miss its first day; the JS
 * bucketing drops whatever falls outside the grid.
 */
export async function listSessionStarts(fromDay: string): Promise<SessionStart[]> {
  return many<SessionStart>(
    `SELECT started_at, sport_type
     FROM activities
     WHERE status = 'confirmed' AND started_at IS NOT NULL AND started_at >= ?
     ORDER BY started_at ASC`,
    [`${fromDay}T00:00:00Z`]
  );
}

export async function activityExistsByStravaId(stravaId: number): Promise<boolean> {
  return (await one("SELECT 1 AS x FROM activities WHERE strava_id = ?", [stravaId])) !== null;
}

/** Epoch seconds of the most recent synced Strava activity, or null. */
export async function latestSyncedStartEpoch(): Promise<number | null> {
  const row = await one<{ m: string | null }>(
    "SELECT MAX(started_at) AS m FROM activities WHERE strava_id IS NOT NULL"
  );
  if (!row?.m) return null;
  const ms = Date.parse(row.m);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

export interface SyncedActivityInput {
  strava_id: number;
  name: string | null;
  sport_type: string | null;
  started_at: string;
  started_at_local: string | null;
  distance_km: number;
  moving_time_s: number | null;
  avg_pace_s_per_km: number | null;
  avg_hr: number | null;
  elevation_gain_m: number | null;
  status: "pending_review" | "confirmed";
  raw_json: string;
  bike_id: number | null;
}

const INSERT_SPLIT_SQL = "INSERT INTO activity_splits (activity_id, shoe_id, km) VALUES (?, ?, ?)";
const DELETE_SPLITS_SQL = "DELETE FROM activity_splits WHERE activity_id = ?";

export async function insertSyncedActivity(
  input: SyncedActivityInput,
  splits: SplitInput[]
): Promise<void> {
  await ensureMigrated();
  const tx = await client.transaction("write");
  try {
    const result = await tx.execute({
      sql: `INSERT INTO activities
            (strava_id, name, sport_type, started_at, started_at_local, distance_km, moving_time_s,
             avg_pace_s_per_km, avg_hr, elevation_gain_m, status, raw_json, bike_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        input.strava_id,
        input.name,
        input.sport_type,
        input.started_at,
        input.started_at_local,
        input.distance_km,
        input.moving_time_s,
        input.avg_pace_s_per_km,
        input.avg_hr,
        input.elevation_gain_m,
        input.status,
        input.raw_json,
        input.bike_id,
      ],
    });
    const activityId = Number(result.lastInsertRowid);
    for (const split of splits) {
      await tx.execute({ sql: INSERT_SPLIT_SQL, args: [activityId, split.shoe_id, split.km] });
    }
    await tx.commit();
  } finally {
    tx.close();
  }
}

export interface JournalFields {
  rpe: number | null;
  feeling: Feeling | null;
  workout_notes: string | null;
  health_notes: string | null;
}

export async function confirmActivity(
  id: number,
  journal: JournalFields,
  splits: SplitInput[],
  bikeId: number | null
): Promise<void> {
  await batchWrite([
    {
      sql: `UPDATE activities SET status = 'confirmed', rpe = ?, feeling = ?,
            workout_notes = ?, health_notes = ?, bike_id = ? WHERE id = ?`,
      args: [journal.rpe, journal.feeling, journal.workout_notes, journal.health_notes, bikeId, id],
    },
    { sql: DELETE_SPLITS_SQL, args: [id] },
    ...splits.map((split) => ({
      sql: INSERT_SPLIT_SQL,
      args: [id, split.shoe_id, split.km],
    })),
  ]);
}

export async function getActivityStreamsJson(activityId: number): Promise<string | null> {
  const row = await one<{ json: string }>(
    "SELECT json FROM activity_streams WHERE activity_id = ?",
    [activityId]
  );
  return row?.json ?? null;
}

export async function saveActivityStreams(activityId: number, json: string): Promise<void> {
  await exec(
    `INSERT INTO activity_streams (activity_id, json, synced_at) VALUES (?, ?, ?)
     ON CONFLICT(activity_id) DO UPDATE SET json = excluded.json, synced_at = excluded.synced_at`,
    [activityId, json, new Date().toISOString()]
  );
}

export async function saveActivityDetail(id: number, detailJson: string): Promise<void> {
  await exec("UPDATE activities SET detail_json = ?, detail_synced_at = ? WHERE id = ?", [
    detailJson,
    new Date().toISOString(),
    id,
  ]);
}

export async function updateActivityJournal(id: number, journal: JournalFields): Promise<void> {
  await exec(
    "UPDATE activities SET rpe = ?, feeling = ?, workout_notes = ?, health_notes = ? WHERE id = ?",
    [journal.rpe, journal.feeling, journal.workout_notes, journal.health_notes, id]
  );
}

export interface RecentSessionRow {
  id: number;
  strava_id: number | null;
  started_at: string | null;
  name: string | null;
  sport_type: string | null;
  distance_km: number | null;
  moving_time_s: number | null;
  avg_hr: number | null;
  avg_pace_s_per_km: number | null;
  tss: number | null;
  detail_json: string | null;
}

/**
 * Recent confirmed sessions of the same sport (excluding a given one and
 * anything after it), with their cached Strava lap detail, so the coach chat can
 * compare across days ("vs last Thursday") and per-lap, not just session-wide.
 */
export async function listRecentSessionsWithDetail(input: {
  excludeId: number;
  sportType: string | null;
  before: string | null;
  days: number;
  limit: number;
}): Promise<RecentSessionRow[]> {
  return many<RecentSessionRow>(
    `SELECT a.id, a.strava_id, a.started_at, a.name, a.sport_type, a.distance_km, a.moving_time_s,
            a.avg_hr, a.avg_pace_s_per_km, a.detail_json, l.tss
     FROM activities a
     LEFT JOIN activity_load l ON l.activity_id = a.id
     WHERE a.status = 'confirmed'
       AND a.id != ?
       AND LOWER(COALESCE(a.sport_type,'')) = LOWER(COALESCE(?, ''))
       AND a.started_at IS NOT NULL
       AND (? IS NULL OR a.started_at < ?)
       AND a.started_at >= datetime('now', ?)
     ORDER BY a.started_at DESC
     LIMIT ?`,
    [
      input.excludeId,
      input.sportType,
      input.before,
      input.before,
      `-${input.days} days`,
      input.limit,
    ]
  );
}

export async function setActivityInsight(id: number, text: string): Promise<void> {
  await exec("UPDATE activities SET coach_insight = ?, coach_insight_at = ? WHERE id = ?", [
    text,
    new Date().toISOString(),
    id,
  ]);
}

export async function replaceActivitySplits(id: number, splits: SplitInput[]): Promise<void> {
  await batchWrite([
    { sql: DELETE_SPLITS_SQL, args: [id] },
    ...splits.map((split) => ({
      sql: INSERT_SPLIT_SQL,
      args: [id, split.shoe_id, split.km],
    })),
  ]);
}

export async function createManualActivity(input: {
  date: string;
  km: number;
  shoe_id: number;
  name?: string;
}): Promise<number> {
  await ensureMigrated();
  // The picked date is already a local calendar day, so its noon stamp is both the
  // stored instant and the local wall-clock — carry it in both columns.
  const startedAt = `${input.date}T12:00:00Z`;
  const tx = await client.transaction("write");
  try {
    const result = await tx.execute({
      sql: `INSERT INTO activities (name, sport_type, started_at, started_at_local, distance_km, status)
            VALUES (?, 'Manual', ?, ?, ?, 'confirmed')`,
      args: [input.name ?? "Manual adjustment", startedAt, startedAt, input.km],
    });
    const activityId = Number(result.lastInsertRowid);
    await tx.execute({ sql: INSERT_SPLIT_SQL, args: [activityId, input.shoe_id, input.km] });
    await tx.commit();
    return activityId;
  } finally {
    tx.close();
  }
}
