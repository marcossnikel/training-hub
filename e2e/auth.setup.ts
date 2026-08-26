import { test as setup, expect } from "@playwright/test";
import path from "node:path";
import { createClient } from "@libsql/client";
import { betaSignUpPath } from "./beta-invite";

const STORAGE_STATE = "e2e/.auth/owner.json";
const PASSWORD = "e2e-test-password";
const FIXTURE_OWNER = "e2e-fixture-owner";

async function captureEnvironmentIndicator(page: import("@playwright/test").Page, name: string) {
  if (process.env.CAPTURE_R5_EVIDENCE !== "1") return;
  const fs = await import("node:fs/promises");
  const evidenceDir = path.join(process.cwd(), "evidence", "R5");
  await fs.mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, name), fullPage: false });
}

setup("create and authenticate the E2E athlete", async ({ page }) => {
  await page.goto(await betaSignUpPath("e2e@example.test"));
  await page.getByLabel("Name").fill("E2E Athlete");
  await page.getByLabel("Email").fill("e2e@example.test");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/onboarding\/welcome$/);
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();

  // The disposable domain seed runs before Better Auth creates this account.
  // Rebind its explicit fixture owner to the just-created auth subject so every
  // read-flow test exercises the same server-derived owner context as production.
  const sessionResponse = await page.request.get("/api/auth/get-session");
  expect(sessionResponse.ok()).toBe(true);
  const session = (await sessionResponse.json()) as { user?: { id?: string } };
  const authSubject = session.user?.id;
  expect(authSubject).toBeTruthy();
  if (!authSubject) throw new Error("E2E sign-up did not return an auth subject.");
  const database = createClient({
    url: `file:${path.join(process.cwd(), "data", "e2e.db")}`,
    intMode: "number",
  });
  try {
    await database.batch(
      [
        {
          sql: `INSERT INTO user_meta (user_id, key, value)
                SELECT ?, key, value FROM user_meta
                WHERE user_id = (SELECT id FROM users WHERE auth_subject = ?)
                ON CONFLICT(user_id, key) DO NOTHING`,
          args: [FIXTURE_OWNER, authSubject],
        },
        { sql: "DELETE FROM users WHERE auth_subject = ?", args: [authSubject] },
        {
          sql: "UPDATE users SET auth_subject = ? WHERE id = ?",
          args: [authSubject, FIXTURE_OWNER],
        },
        {
          sql: "UPDATE users SET role = 'creator' WHERE id = ?",
          args: [FIXTURE_OWNER],
        },
      ],
      "write"
    );
  } finally {
    database.close();
  }
  await page.goto("/", { waitUntil: "commit" });
  await expect(page.locator('[data-environment-indicator="E2E"]')).toHaveCount(2);
  await captureEnvironmentIndicator(page, "R5-root-creator-e2e-1440.png");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await expect(
    page.locator('[data-app-shell="compact"] [data-environment-indicator="E2E"]')
  ).toHaveCount(1);
  await captureEnvironmentIndicator(page, "R5-root-creator-e2e-dark-reduced-motion-390.png");
  await page.context().storageState({ path: STORAGE_STATE });
});
