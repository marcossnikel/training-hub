import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbFile = path.join(
  os.tmpdir(),
  `training-hub-strava-lifecycle-${process.pid}-${Date.now()}.db`
);
const ownerA = { userId: "lifecycle-owner-a" };
const ownerB = { userId: "lifecycle-owner-b" };
let db: typeof import("./db");

async function addOwner(userId: string, subject: string): Promise<void> {
  const now = new Date().toISOString();
  await db.client.batch(
    [
      {
        sql: 'INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
        args: [subject, subject, `${subject}@example.test`, 0, now, now],
      },
      { sql: "INSERT INTO users (id, auth_subject) VALUES (?, ?)", args: [userId, subject] },
    ],
    "write"
  );
}

async function insertActivity(
  userId: string,
  stravaId: number | null,
  name: string
): Promise<number> {
  const result = await db.client.execute({
    sql: `INSERT INTO activities (user_id, strava_id, name, sport_type, started_at, distance_km, moving_time_s, status, raw_json)
          VALUES (?, ?, ?, 'Run', '2026-01-01T00:00:00Z', 5, 1500, 'confirmed', ?)`,
    args: [userId, stravaId, name, stravaId === null ? null : '{"provider":"strava"}'],
  });
  return Number(result.lastInsertRowid);
}

async function count(sql: string, args: string[] = []): Promise<number> {
  const result = await db.client.execute({ sql, args });
  return Number(result.rows[0]?.count ?? 0);
}

beforeAll(async () => {
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.STRAVA_CONNECTION_ENCRYPTION_KEY = Buffer.alloc(32, 53).toString("base64url");
  db = await import("./db");
  await db.ensureMigrated();
  await addOwner(ownerA.userId, "lifecycle-auth-a");
  await addOwner(ownerB.userId, "lifecycle-auth-b");
});

afterAll(() => {
  db.client.close();
  for (const suffix of ["", "-shm", "-wal", "-journal"])
    fs.rmSync(`${dbFile}${suffix}`, { force: true });
});

describe("owner-scoped Strava lifecycle deletion", () => {
  it("reconnects only the current encrypted connection", async () => {
    await db.saveStravaConnection(ownerA, {
      client_id: "client-a",
      client_secret: "secret-a",
      access_token: "access-a",
      refresh_token: "refresh-a",
      expires_at: 4_000_000_000,
    });
    await db.saveStravaConnection(ownerB, {
      client_id: "client-b",
      client_secret: "secret-b",
      access_token: "access-b",
      refresh_token: "refresh-b",
      expires_at: 4_000_000_000,
    });

    expect(await db.prepareStravaReconnect(ownerA)).toBe(true);
    expect(await db.getStravaConnectionStatus(ownerA)).toBe("pending_authorization");
    expect(await db.getPendingStravaAuthorization(ownerA)).toEqual({ client_id: "client-a" });
    expect(await db.getStravaConnectionStatus(ownerB)).toBe("connected");
    expect(await db.prepareStravaReconnect(ownerA)).toBe(false);
  });

  it("atomically deletes only Strava-origin data and keeps manual roots and another owner", async () => {
    const syncedA = await insertActivity(ownerA.userId, 1001, "Imported A");
    const manualA = await insertActivity(ownerA.userId, null, "Manual A");
    const syncedB = await insertActivity(ownerB.userId, 2001, "Imported B");
    await db.client.batch(
      [
        { sql: "INSERT INTO activity_splits (activity_id, km) VALUES (?, ?)", args: [syncedA, 5] },
        {
          sql: "INSERT INTO activity_streams (activity_id, json) VALUES (?, ?)",
          args: [syncedA, "{}"],
        },
        {
          sql: "INSERT INTO activity_best_efforts (activity_id, name) VALUES (?, ?)",
          args: [syncedA, "5K"],
        },
        {
          sql: "INSERT INTO activity_metrics (activity_id, metrics_version) VALUES (?, ?)",
          args: [syncedA, 1],
        },
        {
          sql: "INSERT INTO activity_curve_points (activity_id, kind, bucket, value) VALUES (?, ?, ?, ?)",
          args: [syncedA, "pace", "5k", 300],
        },
        {
          sql: "INSERT INTO shoes (user_id, name, strava_gear_id) VALUES (?, ?, ?)",
          args: [ownerA.userId, "Manual shoe", "shoe-a"],
        },
        {
          sql: "INSERT INTO bikes (user_id, name, strava_gear_id) VALUES (?, ?, ?)",
          args: [ownerA.userId, "Manual bike", "bike-a"],
        },
        {
          sql: "INSERT INTO athlete_goals (user_id, name) VALUES (?, ?)",
          args: [ownerA.userId, "Manual goal"],
        },
        {
          sql: "INSERT INTO user_meta (user_id, key, value) VALUES (?, ?, ?)",
          args: [ownerA.userId, "athlete_name", "Provider name"],
        },
        {
          sql: "INSERT INTO user_meta (user_id, key, value) VALUES (?, ?, ?)",
          args: [ownerA.userId, "last_sync_at", "2026-01-02T00:00:00Z"],
        },
        {
          sql: "INSERT INTO user_meta (user_id, key, value) VALUES (?, ?, ?)",
          args: [ownerA.userId, "baseline_date", "2026-01-01T00:00:00Z"],
        },
        {
          sql: "INSERT INTO oauth_states (state_hash, user_id, connection_intent, redirect_key, expires_at) VALUES (?, ?, ?, ?, ?)",
          args: ["lifecycle-state", ownerA.userId, "connect", "settings", "2999-01-01T00:00:00Z"],
        },
      ],
      "write"
    );

    const result = await db.deleteOwnerStravaData(ownerA);
    expect(result).toEqual({ activities: 1, connection: true });
    expect(
      await count("SELECT COUNT(*) AS count FROM activities WHERE user_id = ?", [ownerA.userId])
    ).toBe(1);
    expect(await db.getActivity(ownerA, manualA)).toMatchObject({
      name: "Manual A",
      strava_id: null,
    });
    for (const table of [
      "activity_splits",
      "activity_streams",
      "activity_best_efforts",
      "activity_metrics",
      "activity_curve_points",
    ]) {
      expect(
        await count(`SELECT COUNT(*) AS count FROM ${table} WHERE activity_id = ?`, [
          String(syncedA),
        ])
      ).toBe(0);
    }
    expect(await db.getStravaConnection(ownerA)).toBeNull();
    expect(await db.getStravaConnectionStatus(ownerA)).toBe("disconnected");
    expect(
      await count("SELECT COUNT(*) AS count FROM oauth_states WHERE user_id = ?", [ownerA.userId])
    ).toBe(0);
    expect(await db.getMeta(ownerA, "athlete_name")).toBeNull();
    expect(await db.getMeta(ownerA, "last_sync_at")).toBeNull();
    expect(await db.getMeta(ownerA, "baseline_date")).toBe("2026-01-01T00:00:00Z");
    expect(
      await count("SELECT COUNT(*) AS count FROM athlete_goals WHERE user_id = ?", [ownerA.userId])
    ).toBe(1);
    expect(
      await count(
        "SELECT COUNT(*) AS count FROM shoes WHERE user_id = ? AND strava_gear_id IS NULL",
        [ownerA.userId]
      )
    ).toBe(1);
    expect(
      await count(
        "SELECT COUNT(*) AS count FROM bikes WHERE user_id = ? AND strava_gear_id IS NULL",
        [ownerA.userId]
      )
    ).toBe(1);
    expect(await db.getActivity(ownerB, syncedB)).toMatchObject({ name: "Imported B" });
    expect(await db.getStravaConnectionStatus(ownerB)).toBe("connected");

    expect(await db.deleteOwnerStravaData(ownerA)).toEqual({ activities: 0, connection: false });
  });
});
