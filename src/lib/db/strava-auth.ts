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
}

export async function getStravaAuth(owner: OwnerContext): Promise<StravaAuthRow | null> {
  const row = await one<EncryptedConnectionRow>(
    `SELECT access_token_ciphertext, refresh_token_ciphertext, encryption_key_version, expires_at,
            client_id, client_secret_ciphertext, strava_athlete_id, granted_scope
     FROM strava_connections WHERE user_id = ?`,
    [owner.userId]
  );
  if (
    !row ||
    !row.access_token_ciphertext ||
    !row.refresh_token_ciphertext ||
    row.expires_at === null
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
            refresh_token_ciphertext, expires_at, strava_athlete_id, granted_scope
     FROM strava_connections WHERE user_id = ?`,
    [owner.userId]
  );
  if (
    !row ||
    !row.client_id ||
    !row.client_secret_ciphertext ||
    !row.access_token_ciphertext ||
    !row.refresh_token_ciphertext ||
    row.expires_at === null
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

export async function saveStravaAuth(owner: OwnerContext, auth: StravaAuthRow): Promise<void> {
  await exec(
    `INSERT INTO strava_connections
       (id, user_id, access_token_ciphertext, refresh_token_ciphertext, encryption_key_version,
        expires_at, status)
     VALUES (?, ?, ?, ?, 1, ?, 'connected')
     ON CONFLICT(user_id) DO UPDATE SET
       access_token_ciphertext = excluded.access_token_ciphertext,
       refresh_token_ciphertext = excluded.refresh_token_ciphertext,
       expires_at = excluded.expires_at, status = excluded.status,
       updated_at = datetime('now')`,
    [
      crypto.randomUUID(),
      owner.userId,
      encryptStravaSecret(owner.userId, "access_token", auth.access_token),
      encryptStravaSecret(owner.userId, "refresh_token", auth.refresh_token),
      auth.expires_at,
    ]
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
