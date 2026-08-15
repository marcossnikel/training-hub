import { test as setup, expect } from "@playwright/test";

// Kept in sync with auth.setup.ts and playwright.config.ts. Tenant isolation
// revokes the first saved session, so read-only projects get a fresh one after
// the serial mutation lane rather than racing that intentional logout.
const STORAGE_STATE = "e2e/.auth/owner.json";
const PASSWORD = "e2e-test-password";

setup("refresh the disposable E2E athlete session", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("e2e@example.test");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  await page.context().storageState({ path: STORAGE_STATE });
});
