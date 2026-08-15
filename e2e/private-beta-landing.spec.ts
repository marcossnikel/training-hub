import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { createClient } from "@libsql/client";
import { expect, test, type Page } from "@playwright/test";

const dbUrl = `file:${path.join(process.cwd(), "data", "e2e.db")}`;
const fixtureOwner = "e2e-fixture-owner";

async function captureEvidence(page: Page, name: string) {
  if (process.env.CAPTURE_LANDING_EVIDENCE !== "1") return;
  const evidenceDir = path.join(process.cwd(), "evidence", "issue-40");
  await fs.mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, name), fullPage: true });
}

async function expectStaticReducedMotion(element: ReturnType<Page["locator"]>) {
  const duration = await element.evaluate((node) =>
    Number.parseFloat(getComputedStyle(node).transitionDuration)
  );
  // Tailwind's generated `transition-none` resolves to 1ms in Chromium. That
  // is the browser's static reduced-motion floor, not visible motion.
  expect(duration).toBeLessThanOrEqual(0.001);
}

async function addRootLoadingVolume(name: string): Promise<void> {
  const database = createClient({ url: dbUrl, intMode: "number" });
  try {
    // This is a disposable local volume fixture, not an artificial route delay:
    // the real authenticated root has to resolve and classify this history
    // before replacing its route-level fallback.
    // Keep the fixture below SQLite's bind-variable ceiling for the real
    // activity/split join; this should exercise a legitimate slow render, not
    // manufacture an invalid database shape.
    for (let start = 0; start < 800; start += 200) {
      await database.batch(
        Array.from({ length: 200 }, () => ({
          sql: `INSERT INTO activities
              (user_id, name, sport_type, started_at, distance_km, moving_time_s, status)
              VALUES (?, ?, 'Run', ?, ?, ?, 'confirmed')`,
          args: [fixtureOwner, name, "2026-08-14T12:00:00.000Z", 10, 3_000],
        })),
        "write"
      );
    }
  } finally {
    database.close();
  }
}

async function removeRootLoadingVolume(name: string): Promise<void> {
  const database = createClient({ url: dbUrl, intMode: "number" });
  try {
    await database.execute({ sql: "DELETE FROM activities WHERE name = ?", args: [name] });
  } finally {
    database.close();
  }
}

test("guest root presents the invitation-only evidence contract without a public account path", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");

  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("header")).toBeVisible();
  await expect(page.locator("main")).toBeVisible();
  await expect(page.locator("footer")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Understand the patterns in your own training history."
  );
  await expect(page.getByRole("link", { name: "How beta access works" })).toHaveAttribute(
    "href",
    "#beta-access"
  );
  await expect(page.getByRole("heading", { name: "Evidence before advice" })).toBeVisible();
  await expect(
    page.getByText("Training Hub never falls back to the founder's Strava credentials.")
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Private beta" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "What is Training Hub?" })).toBeVisible();
  await expect(page.locator('a[href^="/sign-up"]')).toHaveCount(0);
  await expect(page.getByRole("link", { name: /waitlist|contact|payment|checkout/i })).toHaveCount(
    0
  );
  await expect(
    page.getByRole("button", { name: /create account|get started|request access/i })
  ).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("Morning Easy Run");
  await captureEvidence(page, "40-landing-default-1440.png");
  await captureEvidence(page, "40-landing-invite-boundary-1440.png");
});

test("guest landing has a complete keyboard path and preserves the invitation explanation on narrow reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await page.keyboard.press("Enter");

  const accessLink = page.getByRole("link", { name: "How beta access works" });
  await accessLink.focus();
  await expect(accessLink).toBeFocused();
  await expectStaticReducedMotion(accessLink);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#beta-access$/);
  await expect(page.locator("#beta-access")).toBeVisible();
  await expect(
    page.getByText("This page does not collect access requests or create accounts.")
  ).toBeVisible();

  const login = page.getByRole("link", { name: "Log in" }).first();
  await login.focus();
  await expect(login).toBeFocused();
  await expectStaticReducedMotion(login);
  await expect(page.locator("html")).toHaveJSProperty("scrollWidth", 390);
  await captureEvidence(page, "40-landing-default-390.png");
});

test("an authenticated athlete keeps the recent-training root and the post-sync location", async ({
  browser,
}) => {
  const context = await browser.newContext({ storageState: "e2e/.auth/owner.json" });
  const page = await context.newPage();
  try {
    await page.goto("/?strava=connected");
    await expect(page.getByRole("heading", { level: 1, name: "Training log" })).toBeVisible();
    await expect(page.getByText("Strava is connected")).toBeVisible();
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Understand the patterns in your own training history.",
      })
    ).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("the root loading shell is a real client-navigation fallback with no activity-like claims", async ({
  browser,
}) => {
  test.setTimeout(60_000);
  const volumeName = `Private beta landing loading volume ${crypto.randomUUID()}`;
  const context = await browser.newContext({ storageState: "e2e/.auth/owner.json" });
  const page = await context.newPage();
  try {
    await addRootLoadingVolume(volumeName);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/settings");
    const rootLink = page.locator("header").getByRole("link", { name: "Training Hub" });
    const loading = page.getByLabel("Loading Training Hub");
    // Register the proof before the click. The real route fallback is brief on
    // a local database, so sequential post-click assertions could miss it
    // after React swaps in the completed route.
    const loadingProof = Promise.all([
      expect(loading).toHaveAttribute("aria-busy", "true"),
      expect(loading.locator('[data-slot="skeleton"]')).toHaveCount(19),
    ]);
    const navigation = rootLink.click({ noWaitAfter: true });
    await loadingProof;
    await expect(loading).not.toContainText("Morning Easy Run");
    await expect(page.locator("html")).toHaveJSProperty("scrollWidth", 390);
    await captureEvidence(page, "40-landing-loading-390.png");
    await navigation;
    await expect(page.getByRole("heading", { level: 1, name: "Training log" })).toBeVisible({
      timeout: 30_000,
    });
  } finally {
    await removeRootLoadingVolume(volumeName);
    await context.close();
  }
});
