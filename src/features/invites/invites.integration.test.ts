import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ADDITIVE_MIGRATIONS,
  createVersion23Fixture,
  OWNER_SCHEMA_VERSION,
  runMigrations,
} from "@/lib/db/migrations";
import { bootstrapCreator } from "@/features/access/creator-bootstrap";

const files: string[] = [];
const requestState = vi.hoisted(() => ({ headers: new Headers() }));

vi.mock("next/headers", () => ({ headers: async () => requestState.headers }));

function disposableFile(label: string): string {
  const file = path.join(os.tmpdir(), `training-hub-r6-${label}-${process.pid}-${Date.now()}.db`);
  files.push(file);
  return file;
}

function configure(file: string) {
  vi.stubEnv("DATABASE_URL", `file:${file}`);
  vi.stubEnv("TURSO_DATABASE_URL", "");
  vi.stubEnv("TURSO_AUTH_TOKEN", "");
  vi.stubEnv("TRAINING_HUB_ENV", "local");
  vi.stubEnv("TRAINING_HUB_INVITE_TARGET", "local");
  vi.stubEnv("TRAINING_HUB_DISPOSABLE_DATA", "1");
  vi.stubEnv("TRAINING_HUB_PUBLIC_ORIGIN", "http://localhost:3100");
  vi.stubEnv("BETA_INVITE_REGISTRATION_ENABLED", "1");
  vi.stubEnv("BETTER_AUTH_SECRET", "r6-integration-test-secret-with-at-least-32-characters");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3100");
}

async function signUp(email: string, token: string): Promise<string> {
  const { auth } = await import("@/lib/auth");
  const response = await auth.handler(
    new Request("http://localhost:3100/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3100" },
      body: JSON.stringify({
        name: email,
        email,
        password: "correct-horse-battery-staple",
        inviteToken: token,
      }),
    })
  );
  expect(response.status).toBe(200);
  const cookie = response.headers.get("set-cookie");
  if (!cookie) throw new Error("Expected an authenticated session cookie.");
  return cookie.split(";")[0];
}

async function legacySession(email: string): Promise<string> {
  const { issueBetaInvite } = await import("@/lib/beta-invites");
  const legacy = await issueBetaInvite({ email, issuedBy: "r6-compatibility-cli" });
  return signUp(email, legacy.token);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  globalThis.__trainingHubClient = undefined;
  requestState.headers = new Headers();
  for (const file of files.splice(0)) {
    for (const suffix of ["", "-shm", "-wal", "-journal"])
      fs.rmSync(`${file}${suffix}`, { force: true });
  }
});

describe("invite migration compatibility", () => {
  it("upgrades a pre-R6 invitation table without losing the legacy operator provenance", async () => {
    const file = disposableFile("legacy");
    const database = createClient({ url: `file:${file}`, intMode: "number" });
    try {
      await createVersion23Fixture(database);
      for (const migration of ADDITIVE_MIGRATIONS.slice(0, 2)) {
        await database.batch(
          [
            ...migration.statements,
            {
              sql: "UPDATE schema_version SET version = ? WHERE id = 1",
              args: [migration.version],
            },
          ],
          "write"
        );
      }
      await database.batch(
        [
          'ALTER TABLE "user" ADD COLUMN "betaInviteClaim" TEXT',
          `CREATE TABLE beta_invites (
            id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, intended_email TEXT NOT NULL,
            issued_by TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
            redeemed_at TEXT, redeemed_auth_subject TEXT UNIQUE, revoked_at TEXT
          )`,
          {
            sql: "INSERT INTO beta_invites (id, token_hash, intended_email, issued_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
            args: [
              "legacy-id",
              "a".repeat(64),
              "legacy@example.test",
              "legacy-operator",
              "2026-01-01T00:00:00.000Z",
              "2099-01-01T00:00:00.000Z",
            ],
          },
        ],
        "write"
      );
      await runMigrations(database, { autoApply: true });
      expect((await database.execute("SELECT version FROM schema_version")).rows).toEqual([
        { version: OWNER_SCHEMA_VERSION },
      ]);
      expect(
        (
          await database.execute(
            "SELECT issued_by, issued_by_user_id FROM beta_invites WHERE id = 'legacy-id'"
          )
        ).rows
      ).toEqual([{ issued_by: "legacy-operator", issued_by_user_id: null }]);
    } finally {
      database.close();
    }
  });
});

describe("creator invitation module", () => {
  it("keeps management creator-only while exposing only redacted deployment-scoped summaries", async () => {
    const file = disposableFile("operations");
    configure(file);
    const { client } = await import("@/lib/db/client");
    const { ensureMigrated } = await import("@/lib/db/migrations");
    const { issueInvitation, listInvitationSummaries, revokeInvitation, InviteAuthorizationError } =
      await import("./server");
    await ensureMigrated();

    const creatorCookie = await legacySession("creator@example.test");
    requestState.headers = new Headers({ cookie: creatorCookie });
    const { requireAccess } = await import("@/features/access/server");
    await requireAccess();
    await bootstrapCreator(client, { email: "creator@example.test", apply: true });
    const memberCookie = await legacySession("member@example.test");

    requestState.headers = new Headers({ cookie: memberCookie });
    vi.stubEnv("TRAINING_HUB_INVITE_TARGET", "");
    await expect(issueInvitation({ email: "blocked@example.test" })).rejects.toBeInstanceOf(
      InviteAuthorizationError
    );
    vi.stubEnv("TRAINING_HUB_INVITE_TARGET", "local");
    requestState.headers = new Headers();
    await expect(listInvitationSummaries()).rejects.toBeInstanceOf(InviteAuthorizationError);

    requestState.headers = new Headers({ cookie: creatorCookie });
    const canary = "r6-plaintext-canary-must-not-persist";
    const logs = ["log", "info", "warn", "error"].map((method) =>
      vi.spyOn(console, method as keyof Console).mockImplementation(() => undefined)
    );
    const issued = await issueInvitation({ email: " ATHLETE@EXAMPLE.TEST " });
    expect(issued.intendedEmail).toBe("athlete@example.test");
    expect(new URL(issued.inviteUrl).searchParams.get("invite")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(issued.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const token = new URL(issued.inviteUrl).searchParams.get("invite");
    if (!token) throw new Error("Issue result did not contain its immediate token.");

    const active = (await listInvitationSummaries()).find(
      (invite) => invite.intendedEmail === issued.intendedEmail
    );
    expect(active).toMatchObject({ status: "active", intendedEmail: issued.intendedEmail });
    expect(active).not.toHaveProperty("inviteUrl");
    expect(active).not.toHaveProperty("token");
    expect(JSON.stringify(active)).not.toContain(canary);
    expect(JSON.stringify(active)).not.toContain(token);
    expect(JSON.stringify(active)).not.toContain("token_hash");

    const revoked = await issueInvitation({ email: "revoked@example.test" });
    const expired = await issueInvitation({ email: "expired@example.test" });
    const redeemed = await issueInvitation({ email: "redeemed@example.test" });
    const expiredRow = (await listInvitationSummaries()).find(
      (invite) => invite.intendedEmail === "expired@example.test"
    );
    if (!expiredRow) throw new Error("Expected expired fixture invite.");
    await client.execute({
      sql: "UPDATE beta_invites SET expires_at = ? WHERE id = ?",
      args: ["2000-01-01T00:00:00.000Z", expiredRow.id],
    });
    const revokedRow = (await listInvitationSummaries()).find(
      (invite) => invite.intendedEmail === "revoked@example.test"
    );
    if (!revokedRow) throw new Error("Expected revoked fixture invite.");
    await revokeInvitation(revokedRow.id);
    await signUp("redeemed@example.test", new URL(redeemed.inviteUrl).searchParams.get("invite")!);

    const secondCreatorCookie = await legacySession("second-creator@example.test");
    requestState.headers = new Headers({ cookie: secondCreatorCookie });
    await requireAccess();
    await bootstrapCreator(client, { email: "second-creator@example.test", apply: true });
    requestState.headers = new Headers({ cookie: secondCreatorCookie });
    const secondCreatorSummaries = await listInvitationSummaries();
    expect(secondCreatorSummaries.map((invite) => invite.status)).toEqual(
      expect.arrayContaining(["active", "expired", "revoked", "redeemed"])
    );
    const activeId = secondCreatorSummaries.find(
      (invite) => invite.intendedEmail === "athlete@example.test"
    )?.id;
    if (!activeId) throw new Error("Expected active creator-issued invite.");
    await revokeInvitation(activeId);
    await revokeInvitation(activeId);
    expect((await listInvitationSummaries()).find((invite) => invite.id === activeId)?.status).toBe(
      "revoked"
    );

    requestState.headers = new Headers({ cookie: memberCookie });
    await expect(revokeInvitation(activeId)).rejects.toBeInstanceOf(InviteAuthorizationError);

    const foreign = createClient({ url: `file:${disposableFile("foreign")}`, intMode: "number" });
    try {
      await runMigrations(foreign, { autoApply: true });
      expect((await foreign.execute("SELECT COUNT(*) AS count FROM beta_invites")).rows).toEqual([
        { count: 0 },
      ]);
    } finally {
      foreign.close();
    }

    requestState.headers = new Headers({ cookie: secondCreatorCookie });
    expect(JSON.stringify(await listInvitationSummaries())).not.toContain(canary);
    expect(JSON.stringify(await listInvitationSummaries())).not.toContain(token);
    const capturedLogs = JSON.stringify(logs.flatMap((spy) => spy.mock.calls));
    expect(capturedLogs).not.toContain(token);
    expect(capturedLogs).not.toContain(canary);
    expect(revoked.inviteUrl).not.toContain(canary);
  });
});
