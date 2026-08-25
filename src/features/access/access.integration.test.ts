import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createVersion23Fixture, runMigrations } from "@/lib/db/migrations";
import {
  bootstrapCreator,
  CreatorBootstrapError,
  validateCreatorBootstrapCommand,
} from "./creator-bootstrap";

const files: string[] = [];
const requestState = vi.hoisted(() => ({ headers: new Headers() }));

vi.mock("next/headers", () => ({
  headers: async () => requestState.headers,
}));

function disposableClient(label: string): { client: Client; file: string } {
  const file = path.join(
    os.tmpdir(),
    `training-hub-r3-${label}-${process.pid}-${Date.now()}-${files.length}.db`
  );
  files.push(file);
  return { client: createClient({ url: `file:${file}`, intMode: "number" }), file };
}

async function addAuthUser(
  database: Client,
  { authSubject, userId, email }: { authSubject: string; userId: string; email: string }
): Promise<void> {
  await database.batch(
    [
      {
        sql: 'INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
        args: [authSubject, authSubject, email, 0, "2026-01-01", "2026-01-01"],
      },
      { sql: "INSERT INTO users (id, auth_subject) VALUES (?, ?)", args: [userId, authSubject] },
    ],
    "write"
  );
}

async function signUp(
  auth: typeof import("@/lib/auth").auth,
  issueBetaInvite: typeof import("@/lib/beta-invites").issueBetaInvite,
  email: string
): Promise<{ cookie: string }> {
  const invite = await issueBetaInvite({ email, issuedBy: "r3-test" });
  const response = await auth.handler(
    new Request("http://localhost:3100/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3100" },
      body: JSON.stringify({
        name: email,
        email,
        password: "correct-horse-battery-staple",
        inviteToken: invite.token,
      }),
    })
  );
  expect(response.status).toBe(200);
  const cookie = response.headers.get("set-cookie");
  expect(cookie).toBeTruthy();
  if (!cookie) throw new Error("Sign-up did not create a session cookie.");
  return { cookie: cookie.split(";")[0] };
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

describe("creator authorization migration and bootstrap", () => {
  it("migrates two existing users to member, rejects invalid roles, and preserves exactly one bootstrap target", async () => {
    const { client } = disposableClient("migration");
    try {
      await createVersion23Fixture(client);
      await addAuthUser(client, {
        authSubject: "auth-member-a",
        userId: "member-a",
        email: "member-a@example.test",
      });
      await addAuthUser(client, {
        authSubject: "auth-member-b",
        userId: "member-b",
        email: "member-b@example.test",
      });

      await runMigrations(client, { autoApply: true });
      expect((await client.execute("SELECT id, role FROM users ORDER BY id")).rows).toEqual([
        { id: "member-a", role: "member" },
        { id: "member-b", role: "member" },
      ]);
      await expect(
        client.execute({ sql: "UPDATE users SET role = 'admin' WHERE id = ?", args: ["member-a"] })
      ).rejects.toThrow();

      const dryRun = await bootstrapCreator(client, {
        email: "member-a@example.test",
        apply: false,
      });
      expect(dryRun).toMatchObject({
        userId: "member-a",
        redactedEmail: "m***@example.test",
        previousRole: "member",
        role: "member",
        changed: false,
      });
      expect((await client.execute("SELECT role FROM users WHERE id = 'member-a'")).rows).toEqual([
        { role: "member" },
      ]);

      const applied = await bootstrapCreator(client, {
        email: "member-a@example.test",
        apply: true,
      });
      expect(applied).toMatchObject({ userId: "member-a", role: "creator", changed: true });
      expect((await client.execute("SELECT id, role FROM users ORDER BY id")).rows).toEqual([
        { id: "member-a", role: "creator" },
        { id: "member-b", role: "member" },
      ]);
    } finally {
      client.close();
    }
  });

  it("refuses ambiguous accounts and every unsafe bootstrap target before a write", async () => {
    const { client } = disposableClient("bootstrap-refusal");
    try {
      await runMigrations(client, { autoApply: true });
      await addAuthUser(client, {
        authSubject: "duplicate-a",
        userId: "duplicate-local-a",
        email: "duplicate@example.test",
      });
      await client.execute({
        sql: 'INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
        args: [
          "duplicate-b",
          "duplicate-b",
          "DUPLICATE@example.test",
          0,
          "2026-01-01",
          "2026-01-01",
        ],
      });
      await expect(
        bootstrapCreator(client, { email: "duplicate@example.test", apply: true })
      ).rejects.toBeInstanceOf(CreatorBootstrapError);
      expect(
        (await client.execute("SELECT role FROM users WHERE id = 'duplicate-local-a'")).rows
      ).toEqual([{ role: "member" }]);

      expect(() =>
        validateCreatorBootstrapCommand(["--email=member@example.test", "--apply"], {
          TRAINING_HUB_ENV: "preview",
          VERCEL_ENV: "preview",
          TURSO_DATABASE_URL: "libsql://training-hub-preview.example",
          TURSO_AUTH_TOKEN: "never-print-this",
        })
      ).toThrow(CreatorBootstrapError);
    } finally {
      client.close();
    }
  });
});

describe("real session-derived access", () => {
  it("allows creator capabilities, denies member/guest/revoked sessions, and ignores forged role and owner inputs", async () => {
    const file = path.join(os.tmpdir(), `training-hub-r3-session-${process.pid}-${Date.now()}.db`);
    files.push(file);
    vi.stubEnv("DATABASE_URL", `file:${file}`);
    vi.stubEnv("TURSO_DATABASE_URL", "");
    vi.stubEnv("TURSO_AUTH_TOKEN", "");
    vi.stubEnv("TRAINING_HUB_ENV", "local");
    vi.stubEnv("TRAINING_HUB_DISPOSABLE_DATA", "1");
    vi.stubEnv("BETA_INVITE_REGISTRATION_ENABLED", "1");
    vi.stubEnv("BETTER_AUTH_SECRET", "r3-access-test-secret-with-at-least-32-characters");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3100");

    const { ensureMigrated } = await import("@/lib/db/migrations");
    const { client } = await import("@/lib/db/client");
    const { issueBetaInvite } = await import("@/lib/beta-invites");
    const { auth } = await import("@/lib/auth");
    const { hasCapability, requireAccess, requireCreator } = await import("./server");
    const { createManualActivity, createShoe, getActivity, getShoe, getStravaConnectionStatus } =
      await import("@/lib/db");
    await ensureMigrated();

    const creatorSession = await signUp(auth, issueBetaInvite, "creator@example.test");
    requestState.headers = new Headers({
      cookie: creatorSession.cookie,
      "x-owner-id": "forged-owner",
      "x-role": "creator",
    });
    const unpromotedCreator = await requireAccess();
    expect(unpromotedCreator).toMatchObject({ role: "member" });
    expect(unpromotedCreator?.userId).not.toBe("forged-owner");

    await bootstrapCreator(client, { email: "creator@example.test", apply: true });
    const creator = await requireCreator();
    expect(creator).toMatchObject({ role: "creator" });
    if (!creator) throw new Error("Promoted creator session was not resolved.");
    expect(creator && hasCapability(creator, "viewOperationalEnvironment")).toBe(true);
    expect(creator && hasCapability(creator, "manageBetaInvites")).toBe(true);

    const memberSession = await signUp(auth, issueBetaInvite, "member@example.test");
    requestState.headers = new Headers({
      cookie: memberSession.cookie,
      "x-owner-id": creator?.userId ?? "forged-owner",
      "x-role": "creator",
    });
    const member = await requireAccess();
    expect(member).toMatchObject({ role: "member" });
    if (!member) throw new Error("Member session was not resolved.");
    expect(await requireCreator()).toBeNull();
    expect(member && hasCapability(member, "manageBetaInvites")).toBe(false);

    const memberOwner = { userId: member.userId };
    const memberShoe = await createShoe(
      memberOwner,
      { name: "Member shoe", role: null, initial_km: 0, retirement_km: null, strava_gear_id: null },
      null
    );
    const memberActivity = await createManualActivity(memberOwner, {
      date: "2026-08-01",
      km: 10,
      shoe_id: memberShoe,
      name: "Member activity",
    });
    await client.execute({
      sql: "INSERT INTO strava_connections (id, user_id, status) VALUES (?, ?, 'connected')",
      args: ["member-connection", memberOwner.userId],
    });
    expect(await getActivity(creator, memberActivity)).toBeNull();
    expect(await getShoe(creator, memberShoe)).toBeNull();
    expect(await getStravaConnectionStatus(creator)).toBe("disconnected");
    expect(await getStravaConnectionStatus(memberOwner)).toBe("connected");

    requestState.headers = new Headers({ cookie: creatorSession.cookie });
    const freshCreator = await requireAccess();
    if (!freshCreator)
      throw new Error("Creator session was unexpectedly unavailable before revocation.");
    await client.execute({
      sql: 'DELETE FROM "session" WHERE id = ?',
      args: [freshCreator.sessionId],
    });
    expect(await requireAccess()).toBeNull();
    expect(await requireCreator()).toBeNull();

    requestState.headers = new Headers();
    expect(await requireAccess()).toBeNull();
  });
});
