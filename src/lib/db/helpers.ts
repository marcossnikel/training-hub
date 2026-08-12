import { client } from "./client";
import type { InStatement, Row } from "./client";
import { ensureMigrated } from "./migrations";

/**
 * Rebuild a libSQL {@link Row} as a genuine plain object keyed by the result's
 * column names. libSQL rows are array-like: they carry numeric index keys and a
 * non-`Object.prototype` prototype, so handing one straight to a `"use client"`
 * component trips React's "Only plain objects can be passed to Client Components"
 * warning. This is the single read seam where that shape is flattened.
 *
 * Built from `columns` (NOT a `{...row}` spread, which would also copy the numeric
 * index keys). Values are copied by reference — identical numbers/strings/nulls —
 * so every typed accessor and decoder downstream reads exactly the same data.
 */
function toPlain<T>(row: Row, columns: string[]): T {
  const plain: Record<string, unknown> = {};
  for (const col of columns) plain[col] = row[col];
  return plain as T;
}

/**
 * Clears a Strava gear_id off every OTHER row of `table` so the unique gear
 * mapping holds before it is (re)assigned. On create there is no owning row yet,
 * so `exceptId` is omitted and every current holder is cleared; on update the
 * owning row is spared via `AND id != ?`. Emit this immediately before the
 * assigning INSERT/UPDATE, exactly where each caller ran it inline before.
 */
export function clearGearFromOthers(
  table: "shoes" | "bikes",
  userId: string,
  gearId: string,
  exceptId?: number
): InStatement {
  if (exceptId === undefined) {
    return {
      sql: `UPDATE ${table} SET strava_gear_id = NULL WHERE user_id = ? AND strava_gear_id = ?`,
      args: [userId, gearId],
    };
  }
  return {
    sql: `UPDATE ${table} SET strava_gear_id = NULL WHERE user_id = ? AND strava_gear_id = ? AND id != ?`,
    args: [userId, gearId, exceptId],
  };
}

type Args = Array<string | number | null>;

export async function exec(sql: string, args: Args = []) {
  await ensureMigrated();
  return client.execute({ sql, args });
}

export async function many<T>(sql: string, args: Args = []): Promise<T[]> {
  const result = await exec(sql, args);
  return result.rows.map((row) => toPlain<T>(row, result.columns));
}

export async function one<T>(sql: string, args: Args = []): Promise<T | null> {
  const result = await exec(sql, args);
  return result.rows.length > 0 ? toPlain<T>(result.rows[0], result.columns) : null;
}

export async function batchWrite(statements: InStatement[]) {
  await ensureMigrated();
  return client.batch(statements, "write");
}

// Max statements per batched write, to keep a single transaction bounded.
export const WRITE_CHUNK = 200;

/**
 * Decode a SQLite integer boolean to a real `boolean` at the read seam. SQLite
 * has no boolean type, so flags are stored as 0/1 (and read back as numbers, or
 * null for an absent column). This is the single place that conversion happens,
 * so domain types can carry `boolean` instead of leaking 0/1 into the UI (G3.6).
 */
export function sqliteBool(value: number | null | undefined): boolean {
  return value != null && value !== 0;
}
