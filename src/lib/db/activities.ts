import { cache } from "react";
import { batchWrite, exec, many, one, sqliteBool } from "./helpers";
import { client } from "./client";
import { ensureMigrated } from "./migrations";
import type { VdotEffort } from "../benchmarks";
import type { BestEffortRow, StoredBestEffort } from "../best-efforts";
import type { BlockActivity } from "../blocks";
import type { SessionStart } from "../consistency";
import { parseZoneSecs } from "../stream-metrics";
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

/** Every column except the two JSON blobs, which the list views must not carry. */
const ACTIVITY_COLUMNS = `a.id, a.strava_id, a.name, a.sport_type, a.started_at, a.started_at_local,
     a.distance_km, a.moving_time_s, a.avg_pace_s_per_km, a.avg_hr, a.elevation_gain_m,
     a.status, a.rpe, a.feeling, a.workout_notes, a.health_notes, a.created_at,
     a.detail_synced_at, a.bike_id, a.is_race, a.goal_pace_s_per_km,
     a.coach_insight, a.coach_insight_at`;

/**
 * The list query. `detail_json` is never selected — only the activity page reads
 * it, and once the Strava detail backfill runs it is the largest column in the
 * table. `raw_json` is selected ONLY for rides, the sole list-view consumer
 * (`rideMetrics` reads average_watts/average_speed off it for the ride row);
 * every other sport gets NULL. Selecting `a.*` here pulled ~1.7 MB of JSON on
 * every render of a 1200-row log.
 */
const ACTIVITY_LIST_SELECT = `SELECT ${ACTIVITY_COLUMNS},
     CASE
       WHEN LOWER(COALESCE(a.sport_type,'')) LIKE '%ride%'
         OR LOWER(COALESCE(a.sport_type,'')) LIKE '%velomobile%'
       THEN a.raw_json
     END AS raw_json,
     b.name AS bike_name
   FROM activities a LEFT JOIN bikes b ON b.id = a.bike_id`;

/** The single-activity query: both blobs, since the detail page renders from them. */
const ACTIVITY_SELECT =
  "SELECT a.*, b.name AS bike_name FROM activities a LEFT JOIN bikes b ON b.id = a.bike_id";

export async function listConfirmedActivities(): Promise<ActivityWithSplits[]> {
  const rows = await many<ActivityRow>(
    `${ACTIVITY_LIST_SELECT} WHERE a.status = 'confirmed' ORDER BY a.started_at DESC, a.id DESC`
  );
  return attachSplits(rows.map(decodeActivity));
}

export async function listPendingActivities(): Promise<ActivityWithSplits[]> {
  const rows = await many<ActivityRow>(
    `${ACTIVITY_LIST_SELECT} WHERE a.status = 'pending_review' ORDER BY a.started_at ASC, a.id ASC`
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
    `${ACTIVITY_LIST_SELECT} WHERE a.is_race = 1 ORDER BY a.started_at DESC, a.id DESC`
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

/**
 * Confirmed activities in [fromIso, toIso), oldest first, for block analysis.
 * Each row carries its persisted heart-rate zone seconds when the activity has
 * them, so the block's time-in-zone is measured for those sessions instead of
 * estimated from their average heart rate.
 */
export async function listBlockActivities(
  fromIso: string,
  toIso: string
): Promise<BlockActivity[]> {
  const rows = await many<BlockActivityRow>(
    `SELECT a.started_at, a.sport_type, a.distance_km, a.moving_time_s, a.avg_hr,
            a.avg_pace_s_per_km, m.hr_zone_secs
     FROM activities a
     LEFT JOIN activity_metrics m ON m.activity_id = a.id
     WHERE a.status = 'confirmed' AND a.started_at >= ? AND a.started_at < ?
     ORDER BY a.started_at ASC`,
    [fromIso, toIso]
  );
  return rows.map(({ hr_zone_secs, ...activity }) => ({
    ...activity,
    hrZoneSec: parseZoneSecs(hr_zone_secs),
  }));
}

/** A block row as it comes back from SQL, zone seconds still JSON text. */
type BlockActivityRow = Omit<BlockActivity, "hrZoneSec"> & { hr_zone_secs: string | null };

/** A confirmed activity whose Strava detail, streams, or both were never fetched. */
export interface ActivityMissingStravaData {
  id: number;
  strava_id: number;
  name: string | null;
  started_at: string;
  /** 1 when `detail_json` is empty, so the detail endpoint has to be called. */
  needs_detail: number;
  /** 1 when no `activity_streams` row exists, so the streams endpoint has to be called. */
  needs_streams: number;
}

/**
 * Confirmed activities still missing their Strava detail or streams, NEWEST
 * FIRST — the order the historical fetch pass walks, so the most useful history
 * lands first and an interrupted run has already covered the recent months.
 * Manual activities (no `strava_id`) can never be fetched and are excluded.
 *
 * The two flags say which endpoints an activity actually needs, so the caller can
 * budget its API calls before spending them.
 */
export async function listActivitiesMissingStravaData(
  limit: number
): Promise<ActivityMissingStravaData[]> {
  return many<ActivityMissingStravaData>(
    `SELECT a.id, a.strava_id, a.name, a.started_at,
            CASE WHEN a.detail_json IS NULL THEN 1 ELSE 0 END AS needs_detail,
            CASE WHEN s.activity_id IS NULL THEN 1 ELSE 0 END AS needs_streams
     FROM activities a
     LEFT JOIN activity_streams s ON s.activity_id = a.id
     WHERE a.status = 'confirmed' AND a.strava_id IS NOT NULL
       AND (a.detail_json IS NULL OR s.activity_id IS NULL)
     ORDER BY a.started_at DESC, a.id DESC
     LIMIT ?`,
    [limit]
  );
}

/**
 * Confirmed activities from a local calendar day onwards, with their persisted
 * totals, for the Performance page. Rows come back per activity and ungrouped
 * on purpose: every week/month bucket is built in JS from the athlete's local day
 * (`started_at_local`, falling back to `started_at` — see `periodTotals`),
 * because grouping with SQL strftime would bucket by UTC and drift each period
 * boundary by the athlete's tz offset.
 */
export async function listTotalsActivities(fromDay: string): Promise<TotalsActivity[]> {
  return many<TotalsActivity>(
    `SELECT a.started_at, a.started_at_local, a.sport_type,
            a.moving_time_s, a.distance_km, a.elevation_gain_m
     FROM activities a
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

/**
 * Writes an activity's best-effort rows, upserting on UNIQUE(activity_id, name):
 * re-viewing an activity or re-running the backfill rewrites in place instead of
 * duplicating. Nothing is deleted — `detail_json` is an immutable per-activity
 * cache, so a name that vanished from the payload cannot happen.
 */
export async function upsertActivityBestEfforts(
  activityId: number,
  rows: BestEffortRow[]
): Promise<void> {
  if (rows.length === 0) return;
  await batchWrite(
    rows.map((row) => ({
      sql: `INSERT INTO activity_best_efforts
              (activity_id, name, distance_m, elapsed_time_s, moving_time_s, pr_rank)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(activity_id, name) DO UPDATE SET
              distance_m = excluded.distance_m,
              elapsed_time_s = excluded.elapsed_time_s,
              moving_time_s = excluded.moving_time_s,
              pr_rank = excluded.pr_rank`,
      args: [
        activityId,
        row.name,
        row.distance_m,
        row.elapsed_time_s,
        row.moving_time_s,
        row.pr_rank,
      ],
    }))
  );
}

/** How many best-effort rows an activity already has stored. */
export interface BestEffortCount {
  activity_id: number;
  n: number;
}

/**
 * Stored best-effort row counts per activity, so a caller can tell what is already
 * populated and skip it — that is what makes the backfill resumable, and what keeps
 * the view path (`cacheBestEfforts`) from re-writing rows it already wrote.
 *
 * Pass `activityId` for the single-activity form (one indexed lookup on the
 * UNIQUE(activity_id, name) index, returning zero or one row); omit it for every
 * activity at once, which is what a whole-table pass wants.
 */
export async function listBestEffortCounts(activityId?: number): Promise<BestEffortCount[]> {
  return many<BestEffortCount>(
    `SELECT activity_id, COUNT(*) AS n
     FROM activity_best_efforts
     ${activityId === undefined ? "" : "WHERE activity_id = ?"}
     GROUP BY activity_id
     ORDER BY activity_id ASC`,
    activityId === undefined ? [] : [activityId]
  );
}

/**
 * The rows of `activity_best_efforts` that count as ROAD-RUN efforts, as SQL over the
 * aliases `e` (efforts) and `a` (activities). ONE definition, shared by both readers
 * of the table, because two hand-copies would let a future trail-exclusion or
 * sport-gate change land in one and not the other — and then /performance's distance
 * ladder and its VDOT trend would be quoting numbers off different sets of runs.
 *
 * It filters the population to match the whole-activity half of the /performance merge
 * exactly (`listRunEfforts` + `raceCategory`), so the two halves can never disagree
 * about which activities count:
 *  - usable measurements only — a zero distance or time is not an effort;
 *  - run sports only — `cacheBestEfforts` writes whatever a payload carries without
 *    checking the sport, so the sport gate has to live at READ time;
 *  - no trail, by name or sport — `raceCategory` returns "trail" for those, which
 *    keeps them out of the road ladder, and a trail 5K segment must not sneak into a
 *    road-distance ladder documented as excluding trail.
 * The LIKE conditions mirror those predicates: `sportCategory(sport) === "run"` is
 * lower(sport) containing "run", and the trail test is lower(name) or lower(sport)
 * containing "trail". They are expressed in SQL because the filter has to run BEFORE
 * the per-name ranking below — filtering afterwards would drop a whole distance name
 * rather than fall through to the next-fastest eligible row.
 *
 * The review-status gate is deliberately NOT here: the two reads differ on it by
 * design (see `includeActivityId` below), and hiding that difference inside a shared
 * fragment would make it invisible at each call site.
 */
const ROAD_RUN_EFFORT_SQL = `e.moving_time_s > 0 AND e.distance_m > 0
         AND LOWER(COALESCE(a.sport_type, '')) LIKE '%run%'
         AND LOWER(COALESCE(a.sport_type, '')) NOT LIKE '%trail%'
         AND LOWER(COALESCE(a.name, '')) NOT LIKE '%trail%'`;

/**
 * The fastest stored effort at each distance name ("5K", "Half-Marathon", …), one row
 * per name, from confirmed ROAD RUNS (`ROAD_RUN_EFFORT_SQL` defines that population).
 * This is what both readers of `activity_best_efforts` need: /performance ranks the
 * distance ladder from it and the activity page uses it to demote a stale
 * `pr_rank = 1` that another run has beaten.
 *
 * `includeActivityId` additionally admits one activity's own rows whatever its review
 * status. The activity page passes the activity being viewed: a freshly synced run is
 * `pending_review`, which is exactly when a new record wants its badge, and without
 * this the PR badge could never fire on a distance no confirmed run has an effort for.
 * A confirmed activity's own rows are in the set either way, so this only makes an
 * unreviewed activity behave like a reviewed one. /performance passes nothing, so no
 * pending row can reach the ladder.
 *
 * Aggregated in SQL rather than by reading every row: ~103 rows exist today, but
 * T24's fetch-history pass would push that into the thousands while the answer stays
 * one row per name. ROW_NUMBER (not a bare-column MIN) so the winning row's own
 * columns come back and ties break deterministically on the lower activity id.
 */
export async function listFastestBestEfforts(options?: {
  includeActivityId?: number;
}): Promise<StoredBestEffort[]> {
  interface Row extends Omit<StoredBestEffort, "is_race"> {
    is_race: number;
  }
  const ownId = options?.includeActivityId ?? null;
  const rows = await many<Row>(
    `SELECT name, distance_m, elapsed_time_s, moving_time_s, pr_rank,
            activity_name, is_race, date
     FROM (
       SELECT e.name, e.distance_m, e.elapsed_time_s, e.moving_time_s, e.pr_rank,
              a.name AS activity_name, a.is_race AS is_race,
              COALESCE(a.started_at_local, a.started_at) AS date,
              ROW_NUMBER() OVER (
                PARTITION BY e.name ORDER BY e.moving_time_s ASC, e.activity_id ASC
              ) AS rn
       FROM activity_best_efforts e
       JOIN activities a ON a.id = e.activity_id
       WHERE (a.status = 'confirmed' OR a.id = ?)
         AND ${ROAD_RUN_EFFORT_SQL}
     )
     WHERE rn = 1
     ORDER BY distance_m ASC`,
    [ownId]
  );
  return rows.map((row) => ({ ...row, is_race: sqliteBool(row.is_race) }));
}

/**
 * EVERY stored effort with its date, from the same confirmed road runs
 * `listFastestBestEfforts` ranks — the VDOT trend needs one point per effort per
 * month, not one winner per distance name, so it cannot read that query's output.
 * "The same" is enforced, not asserted: both reads apply `ROAD_RUN_EFFORT_SQL`, and
 * db.best-efforts.test.ts pins that they admit and reject the same activities.
 *
 * Unwindowed and unaggregated on purpose: ~103 rows exist today and the engine owns
 * both the qualifying distance and the 12-month window (`vdotTrend`), so no window
 * semantics are duplicated in SQL. If T24's history pass grows this table by orders
 * of magnitude, push a date bound down to here.
 */
export async function listBestEffortsForVdot(): Promise<VdotEffort[]> {
  return many<VdotEffort>(
    `SELECT e.distance_m, e.moving_time_s,
            COALESCE(a.started_at_local, a.started_at) AS date
     FROM activity_best_efforts e
     JOIN activities a ON a.id = e.activity_id
     WHERE a.status = 'confirmed'
       AND ${ROAD_RUN_EFFORT_SQL}
     ORDER BY date ASC`
  );
}

/** An activity's cached Strava detail payload, as the local backfill re-reads it. */
export interface ActivityDetailRow {
  id: number;
  detail_json: string | null;
}

/**
 * One page of activities carrying a cached Strava detail payload, oldest id first,
 * for the local best-effort backfill. Read-only re-parse: no Strava call is involved.
 *
 * Paged by id cursor rather than returning everything, because a detail payload is a
 * full Strava activity JSON: only ~21 activities carry one today, but T24's
 * fetch-history pass fills ~1230 of them, and an unbounded SELECT would then pull
 * every payload into memory in a single round trip. Pass `afterId: 0` for the first
 * page and the last returned id for each next one; a short page means the end.
 */
export async function listActivitiesWithDetailJson(page: {
  afterId: number;
  limit: number;
}): Promise<ActivityDetailRow[]> {
  return many<ActivityDetailRow>(
    `SELECT id, detail_json
     FROM activities
     WHERE detail_json IS NOT NULL
       AND id > ?
     ORDER BY id ASC
     LIMIT ?`,
    [page.afterId, page.limit]
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
            a.avg_hr, a.avg_pace_s_per_km, a.detail_json
     FROM activities a
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
