import { test as setup, expect } from "@playwright/test";

// Playwright auth setup. With AUTH_PASSWORD / AUTH_SECRET set for the e2e server
// (playwright.config.ts), the proxy now redirects unauthenticated reads to
// /login. This project logs in ONCE and saves the owner session to storageState;
// the read specs (log/performance/gear/review) reuse it via the authenticated
// project. auth.spec.ts deliberately runs unauthenticated in its own project.
//
// The path is kept in sync with STORAGE_STATE in playwright.config.ts.
const STORAGE_STATE = "e2e/.auth/owner.json";
const PASSWORD = "e2e-owner-password";

setup("authenticate as owner", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();

  // loginAction redirects to "/" only after createSession() sets the cookie.
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();

  await page.context().storageState({ path: STORAGE_STATE });
});
