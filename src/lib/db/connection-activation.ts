import { client } from "./client";
import { ensureMigrated } from "./migrations";
import { one } from "./helpers";
import type { OwnerContext } from "../owner-context";

export const connectionActivationStates = [
  "pending",
  "dismissed",
  "summary_ready",
  "completed",
] as const;
export type ConnectionActivationState = (typeof connectionActivationStates)[number];

export interface ConnectionActivation {
  connectionId: string;
  state: ConnectionActivationState;
  createdAt: string;
  updatedAt: string;
}

interface ActivationRow {
  connection_id: string;
  presentation_state: ConnectionActivationState;
  created_at: string;
  updated_at: string;
}

function decode(row: ActivationRow): ConnectionActivation {
  return {
    connectionId: row.connection_id,
    state: row.presentation_state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function currentConnection(owner: OwnerContext): Promise<{ id: string } | null> {
  return one<{ id: string }>(
    "SELECT id FROM strava_connections WHERE user_id = ? AND status = 'connected'",
    [owner.userId]
  );
}

/** Creates one presentation record for a newly connected lifecycle, never for a reauthorization. */
export async function ensureConnectionActivation(
  owner: OwnerContext
): Promise<ConnectionActivation | null> {
  await ensureMigrated();
  const connection = await currentConnection(owner);
  if (!connection) return null;
  const now = new Date().toISOString();
  await client.execute({
    sql: `INSERT OR IGNORE INTO strava_connection_activations
          (connection_id, user_id, presentation_state, created_at, updated_at)
          VALUES (?, ?, 'pending', ?, ?)`,
    args: [connection.id, owner.userId, now, now],
  });
  return getConnectionActivation(owner);
}

/** An owner can only observe the activation joined to their currently connected lifecycle. */
export async function getConnectionActivation(
  owner: OwnerContext
): Promise<ConnectionActivation | null> {
  const row = await one<ActivationRow>(
    `SELECT a.connection_id, a.presentation_state, a.created_at, a.updated_at
     FROM strava_connection_activations a
     JOIN strava_connections c ON c.id = a.connection_id
     WHERE a.user_id = ? AND c.user_id = ? AND c.status = 'connected'
     ORDER BY a.created_at DESC LIMIT 1`,
    [owner.userId, owner.userId]
  );
  return row ? decode(row) : null;
}

export async function dismissConnectionActivation(owner: OwnerContext): Promise<void> {
  const now = new Date().toISOString();
  await client.execute({
    sql: `UPDATE strava_connection_activations
          SET presentation_state = 'dismissed', dismissed_at = ?, updated_at = ?
          WHERE user_id = ? AND connection_id = (
            SELECT id FROM strava_connections WHERE user_id = ? AND status = 'connected'
          ) AND presentation_state IN ('pending', 'summary_ready')`,
    args: [now, now, owner.userId, owner.userId],
  });
}

/** The job is checked in SQL: a partial or failed import can never become summary-ready. */
export async function markConnectionActivationSummaryReady(
  owner: OwnerContext
): Promise<ConnectionActivation | null> {
  const now = new Date().toISOString();
  await client.execute({
    sql: `UPDATE strava_connection_activations
          SET presentation_state = 'summary_ready', summary_ready_at = COALESCE(summary_ready_at, ?), updated_at = ?
          WHERE user_id = ? AND connection_id = (
            SELECT c.id FROM strava_connections c
            JOIN strava_import_jobs j ON j.connection_id = c.id AND j.user_id = c.user_id
            WHERE c.user_id = ? AND c.status = 'connected' AND j.status = 'completed'
          ) AND presentation_state IN ('pending', 'dismissed', 'summary_ready')`,
    args: [now, now, owner.userId, owner.userId],
  });
  return getConnectionActivation(owner);
}

/** Called after the client has rendered the summary; it is intentionally idempotent. */
export async function completeConnectionActivation(owner: OwnerContext): Promise<void> {
  const now = new Date().toISOString();
  await client.execute({
    sql: `UPDATE strava_connection_activations
          SET presentation_state = 'completed', completed_at = COALESCE(completed_at, ?), updated_at = ?
          WHERE user_id = ? AND connection_id = (
            SELECT id FROM strava_connections WHERE user_id = ? AND status = 'connected'
          ) AND presentation_state = 'summary_ready'`,
    args: [now, now, owner.userId, owner.userId],
  });
}
