import { client } from "./client";
import { exec, many, one } from "./helpers";
import { ensureMigrated } from "./migrations";
import type { OwnerContext } from "../owner-context";

export const ATHLETE_PARAMETER_KEYS = [
  "resting_hr_bpm",
  "max_hr_bpm",
  "lthr_bpm",
  "threshold_pace_sec_per_km",
  "cycling_ftp_watts",
  "measured_vo2max_ml_kg_min",
] as const;

export type AthleteParameterKey = (typeof ATHLETE_PARAMETER_KEYS)[number];
export type ParameterProvenance =
  "athlete_entered" | "provider" | "calculated" | "analyst_hypothesis";

export interface AthleteParameterObservation {
  id: string;
  key: AthleteParameterKey;
  value: number;
  unit: string;
  provenance: ParameterProvenance;
  observedAt: string | null;
  calculationVersion: string | null;
  evidenceRef: string | null;
  updatedAt: string;
}

export interface EffectiveAthleteParameter {
  key: AthleteParameterKey;
  value: number | null;
  unit: string;
  provenance: ParameterProvenance | null;
  observedAt: string | null;
  updatedAt: string | null;
  suppressed: boolean;
}

export interface AthletePerformanceProfile {
  parameters: Record<AthleteParameterKey, EffectiveAthleteParameter>;
  timezone: { value: string | null; provenance: "athlete_entered" | "provider" | null };
}

const UNITS: Record<AthleteParameterKey, string> = {
  resting_hr_bpm: "bpm",
  max_hr_bpm: "bpm",
  lthr_bpm: "bpm",
  threshold_pace_sec_per_km: "s/km",
  cycling_ftp_watts: "W",
  measured_vo2max_ml_kg_min: "ml/kg/min",
};

const RANGES: Record<AthleteParameterKey, readonly [number, number]> = {
  resting_hr_bpm: [25, 90],
  max_hr_bpm: [120, 230],
  lthr_bpm: [90, 220],
  threshold_pace_sec_per_km: [120, 600],
  cycling_ftp_watts: [50, 600],
  measured_vo2max_ml_kg_min: [15, 100],
};

export function isAthleteParameterKey(value: unknown): value is AthleteParameterKey {
  return typeof value === "string" && ATHLETE_PARAMETER_KEYS.includes(value as AthleteParameterKey);
}

export function validateParameterValue(key: AthleteParameterKey, value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 100) / 100;
  const [min, max] = RANGES[key];
  return rounded >= min && rounded <= max ? rounded : null;
}

export function validateIanaTimezone(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 100) return null;
  // ICU accepts fixed offsets such as -03:00. They are valid formatter input,
  // but not an IANA region and cannot carry daylight-saving rules.
  if (/^(?:UTC)?[+-]\d{1,2}(?::?\d{2})?$/i.test(value)) return null;
  try {
    // Intl canonicalizes aliases and rejects offsets (for example, +03:00).
    return new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

function emptyParameter(key: AthleteParameterKey): EffectiveAthleteParameter {
  return {
    key,
    value: null,
    unit: UNITS[key],
    provenance: null,
    observedAt: null,
    updatedAt: null,
    suppressed: false,
  };
}

interface EffectiveRow {
  parameter_key: AthleteParameterKey;
  state: "active" | "suppressed";
  numeric_value: number | null;
  unit: string | null;
  provenance: ParameterProvenance | null;
  observed_at: string | null;
  updated_at: string;
}

export async function getAthletePerformanceProfile(
  owner: OwnerContext
): Promise<AthletePerformanceProfile> {
  await ensureMigrated();
  const parameters = Object.fromEntries(
    ATHLETE_PARAMETER_KEYS.map((key) => [key, emptyParameter(key)])
  ) as Record<AthleteParameterKey, EffectiveAthleteParameter>;
  const rows = await many<EffectiveRow>(
    `SELECT e.parameter_key, e.state, o.numeric_value, o.unit, o.provenance, o.observed_at, e.updated_at
       FROM athlete_parameter_effective e
       LEFT JOIN athlete_parameter_observations o ON o.id = e.observation_id
      WHERE e.user_id = ?`,
    [owner.userId]
  );
  for (const row of rows) {
    if (!isAthleteParameterKey(row.parameter_key)) continue;
    parameters[row.parameter_key] = {
      key: row.parameter_key,
      value: row.state === "active" ? row.numeric_value : null,
      unit: row.unit ?? UNITS[row.parameter_key],
      provenance: row.state === "active" ? row.provenance : null,
      observedAt: row.state === "active" ? row.observed_at : null,
      updatedAt: row.updated_at,
      suppressed: row.state === "suppressed",
    };
  }
  const timezoneRows = await many<{ provenance: "athlete_entered" | "provider"; timezone: string }>(
    "SELECT provenance, timezone FROM athlete_timezones WHERE user_id = ?",
    [owner.userId]
  );
  const athlete = timezoneRows.find((row) => row.provenance === "athlete_entered");
  const provider = timezoneRows.find((row) => row.provenance === "provider");
  return {
    parameters,
    timezone: athlete
      ? { value: athlete.timezone, provenance: "athlete_entered" }
      : provider
        ? { value: provider.timezone, provenance: "provider" }
        : { value: null, provenance: null },
  };
}

export async function listParameterCandidates(
  owner: OwnerContext,
  key: AthleteParameterKey
): Promise<AthleteParameterObservation[]> {
  await ensureMigrated();
  const rows = await many<{
    id: string;
    parameter_key: AthleteParameterKey;
    numeric_value: number;
    unit: string;
    provenance: ParameterProvenance;
    observed_at: string | null;
    calculation_version: string | null;
    evidence_ref: string | null;
    updated_at: string;
  }>(
    `SELECT id, parameter_key, numeric_value, unit, provenance, observed_at,
            calculation_version, evidence_ref, updated_at
       FROM athlete_parameter_observations
      WHERE user_id = ? AND parameter_key = ? AND provenance != 'athlete_entered'
      ORDER BY updated_at DESC`,
    [owner.userId, key]
  );
  return rows.map((row) => ({
    id: row.id,
    key: row.parameter_key,
    value: row.numeric_value,
    unit: row.unit,
    provenance: row.provenance,
    observedAt: row.observed_at,
    calculationVersion: row.calculation_version,
    evidenceRef: row.evidence_ref,
    updatedAt: row.updated_at,
  }));
}

async function invalidateZoneMetrics(owner: OwnerContext): Promise<void> {
  await exec(
    `UPDATE activity_metrics
        SET hr_zone_secs = NULL, pace_zone_secs = NULL, computed_at = datetime('now')
      WHERE activity_id IN (SELECT id FROM activities WHERE user_id = ?)`,
    [owner.userId]
  );
}

async function setEffective(
  owner: OwnerContext,
  key: AthleteParameterKey,
  observationId: string | null
): Promise<void> {
  await exec(
    `INSERT INTO athlete_parameter_effective (user_id, parameter_key, observation_id, state, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, parameter_key) DO UPDATE SET
       observation_id = excluded.observation_id, state = excluded.state, updated_at = excluded.updated_at`,
    [
      owner.userId,
      key,
      observationId,
      observationId ? "active" : "suppressed",
      new Date().toISOString(),
    ]
  );
}

export async function saveAthleteEnteredParameter(
  owner: OwnerContext,
  key: AthleteParameterKey,
  rawValue: unknown
): Promise<boolean> {
  await ensureMigrated();
  const value = validateParameterValue(key, rawValue);
  if (value === null) return false;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const transaction = await client.transaction("write");
  try {
    await transaction.execute({
      sql: `INSERT INTO athlete_parameter_observations
              (id, user_id, parameter_key, numeric_value, unit, provenance, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'athlete_entered', ?, ?)`,
      args: [id, owner.userId, key, value, UNITS[key], now, now],
    });
    await transaction.execute({
      sql: "DELETE FROM user_meta WHERE user_id = ? AND key = 'training_zones'",
      args: [owner.userId],
    });
    await transaction.execute({
      sql: `INSERT INTO athlete_parameter_effective (user_id, parameter_key, observation_id, state, updated_at)
            VALUES (?, ?, ?, 'active', ?)
            ON CONFLICT(user_id, parameter_key) DO UPDATE SET
              observation_id = excluded.observation_id, state = excluded.state, updated_at = excluded.updated_at`,
      args: [owner.userId, key, id, now],
    });
    await transaction.execute({
      sql: `UPDATE activity_metrics
              SET hr_zone_secs = NULL, pace_zone_secs = NULL, computed_at = ?
            WHERE activity_id IN (SELECT id FROM activities WHERE user_id = ?)`,
      args: [now, owner.userId],
    });
    await transaction.commit();
    return true;
  } finally {
    transaction.close();
  }
}

export async function clearAthleteParameter(
  owner: OwnerContext,
  key: AthleteParameterKey
): Promise<void> {
  await ensureMigrated();
  await setEffective(owner, key, null);
  await invalidateZoneMetrics(owner);
  await exec("DELETE FROM user_meta WHERE user_id = ? AND key = 'training_zones'", [owner.userId]);
}

/** Trusted server integrations use this to append, never overwrite, a source candidate. */
export async function recordParameterCandidate(
  owner: OwnerContext,
  input: {
    key: AthleteParameterKey;
    value: unknown;
    provenance: Exclude<ParameterProvenance, "athlete_entered">;
    observedAt?: string | null;
    calculationVersion?: string | null;
    evidenceRef?: string | null;
  }
): Promise<string | null> {
  await ensureMigrated();
  const value = validateParameterValue(input.key, input.value);
  if (value === null) return null;
  if (
    (input.provenance === "calculated" || input.provenance === "analyst_hypothesis") &&
    (!input.calculationVersion || !input.evidenceRef)
  )
    return null;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await exec(
    `INSERT INTO athlete_parameter_observations
       (id, user_id, parameter_key, numeric_value, unit, provenance, observed_at,
        calculation_version, evidence_ref, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      owner.userId,
      input.key,
      value,
      UNITS[input.key],
      input.provenance,
      input.observedAt ?? null,
      input.calculationVersion ?? null,
      input.evidenceRef ?? null,
      now,
      now,
    ]
  );
  return id;
}

/** Confirmation promotes only a same-owner candidate into a new athlete-entered observation. */
export async function applyParameterCandidate(
  owner: OwnerContext,
  candidateId: string
): Promise<boolean> {
  await ensureMigrated();
  const candidate = await one<{
    parameter_key: AthleteParameterKey;
    numeric_value: number;
  }>(
    `SELECT parameter_key, numeric_value FROM athlete_parameter_observations
      WHERE id = ? AND user_id = ? AND provenance != 'athlete_entered'`,
    [candidateId, owner.userId]
  );
  if (!candidate || !isAthleteParameterKey(candidate.parameter_key)) return false;
  return saveAthleteEnteredParameter(owner, candidate.parameter_key, candidate.numeric_value);
}

export async function saveAthleteTimezone(
  owner: OwnerContext,
  rawTimezone: unknown
): Promise<boolean> {
  await ensureMigrated();
  const timezone = validateIanaTimezone(rawTimezone);
  if (!timezone) return false;
  await exec(
    `INSERT INTO athlete_timezones (user_id, provenance, timezone, updated_at)
     VALUES (?, 'athlete_entered', ?, ?)
     ON CONFLICT(user_id, provenance) DO UPDATE SET timezone = excluded.timezone, updated_at = excluded.updated_at`,
    [owner.userId, timezone, new Date().toISOString()]
  );
  return true;
}

export async function saveProviderTimezone(
  owner: OwnerContext,
  rawTimezone: unknown
): Promise<boolean> {
  await ensureMigrated();
  const timezone = validateIanaTimezone(rawTimezone);
  if (!timezone) return false;
  await exec(
    `INSERT INTO athlete_timezones (user_id, provenance, timezone, updated_at)
     VALUES (?, 'provider', ?, ?)
     ON CONFLICT(user_id, provenance) DO UPDATE SET timezone = excluded.timezone, updated_at = excluded.updated_at`,
    [owner.userId, timezone, new Date().toISOString()]
  );
  return true;
}

/** Removing an athlete override deliberately reveals only the provider timezone. */
export async function clearAthleteTimezone(owner: OwnerContext): Promise<void> {
  await ensureMigrated();
  await exec("DELETE FROM athlete_timezones WHERE user_id = ? AND provenance = 'athlete_entered'", [
    owner.userId,
  ]);
}

export async function clearProviderTimezone(owner: OwnerContext): Promise<void> {
  await ensureMigrated();
  await exec("DELETE FROM athlete_timezones WHERE user_id = ? AND provenance = 'provider'", [
    owner.userId,
  ]);
}
