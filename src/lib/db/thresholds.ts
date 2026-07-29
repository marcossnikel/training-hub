// The athlete's reference thresholds (max HR, resting HR, LTHR, threshold pace,
// FTP). Split out of the old load.ts when training load was removed: the zones,
// the performance page and the coach all still need these.
import { exec, one } from "./helpers";
import { THRESHOLD_DEFAULTS } from "../baseline";
import type { AthleteThresholds } from "../fitness";
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
