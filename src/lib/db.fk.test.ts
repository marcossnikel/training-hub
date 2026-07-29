import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Client } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Regression guard for G5.5: deleting an activity must cascade to every child
// table (activity_splits, activity_streams, activity_chat), which
// only happens when SQLite foreign-key enforcement is on for the connection.
//
// The test drives the REAL db.ts client + migrations against an ISOLATED local
// sqlite file (never Turso). db.ts builds its client singleton from env at import
// time, so DATABASE_URL is set BEFORE the dynamic import below, and TURSO_* is
// cleared first because makeClient() prefers TURSO_DATABASE_URL over DATABASE_URL.

const dbFile = path.join(os.tmpdir(), `training-hub-fk-${process.pid}-${Date.now()}.db`);

let db: typeof import("./db");

async function childCounts(client: Client, activityId: number) {
  const count = async (table: string): Promise<number> => {
    const result = await client.execute({
      sql: `SELECT COUNT(*) AS n FROM ${table} WHERE activity_id = ?`,
      args: [activityId],
    });
    return Number(result.rows[0].n);
  };
  return {
    splits: await count("activity_splits"),
    streams: await count("activity_streams"),
    chat: await count("activity_chat"),
  };
}

beforeAll(async () => {
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  process.env.DATABASE_URL = `file:${dbFile}`;
  db = await import("./db");
  await db.ensureMigrated();
});

afterAll(() => {
  db.client.close();
  for (const suffix of ["", "-shm", "-wal", "-journal"]) {
    fs.rmSync(`${dbFile}${suffix}`, { force: true });
  }
});

describe("foreign-key cascade enforcement", () => {
  it("deleting an activity leaves zero orphaned child rows", async () => {
    const { client } = db;

    const inserted = await client.execute({
      sql: `INSERT INTO activities (name, sport_type, started_at, distance_km, status)
            VALUES (?, 'Run', ?, ?, 'confirmed')`,
      args: ["FK cascade test", "2026-01-01T12:00:00Z", 10],
    });
    const activityId = Number(inserted.lastInsertRowid);

    await client.batch(
      [
        {
          sql: "INSERT INTO activity_splits (activity_id, km) VALUES (?, ?)",
          args: [activityId, 10],
        },
        {
          sql: "INSERT INTO activity_streams (activity_id, json) VALUES (?, ?)",
          args: [activityId, "{}"],
        },
        {
          sql: "INSERT INTO activity_chat (activity_id, role, content) VALUES (?, 'user', 'hi')",
          args: [activityId],
        },
      ],
      "write"
    );

    expect(await childCounts(client, activityId)).toEqual({
      splits: 1,
      streams: 1,
      chat: 1,
    });

    // No dedicated delete path exists in db.ts, so delete the activity directly.
    await client.execute({ sql: "DELETE FROM activities WHERE id = ?", args: [activityId] });

    expect(await childCounts(client, activityId)).toEqual({
      splits: 0,
      streams: 0,
      chat: 0,
    });
  });
});
