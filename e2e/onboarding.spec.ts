import { expect, test } from "@playwright/test";
import { betaSignUpPath } from "./beta-invite";

test("welcome onboarding is skippable, keyboard-accessible, and does not replay", async ({
  page,
}) => {
  await page.context().clearCookies();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(await betaSignUpPath("onboarding@example.test"));
  await page.getByLabel("Name").fill("Onboarding athlete");
  await page.getByLabel("Email").fill("onboarding@example.test");
  await page.getByLabel("Password").fill("e2e-test-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding\/welcome$/);
  await expect(
    page.getByRole("heading", {
      name: "Keep the sessions that explain your training close together.",
    })
  ).toBeVisible();
  await expect(page.getByRole("heading")).toBeFocused();
  await page.getByRole("link", { name: "Continue" }).click();
  await expect(page).toHaveURL(/step=2$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/onboarding\/welcome$/);
  await page.getByRole("button", { name: "Skip" }).press("Enter");
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/onboarding/welcome");
  await expect(page).toHaveURL(/\/$/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveJSProperty("scrollWidth", 390);
});

test("Connect Strava hands off to Settings with an internal continuation key", async ({ page }) => {
  const email = `onboarding-connect-${Date.now()}@example.test`;
  await page.context().clearCookies();
  await page.goto(await betaSignUpPath(email));
  await page.getByLabel("Name").fill("Connect onboarding athlete");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("e2e-test-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding\/welcome$/);
  await page.goto("/onboarding/welcome?step=4");
  await page.getByRole("button", { name: "Connect Strava" }).click();
  await expect(page).toHaveURL(/\/settings\?onboarding=welcome$/);
  await expect(page.getByLabel("Strava Client ID")).toBeVisible();
  await expect(page.locator('input[name="returnKey"]')).toHaveValue("onboarding");
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
});
