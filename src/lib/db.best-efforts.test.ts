import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Migration 10 + the best-effort upsert, exercised against the REAL migrations and
// SQL on an ISOLATED local sqlite file (never Turso) — the shared database is where
// these statements ultimately run, so the UNIQUE key, the upsert and the cascade are
// proven here first. db/client.ts builds its client singleton from env at import
// time, so DATABASE_URL is set (and TURSO_* cleared) before the dynamic import.

const dbFile = path.join(os.tmpdir(), `training-hub-best-efforts-${process.pid}-${Date.now()}.db`);

let db: typeof import("./db");
let activityId: number;

beforeAll(async () => {
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  process.env.DATABASE_URL = `file:${dbFile}`;
  db = await import("./db");
  await db.ensureMigrated();
  const inserted = await db.client.execute({
    sql: `INSERT INTO activities (name, sport_type, started_at, distance_km, status)
          VALUES (?, 'Run', ?, ?, 'confirmed')`,
    args: ["Best efforts test", "2026-01-01T12:00:00Z", 10],
  });
  activityId = Number(inserted.lastInsertRowid);
});

afterAll(() => {
  db.client.close();
  for (const suffix of ["", "-shm", "-wal", "-journal"]) {
    fs.rmSync(`${dbFile}${suffix}`, { force: true });
  }
});

async function storedRows() {
  const result = await db.client.execute({
    sql: `SELECT name, distance_m, elapsed_time_s, moving_time_s, pr_rank
          FROM activity_best_efforts WHERE activity_id = ? ORDER BY name`,
    args: [activityId],
  });
  return result.rows.map((row) => ({ ...row }));
}

describe("activity_best_efforts", () => {
  it("upserts on (activity_id, name): re-running rewrites in place", async () => {
    await db.upsertActivityBestEfforts(activityId, [
      { name: "1K", distance_m: 1000, elapsed_time_s: 291, moving_time_s: 291, pr_rank: null },
      { name: "5K", distance_m: 5000, elapsed_time_s: 1200, moving_time_s: 1200, pr_rank: 2 },
    ]);
    expect(await storedRows()).toEqual([
      { name: "1K", distance_m: 1000, elapsed_time_s: 291, moving_time_s: 291, pr_rank: null },
      { name: "5K", distance_m: 5000, elapsed_time_s: 1200, moving_time_s: 1200, pr_rank: 2 },
    ]);

    // Same names, one changed rank: two rows, not four.
    await db.upsertActivityBestEfforts(activityId, [
      { name: "1K", distance_m: 1000, elapsed_time_s: 291, moving_time_s: 291, pr_rank: null },
      { name: "5K", distance_m: 5000, elapsed_time_s: 1200, moving_time_s: 1200, pr_rank: 1 },
    ]);
    const rows = await storedRows();
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ name: "5K", pr_rank: 1 });

    expect(await db.listBestEffortCounts()).toEqual([{ activity_id: activityId, n: 2 }]);
  });

  it("deleting the activity cascades its effort rows away", async () => {
    await db.client.execute({ sql: "DELETE FROM activities WHERE id = ?", args: [activityId] });
    expect(await storedRows()).toEqual([]);
  });
});
