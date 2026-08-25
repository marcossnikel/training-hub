import { client } from "./client";
import { ensureMigrated } from "./migrations";
import { exec, many, one } from "./helpers";
import type { OwnerContext } from "../owner-context";
import { decryptStravaSecret, encryptStravaSecret, StravaSecretStorageError } from "../crypto";

// #24/#26 replace this compatibility fixture with a server-derived owner and
// encrypted credentials. It is intentionally owner-bound today; no global token
// table survives the #23 fresh bootstrap.
export interface StravaAuthRow {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface StravaConnectionInput extends StravaAuthRow {
  client_id: string;
  client_secret: string;
  strava_athlete_id?: number;
  granted_scope?: string;
}

export interface StravaSyncState {
  reviewAfter: string;
  initialSyncCompletedAt: string | null;
}

interface EncryptedConnectionRow {
  client_id: string | null;
  client_secret_ciphertext: string | null;
  access_token_ciphertext: string | null;
  refresh_token_ciphertext: string | null;
  encryption_key_version: number | null;
  expires_at: number | null;
  strava_athlete_id: number | null;
  granted_scope: string | null;
  status: string;
  review_after: string | null;
  initial_sync_completed_at: string | null;
}

export type StravaConnectionStatus = "disconnected" | "pending_authorization" | "connected";

/** The local deletion result contains counts only, never provider data or secrets. */
export interface DeletedStravaData {
  activities: number;
  connection: boolean;
}

export interface HistoricalReviewRepairResult {
  candidates: number;
  oldestStartedAt: string | null;
  newestStartedAt: string | null;
  changed: number;
}

export interface PendingStravaConnectionInput {
  client_id: string;
  client_secret: string;
}

/**
 * Server-only input for the callback exchange. It intentionally has no
 * browser-facing call site: the secret is decrypted only after the signed-in
 * owner has atomically consumed their opaque OAuth state.
 */
export type PendingStravaExchangeInput = PendingStravaConnectionInput;

interface PendingAuthorizationRow {
  client_id: string | null;
  client_secret_ciphertext: string | null;
  encryption_key_version: number | null;
  status: string;
}

/** A safe, browser-renderable state. It deliberately contains no credential material. */
export async function getStravaConnectionStatus(
  owner: OwnerContext
): Promise<StravaConnectionStatus> {
  const row = await one<{ status: string }>(
    "SELECT status FROM strava_connections WHERE user_id = ?",
    [owner.userId]
  );
  if (row?.status === "pending_authorization" || row?.status === "connected") return row.status;
  return "disconnected";
}

/** Owner-bound, non-secret sync lifecycle facts. */
export async function getStravaSyncState(owner: OwnerContext): Promise<StravaSyncState | null> {
  const row = await one<
    Pick<EncryptedConnectionRow, "review_after" | "initial_sync_completed_at" | "status">
  >(
    "SELECT review_after, initial_sync_completed_at, status FROM strava_connections WHERE user_id = ?",
    [owner.userId]
  );
  if (row?.status !== "connected" || !row.review_after) return null;
  return { reviewAfter: row.review_after, initialSyncCompletedAt: row.initial_sync_completed_at };
}

export async function markInitialStravaSyncComplete(
  owner: OwnerContext,
  completedAt: string
): Promise<void> {
  await exec(
    `UPDATE strava_connections
     SET initial_sync_completed_at = COALESCE(initial_sync_completed_at, ?), updated_at = datetime('now')
     WHERE user_id = ? AND status = 'connected'`,
    [completedAt, owner.userId]
  );
}

/**
 * Owner-explicit repair for rows created before D-020. The default caller must
 * pass dryRun=true; this returns aggregates only, never provider payloads or
 * connection material. Invalid timestamps are intentionally not candidates.
 */
export async function repairHistoricalReviewImports(
  owner: OwnerContext,
  { dryRun = true }: { dryRun?: boolean } = {}
): Promise<HistoricalReviewRepairResult> {
  const state = await getStravaSyncState(owner);
  if (!state) return { candidates: 0, oldestStartedAt: null, newestStartedAt: null, changed: 0 };
  const cutoff = Date.parse(state.reviewAfter);
  if (!Number.isFinite(cutoff)) throw new Error("Strava review cutoff is invalid.");
  const rows = await many<{ id: number; started_at: string }>(
    `SELECT id, started_at FROM activities
     WHERE user_id = ? AND strava_id IS NOT NULL AND status = 'pending_review' AND started_at IS NOT NULL`,
    [owner.userId]
  );
  const candidates = rows.filter((row) => {
    const started = Date.parse(row.started_at);
    return Number.isFinite(started) && started <= cutoff;
  });
  const timestamps = candidates.map((row) => row.started_at).sort();
  if (dryRun || candidates.length === 0) {
    return {
      candidates: candidates.length,
      oldestStartedAt: timestamps[0] ?? null,
      newestStartedAt: timestamps.at(-1) ?? null,
      changed: 0,
    };
  }
  await ensureMigrated();
  const tx = await client.transaction("write");
  try {
    for (const candidate of candidates) {
      await tx.execute({
        sql: "UPDATE activities SET status = 'confirmed' WHERE id = ? AND user_id = ? AND status = 'pending_review'",
        args: [candidate.id, owner.userId],
      });
      await tx.execute({
        sql: "DELETE FROM activity_splits WHERE activity_id = ?",
        args: [candidate.id],
      });
    }
    await tx.commit();
  } finally {
    tx.close();
  }
  return {
    candidates: candidates.length,
    oldestStartedAt: timestamps[0] ?? null,
    newestStartedAt: timestamps.at(-1) ?? null,
    changed: candidates.length,
  };
}

/**
 * Server-only authorization handoff read. The encrypted secret stays unread
 * because the authorize endpoint has no legitimate use for it; #31 may read it
 * only when exchanging a code server-side.
 */
export async function getPendingStravaAuthorization(
  owner: OwnerContext
): Promise<{ client_id: string } | null> {
  const row = await one<PendingAuthorizationRow>(
    `SELECT client_id, client_secret_ciphertext, encryption_key_version, status
     FROM strava_connections WHERE user_id = ?`,
    [owner.userId]
  );
  if (
    row?.status !== "pending_authorization" ||
    !row.client_id ||
    !row.client_secret_ciphertext ||
    row.encryption_key_version !== 1
  ) {
    return null;
  }
  return { client_id: row.client_id };
}

export async function getPendingStravaExchangeInput(
  owner: OwnerContext
): Promise<PendingStravaExchangeInput | null> {
  const row = await one<PendingAuthorizationRow>(
    `SELECT client_id, client_secret_ciphertext, encryption_key_version, status
     FROM strava_connections WHERE user_id = ?`,
    [owner.userId]
  );
  if (
    row?.status !== "pending_authorization" ||
    !row.client_id ||
    !row.client_secret_ciphertext ||
    row.encryption_key_version !== 1
  ) {
    return null;
  }
  return {
    client_id: row.client_id,
    client_secret: decryptStravaSecret(owner.userId, "client_secret", row.client_secret_ciphertext),
  };
}

/**
 * Writes one owner-bound pending credential pair. Once a handoff is held, a
 * repeat form post cannot replace it; the UI exposes only the continuation and
 * avoids a duplicate authorization attempt. A connected record is never
 * modified by the #30 setup path.
 */
export async function savePendingStravaConnection(
  owner: OwnerContext,
  input: PendingStravaConnectionInput
): Promise<boolean> {
  const result = await exec(
    `INSERT INTO strava_connections
       (id, user_id, client_id, client_secret_ciphertext, encryption_key_version,
        access_token_ciphertext, refresh_token_ciphertext, expires_at, strava_athlete_id,
        granted_scope, status)
     VALUES (?, ?, ?, ?, 1, NULL, NULL, NULL, NULL, NULL, 'pending_authorization')
     ON CONFLICT(user_id) DO UPDATE SET
       client_id = excluded.client_id,
       client_secret_ciphertext = excluded.client_secret_ciphertext,
       access_token_ciphertext = NULL,
       refresh_token_ciphertext = NULL,
       encryption_key_version = excluded.encryption_key_version,
       expires_at = NULL,
       strava_athlete_id = NULL,
       granted_scope = NULL,
       status = excluded.status,
       updated_at = datetime('now')
     WHERE strava_connections.status = 'disconnected'
     RETURNING id`,
    [
      crypto.randomUUID(),
      owner.userId,
      input.client_id,
      encryptStravaSecret(owner.userId, "client_secret", input.client_secret),
    ]
  );
  return result.rows.length === 1;
}

export async function getStravaAuth(owner: OwnerContext): Promise<StravaAuthRow | null> {
  const row = await one<EncryptedConnectionRow>(
    `SELECT access_token_ciphertext, refresh_token_ciphertext, encryption_key_version, expires_at,
            client_id, client_secret_ciphertext, strava_athlete_id, granted_scope, status
     FROM strava_connections WHERE user_id = ?`,
    [owner.userId]
  );
  if (
    !row ||
    !row.access_token_ciphertext ||
    !row.refresh_token_ciphertext ||
    row.expires_at === null ||
    row.status !== "connected"
  ) {
    return null;
  }
  if (row.encryption_key_version !== 1) throw new StravaSecretStorageError();
  return {
    access_token: decryptStravaSecret(owner.userId, "access_token", row.access_token_ciphertext),
    refresh_token: decryptStravaSecret(owner.userId, "refresh_token", row.refresh_token_ciphertext),
    expires_at: row.expires_at,
  };
}

/**
 * Server-only lifecycle read for provider deauthorization. Unlike the normal
 * authenticated API read, a reconnect has intentionally moved a connection to
 * `pending_authorization` while retaining its prior encrypted token. That
 * status must not suppress a best-effort revoke during a subsequent delete.
 */
export async function getStravaDeauthorizationAccessToken(
  owner: OwnerContext
): Promise<string | null> {
  const row = await one<
    Pick<EncryptedConnectionRow, "access_token_ciphertext" | "encryption_key_version">
  >(
    `SELECT access_token_ciphertext, encryption_key_version
     FROM strava_connections WHERE user_id = ?`,
    [owner.userId]
  );
  if (!row?.access_token_ciphertext) return null;
  if (row.encryption_key_version !== 1) throw new StravaSecretStorageError();
  return decryptStravaSecret(owner.userId, "access_token", row.access_token_ciphertext);
}

/** Server-only full connection read for a future callback/sync worker. */
export async function getStravaConnection(
  owner: OwnerContext
): Promise<StravaConnectionInput | null> {
  const row = await one<EncryptedConnectionRow>(
    `SELECT client_id, client_secret_ciphertext, access_token_ciphertext, encryption_key_version,
            refresh_token_ciphertext, expires_at, strava_athlete_id, granted_scope, status
     FROM strava_connections WHERE user_id = ?`,
    [owner.userId]
  );
  if (
    !row ||
    !row.client_id ||
    !row.client_secret_ciphertext ||
    !row.access_token_ciphertext ||
    !row.refresh_token_ciphertext ||
    row.expires_at === null ||
    row.status !== "connected"
  ) {
    return null;
  }
  if (row.encryption_key_version !== 1) throw new StravaSecretStorageError();
  return {
    client_id: row.client_id,
    client_secret: decryptStravaSecret(owner.userId, "client_secret", row.client_secret_ciphertext),
    access_token: decryptStravaSecret(owner.userId, "access_token", row.access_token_ciphertext),
    refresh_token: decryptStravaSecret(owner.userId, "refresh_token", row.refresh_token_ciphertext),
    expires_at: row.expires_at,
    ...(row.strava_athlete_id === null ? {} : { strava_athlete_id: row.strava_athlete_id }),
    ...(row.granted_scope === null ? {} : { granted_scope: row.granted_scope }),
  };
}

export async function saveStravaConnection(
  owner: OwnerContext,
  input: StravaConnectionInput
): Promise<void> {
  await exec(
    `INSERT INTO strava_connections
       (id, user_id, client_id, client_secret_ciphertext, access_token_ciphertext,
        refresh_token_ciphertext, encryption_key_version, expires_at, strava_athlete_id,
        granted_scope, status, review_after)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 'connected', ?)
     ON CONFLICT(user_id) DO UPDATE SET
       client_id = excluded.client_id,
       client_secret_ciphertext = excluded.client_secret_ciphertext,
       access_token_ciphertext = excluded.access_token_ciphertext,
       refresh_token_ciphertext = excluded.refresh_token_ciphertext,
       encryption_key_version = excluded.encryption_key_version,
       expires_at = excluded.expires_at,
       strava_athlete_id = excluded.strava_athlete_id,
       granted_scope = excluded.granted_scope,
       status = excluded.status,
       review_after = COALESCE(strava_connections.review_after, excluded.review_after),
       updated_at = datetime('now')`,
    [
      crypto.randomUUID(),
      owner.userId,
      input.client_id,
      encryptStravaSecret(owner.userId, "client_secret", input.client_secret),
      encryptStravaSecret(owner.userId, "access_token", input.access_token),
      encryptStravaSecret(owner.userId, "refresh_token", input.refresh_token),
      input.expires_at,
      input.strava_athlete_id ?? null,
      input.granted_scope ?? null,
      new Date().toISOString(),
    ]
  );
}

/**
 * The only callback promotion path. A valid token never upgrades a row owned
 * by somebody else, a connected row, or a row that no longer has the exact
 * pending credential pair the authorization was started with.
 */
export async function promotePendingStravaConnection(
  owner: OwnerContext,
  input: StravaAuthRow & { strava_athlete_id: number; granted_scope: string }
): Promise<boolean> {
  const result = await exec(
    `UPDATE strava_connections
     SET access_token_ciphertext = ?,
         refresh_token_ciphertext = ?,
         encryption_key_version = 1,
         expires_at = ?,
         strava_athlete_id = ?,
         granted_scope = ?,
         status = 'connected',
         review_after = COALESCE(review_after, ?),
         updated_at = datetime('now')
     WHERE user_id = ?
       AND status = 'pending_authorization'
       AND client_id IS NOT NULL
       AND client_secret_ciphertext IS NOT NULL
       AND encryption_key_version = 1
     RETURNING id`,
    [
      encryptStravaSecret(owner.userId, "access_token", input.access_token),
      encryptStravaSecret(owner.userId, "refresh_token", input.refresh_token),
      input.expires_at,
      input.strava_athlete_id,
      input.granted_scope,
      new Date().toISOString(),
      owner.userId,
    ]
  );
  return result.rows.length === 1;
}

export async function saveStravaAuth(owner: OwnerContext, auth: StravaAuthRow): Promise<boolean> {
  const result = await exec(
    `UPDATE strava_connections
     SET access_token_ciphertext = ?,
         refresh_token_ciphertext = ?,
         encryption_key_version = 1,
         expires_at = ?,
         updated_at = datetime('now')
     WHERE user_id = ?
       AND status = 'connected'
       AND client_id IS NOT NULL
       AND client_secret_ciphertext IS NOT NULL
     RETURNING id`,
    [
      encryptStravaSecret(owner.userId, "access_token", auth.access_token),
      encryptStravaSecret(owner.userId, "refresh_token", auth.refresh_token),
      auth.expires_at,
      owner.userId,
    ]
  );
  return result.rows.length === 1;
}

/**
 * A rejected/expired refresh cannot fall back to a process-wide credential.
 * Retain only the encrypted BYO client credentials so this owner can safely
 * authorize again; previous tokens are no longer usable.
 */
export async function markStravaConnectionRecoverable(owner: OwnerContext): Promise<void> {
  await exec(
    `UPDATE strava_connections
     SET access_token_ciphertext = NULL,
         refresh_token_ciphertext = NULL,
         expires_at = NULL,
         strava_athlete_id = NULL,
         granted_scope = NULL,
         status = 'pending_authorization',
         updated_at = datetime('now')
     WHERE user_id = ? AND status = 'connected'`,
    [owner.userId]
  );
}

/**
 * Moves a connected owner back to the existing owner-bound authorization
 * continuation. The saved BYO client credentials remain encrypted so a
 * reconnect does not ask the athlete to copy a secret again; current tokens
 * are deliberately unusable while the provider authorization is renewed.
 */
export async function prepareStravaReconnect(owner: OwnerContext): Promise<boolean> {
  const result = await exec(
    `UPDATE strava_connections
     SET status = 'pending_authorization', updated_at = datetime('now')
     WHERE user_id = ?
       AND status = 'connected'
       AND client_id IS NOT NULL
       AND client_secret_ciphertext IS NOT NULL
       AND encryption_key_version = 1
     RETURNING id`,
    [owner.userId]
  );
  return result.rows.length === 1;
}

/**
 * Permanently removes one owner's Strava connection and imported graph.
 *
 * Deletion is intentionally a single write transaction. Activity children
 * cascade through their foreign keys (splits, streams, best efforts, metrics,
 * and curve points); manually entered activities have `strava_id IS NULL` and
 * are never selected. Strava-origin gear belongs to this graph and is deleted;
 * manual gear survives with only provider-derived references cleared.
 */
export async function deleteOwnerStravaData(owner: OwnerContext): Promise<DeletedStravaData> {
  await ensureMigrated();
  const transaction = await client.transaction("write");
  try {
    const imported = await transaction.execute({
      sql: "SELECT COUNT(*) AS count FROM activities WHERE user_id = ? AND strava_id IS NOT NULL",
      args: [owner.userId],
    });
    const connection = await transaction.execute({
      sql: "SELECT 1 AS present FROM strava_connections WHERE user_id = ?",
      args: [owner.userId],
    });

    // OAuth states and sync/person metadata are connection material too. Do
    // this before the connection disappears so retries are fully idempotent.
    await transaction.execute({
      sql: "DELETE FROM oauth_states WHERE user_id = ?",
      args: [owner.userId],
    });
    await transaction.execute({
      sql: "DELETE FROM user_meta WHERE user_id = ? AND key IN ('athlete_name', 'last_sync_at')",
      args: [owner.userId],
    });
    // A manually entered activity may have been assigned imported gear. Keep
    // the manual activity but clear that now-deleted relationship first.
    await transaction.execute({
      sql: `UPDATE activity_splits SET shoe_id = NULL
            WHERE shoe_id IN (SELECT id FROM shoes WHERE user_id = ? AND origin = 'strava')`,
      args: [owner.userId],
    });
    await transaction.execute({
      sql: `UPDATE activities SET bike_id = NULL
            WHERE user_id = ? AND bike_id IN (SELECT id FROM bikes WHERE user_id = ? AND origin = 'strava')`,
      args: [owner.userId, owner.userId],
    });
    await transaction.execute({
      sql: "DELETE FROM shoes WHERE user_id = ? AND origin = 'strava'",
      args: [owner.userId],
    });
    await transaction.execute({
      sql: "DELETE FROM bikes WHERE user_id = ? AND origin = 'strava'",
      args: [owner.userId],
    });
    for (const table of ["shoes", "bikes"] as const)
      await transaction.execute({
        sql: `UPDATE ${table}
              SET strava_gear_id = NULL, provider_distance_m = NULL,
                  provider_observed_at = NULL, provider_last_seen_at = NULL
              WHERE user_id = ? AND origin = 'manual'`,
        args: [owner.userId],
      });
    await transaction.execute({
      sql: "DELETE FROM activities WHERE user_id = ? AND strava_id IS NOT NULL",
      args: [owner.userId],
    });
    await transaction.execute({
      sql: "DELETE FROM strava_connections WHERE user_id = ?",
      args: [owner.userId],
    });
    await transaction.commit();
    return {
      activities: Number(imported.rows[0]?.count ?? 0),
      connection: connection.rows.length > 0,
    };
  } finally {
    transaction.close();
  }
}
