import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbFile = path.join(os.tmpdir(), `training-hub-oauth-state-${process.pid}-${Date.now()}.db`);
const ownerA = { userId: "oauth-owner-a" };
const ownerB = { userId: "oauth-owner-b" };
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
  process.env.STRAVA_CONNECTION_ENCRYPTION_KEY = Buffer.alloc(32, 44).toString("base64url");
  db = await import("./db");
  await db.ensureMigrated();
  await addOwner(ownerA.userId, "oauth-auth-a");
  await addOwner(ownerB.userId, "oauth-auth-b");
});

afterAll(() => {
  db.client.close();
  for (const suffix of ["", "-shm", "-wal", "-journal"])
    fs.rmSync(`${dbFile}${suffix}`, { force: true });
});

describe("owner-bound opaque OAuth state", () => {
  it("persists only a keyed digest and permits exactly one owner-bound consume", async () => {
    const state = await db.createOAuthState(ownerA, { intent: "connect", redirectKey: "settings" });
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const raw = await db.client.execute({
      sql: "SELECT state_hash FROM oauth_states WHERE user_id = ?",
      args: [ownerA.userId],
    });
    expect(String(raw.rows[0].state_hash)).not.toContain(state);
    expect(await db.consumeOAuthState(ownerB, state)).toBeNull();
    expect(await db.consumeOAuthState(ownerA, state)).toEqual({
      intent: "connect",
      redirectKey: "settings",
    });
    expect(await db.consumeOAuthState(ownerA, state)).toBeNull();
  });

  it("rejects expiry, invalid state, and non-allowlisted intent/redirect input", async () => {
    const expired = await db.createOAuthState(ownerA, {
      intent: "reconnect",
      redirectKey: "onboarding",
      expiresAt: new Date(Date.now() + 1),
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(await db.consumeOAuthState(ownerA, expired)).toBeNull();
    expect(await db.consumeOAuthState(ownerA, "not-issued")).toBeNull();
    await expect(
      db.createOAuthState(ownerA, { intent: "delete" as "connect", redirectKey: "settings" })
    ).rejects.toThrow("Invalid OAuth state request.");
    await expect(
      db.createOAuthState(ownerA, {
        intent: "connect",
        redirectKey: "https://bad.example" as "settings",
      })
    ).rejects.toThrow("Invalid OAuth state request.");
  });
});
