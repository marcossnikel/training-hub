import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

const DB_PATH = "data/auth-owner-context-test.db";
const requestState = vi.hoisted(() => ({ headers: new Headers() }));

vi.mock("next/headers", () => ({
  headers: async () => requestState.headers,
}));

afterEach(() => {
  vi.unstubAllEnvs();
  globalThis.__trainingHubClient = undefined;
  for (const suffix of ["", "-shm", "-wal", "-journal"]) {
    fs.rmSync(`${DB_PATH}${suffix}`, { force: true });
  }
});

describe("requireCurrentUser", () => {
  it("derives distinct local owners from authenticated sessions, never a request owner field", async () => {
    vi.stubEnv("DATABASE_URL", `file:${DB_PATH}`);
    vi.stubEnv("TURSO_DATABASE_URL", "");
    vi.stubEnv("TURSO_AUTH_TOKEN", "");
    vi.stubEnv("TRAINING_HUB_ENV", "local");
    vi.stubEnv("TRAINING_HUB_DISPOSABLE_DATA", "1");
    vi.stubEnv("BETA_INVITE_REGISTRATION_ENABLED", "1");
    vi.stubEnv("BETTER_AUTH_SECRET", "owner-context-test-secret-with-at-least-32-characters");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3100");
    vi.resetModules();

    const { ensureMigrated } = await import("./db/migrations");
    await ensureMigrated();
    const { issueBetaInvite } = await import("./beta-invites");
    const { auth, requireCurrentUser } = await import("./auth");

    const signUp = async (email: string) => {
      const invite = await issueBetaInvite({ email, issuedBy: "owner-context-test" });
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
      const session = await response.clone().json();
      const cookie = response.headers.get("set-cookie");
      expect(cookie).toBeTruthy();
      return { authSubject: session.user.id as string, cookie: cookie!.split(";")[0] };
    };

    const first = await signUp("first@example.test");
    requestState.headers = new Headers({ cookie: first.cookie, "x-owner-id": "forged-owner" });
    const firstOwner = await requireCurrentUser();

    const second = await signUp("second@example.test");
    requestState.headers = new Headers({
      cookie: second.cookie,
      "x-owner-id": firstOwner?.userId ?? "",
    });
    const secondOwner = await requireCurrentUser();

    expect(firstOwner).toMatchObject({ authSubject: first.authSubject });
    expect(secondOwner).toMatchObject({ authSubject: second.authSubject });
    expect(firstOwner?.userId).not.toBe(secondOwner?.userId);
    expect(firstOwner?.userId).not.toBe("forged-owner");
    expect(secondOwner?.userId).not.toBe(firstOwner?.userId);
  });
});
