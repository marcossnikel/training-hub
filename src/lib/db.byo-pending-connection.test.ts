import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decryptStravaSecret } from "./crypto";

const dbFile = path.join(os.tmpdir(), `training-hub-byo-pending-${process.pid}-${Date.now()}.db`);
const ownerA = { userId: "byo-owner-a" };
const ownerB = { userId: "byo-owner-b" };
let db: typeof import("./db");

async function addOwner(userId: string, authSubject: string): Promise<void> {
  const now = new Date().toISOString();
  await db.client.batch(
    [
      {
        sql: 'INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
        args: [authSubject, authSubject, `${authSubject}@example.test`, 0, now, now],
      },
      { sql: "INSERT INTO users (id, auth_subject) VALUES (?, ?)", args: [userId, authSubject] },
    ],
    "write"
  );
}

beforeAll(async () => {
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.STRAVA_CONNECTION_ENCRYPTION_KEY = Buffer.alloc(32, 47).toString("base64url");
  db = await import("./db");
  await db.ensureMigrated();
  await addOwner(ownerA.userId, "byo-auth-a");
  await addOwner(ownerB.userId, "byo-auth-b");
});

afterAll(() => {
  db.client.close();
  for (const suffix of ["", "-shm", "-wal", "-journal"])
    fs.rmSync(`${dbFile}${suffix}`, { force: true });
});

describe("owner-scoped pending BYO credentials", () => {
  it("persists only an encrypted secret and exposes a safe pending status", async () => {
    expect(
      await db.savePendingStravaConnection(ownerA, {
        client_id: "athlete-client-a",
        client_secret: "athlete-secret-a",
      })
    ).toBe(true);
    expect(await db.getStravaConnectionStatus(ownerA)).toBe("pending_authorization");
    expect(await db.getPendingStravaAuthorization(ownerA)).toEqual({
      client_id: "athlete-client-a",
    });
    expect(await db.getPendingStravaAuthorization(ownerB)).toBeNull();
    expect(await db.getStravaConnection(ownerA)).toBeNull();

    const raw = await db.client.execute({
      sql: `SELECT client_id, client_secret_ciphertext, access_token_ciphertext,
                   refresh_token_ciphertext, expires_at, strava_athlete_id, granted_scope,
                   encryption_key_version, status
            FROM strava_connections WHERE user_id = ?`,
      args: [ownerA.userId],
    });
    const row = raw.rows[0];
    const artifact = JSON.stringify(row);
    expect(artifact).not.toContain("athlete-secret-a");
    expect(String(row.status)).toBe("pending_authorization");
    expect(row.access_token_ciphertext).toBeNull();
    expect(row.refresh_token_ciphertext).toBeNull();
    expect(row.expires_at).toBeNull();
    expect(row.strava_athlete_id).toBeNull();
    expect(row.granted_scope).toBeNull();
    expect(
      decryptStravaSecret(ownerA.userId, "client_secret", String(row.client_secret_ciphertext))
    ).toBe("athlete-secret-a");
  });

  it("does not let another owner read or replace a held authorization", async () => {
    expect(
      await db.savePendingStravaConnection(ownerB, {
        client_id: "athlete-client-b",
        client_secret: "athlete-secret-b",
      })
    ).toBe(true);
    const before = await db.client.execute({
      sql: "SELECT client_id, client_secret_ciphertext FROM strava_connections WHERE user_id = ?",
      args: [ownerA.userId],
    });
    // A repeat request cannot create a second handoff or replace already-held credentials.
    expect(
      await db.savePendingStravaConnection(ownerA, {
        client_id: "attacker-replacement-id",
        client_secret: "attacker-replacement-secret",
      })
    ).toBe(false);
    const after = await db.client.execute({
      sql: "SELECT client_id, client_secret_ciphertext FROM strava_connections WHERE user_id = ?",
      args: [ownerA.userId],
    });
    expect(after.rows).toEqual(before.rows);
    expect(await db.getPendingStravaAuthorization(ownerB)).toEqual({
      client_id: "athlete-client-b",
    });
  });

  it("atomically promotes only the initiating pending owner and never writes a failed token", async () => {
    expect(
      await db.promotePendingStravaConnection(ownerA, {
        access_token: "callback-access-a",
        refresh_token: "callback-refresh-a",
        expires_at: 4_000_000_000,
        strava_athlete_id: 123,
        granted_scope: "read,activity:read_all,profile:read_all",
      })
    ).toBe(true);
    expect(
      await db.promotePendingStravaConnection(ownerB, {
        access_token: "callback-access-b",
        refresh_token: "callback-refresh-b",
        expires_at: 4_000_000_000,
        strava_athlete_id: 456,
        granted_scope: "read,activity:read_all,profile:read_all",
      })
    ).toBe(true);
    // A replay cannot update an already-promoted connection.
    expect(
      await db.promotePendingStravaConnection(ownerA, {
        access_token: "replayed-token",
        refresh_token: "replayed-refresh",
        expires_at: 4_000_000_001,
        strava_athlete_id: 999,
        granted_scope: "read,activity:read_all,profile:read_all",
      })
    ).toBe(false);

    expect(await db.getStravaConnection(ownerA)).toMatchObject({
      client_id: "athlete-client-a",
      access_token: "callback-access-a",
      refresh_token: "callback-refresh-a",
      strava_athlete_id: 123,
      granted_scope: "read,activity:read_all,profile:read_all",
    });
    expect(await db.getStravaConnection(ownerB)).toMatchObject({
      client_id: "athlete-client-b",
      access_token: "callback-access-b",
      refresh_token: "callback-refresh-b",
      strava_athlete_id: 456,
    });

    const raw = await db.client.execute({
      sql: "SELECT access_token_ciphertext, refresh_token_ciphertext FROM strava_connections WHERE user_id = ?",
      args: [ownerA.userId],
    });
    expect(JSON.stringify(raw.rows[0])).not.toContain("callback-access-a");
    expect(JSON.stringify(raw.rows[0])).not.toContain("callback-refresh-a");
  });

  it("makes only a failed owner recoverable by clearing tokens but retaining encrypted retry credentials", async () => {
    await db.markStravaConnectionRecoverable(ownerA);
    expect(await db.getStravaConnectionStatus(ownerA)).toBe("pending_authorization");
    expect(await db.getStravaAuth(ownerA)).toBeNull();
    expect(await db.getPendingStravaAuthorization(ownerA)).toEqual({
      client_id: "athlete-client-a",
    });
    expect(await db.getStravaConnectionStatus(ownerB)).toBe("connected");
    expect(await db.getStravaConnection(ownerB)).toMatchObject({
      access_token: "callback-access-b",
    });

    const raw = await db.client.execute({
      sql: "SELECT access_token_ciphertext, refresh_token_ciphertext FROM strava_connections WHERE user_id = ?",
      args: [ownerA.userId],
    });
    expect(raw.rows[0].access_token_ciphertext).toBeNull();
    expect(raw.rows[0].refresh_token_ciphertext).toBeNull();
  });
});
