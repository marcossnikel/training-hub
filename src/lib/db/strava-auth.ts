import { batchWrite, exec, one } from "./helpers";

// #24/#26 replace this compatibility fixture with a server-derived owner and
// encrypted credentials. It is intentionally owner-bound today; no global token
// table survives the #23 fresh bootstrap.
const LEGACY_COMPATIBILITY_USER_ID = "legacy-local-owner";
const LEGACY_COMPATIBILITY_CONNECTION_ID = "legacy-local-connection";

export interface StravaAuthRow {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export async function getStravaAuth(): Promise<StravaAuthRow | null> {
  const row = await one<StravaAuthRow>(
    `SELECT access_token_ciphertext AS access_token,
            refresh_token_ciphertext AS refresh_token, expires_at
     FROM strava_connections WHERE user_id = ?`,
    [LEGACY_COMPATIBILITY_USER_ID]
  );
  if (!row || !row.access_token || !row.refresh_token) return null;
  return row;
}

export async function saveStravaAuth(auth: StravaAuthRow): Promise<void> {
  await exec(
    `INSERT INTO strava_connections
       (id, user_id, access_token_ciphertext, refresh_token_ciphertext, expires_at, status)
     VALUES (?, ?, ?, ?, ?, 'connected')
     ON CONFLICT(user_id) DO UPDATE SET
       access_token_ciphertext = excluded.access_token_ciphertext,
       refresh_token_ciphertext = excluded.refresh_token_ciphertext,
       expires_at = excluded.expires_at, status = excluded.status,
       updated_at = datetime('now')`,
    [
      LEGACY_COMPATIBILITY_CONNECTION_ID,
      LEGACY_COMPATIBILITY_USER_ID,
      auth.access_token,
      auth.refresh_token,
      auth.expires_at,
    ]
  );
}

export async function clearStravaAuth(): Promise<void> {
  await batchWrite([
    {
      sql: "DELETE FROM strava_connections WHERE user_id = ?",
      args: [LEGACY_COMPATIBILITY_USER_ID],
    },
    {
      sql: "DELETE FROM user_meta WHERE user_id = ? AND key = 'athlete_name'",
      args: [LEGACY_COMPATIBILITY_USER_ID],
    },
  ]);
}
