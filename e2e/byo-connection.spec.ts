import fs from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const TEST_SECRET = "byo-secret-must-not-render";

async function captureEvidence(page: Page, name: string) {
  if (process.env.CAPTURE_BYO_CONNECTION_EVIDENCE !== "1") return;
  const evidenceDir = path.join(
    process.cwd(),
    "evidence",
    name.startsWith("32-") ? "issue-32" : name.startsWith("31-") ? "issue-31" : "issue-30"
  );
  await fs.mkdir(evidenceDir, { recursive: true });
  // A viewport capture avoids duplicating the sticky navigation in a stitched
  // full-page image while keeping the decisive credential state inspectable.
  await page.screenshot({ path: path.join(evidenceDir, name), fullPage: false });
}

test.describe.configure({ mode: "serial" });

test("an expired Settings session gives a safe sign-in recovery without preserving the secret", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/settings");
  await page.getByLabel("Strava Client ID").fill("athlete-client-30");
  await page.getByLabel("Strava Client Secret").fill(TEST_SECRET);

  // The server action must treat an expired cookie as unauthenticated even
  // though the Settings form was rendered from an earlier valid session.
  await page.context().clearCookies();
  await page.getByRole("button", { name: "Validate and continue" }).press("Enter");

  const alert = page.getByRole("alert").filter({ hasText: "Your session ended" });
  await expect(alert).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in again" })).toHaveAttribute(
    "href",
    "/login?next=%2Fsettings"
  );
  expect(await page.content()).not.toContain(TEST_SECRET);
  await captureEvidence(page, "30-settings-session-ended-reduced-motion-390.png");
});

test("BYO credential form is owner-bound, keyboard accessible, and gives only a safe handoff", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/settings");
  await expect(page.getByText("Connect your Strava app", { exact: true })).toBeVisible();
  await expect(
    page.getByText("read,activity:read_all,profile:read_all", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("http://localhost:3100/api/strava/callback", { exact: true })
  ).toBeVisible();
  await expect(page.getByLabel("Strava Client ID")).toBeVisible();
  await expect(page.getByLabel("Strava Client ID")).toHaveAttribute("required", "");
  await expect(page.getByLabel("Strava Client ID")).toHaveAttribute("aria-required", "true");
  await expect(page.getByLabel("Strava Client Secret")).toHaveAttribute("type", "password");
  await expect(page.getByLabel("Strava Client Secret")).toHaveAttribute("required", "");
  await expect(page.getByLabel("Strava Client Secret")).toHaveAttribute("aria-required", "true");
  await expect(page.getByText("Set an environment variable", { exact: false })).toHaveCount(0);
  await captureEvidence(page, "30-settings-default-1440.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await captureEvidence(page, "30-settings-default-reduced-motion-390.png");
  await page.getByLabel("Strava Client ID").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Strava Client Secret")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Validate and continue" })).toBeFocused();
  await page.getByLabel("Strava Client ID").fill("  athlete-client-30  ");
  await page.getByLabel("Strava Client Secret").fill("\n");
  await page.getByRole("button", { name: "Validate and continue" }).press("Enter");
  const summary = page
    .locator('[role="alert"]')
    .filter({ hasText: "Check the highlighted fields" });
  await expect(summary).toBeVisible();
  await expect(summary).toBeFocused();
  await expect(page.getByLabel("Strava Client ID")).toHaveValue("athlete-client-30");
  await expect(page.getByLabel("Strava Client Secret")).toHaveValue("");
  await expect(page.getByLabel("Strava Client Secret")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("html")).toHaveJSProperty("scrollWidth", 390);
  await captureEvidence(page, "30-settings-invalid-reduced-motion-390.png");

  await page.getByLabel("Strava Client Secret").fill(TEST_SECRET);
  let actionPosts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"]) actionPosts += 1;
  });
  await page.getByRole("button", { name: "Validate and continue" }).press("Enter");
  await expect(
    page.locator('[role="alert"]').filter({ hasText: "Credentials held securely" })
  ).toBeVisible();
  const handoff = page.getByRole("link", { name: "Continue to Strava" });
  await expect(handoff).toHaveAttribute("href", "/api/strava/byo-connect");
  await expect(page.getByLabel("Strava Client ID")).toHaveCount(0);
  await expect(page.getByLabel("Strava Client Secret")).toHaveCount(0);
  await expect(
    page.getByText("second credential submission is disabled", { exact: false })
  ).toBeVisible();
  expect(actionPosts).toBe(1);
  const rendered = await page.content();
  expect(rendered).not.toContain(TEST_SECRET);
  await captureEvidence(page, "30-settings-pending-reduced-motion-390.png");

  // maxRedirects: 0 proves the generated URL without contacting Strava.
  const authorization = await page.request.get("/api/strava/byo-connect", { maxRedirects: 0 });
  expect(authorization.status()).toBe(307);
  const location = authorization.headers().location;
  expect(location).toBeTruthy();
  expect(location).not.toContain(TEST_SECRET);
  const url = new URL(location!);
  expect(url.origin).toBe("https://www.strava.com");
  expect(url.searchParams.get("client_id")).toBe("athlete-client-30");
  expect(url.searchParams.get("response_type")).toBe("code");
  expect(url.searchParams.get("scope")).toBe("read,activity:read_all,profile:read_all");
  expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3100/api/strava/callback");
  expect(url.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{43}$/);
  for (const key of ["client_secret", "access_token", "refresh_token", "owner", "redirect"]) {
    expect(url.searchParams.has(key)).toBe(false);
  }
});

test("the authenticated callback consumes denial/replay safely and keeps the pending owner connection retryable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const authorization = await page.request.get("/api/strava/byo-connect", { maxRedirects: 0 });
  const state = new URL(authorization.headers().location!).searchParams.get("state");
  expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);

  const denied = await page.request.get(
    `/api/strava/callback?state=${encodeURIComponent(state!)}&error=access_denied`,
    { maxRedirects: 0 }
  );
  expect(denied.headers().location).toBe("http://localhost:3100/settings?strava=scope");
  await page.goto(denied.headers().location!);
  await expect(
    page.getByRole("alert").filter({ hasText: "Strava access wasn’t approved" })
  ).toBeVisible();
  await captureEvidence(page, "31-settings-scope-reduced-motion-390.png");

  const replay = await page.request.get(
    `/api/strava/callback?state=${encodeURIComponent(state!)}&error=access_denied`,
    { maxRedirects: 0 }
  );
  expect(replay.headers().location).toBe("http://localhost:3100/settings?strava=recovery");
  await page.goto(replay.headers().location!);
  await expect(
    page.getByRole("alert").filter({ hasText: "We couldn’t connect Strava" })
  ).toBeVisible();
  expect(await page.content()).not.toContain(TEST_SECRET);
  expect(await page.content()).not.toContain(state!);
  await captureEvidence(page, "31-settings-recovery-reduced-motion-390.png");
});

test("the authenticated callback reaches a real owner-bound mock exchange and initial sync without a Strava request", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const authorization = await page.request.get("/api/strava/byo-connect", { maxRedirects: 0 });
  const state = new URL(authorization.headers().location!).searchParams.get("state");
  expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);

  const callback = await page.request.get(
    `/api/strava/callback?state=${encodeURIComponent(state!)}&code=e2e-authorized-code`,
    { maxRedirects: 0 }
  );
  expect(callback.headers().location).toBe("http://localhost:3100/onboarding/connection");
  await page.goto(callback.headers().location!);
  await expect(
    page.getByRole("heading", { name: "Your imported training has a starting point." })
  ).toBeVisible();
  await captureEvidence(page, "32-recent-training-first-value-1440.png");

  await page.goto("/gear");
  await expect(page.getByText("E2E Nimbus", { exact: true })).toBeVisible();
  await expect(page.getByText("Strava odometer", { exact: true })).toBeVisible();
  await expect(page.getByText("120.0 km", { exact: true })).toBeVisible();
  await page.goto("/gear?tab=bikes");
  await expect(page.getByText("E2E Road", { exact: true })).toBeVisible();
  await expect(page.getByText("2400.0 km", { exact: true })).toBeVisible();

  await page.goto("/");
  await page.getByRole("button", { name: "Sync", exact: true }).click();
  await expect(page.getByText("1 new activity to review", { exact: true })).toBeVisible();
  await page.goto("/review");
  // The seed owns the first three pending cards; the post-import provider
  // activity is newest and therefore follows them in the Review queue.
  for (let index = 0; index < 3; index += 1)
    await page.getByRole("button", { name: "Next activity" }).click();
  await expect(page.getByRole("heading", { name: "E2E new Nimbus run" })).toBeVisible();
  await expect(page.getByText("E2E Nimbus", { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const syncButtons = page.getByRole("button", { name: "Sync", exact: true });
  await expect(syncButtons).toHaveCount(1);
  await expect(syncButtons.first()).toBeVisible();
  await captureEvidence(page, "32-recent-training-first-value-reduced-motion-390.png");
  const rendered = await page.content();
  for (const forbidden of [
    TEST_SECRET,
    state!,
    "e2e-access-token-not-a-secret",
    "e2e-refresh-token-not-a-secret",
    "client_secret_ciphertext",
  ]) {
    expect(rendered).not.toContain(forbidden);
  }
});

test("connected Settings performs confirmed revoke/delete and a failed provider revoke still deletes local data", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/settings");
  await expect(page.getByRole("link", { name: "View recent training" })).toBeVisible();
  const firstTrigger = page.getByRole("button", { name: "Disconnect and delete" });
  await captureEvidence(page, "32-settings-connected-1440.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await firstTrigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();
  await captureEvidence(page, "32-settings-delete-confirmation-reduced-motion-390.png");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(firstTrigger).toBeFocused();

  await firstTrigger.press("Enter");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Disconnect and delete" })
    .press("Enter");
  await expect(
    page.getByRole("alert").filter({ hasText: "Disconnected and local imported data deleted" })
  ).toBeVisible();
  await expect(page).toHaveURL(/\/settings\?strava=deleted$/);
  await captureEvidence(page, "32-settings-local-delete-success-reduced-motion-390.png");
  await page.reload();
  await expect(page.getByLabel("Strava Client ID")).toBeVisible();

  // Establish a second disposable connected fixture whose local provider
  // intentionally returns a deauthorization failure. The local delete must
  // still complete and disclose the only honest recovery path.
  await page.getByLabel("Strava Client ID").fill("athlete-client-32");
  await page.getByLabel("Strava Client Secret").fill("byo-secret-must-not-render");
  await page.getByRole("button", { name: "Validate and continue" }).press("Enter");
  const authorization = await page.request.get("/api/strava/byo-connect", { maxRedirects: 0 });
  const state = new URL(authorization.headers().location!).searchParams.get("state");
  const callback = await page.request.get(
    `/api/strava/callback?state=${encodeURIComponent(state!)}&code=e2e-authorized-code-revocation-failure`,
    { maxRedirects: 0 }
  );
  await page.goto(callback.headers().location!);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Disconnect and delete" }).press("Enter");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Disconnect and delete" })
    .press("Enter");
  const failedRevocation = page
    .getByRole("alert")
    .filter({ hasText: "We couldn’t confirm revocation with Strava" });
  await expect(failedRevocation).toBeVisible();
  await expect(page).toHaveURL(/\/settings\?strava=deleted_provider_unconfirmed$/);
  await captureEvidence(page, "32-settings-provider-revocation-failed-reduced-motion-390.png");
  for (const forbidden of [
    "byo-secret-must-not-render",
    "e2e-revocation-failure-access-token",
    "e2e-revocation-failure-refresh-token",
  ]) {
    expect(await page.content()).not.toContain(forbidden);
  }
});

test("guest BYO handoff is redirected to sign-in and reveals no connection material", async () => {
  // Native fetch has no browser context or cookie jar, so it proves the route
  // boundary independently of Playwright's authenticated project fixture.
  const response = await fetch("http://localhost:3100/api/strava/byo-connect", {
    redirect: "manual",
  });
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toContain("/login?next=%2Fapi%2Fstrava%2Fbyo-connect");
  const body = await response.text();
  expect(body).not.toContain(TEST_SECRET);
  expect(body).not.toContain("client_secret_ciphertext");
});
