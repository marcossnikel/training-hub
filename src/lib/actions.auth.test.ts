import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LibsqlDialect } from "@libsql/kysely-libsql";
import { Kysely } from "kysely";
import { betterAuth } from "better-auth";

const DB_PATH = "data/auth-unit-test.db";

afterEach(() => {
  vi.unstubAllEnvs();
  globalThis.__trainingHubClient = undefined;
  for (const suffix of ["", "-shm", "-wal", "-journal"]) {
    fs.rmSync(`${DB_PATH}${suffix}`, { force: true });
  }
});

describe("Better Auth database sessions", () => {
  it("uses application migration 16 and rejects a revoked session on a fresh request", async () => {
    vi.stubEnv("DATABASE_URL", `file:${DB_PATH}`);
    vi.stubEnv("TURSO_DATABASE_URL", "");
    vi.resetModules();

    // Exercise the application migration registry, not Better Auth's schema generator.
    const { client } = await import("./db/client");
    const { ensureMigrated } = await import("./db/migrations");
    await ensureMigrated();
    const tables = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('user', 'session', 'account', 'verification')"
    );
    expect(tables.rows.map((row) => String(row.name)).sort()).toEqual([
      "account",
      "session",
      "user",
      "verification",
    ]);

    const db = new Kysely({ dialect: new LibsqlDialect({ client: client as never }) });
    const config = {
      secret: "unit-test-secret-with-at-least-32-characters",
      baseURL: "http://localhost:3100",
      database: { db, type: "sqlite" as const, casing: "snake" as const, transaction: true },
      emailAndPassword: { enabled: true },
      session: { cookieCache: { enabled: false } },
    };
    const auth = betterAuth(config);

    const signedUp = await auth.api.signUpEmail({
      body: {
        name: "Athlete A",
        email: "a@example.test",
        password: "correct-horse-battery-staple",
      },
      asResponse: true,
    });
    const cookie = signedUp.headers.get("set-cookie");
    const token = cookie?.match(/better-auth\.session_token=([^;]+)/)?.[1];
    expect(signedUp.status).toBe(200);
    expect(cookie).toContain("HttpOnly");
    expect(token).toBeTruthy();

    const sessionRequest = () =>
      new Request("http://localhost:3100/api/auth/get-session", {
        headers: { cookie: `better-auth.session_token=${token}` },
      });
    const beforeRevocation = await auth.handler(sessionRequest());
    const beforeSession = await beforeRevocation.json();
    expect(beforeSession.user.email).toBe("a@example.test");

    await client.execute({
      sql: "DELETE FROM session WHERE token = ?",
      args: [beforeSession.session.token],
    });
    expect(
      Number((await client.execute("SELECT COUNT(*) AS count FROM session")).rows[0].count)
    ).toBe(0);

    // A new auth instance plus a new Request models a later server request, so
    // this cannot reuse the direct API call's request context or cookie cache.
    const freshAuth = betterAuth(config);
    const afterRevocation = await freshAuth.handler(sessionRequest());
    expect(await afterRevocation.json()).toBeNull();
    await db.destroy();
  });
});
