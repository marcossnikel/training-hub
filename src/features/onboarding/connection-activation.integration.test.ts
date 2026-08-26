import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbFile = path.join(
  os.tmpdir(),
  `training-hub-connection-activation-${process.pid}-${Date.now()}.db`
);
const owner = { userId: "activation-owner" };
const otherOwner = { userId: "activation-other-owner" };
let db: typeof import("@/lib/db");
let activation: typeof import("./connection-activation");

async function addOwner(userId: string) {
  const now = new Date().toISOString();
  await db.client.batch(
    [
      {
        sql: 'INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 0, ?, ?)',
        args: [`auth-${userId}`, userId, `${userId}@example.test`, now, now],
      },
      {
        sql: "INSERT INTO users (id, auth_subject) VALUES (?, ?)",
        args: [userId, `auth-${userId}`],
      },
    ],
    "write"
  );
  await db.saveStravaConnection(
    { userId },
    {
      client_id: `client-${userId}`,
      client_secret: "secret",
      access_token: "access",
      refresh_token: "refresh",
      expires_at: 4_000_000_000,
    }
  );
}

beforeAll(async () => {
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.STRAVA_CONNECTION_ENCRYPTION_KEY = Buffer.alloc(32, 53).toString("base64url");
  db = await import("@/lib/db");
  activation = await import("./connection-activation");
  await db.ensureMigrated();
  await addOwner(owner.userId);
  await addOwner(otherOwner.userId);
});

afterAll(() => {
  db.client.close();
  for (const suffix of ["", "-shm", "-wal", "-journal"])
    fs.rmSync(`${dbFile}${suffix}`, { force: true });
});

describe("connection activation", () => {
  it("keeps presentation separate from welcome, permits dismiss/revisit, and completes only after a completed owner job", async () => {
    const first = await db.ensureConnectionActivation(owner);
    expect(first).toMatchObject({ state: "pending" });
    if (!first) throw new Error("Expected an activation for the connected owner.");
    // A retained connection's reauthorization only calls ensure again; it never creates a replay record.
    expect(await db.ensureConnectionActivation(owner)).toMatchObject({
      connectionId: first?.connectionId,
      state: "pending",
    });
    await db.dismissConnectionActivation(owner);
    expect(await db.getConnectionActivation(owner)).toMatchObject({ state: "dismissed" });

    await db.client.batch(
      [
        {
          sql: "INSERT INTO strava_import_jobs (id, user_id, connection_id, status, stage, next_page, started_at, updated_at, completed_at) VALUES (?, ?, ?, 'completed', 'completed', 2, ?, ?, ?)",
          args: [
            "job-owner",
            owner.userId,
            first.connectionId,
            "2026-08-01T12:00:00Z",
            "2026-08-01T12:01:00Z",
            "2026-08-01T12:01:00Z",
          ],
        },
        {
          sql: "INSERT INTO activities (user_id, strava_id, name, sport_type, started_at, started_at_local, distance_km, moving_time_s, elevation_gain_m, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed')",
          args: [
            owner.userId,
            9001,
            "Imported run",
            "Run",
            "2026-07-01T12:00:00Z",
            "2026-07-01T09:00:00Z",
            10,
            3600,
            120,
          ],
        },
        {
          sql: "INSERT INTO activities (user_id, strava_id, name, sport_type, started_at, distance_km, moving_time_s, elevation_gain_m, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_review')",
          args: [owner.userId, 9002, "New run", "Run", "2026-07-02T12:00:00Z", 5, 1800, 40],
        },
        {
          sql: "INSERT INTO shoes (user_id, name, origin) VALUES (?, ?, 'strava')",
          args: [owner.userId, "Imported shoe"],
        },
      ],
      "write"
    );

    const summary = await activation.prepareConnectionActivationSummary(owner);
    expect(summary).toMatchObject({
      confirmed: 1,
      pending: 1,
      sportMix: { run: 1 },
      distanceKm: 10,
      movingTimeS: 3600,
      elevationM: 120,
      gearCount: 1,
      recent: { sessions: 1, activeDays: 1 },
    });
    expect(await db.getConnectionActivation(owner)).toMatchObject({ state: "summary_ready" });
    await db.completeConnectionActivation(owner);
    expect(await db.getConnectionActivation(owner)).toMatchObject({ state: "completed" });

    // The foreign owner has no activation, job, counters, summary, or route-derived identity to observe.
    expect(await db.getConnectionActivation(otherOwner)).toBeNull();
    expect(await activation.connectionActivationSummary(otherOwner)).toBeNull();
  });
});
