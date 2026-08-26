import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { firstAuthContinuation } from "@/features/access/auth-journey";

const files: string[] = [];
const requestState = vi.hoisted(() => ({ headers: new Headers() }));

vi.mock("next/headers", () => ({
  headers: async () => requestState.headers,
  cookies: async () => ({ get: () => undefined }),
}));

function configureDisposableEnvironment(): void {
  const file = path.join(os.tmpdir(), `training-hub-r17-${process.pid}-${Date.now()}.db`);
  files.push(file);
  vi.stubEnv("DATABASE_URL", `file:${file}`);
  vi.stubEnv("TURSO_DATABASE_URL", "");
  vi.stubEnv("TURSO_AUTH_TOKEN", "");
  vi.stubEnv("TRAINING_HUB_ENV", "local");
  vi.stubEnv("TRAINING_HUB_DISPOSABLE_DATA", "1");
  vi.stubEnv("BETA_INVITE_REGISTRATION_ENABLED", "1");
  vi.stubEnv("BETTER_AUTH_SECRET", "r17-welcome-test-secret-at-least-32-characters");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3100");
}

async function signUp(email: string) {
  const { issueBetaInvite } = await import("@/lib/beta-invites");
  const { auth } = await import("@/lib/auth");
  const invite = await issueBetaInvite({ email, issuedBy: "r17-test" });
  const response = await auth.handler(
    new Request("http://localhost:3100/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3100" },
      body: JSON.stringify({
        name: "Welcome athlete",
        email,
        password: "correct-horse-battery-staple",
        inviteToken: invite.token,
      }),
    })
  );
  expect(response.status).toBe(200);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("Expected session cookie.");
  requestState.headers = new Headers({ cookie });
  const { requireCurrentUser } = await import("@/lib/auth");
  const owner = await requireCurrentUser();
  if (!owner) throw new Error("Expected current user.");
  return owner;
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

describe("welcome onboarding", () => {
  it("is versioned, owner-scoped, idempotent, and independent from Strava state", async () => {
    configureDisposableEnvironment();
    const first = await signUp("first@example.test");
    const { finishWelcomeOnboarding, needsWelcomeOnboarding, welcomeMetaValue } =
      await import("./welcome");
    const { getMeta, getStravaConnectionStatus } = await import("@/lib/db");

    expect(firstAuthContinuation()).toBe("/onboarding/welcome");
    expect(await needsWelcomeOnboarding(first)).toBe(true);
    expect(await getStravaConnectionStatus(first)).toBe("disconnected");

    await finishWelcomeOnboarding(first, "skipped");
    await finishWelcomeOnboarding(first, "completed");
    expect(await getMeta(first, "welcome_onboarding_version")).toBe(welcomeMetaValue("skipped"));
    expect(await needsWelcomeOnboarding(first)).toBe(false);
    expect(await getStravaConnectionStatus(first)).toBe("disconnected");

    const second = await signUp("second@example.test");
    expect(second.userId).not.toBe(first.userId);
    expect(await needsWelcomeOnboarding(second)).toBe(true);
    await finishWelcomeOnboarding(second, "completed");
    expect(await getMeta(second, "welcome_onboarding_version")).toBe(welcomeMetaValue("completed"));
    expect(await getMeta(first, "welcome_onboarding_version")).toBe(welcomeMetaValue("skipped"));
  });

  it("redirects guest welcome requests to login and sends dismissed owners back to the app", async () => {
    configureDisposableEnvironment();
    const WelcomePage = (await import("@/app/onboarding/welcome/page")).default;
    await expect(
      WelcomePage({ params: Promise.resolve({}), searchParams: Promise.resolve({}) })
    ).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });

    const owner = await signUp("route@example.test");
    const { finishWelcomeOnboarding } = await import("./welcome");
    await finishWelcomeOnboarding(owner, "completed");
    await expect(
      WelcomePage({ params: Promise.resolve({}), searchParams: Promise.resolve({}) })
    ).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
  });
});
