import { batchWrite, exec, one } from "./helpers";
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
}

export type StravaConnectionStatus = "disconnected" | "pending_authorization" | "connected";

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
        granted_scope, status)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 'connected')
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

export async function clearStravaAuth(owner: OwnerContext): Promise<void> {
  await batchWrite([
    {
      sql: "DELETE FROM strava_connections WHERE user_id = ?",
      args: [owner.userId],
    },
    {
      sql: "DELETE FROM user_meta WHERE user_id = ? AND key = 'athlete_name'",
      args: [owner.userId],
    },
  ]);
}
