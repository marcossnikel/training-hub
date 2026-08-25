import { client } from "./client";
import { ensureMigrated } from "./migrations";
import { one } from "./helpers";
import type { OwnerContext } from "../owner-context";
import type {
  ImportErrorCategory,
  ImportOutcome,
  ImportStage,
  ImportStatus,
  SportFamily,
} from "../../features/strava/import-progress";

export interface StravaImportJob {
  id: string;
  connectionId: string;
  status: ImportStatus;
  stage: ImportStage;
  nextPage: number;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  retryCount: number;
  errorCategory: ImportErrorCategory | null;
}

export interface StravaImportSnapshot {
  confirmed: number;
  pending: number;
  sportMix: Record<SportFamily, number>;
  coverage: { oldest: string | null; newest: string | null };
}

export interface StravaImportStatusSnapshot {
  job: StravaImportJob;
  counters: Record<ImportOutcome, number>;
  outcomeSportMix: Record<SportFamily, number>;
  pagesCommitted: number;
  snapshot: StravaImportSnapshot;
  percent: null;
}

interface JobRow {
  id: string;
  connection_id: string;
  status: ImportStatus;
  stage: ImportStage;
  next_page: number;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
  retry_count: number;
  error_category: ImportErrorCategory | null;
}

function decodeJob(row: JobRow): StravaImportJob {
  return {
    id: row.id,
    connectionId: row.connection_id,
    status: row.status,
    stage: row.stage,
    nextPage: Number(row.next_page),
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    retryCount: Number(row.retry_count),
    errorCategory: row.error_category,
  };
}

const JOB_COLUMNS = `id, connection_id, status, stage, next_page, started_at,
  updated_at, completed_at, retry_count, error_category`;

async function connectedInitialConnection(owner: OwnerContext): Promise<{ id: string } | null> {
  return one<{ id: string }>(
    `SELECT id FROM strava_connections
     WHERE user_id = ? AND status = 'connected' AND initial_sync_completed_at IS NULL`,
    [owner.userId]
  );
}

/** Creates at most one job for the current connection lifecycle. */
export async function ensureInitialStravaImportJob(
  owner: OwnerContext
): Promise<StravaImportJob | null> {
  await ensureMigrated();
  const connection = await connectedInitialConnection(owner);
  if (!connection) return null;
  const existing = await one<JobRow>(
    `SELECT ${JOB_COLUMNS} FROM strava_import_jobs WHERE user_id = ? AND connection_id = ?`,
    [owner.userId, connection.id]
  );
  if (existing) return decodeJob(existing);

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await client.execute({
    sql: `INSERT OR IGNORE INTO strava_import_jobs
          (id, user_id, connection_id, status, stage, next_page, started_at, updated_at)
          VALUES (?, ?, ?, 'queued', 'fetching_activities', 1, ?, ?)`,
    args: [id, owner.userId, connection.id, now, now],
  });
  const job = await one<JobRow>(
    `SELECT ${JOB_COLUMNS} FROM strava_import_jobs WHERE user_id = ? AND connection_id = ?`,
    [owner.userId, connection.id]
  );
  return job ? decodeJob(job) : null;
}

export async function getInitialStravaImportJob(
  owner: OwnerContext
): Promise<StravaImportJob | null> {
  const row = await one<JobRow>(
    `SELECT j.id, j.connection_id, j.status, j.stage, j.next_page, j.started_at,
            j.updated_at, j.completed_at, j.retry_count, j.error_category
     FROM strava_import_jobs j
     JOIN strava_connections c ON c.id = j.connection_id
     WHERE j.user_id = ? AND c.user_id = ? AND c.status = 'connected'
     ORDER BY j.started_at DESC LIMIT 1`,
    [owner.userId, owner.userId]
  );
  return row ? decodeJob(row) : null;
}

/** Atomically grants one short lease. A caller that loses the race learns nothing extra. */
export async function leaseInitialStravaImportJob(
  owner: OwnerContext,
  jobId: string,
  now = new Date()
): Promise<{ job: StravaImportJob; leaseToken: string } | null> {
  const leaseToken = crypto.randomUUID();
  const expiresAt = new Date(now.getTime() + 30_000).toISOString();
  const updated = await client.execute({
    sql: `UPDATE strava_import_jobs
          SET status = 'running', lease_token = ?, lease_expires_at = ?, error_category = NULL, updated_at = ?
          WHERE id = ? AND user_id = ? AND status != 'completed'
            AND (lease_expires_at IS NULL OR julianday(lease_expires_at) <= julianday(?))
          RETURNING ${JOB_COLUMNS}`,
    args: [leaseToken, expiresAt, now.toISOString(), jobId, owner.userId, now.toISOString()],
  });
  if (updated.rows.length === 0) return null;
  const row = Object.fromEntries(
    updated.columns.map((column, index) => [column, updated.rows[0][index]])
  ) as unknown as JobRow;
  return { job: decodeJob(row), leaseToken };
}

export async function recordInitialStravaImportOutcome(
  owner: OwnerContext,
  jobId: string,
  leaseToken: string,
  providerActivityId: number,
  outcome: ImportOutcome,
  family: SportFamily
): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await client.execute({
    sql: `INSERT OR IGNORE INTO strava_import_job_outcomes
          (job_id, provider_activity_id, outcome, sport_family, created_at)
          SELECT ?, ?, ?, ?, ? WHERE EXISTS (
            SELECT 1 FROM strava_import_jobs
            WHERE id = ? AND user_id = ? AND lease_token = ? AND status IN ('running', 'partial')
          )`,
    args: [jobId, providerActivityId, outcome, family, now, jobId, owner.userId, leaseToken],
  });
  return result.rowsAffected > 0;
}

export async function commitInitialStravaImportPage(
  owner: OwnerContext,
  jobId: string,
  leaseToken: string,
  page: number,
  terminal = false
): Promise<boolean> {
  const tx = await client.transaction("write");
  try {
    const job = await tx.execute({
      sql: `SELECT 1 FROM strava_import_jobs
            WHERE id = ? AND user_id = ? AND lease_token = ? AND status = 'running'`,
      args: [jobId, owner.userId, leaseToken],
    });
    if (job.rows.length === 0) return false;
    await tx.execute({
      sql: `INSERT OR IGNORE INTO strava_import_job_pages (job_id, provider_page, committed_at)
            VALUES (?, ?, ?)`,
      args: [jobId, page, new Date().toISOString()],
    });
    await tx.execute({
      sql: `UPDATE strava_import_jobs
            SET status = 'partial', stage = 'fetching_activities', next_page = ?, updated_at = ?,
                lease_token = CASE WHEN ? THEN lease_token ELSE NULL END,
                lease_expires_at = CASE WHEN ? THEN lease_expires_at ELSE NULL END
            WHERE id = ? AND lease_token = ?`,
      args: [
        page + 1,
        new Date().toISOString(),
        terminal ? 1 : 0,
        terminal ? 1 : 0,
        jobId,
        leaseToken,
      ],
    });
    await tx.commit();
    return true;
  } finally {
    tx.close();
  }
}

export async function completeInitialStravaImport(
  owner: OwnerContext,
  jobId: string,
  leaseToken: string,
  completedAt: string
): Promise<boolean> {
  const tx = await client.transaction("write");
  try {
    const job = await tx.execute({
      sql: `UPDATE strava_import_jobs
            SET status = 'completed', stage = 'completed', completed_at = ?, updated_at = ?,
                lease_token = NULL, lease_expires_at = NULL, error_category = NULL
            WHERE id = ? AND user_id = ? AND lease_token = ? AND status IN ('running', 'partial')
            RETURNING connection_id`,
      args: [completedAt, completedAt, jobId, owner.userId, leaseToken],
    });
    if (job.rows.length === 0) return false;
    await tx.execute({
      sql: `UPDATE strava_connections SET initial_sync_completed_at = COALESCE(initial_sync_completed_at, ?),
              updated_at = datetime('now') WHERE id = ? AND user_id = ? AND status = 'connected'`,
      args: [completedAt, job.rows[0].connection_id, owner.userId],
    });
    await tx.execute({
      sql: `INSERT INTO user_meta (user_id, key, value) VALUES (?, 'last_sync_at', ?)
            ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`,
      args: [owner.userId, completedAt],
    });
    await tx.commit();
    return true;
  } finally {
    tx.close();
  }
}

export async function failInitialStravaImport(
  owner: OwnerContext,
  jobId: string,
  leaseToken: string,
  category: ImportErrorCategory
): Promise<void> {
  await client.execute({
    sql: `UPDATE strava_import_jobs
          SET status = 'failed', error_category = ?, retry_count = retry_count + 1,
              lease_token = NULL, lease_expires_at = NULL, updated_at = ?
          WHERE id = ? AND user_id = ? AND lease_token = ? AND status IN ('running', 'partial')`,
    args: [category, new Date().toISOString(), jobId, owner.userId, leaseToken],
  });
}

export async function getInitialStravaImportStatus(
  owner: OwnerContext
): Promise<StravaImportStatusSnapshot | null> {
  const job = await getInitialStravaImportJob(owner);
  if (!job) return null;
  const [outcomes, pages, facts] = await Promise.all([
    one<Record<ImportOutcome, number>>(
      `SELECT
        SUM(outcome = 'historical_confirmed_created') AS historical_confirmed_created,
        SUM(outcome = 'new_pending_created') AS new_pending_created,
        SUM(outcome = 'already_present') AS already_present,
        SUM(outcome = 'skipped_invalid') AS skipped_invalid
       FROM strava_import_job_outcomes WHERE job_id = ?`,
      [job.id]
    ),
    one<{ count: number }>(
      "SELECT COUNT(*) AS count FROM strava_import_job_pages WHERE job_id = ?",
      [job.id]
    ),
    one<{ confirmed: number; pending: number; oldest: string | null; newest: string | null }>(
      `SELECT
        SUM(status = 'confirmed') AS confirmed,
        SUM(status = 'pending_review') AS pending,
        MIN(started_at) AS oldest,
        MAX(started_at) AS newest
       FROM activities WHERE user_id = ? AND strava_id IS NOT NULL`,
      [owner.userId]
    ),
  ]);
  const mixRows = await client.execute({
    sql: `SELECT CASE
              WHEN lower(coalesce(sport_type, '')) LIKE '%run%' THEN 'run'
              WHEN lower(coalesce(sport_type, '')) LIKE '%ride%' OR lower(coalesce(sport_type, '')) LIKE '%cycl%' THEN 'ride'
              WHEN sport_type IS NULL OR sport_type = '' THEN 'unknown'
              ELSE 'other'
            END AS family, COUNT(*) AS count
          FROM activities WHERE user_id = ? AND strava_id IS NOT NULL GROUP BY family`,
    args: [owner.userId],
  });
  const sportMix: Record<SportFamily, number> = { run: 0, ride: 0, other: 0, unknown: 0 };
  for (const row of mixRows.rows) {
    const family = row.family as SportFamily;
    if (family in sportMix) sportMix[family] = Number(row.count);
  }
  const outcomeMixRows = await client.execute({
    sql: `SELECT sport_family, COUNT(*) AS count
          FROM strava_import_job_outcomes WHERE job_id = ? GROUP BY sport_family`,
    args: [job.id],
  });
  const outcomeSportMix: Record<SportFamily, number> = { run: 0, ride: 0, other: 0, unknown: 0 };
  for (const row of outcomeMixRows.rows) {
    const family = row.sport_family as SportFamily;
    if (family in outcomeSportMix) outcomeSportMix[family] = Number(row.count);
  }
  return {
    job,
    counters: {
      historical_confirmed_created: Number(outcomes?.historical_confirmed_created ?? 0),
      new_pending_created: Number(outcomes?.new_pending_created ?? 0),
      already_present: Number(outcomes?.already_present ?? 0),
      skipped_invalid: Number(outcomes?.skipped_invalid ?? 0),
    },
    outcomeSportMix,
    pagesCommitted: Number(pages?.count ?? 0),
    snapshot: {
      confirmed: Number(facts?.confirmed ?? 0),
      pending: Number(facts?.pending ?? 0),
      sportMix,
      coverage: { oldest: facts?.oldest ?? null, newest: facts?.newest ?? null },
    },
    percent: null,
  };
}
