import { exec, one } from "./helpers";
import type { OwnerContext } from "../owner-context";

export async function getMeta(owner: OwnerContext, key: string): Promise<string | null> {
  const row = await one<{ value: string }>(
    "SELECT value FROM user_meta WHERE user_id = ? AND key = ?",
    [owner.userId, key]
  );
  return row?.value ?? null;
}

export async function setMeta(owner: OwnerContext, key: string, value: string): Promise<void> {
  await exec(
    `INSERT INTO user_meta (user_id, key, value) VALUES (?, ?, ?)
     ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`,
    [owner.userId, key, value]
  );
}

export async function deleteMeta(owner: OwnerContext, key: string): Promise<void> {
  await exec("DELETE FROM user_meta WHERE user_id = ? AND key = ?", [owner.userId, key]);
}
