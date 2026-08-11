import { test as setup, expect } from "@playwright/test";

const STORAGE_STATE = "e2e/.auth/owner.json";
const PASSWORD = "e2e-test-password";

setup("create and authenticate the E2E athlete", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("E2E Athlete");
  await page.getByLabel("Email").fill("e2e@example.test");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  await page.context().storageState({ path: STORAGE_STATE });
});
