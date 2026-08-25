import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";

const DB_PATH = "data/beta-invites-test.db";
const PASSWORD = "correct-horse-battery-staple";

function configureIsolatedBetaEnv() {
  vi.stubEnv("DATABASE_URL", `file:${DB_PATH}`);
  vi.stubEnv("TURSO_DATABASE_URL", "");
  vi.stubEnv("TURSO_AUTH_TOKEN", "");
  vi.stubEnv("TRAINING_HUB_ENV", "local");
  vi.stubEnv("TRAINING_HUB_DISPOSABLE_DATA", "1");
  vi.stubEnv("BETA_INVITE_REGISTRATION_ENABLED", "1");
  vi.stubEnv("BETTER_AUTH_SECRET", "beta-invite-test-secret-with-at-least-32-characters");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3100");
}

async function signUp(input: { email: string; token?: string; password?: string }) {
  const { auth } = await import("./auth");
  return auth.handler(
    new Request("http://localhost:3100/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3100" },
      body: JSON.stringify({
        name: "Invited athlete",
        email: input.email,
        password: input.password ?? PASSWORD,
        ...(input.token ? { inviteToken: input.token } : {}),
      }),
    })
  );
}

async function countInvites() {
  const { client } = await import("./db/client");
  return Number((await client.execute("SELECT COUNT(*) AS count FROM beta_invites")).rows[0].count);
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  globalThis.__trainingHubClient = undefined;
  for (const suffix of ["", "-shm", "-wal", "-journal"]) {
    fs.rmSync(`${DB_PATH}${suffix}`, { force: true });
  }
});

describe("beta invitation server boundary", () => {
  it("keeps registration denied even though durable invitation schema is always migrated", async () => {
    configureIsolatedBetaEnv();
    vi.stubEnv("BETA_INVITE_REGISTRATION_ENABLED", "");
    vi.resetModules();

    const response = await signUp({ email: "disabled@example.test" });
    expect(response.status).toBe(401);
    expect(await response.text()).toContain("Registration is unavailable.");

    const { client } = await import("./db/client");
    const { ensureMigrated } = await import("./db/migrations");
    await ensureMigrated();
    const columns = await client.execute('PRAGMA table_info("user")');
    expect(columns.rows.map((column) => column.name)).toContain("betaInviteClaim");
  });

  it("refuses unlabelled targets and only the local CLI prints one private registration URL", async () => {
    configureIsolatedBetaEnv();
    vi.stubEnv("TRAINING_HUB_INVITE_TARGET", "");
    const { assertBetaInviteIssuanceTarget } = await import("./beta-invites");
    expect(() => assertBetaInviteIssuanceTarget()).toThrow(
      "must explicitly be local, preview, or production"
    );

    const environment = {
      ...process.env,
      TRAINING_HUB_INVITE_TARGET: "local",
      TRAINING_HUB_PUBLIC_ORIGIN: "http://localhost:3100",
    };
    const output = execFileSync(
      path.join(process.cwd(), "node_modules", ".bin", "tsx"),
      [
        "scripts/issue-beta-invite.ts",
        "--email",
        "cli@example.test",
        "--operator",
        "test-operator",
      ],
      { cwd: process.cwd(), env: environment, encoding: "utf8" }
    );
    const url = new URL(output.trim().replace("Private registration URL (share once): ", ""));
    expect(url.pathname).toBe("/sign-up");
    expect(url.searchParams.get("invite")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(output.match(/http:\/\/localhost:3100\/sign-up\?invite=/g)).toHaveLength(1);
    // The CLI is a separate process; reconnect after it exits rather than
    // retaining SQLite's handle to a file the previous test removed.
    globalThis.__trainingHubClient = undefined;
    vi.resetModules();
    expect(await countInvites()).toBe(1);
  });

  it("permits only approved local, preview, and production invite targets", async () => {
    const { assertBetaInviteIssuanceTarget, assertBetaInviteSchemaTarget } =
      await import("./beta-invites");
    const local = {
      BETA_INVITE_REGISTRATION_ENABLED: "1",
      TRAINING_HUB_DISPOSABLE_DATA: "1",
      TRAINING_HUB_INVITE_TARGET: "local",
      TRAINING_HUB_ENV: "local",
      DATABASE_URL: "file:data/beta-invites-test.db",
      TRAINING_HUB_PUBLIC_ORIGIN: "http://localhost:3100",
    };
    expect(assertBetaInviteIssuanceTarget(local)).toBe("http://localhost:3100");
    expect(() =>
      assertBetaInviteIssuanceTarget({
        ...local,
        TRAINING_HUB_PUBLIC_ORIGIN: "https://example.test",
      })
    ).toThrow("direct loopback");

    const preview = {
      BETA_INVITE_REGISTRATION_ENABLED: "1",
      TRAINING_HUB_DISPOSABLE_DATA: "1",
      TRAINING_HUB_INVITE_TARGET: "preview",
      TRAINING_HUB_ENV: "preview",
      VERCEL_ENV: "preview",
      TURSO_DATABASE_URL: "libsql://training-hub-preview.turso.io",
      TRAINING_HUB_PUBLIC_ORIGIN: "https://preview-60.training-hub.example",
      TRAINING_HUB_INVITE_PREVIEW_ORIGIN: "https://preview-60.training-hub.example",
    };
    expect(assertBetaInviteIssuanceTarget(preview)).toBe("https://preview-60.training-hub.example");
    expect(() =>
      assertBetaInviteIssuanceTarget({
        ...preview,
        TRAINING_HUB_PUBLIC_ORIGIN: "https://other-preview.training-hub.example",
      })
    ).toThrow("exactly match");
    expect(() =>
      assertBetaInviteIssuanceTarget({
        ...preview,
        TRAINING_HUB_PUBLIC_ORIGIN: "https://training-hub-psi-one.vercel.app",
        TRAINING_HUB_INVITE_PREVIEW_ORIGIN: "https://training-hub-psi-one.vercel.app",
      })
    ).toThrow("production canonical origin");

    const production = {
      BETA_INVITE_REGISTRATION_ENABLED: "1",
      TRAINING_HUB_INVITE_TARGET: "production",
      TRAINING_HUB_ENV: "production",
      VERCEL_ENV: "production",
      TRAINING_HUB_PRODUCTION_APPROVED: "1",
      TRAINING_HUB_PRODUCTION_INVITES_ENABLED: "1",
      TURSO_DATABASE_URL: "libsql://training-hub-production.turso.io",
      TURSO_AUTH_TOKEN: "production-test-token",
      TRAINING_HUB_PUBLIC_ORIGIN: "https://training-hub.example",
      TRAINING_HUB_INVITE_PRODUCTION_ORIGIN: "https://training-hub.example",
    };
    expect(assertBetaInviteIssuanceTarget(production)).toBe("https://training-hub.example");
    expect(() => assertBetaInviteSchemaTarget(production)).not.toThrow();
    expect(() =>
      assertBetaInviteSchemaTarget({
        ...production,
        TRAINING_HUB_TURSO_DATABASE_URL: "libsql://stable-production.turso.io",
        TRAINING_HUB_TURSO_AUTH_TOKEN: "stable-production-token",
        TURSO_DATABASE_URL: "libsql://dpl-preview.turso.io",
        TURSO_AUTH_TOKEN: "deployment-token",
      })
    ).not.toThrow();
    expect(() =>
      assertBetaInviteIssuanceTarget({
        ...production,
        TRAINING_HUB_PRODUCTION_INVITES_ENABLED: "",
      })
    ).toThrow("production invites enabled");
    expect(() =>
      assertBetaInviteIssuanceTarget({
        ...production,
        TURSO_DATABASE_URL: "libsql://training-hub-preview.turso.io",
      })
    ).toThrow("dedicated production Turso database");
    expect(() =>
      assertBetaInviteIssuanceTarget({
        ...production,
        TRAINING_HUB_PUBLIC_ORIGIN: "https://wrong.training-hub.example",
      })
    ).toThrow("exactly match");
    expect(() =>
      assertBetaInviteIssuanceTarget({
        ...production,
        TRAINING_HUB_DISPOSABLE_DATA: "1",
      })
    ).toThrow("must not mark production data as disposable");
    expect(() =>
      assertBetaInviteSchemaTarget({
        ...production,
        TURSO_AUTH_TOKEN: "",
      })
    ).toThrow("explicitly approved local, preview, or production data target");
  });

  it("requires a matching opaque invitation at the Better Auth endpoint without leaking failure state", async () => {
    configureIsolatedBetaEnv();
    vi.resetModules();
    const { issueBetaInvite } = await import("./beta-invites");
    const invite = await issueBetaInvite({
      email: "athlete@example.test",
      issuedBy: "test-operator",
    });

    const missing = await signUp({ email: "athlete@example.test" });
    const malformed = await signUp({ email: "athlete@example.test", token: "not-an-opaque-token" });
    const mismatch = await signUp({ email: "other@example.test", token: invite.token });
    expect(missing.status).toBe(401);
    expect(malformed.status).toBe(401);
    expect(mismatch.status).toBe(401);
    const [missingBody, malformedBody, mismatchBody] = await Promise.all([
      missing.text(),
      malformed.text(),
      mismatch.text(),
    ]);
    expect(missingBody).toBe(malformedBody);
    expect(malformedBody).toBe(mismatchBody);
  });

  it("redeems exactly once in the account transaction, scrubs the transient digest, and keeps failed registration retryable", async () => {
    configureIsolatedBetaEnv();
    vi.resetModules();
    const { client } = await import("./db/client");
    const { issueBetaInvite } = await import("./beta-invites");
    const invite = await issueBetaInvite({
      email: "retry@example.test",
      issuedBy: "test-operator",
    });

    const failed = await signUp({ email: invite.email, token: invite.token, password: "" });
    expect(failed.status).toBe(400);
    expect(
      Number(
        (
          await client.execute(
            "SELECT COUNT(*) AS count FROM beta_invites WHERE redeemed_at IS NOT NULL"
          )
        ).rows[0].count
      )
    ).toBe(0);

    const created = await signUp({ email: invite.email, token: invite.token });
    expect(created.status).toBe(200);
    const payload = (await created.json()) as { user: { id: string } };
    expect(created.headers.get("set-cookie")).toContain("HttpOnly");
    expect(payload.user).not.toHaveProperty("betaInviteClaim");

    const redemption = await client.execute({
      sql: "SELECT redeemed_auth_subject, redeemed_at FROM beta_invites WHERE intended_email = ?",
      args: [invite.email],
    });
    expect(redemption.rows[0]?.redeemed_auth_subject).toBe(payload.user.id);
    expect(redemption.rows[0]?.redeemed_at).toBeTruthy();
    const persistedUser = await client.execute({
      sql: 'SELECT "betaInviteClaim" FROM "user" WHERE id = ?',
      args: [payload.user.id],
    });
    expect(persistedUser.rows[0]?.betaInviteClaim).toBeNull();

    const replay = await signUp({ email: invite.email, token: invite.token });
    expect(replay.status).toBe(401);
  });

  it("does not let concurrent submits, revoked/expired records, or another athlete consume an invite", async () => {
    configureIsolatedBetaEnv();
    vi.resetModules();
    const { client } = await import("./db/client");
    const { digestInviteToken, issueBetaInvite, revokeBetaInvite } = await import("./beta-invites");
    const invite = await issueBetaInvite({
      email: "first@example.test",
      issuedBy: "test-operator",
    });
    const [first, duplicate] = await Promise.all([
      signUp({ email: invite.email, token: invite.token }),
      signUp({ email: invite.email, token: invite.token }),
    ]);
    expect([first.status, duplicate.status].sort()).toEqual([200, 401]);
    expect(
      Number(
        (
          await client.execute({
            sql: 'SELECT COUNT(*) AS count FROM "user" WHERE email = ?',
            args: [invite.email],
          })
        ).rows[0].count
      )
    ).toBe(1);

    const revoked = await issueBetaInvite({
      email: "revoked@example.test",
      issuedBy: "test-operator",
    });
    await revokeBetaInvite(revoked.token);
    const revokedResponse = await signUp({ email: revoked.email, token: revoked.token });
    expect(revokedResponse.status).toBe(401);

    const actualNow = Date.now();
    vi.setSystemTime(new Date(actualNow - 60_000));
    const expired = await issueBetaInvite({
      email: "expired@example.test",
      issuedBy: "test-operator",
      expiresAt: new Date(actualNow - 1_000),
    });
    vi.useRealTimers();
    const expiredResponse = await signUp({ email: expired.email, token: expired.token });
    expect(expiredResponse.status).toBe(401);

    const second = await issueBetaInvite({
      email: "second@example.test",
      issuedBy: "test-operator",
    });
    const crossUser = await signUp({ email: "third@example.test", token: second.token });
    expect(crossUser.status).toBe(401);
    const unredeemed = await client.execute({
      sql: "SELECT redeemed_at FROM beta_invites WHERE token_hash = ?",
      args: [digestInviteToken(second.token)],
    });
    expect(unredeemed.rows[0]?.redeemed_at).toBeNull();
  });
});
