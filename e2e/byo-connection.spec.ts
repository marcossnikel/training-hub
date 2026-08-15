import fs from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const TEST_SECRET = "byo-secret-must-not-render";

async function captureEvidence(page: Page, name: string) {
  if (process.env.CAPTURE_BYO_CONNECTION_EVIDENCE !== "1") return;
  const evidenceDir = path.join(process.cwd(), "evidence", "issue-30");
  await fs.mkdir(evidenceDir, { recursive: true });
  // A viewport capture avoids duplicating the sticky navigation in a stitched
  // full-page image while keeping the decisive credential state inspectable.
  await page.screenshot({ path: path.join(evidenceDir, name), fullPage: false });
}

test.describe.configure({ mode: "serial" });

test("BYO credential form is owner-bound, keyboard accessible, and gives only a safe handoff", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/settings");
  await expect(page.getByText("Connect your Strava app", { exact: true })).toBeVisible();
  await expect(page.getByText("activity:read_all,profile:read_all", { exact: true })).toBeVisible();
  await expect(
    page.getByText("http://localhost:3100/api/strava/callback", { exact: true })
  ).toBeVisible();
  await expect(page.getByLabel("Strava Client ID")).toBeVisible();
  await expect(page.getByLabel("Strava Client Secret")).toHaveAttribute("type", "password");
  await expect(page.getByText("Set STRAVA_CLIENT_ID", { exact: false })).toHaveCount(0);
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
  expect(url.searchParams.get("scope")).toBe("activity:read_all,profile:read_all");
  expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3100/api/strava/callback");
  expect(url.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{43}$/);
  for (const key of ["client_secret", "access_token", "refresh_token", "owner", "redirect"]) {
    expect(url.searchParams.has(key)).toBe(false);
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
