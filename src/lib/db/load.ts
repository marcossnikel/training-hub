import { batchWrite, exec, many, one, WRITE_CHUNK } from "./helpers";
import { THRESHOLD_DEFAULTS } from "../baseline";
import { computeLoad, type AthleteThresholds, type LoadMethod } from "../fitness";
import { currentAthlete, requireAthlete } from "../identity";

interface AthleteThresholdsRow {
  max_hr: number | null;
  resting_hr: number | null;
  lthr: number | null;
  threshold_pace_s_per_km: number | null;
  ftp_w: number | null;
  resting_hr_estimated: number;
  ftp_provisional: number;
  updated_at: string | null;
}

export async function getAthleteThresholds(): Promise<AthleteThresholds> {
  const row = await one<AthleteThresholdsRow>(
    `SELECT max_hr, resting_hr, lthr, threshold_pace_s_per_km, ftp_w,
            resting_hr_estimated, ftp_provisional, updated_at
     FROM athlete_thresholds WHERE id = ?`,
    [currentAthlete().id]
  );
  if (!row) return { ...THRESHOLD_DEFAULTS };
  return {
    maxHr: row.max_hr ?? THRESHOLD_DEFAULTS.maxHr,
    restingHr: row.resting_hr ?? THRESHOLD_DEFAULTS.restingHr,
    lthr: row.lthr ?? THRESHOLD_DEFAULTS.lthr,
    thresholdPaceSPerKm: row.threshold_pace_s_per_km ?? THRESHOLD_DEFAULTS.thresholdPaceSPerKm,
    ftpW: row.ftp_w ?? THRESHOLD_DEFAULTS.ftpW,
    restingHrEstimated: row.resting_hr_estimated !== 0,
    ftpProvisional: row.ftp_provisional !== 0,
    updatedAt: row.updated_at ?? null,
  };
}

export interface AthleteThresholdFields {
  maxHr: number;
  restingHr: number;
  lthr: number;
  thresholdPaceSPerKm: number;
  ftpW: number;
  restingHrEstimated: boolean;
  ftpProvisional: boolean;
}

export async function saveAthleteThresholds(fields: AthleteThresholdFields): Promise<void> {
  await exec(
    `INSERT INTO athlete_thresholds
       (id, max_hr, resting_hr, lthr, threshold_pace_s_per_km, ftp_w,
        resting_hr_estimated, ftp_provisional, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       max_hr = excluded.max_hr,
       resting_hr = excluded.resting_hr,
       lthr = excluded.lthr,
       threshold_pace_s_per_km = excluded.threshold_pace_s_per_km,
       ftp_w = excluded.ftp_w,
       resting_hr_estimated = excluded.resting_hr_estimated,
       ftp_provisional = excluded.ftp_provisional,
       updated_at = excluded.updated_at`,
    [
      requireAthlete().id,
      fields.maxHr,
      fields.restingHr,
      fields.lthr,
      fields.thresholdPaceSPerKm,
      fields.ftpW,
      fields.restingHrEstimated ? 1 : 0,
      fields.ftpProvisional ? 1 : 0,
      new Date().toISOString(),
    ]
  );
}

export interface ActivityLoadRow {
  tss: number;
  method: LoadMethod | null;
  intensity_factor: number | null;
  source: string;
}

export async function getActivityLoad(activityId: number): Promise<ActivityLoadRow | null> {
  return one<ActivityLoadRow>(
    "SELECT tss, method, intensity_factor, source FROM activity_load WHERE activity_id = ? AND tss IS NOT NULL",
    [activityId]
  );
}

const ACTIVITY_LOAD_COLUMNS = "(activity_id, tss, method, intensity_factor, source, computed_at)";

/**
 * Canonical `activity_load` upsert — the single source of truth for every writer.
 *
 * `source` selects the correlated column handling that legitimately differs (these
 * are NOT the same behaviour, so they are parameterized, not force-merged):
 *   - 'auto'   → method + intensity_factor are bound params (`?`) that overwrite on
 *                conflict (a computed load row).
 *   - 'manual' → method/intensity_factor are inserted as NULL; on conflict the
 *                existing method is preserved and intensity_factor cleared
 *                (a user-entered TSS override).
 *
 * `overrideManual` applies to auto writers only, choosing whether an existing
 * manual row is clobbered:
 *   - false → guarded with `WHERE source != 'manual'`; a bulk recompute keeps hand
 *             edits (source is left untouched).
 *   - true  → unguarded and forces the row back to `source = 'auto'`; a single
 *             recompute overrides any manual value.
 */
function activityLoadUpsert(opts: { source: "auto" | "manual"; overrideManual?: boolean }): string {
  if (opts.source === "manual") {
    return `INSERT INTO activity_load ${ACTIVITY_LOAD_COLUMNS}
     VALUES (?, ?, NULL, NULL, 'manual', ?)
     ON CONFLICT(activity_id) DO UPDATE SET
       tss = excluded.tss,
       source = 'manual',
       intensity_factor = NULL,
       computed_at = excluded.computed_at`;
  }
  const sourceSet = opts.overrideManual ? "\n       source = 'auto'," : "";
  const guard = opts.overrideManual ? "" : "\n     WHERE activity_load.source != 'manual'";
  return `INSERT INTO activity_load ${ACTIVITY_LOAD_COLUMNS}
     VALUES (?, ?, ?, ?, 'auto', ?)
     ON CONFLICT(activity_id) DO UPDATE SET
       tss = excluded.tss,
       method = excluded.method,
       intensity_factor = excluded.intensity_factor,${sourceSet}
       computed_at = excluded.computed_at${guard}`;
}

/** Manual override: keeps any existing method, clears the intensity factor. */
export async function setActivityLoadManual(activityId: number, tss: number): Promise<void> {
  await exec(activityLoadUpsert({ source: "manual" }), [activityId, tss, new Date().toISOString()]);
}

const ACTIVITY_LOAD_FIELDS =
  "id, sport_type, moving_time_s, distance_km, avg_hr, avg_pace_s_per_km, rpe, raw_json";

interface ActivityLoadInput {
  id: number;
  sport_type: string | null;
  moving_time_s: number | null;
  distance_km: number | null;
  avg_hr: number | null;
  avg_pace_s_per_km: number | null;
  rpe: number | null;
  raw_json: string | null;
}

/** Bulk auto upsert; never clobbers rows the athlete edited by hand. */
export async function upsertActivityLoads(
  rows: { activityId: number; tss: number; method: LoadMethod; intensityFactor: number | null }[]
): Promise<void> {
  if (rows.length === 0) return;
  const sql = activityLoadUpsert({ source: "auto", overrideManual: false });
  const now = new Date().toISOString();
  for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
    await batchWrite(
      rows.slice(i, i + WRITE_CHUNK).map((r) => ({
        sql,
        args: [r.activityId, r.tss, r.method, r.intensityFactor, now],
      }))
    );
  }
}

/** One persisted load per confirmed activity, ascending — the PMC's raw input. */
export interface PmcLoadRow {
  started_at: string;
  tss: number;
  /** Raw Strava sport_type, bucketed by sportCategory() where sport matters. */
  sport_type: string | null;
}

export async function listActivityLoadsForPmc(): Promise<PmcLoadRow[]> {
  return many<PmcLoadRow>(
    `SELECT a.started_at AS started_at, l.tss AS tss, a.sport_type AS sport_type
     FROM activities a
     JOIN activity_load l ON l.activity_id = a.id
     WHERE a.status = 'confirmed' AND l.tss IS NOT NULL AND a.started_at IS NOT NULL
     ORDER BY a.started_at ASC`
  );
}

/** Recomputes every confirmed activity's load; returns the auto rows written. */
export async function recomputeAllLoads(): Promise<{ count: number }> {
  const thresholds = await getAthleteThresholds();
  // raw_json is a large blob that computeLoad reads ONLY inside its power branch,
  // which is gated on isRideSport(sport_type). Fetch the blob only for ride sports
  // (the LIKE conditions mirror isRideSport exactly: lower(sport) contains "ride" —
  // which also covers "ebikeride" — or "velomobile"); every other row never reads
  // it, so returning NULL there is behaviour-identical while skipping the blob for
  // the majority of activities.
  const activities = await many<ActivityLoadInput>(
    `SELECT id, sport_type, moving_time_s, distance_km, avg_hr, avg_pace_s_per_km, rpe,
            CASE
              WHEN LOWER(COALESCE(sport_type, '')) LIKE '%ride%'
                OR LOWER(COALESCE(sport_type, '')) LIKE '%velomobile%'
              THEN raw_json
            END AS raw_json
     FROM activities WHERE status = 'confirmed'`
  );
  const rows: {
    activityId: number;
    tss: number;
    method: LoadMethod;
    intensityFactor: number | null;
  }[] = [];
  for (const activity of activities) {
    const load = computeLoad(activity, thresholds);
    if (load) {
      rows.push({
        activityId: activity.id,
        tss: load.tss,
        method: load.method,
        intensityFactor: load.intensityFactor,
      });
    }
  }
  await upsertActivityLoads(rows);
  return { count: rows.length };
}

/** Recompute a single activity as an auto row, overriding any manual value. */
export async function recomputeActivityLoad(activityId: number): Promise<void> {
  const thresholds = await getAthleteThresholds();
  const activity = await one<ActivityLoadInput>(
    `SELECT ${ACTIVITY_LOAD_FIELDS} FROM activities WHERE id = ?`,
    [activityId]
  );
  if (!activity) return;
  const load = computeLoad(activity, thresholds);
  if (!load) {
    await exec("DELETE FROM activity_load WHERE activity_id = ?", [activityId]);
    return;
  }
  await exec(activityLoadUpsert({ source: "auto", overrideManual: true }), [
    activityId,
    load.tss,
    load.method,
    load.intensityFactor,
    new Date().toISOString(),
  ]);
}
