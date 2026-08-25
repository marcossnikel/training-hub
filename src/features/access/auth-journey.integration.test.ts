import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { firstAuthContinuation, signInContinuation } from "./auth-journey";

const files: string[] = [];
const requestState = vi.hoisted(() => ({ headers: new Headers() }));

vi.mock("next/headers", () => ({
  headers: async () => requestState.headers,
  cookies: async () => ({ get: () => undefined }),
}));

function configureDisposableEnvironment(label: string): string {
  const file = path.join(
    os.tmpdir(),
    `training-hub-r8-${label}-${process.pid}-${Date.now()}-${files.length}.db`
  );
  files.push(file);
  vi.stubEnv("DATABASE_URL", `file:${file}`);
  vi.stubEnv("TURSO_DATABASE_URL", "");
  vi.stubEnv("TURSO_AUTH_TOKEN", "");
  vi.stubEnv("TRAINING_HUB_ENV", "local");
  vi.stubEnv("TRAINING_HUB_DISPOSABLE_DATA", "1");
  vi.stubEnv("BETA_INVITE_REGISTRATION_ENABLED", "1");
  vi.stubEnv("BETTER_AUTH_SECRET", "r8-auth-journey-test-secret-at-least-32-characters");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3100");
  return file;
}

async function redeemInvite(
  auth: typeof import("@/lib/auth").auth,
  token: string,
  email: string
): Promise<Response> {
  return auth.handler(
    new Request("http://localhost:3100/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3100" },
      body: JSON.stringify({
        name: "Invited athlete",
        email,
        password: "correct-horse-battery-staple",
        inviteToken: token,
      }),
    })
  );
}

function sessionCookie(response: Response): string {
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("Expected Better Auth to set a session cookie.");
  return cookie;
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

describe("auth journey", () => {
  it("keeps only safe protected-route recovery for sign-in and has one fixed first-auth seam", () => {
    expect(signInContinuation("/weekly-brief?range=28#evidence")).toBe(
      "/weekly-brief?range=28#evidence"
    );
    for (const hostileDestination of [
      "https://attacker.example",
      "//attacker.example",
      "/\\attacker.example",
      "javascript:alert(1)",
      undefined,
      ["/weekly-brief"],
    ]) {
      expect(signInContinuation(hostileDestination)).toBe("/");
    }
    expect(firstAuthContinuation()).toBe("/");
  });

  it("redeems an invite once, ignores signup next input, and leaves generic failures retry-safe", async () => {
    configureDisposableEnvironment("signup");
    const { client } = await import("@/lib/db/client");
    const { issueBetaInvite } = await import("@/lib/beta-invites");
    const { auth } = await import("@/lib/auth");
    const invite = await issueBetaInvite({ email: "athlete@example.test", issuedBy: "r8-test" });

    const [first, replay] = await Promise.all([
      redeemInvite(auth, invite.token, invite.email),
      redeemInvite(auth, invite.token, invite.email),
    ]);
    expect([first.status, replay.status].sort()).toEqual([200, 401]);
    expect(firstAuthContinuation()).toBe("/");
    const redeemed = await client.execute({
      sql: "SELECT redeemed_at FROM beta_invites WHERE intended_email = ?",
      args: [invite.email],
    });
    expect(redeemed.rows[0]?.redeemed_at).toBeTruthy();

    const invalid = await redeemInvite(auth, "not-an-opaque-token", "other@example.test");
    expect(invalid.status).toBe(401);
    expect(await invalid.text()).toContain("Registration is unavailable.");
    client.close();
  });

  it("redirects authenticated auth-entry requests, preserves guest recovery, and observes revocation", async () => {
    configureDisposableEnvironment("session");
    const { client } = await import("@/lib/db/client");
    const { issueBetaInvite } = await import("@/lib/beta-invites");
    const { auth, requireCurrentUser } = await import("@/lib/auth");
    const invite = await issueBetaInvite({ email: "session@example.test", issuedBy: "r8-test" });
    const response = await redeemInvite(auth, invite.token, invite.email);
    expect(response.status).toBe(200);
    requestState.headers = new Headers({ cookie: sessionCookie(response) });

    const LoginPage = (await import("@/app/login/page")).default;
    const SignUpPage = (await import("@/app/sign-up/page")).default;
    await expect(
      LoginPage({
        params: Promise.resolve({}),
        searchParams: Promise.resolve({ next: "/settings" }),
      })
    ).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT") });
    await expect(
      SignUpPage({
        searchParams: Promise.resolve({ invite: "a".repeat(43) }),
      })
    ).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT") });

    const session = await auth.api.getSession({ headers: requestState.headers });
    expect(session).toBeTruthy();
    if (!session) throw new Error("Authenticated session unexpectedly disappeared.");
    await client.execute({ sql: 'DELETE FROM "session" WHERE id = ?', args: [session.session.id] });
    expect(await requireCurrentUser()).toBeNull();

    const { proxy } = await import("@/proxy");
    const recovery = await proxy(new NextRequest("http://localhost:3100/weekly-brief?range=28"));
    expect(recovery.headers.get("location")).toBe(
      "http://localhost:3100/login?next=%2Fweekly-brief%3Frange%3D28"
    );
    client.close();
  });
});
