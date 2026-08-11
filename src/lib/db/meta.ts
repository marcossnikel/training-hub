import { exec, one } from "./helpers";

const LEGACY_COMPATIBILITY_USER_ID = "legacy-local-owner";

export async function getMeta(key: string): Promise<string | null> {
  const row = await one<{ value: string }>(
    "SELECT value FROM user_meta WHERE user_id = ? AND key = ?",
    [LEGACY_COMPATIBILITY_USER_ID, key]
  );
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await exec(
    `INSERT INTO user_meta (user_id, key, value) VALUES (?, ?, ?)
     ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`,
    [LEGACY_COMPATIBILITY_USER_ID, key, value]
  );
}

export async function deleteMeta(key: string): Promise<void> {
  await exec("DELETE FROM user_meta WHERE user_id = ? AND key = ?", [
    LEGACY_COMPATIBILITY_USER_ID,
    key,
  ]);
}
