import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbFile = path.join(
  os.tmpdir(),
  `training-hub-strava-connection-${process.pid}-${Date.now()}.db`
);
const ownerA = { userId: "connection-owner-a" };
const ownerB = { userId: "connection-owner-b" };

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
  process.env.STRAVA_CONNECTION_ENCRYPTION_KEY = Buffer.alloc(32, 43).toString("base64url");
  db = await import("./db");
  await db.ensureMigrated();
  await addOwner(ownerA.userId, "connection-auth-a");
  await addOwner(ownerB.userId, "connection-auth-b");
});

afterAll(() => {
  db.client.close();
  for (const suffix of ["", "-shm", "-wal", "-journal"])
    fs.rmSync(`${dbFile}${suffix}`, { force: true });
});

describe("owner-scoped encrypted Strava connections", () => {
  it("keeps each owner readable only by that owner and stores no plaintext artifacts", async () => {
    await db.saveStravaConnection(ownerA, {
      client_id: "client-a",
      client_secret: "client-secret-a",
      access_token: "access-token-a",
      refresh_token: "refresh-token-a",
      expires_at: 4_000_000_000,
      granted_scope: "activity:read_all,profile:read_all",
    });
    expect(await db.getStravaConnection(ownerA)).toMatchObject({
      client_id: "client-a",
      client_secret: "client-secret-a",
      access_token: "access-token-a",
      refresh_token: "refresh-token-a",
    });
    expect(await db.getStravaConnection(ownerB)).toBeNull();

    const raw = await db.client.execute({
      sql: `SELECT client_secret_ciphertext, access_token_ciphertext, refresh_token_ciphertext,
                   encryption_key_version FROM strava_connections WHERE user_id = ?`,
      args: [ownerA.userId],
    });
    const artifact = JSON.stringify(raw.rows[0]);
    for (const plaintext of ["client-secret-a", "access-token-a", "refresh-token-a"]) {
      expect(artifact).not.toContain(plaintext);
    }
    expect(Number(raw.rows[0].encryption_key_version)).toBe(1);
  });

  it("cannot overwrite a second owner and rejects copied ciphertext during owner-bound reads", async () => {
    await db.saveStravaConnection(ownerB, {
      client_id: "client-b",
      client_secret: "client-secret-b",
      access_token: "access-token-b",
      refresh_token: "refresh-token-b",
      expires_at: 4_000_000_000,
    });
    const before = await db.getStravaConnection(ownerB);
    await db.saveStravaAuth(ownerA, {
      access_token: "access-token-a-updated",
      refresh_token: "refresh-token-a-updated",
      expires_at: 4_000_000_001,
    });
    expect(await db.getStravaConnection(ownerB)).toEqual(before);

    const aRow = await db.client.execute({
      sql: "SELECT access_token_ciphertext FROM strava_connections WHERE user_id = ?",
      args: [ownerA.userId],
    });
    await db.client.execute({
      sql: "UPDATE strava_connections SET access_token_ciphertext = ? WHERE user_id = ?",
      args: [String(aRow.rows[0].access_token_ciphertext), ownerB.userId],
    });
    await expect(db.getStravaAuth(ownerB)).rejects.toThrow(
      "Strava connection material is unavailable."
    );
    await db.client.execute({
      sql: "UPDATE strava_connections SET encryption_key_version = 2 WHERE user_id = ?",
      args: [ownerA.userId],
    });
    await expect(db.getStravaAuth(ownerA)).rejects.toThrow(
      "Strava connection material is unavailable."
    );
  });
});
