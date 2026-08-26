import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnvironmentIndicator } from "@/components/environment-indicator";
import { bootstrapCreator } from "./creator-bootstrap";
import { environmentIndicatorModel } from "./environment-indicator";

const files: string[] = [];
const requestState = vi.hoisted(() => ({ headers: new Headers() }));

vi.mock("next/headers", () => ({
  headers: async () => requestState.headers,
}));

async function signUp(
  auth: typeof import("@/lib/auth").auth,
  createInviteFixture: typeof import("@/lib/test-invite").createInviteFixture,
  email: string
): Promise<string> {
  const invite = await createInviteFixture(email);
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
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("Sign-up did not create a session cookie.");
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

describe("creator environment indicator boundary", () => {
  it("maps every supported runtime exactly and fails closed for unknown values", () => {
    expect(environmentIndicatorModel("local")).toEqual({ label: "LOCAL", tone: "neutral" });
    expect(environmentIndicatorModel("e2e")).toEqual({ label: "E2E", tone: "test" });
    expect(environmentIndicatorModel("preview")).toEqual({ label: "PREVIEW", tone: "info" });
    expect(environmentIndicatorModel("production")).toEqual({
      label: "PRODUCTION",
      tone: "caution",
    });
    expect(environmentIndicatorModel("staging")).toBeNull();
    expect(environmentIndicatorModel(undefined)).toBeNull();
  });

  it("derives a small creator-only model from a real session and serializes no config details", async () => {
    const file = path.join(os.tmpdir(), `training-hub-r5-${process.pid}-${Date.now()}.db`);
    files.push(file);
    vi.stubEnv("DATABASE_URL", `file:${file}`);
    vi.stubEnv("TURSO_DATABASE_URL", "");
    vi.stubEnv("TURSO_AUTH_TOKEN", "");
    vi.stubEnv("TRAINING_HUB_ENV", "e2e");
    vi.stubEnv("TRAINING_HUB_DISPOSABLE_DATA", "1");
    vi.stubEnv("BETA_INVITE_REGISTRATION_ENABLED", "1");
    vi.stubEnv("BETTER_AUTH_SECRET", "r5-environment-test-secret-with-at-least-32-characters");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3100");

    const { ensureMigrated } = await import("@/lib/db/migrations");
    const { client } = await import("@/lib/db/client");
    const { createInviteFixture } = await import("@/lib/test-invite");
    const { auth } = await import("@/lib/auth");
    const { resolveEnvironmentIndicator } = await import("./server");
    await ensureMigrated();

    const creatorCookie = await signUp(auth, createInviteFixture, "creator@example.test");
    requestState.headers = new Headers({ cookie: creatorCookie, "x-role": "creator" });
    expect(await resolveEnvironmentIndicator()).toBeNull();

    await bootstrapCreator(client, { email: "creator@example.test", apply: true });
    const expected = { label: "E2E", tone: "test" } as const;
    expect(await resolveEnvironmentIndicator()).toEqual(expected);
    const markup = renderToStaticMarkup(
      createElement(EnvironmentIndicator, {
        model: expected,
        accessibleName: "Current environment: E2E",
      })
    );
    expect(markup).toContain("ENV · E2E");
    expect(markup).toContain('aria-label="Current environment: E2E"');
    for (const forbidden of [
      "localhost",
      "file:",
      "DATABASE_URL",
      "TRAINING_HUB_ENV",
      "creator",
      "role",
      "auth_subject",
    ]) {
      expect(JSON.stringify(expected)).not.toContain(forbidden);
    }
    for (const forbidden of [
      "localhost",
      "file:",
      "DATABASE_URL",
      "TRAINING_HUB_ENV",
      "creator",
      "auth_subject",
    ]) {
      expect(markup).not.toContain(forbidden);
    }

    const memberCookie = await signUp(auth, createInviteFixture, "member@example.test");
    requestState.headers = new Headers({ cookie: memberCookie, "x-role": "creator" });
    expect(await resolveEnvironmentIndicator()).toBeNull();

    requestState.headers = new Headers({ cookie: creatorCookie });
    const session = await auth.api.getSession({ headers: requestState.headers });
    if (!session)
      throw new Error("Creator session was unexpectedly unavailable before revocation.");
    await client.execute({ sql: 'DELETE FROM "session" WHERE id = ?', args: [session.session.id] });
    expect(await resolveEnvironmentIndicator()).toBeNull();

    requestState.headers = new Headers();
    expect(await resolveEnvironmentIndicator()).toBeNull();
    client.close();
  });
});
