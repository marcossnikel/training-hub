import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localStartedAt } from "@/lib/format";

// Round-trip guard for migration 6 (started_at_local). Drives the REAL db.ts
// client + migrations against an ISOLATED local sqlite file (never Turso), the
// same pattern as db.fk.test.ts: DATABASE_URL is set BEFORE the dynamic import
// (db.ts builds its client singleton from env at import time) and TURSO_* is
// cleared first because makeClient() prefers TURSO_DATABASE_URL.

const dbFile = path.join(os.tmpdir(), `training-hub-local-start-${process.pid}-${Date.now()}.db`);

type Db = typeof import("./db");
type TestDb = Omit<Db, "getActivity"> & { getActivity(id: number): ReturnType<Db["getActivity"]> };
let db: TestDb;
const TEST_OWNER = "local-start-test-owner";
const OWNER = { userId: TEST_OWNER };

function bindOwner(raw: Db): TestDb {
  return { ...raw, getActivity: (id) => raw.getActivity(OWNER, id) };
}

beforeAll(async () => {
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  process.env.DATABASE_URL = `file:${dbFile}`;
  db = bindOwner(await import("./db"));
  await db.ensureMigrated();
  const now = new Date().toISOString();
  await db.client.batch(
    [
      {
        sql: 'INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
        args: [
          "local-start-test-auth",
          "Local start Test",
          "local-start@example.test",
          0,
          now,
          now,
        ],
      },
      {
        sql: "INSERT INTO users (id, auth_subject) VALUES (?, ?)",
        args: [TEST_OWNER, "local-start-test-auth"],
      },
    ],
    "write"
  );
});

afterAll(() => {
  db.client.close();
  for (const suffix of ["", "-shm", "-wal", "-journal"]) {
    fs.rmSync(`${dbFile}${suffix}`, { force: true });
  }
});

describe("migration 6: started_at_local", () => {
  it("adds the nullable started_at_local column and records version 6", async () => {
    const info = await db.client.execute("SELECT name FROM pragma_table_info('activities')");
    const columns = new Set(info.rows.map((row) => String(row.name)));
    expect(columns.has("started_at_local")).toBe(true);

    const version = await db.client.execute("SELECT version FROM schema_version WHERE id = 1");
    expect(Number(version.rows[0].version)).toBeGreaterThanOrEqual(6);
  });

  it("round-trips a captured local stamp and localStartedAt prefers it", async () => {
    const inserted = await db.client.execute({
      sql: `INSERT INTO activities (user_id, name, sport_type, started_at, started_at_local, distance_km, status)
            VALUES (?, ?, 'Run', ?, ?, ?, 'confirmed')`,
      args: [TEST_OWNER, "evening run", "2026-03-16T00:00:00Z", "2026-03-15T21:00:00Z", 10],
    });
    const activity = await db.getActivity(Number(inserted.lastInsertRowid));
    expect(activity).not.toBeNull();
    if (!activity) return;
    expect(activity.started_at_local).toBe("2026-03-15T21:00:00Z");
    expect(localStartedAt(activity)).toBe("2026-03-15T21:00:00Z");
  });

  it("falls back to the UTC started_at when the local stamp is null", async () => {
    const inserted = await db.client.execute({
      sql: `INSERT INTO activities (user_id, name, sport_type, started_at, distance_km, status)
            VALUES (?, ?, 'Run', ?, ?, 'confirmed')`,
      args: [TEST_OWNER, "fixture row", "2026-03-16T00:00:00Z", 10],
    });
    const activity = await db.getActivity(Number(inserted.lastInsertRowid));
    expect(activity).not.toBeNull();
    if (!activity) return;
    expect(activity.started_at_local).toBeNull();
    expect(localStartedAt(activity)).toBe("2026-03-16T00:00:00Z");
  });
});
