import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbFile = path.join(os.tmpdir(), `training-hub-owner-schema-${process.pid}-${Date.now()}.db`);
let db: typeof import("./db");

async function insertOwner(id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.client.batch(
    [
      {
        sql: 'INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
        args: [`auth-${id}`, id, `${id}@example.test`, 0, now, now],
      },
      { sql: "INSERT INTO users (id, auth_subject) VALUES (?, ?)", args: [id, `auth-${id}`] },
    ],
    "write"
  );
}

beforeAll(async () => {
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  process.env.DATABASE_URL = `file:${dbFile}`;
  db = await import("./db");
  await db.ensureMigrated();
  await insertOwner("owner-a");
  await insertOwner("owner-b");
});

afterAll(() => {
  db.client.close();
  for (const suffix of ["", "-shm", "-wal", "-journal"])
    fs.rmSync(`${dbFile}${suffix}`, { force: true });
});

describe("#23 fresh owner schema", () => {
  it("keeps Better Auth tables and replaces prototype singleton tenant tables", async () => {
    const tables = await db.client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
    );
    const names = new Set(tables.rows.map((row) => String(row.name)));
    for (const table of [
      "user",
      "session",
      "account",
      "verification",
      "users",
      "athlete_profiles",
      "user_meta",
      "strava_connections",
      "oauth_states",
    ]) {
      expect(names.has(table)).toBe(true);
    }
    for (const retired of ["health_metrics", "activity_load"]) {
      expect(names.has(retired)).toBe(false);
    }
  });

  it("enforces owner FKs and allows an external id only across owners", async () => {
    await expect(
      db.client.execute({
        sql: "INSERT INTO activities (user_id, name, status) VALUES (?, ?, ?)",
        args: ["missing", "orphan", "confirmed"],
      })
    ).rejects.toThrow();
    await db.client.batch(
      [
        {
          sql: "INSERT INTO shoes (user_id, name, strava_gear_id) VALUES (?, ?, ?)",
          args: ["owner-a", "A", "gear-1"],
        },
        {
          sql: "INSERT INTO shoes (user_id, name, strava_gear_id) VALUES (?, ?, ?)",
          args: ["owner-b", "B", "gear-1"],
        },
        {
          sql: "INSERT INTO activities (user_id, strava_id, name, status) VALUES (?, ?, ?, ?)",
          args: ["owner-a", 77, "A run", "confirmed"],
        },
        {
          sql: "INSERT INTO activities (user_id, strava_id, name, status) VALUES (?, ?, ?, ?)",
          args: ["owner-b", 77, "B run", "confirmed"],
        },
      ],
      "write"
    );
    await expect(
      db.client.execute({
        sql: "INSERT INTO activities (user_id, strava_id, name, status) VALUES (?, ?, ?, ?)",
        args: ["owner-a", 77, "duplicate", "confirmed"],
      })
    ).rejects.toThrow();
    await expect(
      db.client.execute({
        sql: "INSERT INTO shoes (user_id, name, strava_gear_id) VALUES (?, ?, ?)",
        args: ["owner-a", "duplicate", "gear-1"],
      })
    ).rejects.toThrow();
  });

  it("cascades activity-derived data and root-owned data", async () => {
    const activity = await db.client.execute({
      sql: "INSERT INTO activities (user_id, name, status) VALUES (?, ?, ?)",
      args: ["owner-a", "cascade", "confirmed"],
    });
    const activityId = Number(activity.lastInsertRowid);
    await db.client.batch(
      [
        {
          sql: "INSERT INTO activity_streams (activity_id, json) VALUES (?, ?)",
          args: [activityId, "{}"],
        },
        {
          sql: "INSERT INTO activity_metrics (activity_id, metrics_version) VALUES (?, ?)",
          args: [activityId, 1],
        },
        {
          sql: "INSERT INTO activity_best_efforts (activity_id, name) VALUES (?, ?)",
          args: [activityId, "1K"],
        },
        {
          sql: "INSERT INTO activity_curve_points (activity_id, kind, bucket, value) VALUES (?, ?, ?, ?)",
          args: [activityId, "pace", "1K", 1],
        },
      ],
      "write"
    );
    await db.client.execute({ sql: "DELETE FROM activities WHERE id = ?", args: [activityId] });
    for (const table of [
      "activity_streams",
      "activity_metrics",
      "activity_best_efforts",
      "activity_curve_points",
    ]) {
      const result = await db.client.execute(
        `SELECT COUNT(*) AS count FROM ${table} WHERE activity_id = ${activityId}`
      );
      expect(Number(result.rows[0].count)).toBe(0);
    }
    await db.client.execute({ sql: "DELETE FROM users WHERE id = ?", args: ["owner-b"] });
    const remaining = await db.client.execute(
      "SELECT COUNT(*) AS count FROM activities WHERE user_id = 'owner-b'"
    );
    expect(Number(remaining.rows[0].count)).toBe(0);
  });

  it("indexes the owner access paths and has no singleton id=1 tenant checks", async () => {
    const indexes = await db.client.execute("SELECT name FROM sqlite_master WHERE type = 'index'");
    const names = new Set(indexes.rows.map((row) => String(row.name)));
    for (const index of [
      "idx_activities_owner_started",
      "idx_activities_owner_status_started",
      "idx_activities_owner_bike",
      "idx_shoes_owner_retired_name",
      "idx_bikes_owner_retired_name",
      "idx_goals_owner_race_date",
    ]) {
      expect(names.has(index)).toBe(true);
    }
    const sql = await db.client.execute(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name IN ('activities', 'shoes', 'bikes', 'athlete_goals', 'athlete_profiles', 'user_meta')"
    );
    expect(sql.rows.map((row) => String(row.sql)).join(" ")).not.toMatch(
      /CHECK\\s*\\(\\s*id\\s*=\\s*1\\s*\\)/i
    );
  });

  it("refuses an explicit reset when remote configuration is present", () => {
    const reset = path.join(process.cwd(), "scripts/reset-local-db.mjs");
    const result = spawnSync(
      process.execPath,
      [reset, "--confirm-reset-disposable-data", "--dry-run"],
      {
        env: {
          ...process.env,
          TRAINING_HUB_ENV: "local",
          TURSO_DATABASE_URL: "libsql://shared.example",
        },
        encoding: "utf8",
      }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("remote databases are never reset");
  });
});
