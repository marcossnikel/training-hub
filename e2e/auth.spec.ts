import { test, expect } from "@playwright/test";
import { betaSignUpPath } from "./beta-invite";

test.describe("auth", () => {
  const PASSWORD = "e2e-test-password";

  test("/login renders the email/password form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Use your Training Hub account to continue.")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
  });

  test("invalid credentials are rejected and set no session", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("nobody@example.test");
    await page.getByLabel("Password").fill("definitely-wrong");
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    const cookies = await page.context().cookies();
    expect(cookies.some((c) => c.name.includes("session_token"))).toBe(false);
  });

  test("a guest is redirected before a protected page renders domain data", async ({ page }) => {
    await page.goto("/weekly-brief");

    await expect(page).toHaveURL(/\/login\?next=%2Fweekly-brief$/);
    await expect(page.getByRole("heading", { level: 1, name: "Training log" })).toHaveCount(0);
    await expect(page.getByText("Morning Easy Run")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Weekly brief" })).toHaveCount(0);
  });

  test("sign-up creates a session and logout returns to sign-in", async ({ page }) => {
    await page.goto(await betaSignUpPath("guest@example.test"));
    await page.getByLabel("Name").fill("Guest Athlete");
    await page.getByLabel("Email").fill("guest@example.test");
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "Training log" })).toBeVisible();
    const session = (await page.context().cookies()).find((c) => c.name.includes("session_token"));
    expect(session?.httpOnly).toBe(true);
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
