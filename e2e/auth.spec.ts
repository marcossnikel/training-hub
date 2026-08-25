import fs from "node:fs/promises";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { betaSignUpPath } from "./beta-invite";

async function capture(page: import("@playwright/test").Page, name: string) {
  if (process.env.CAPTURE_ISSUE_62_EVIDENCE !== "1") return;
  const evidenceDir = path.join(process.cwd(), "evidence", "issue-62");
  await fs.mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, name), fullPage: false });
}

test.describe("auth", () => {
  const PASSWORD = "e2e-test-password";

  test("/login renders the email/password form", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1, name: "Welcome back." })).toBeVisible();
    await expect(page.getByText("The quiet place to notice patterns.")).toBeVisible();
    await expect(
      page.getByText("Use the email and password for your Training Hub account.")
    ).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(page.locator('a[href="/sign-up"]')).toHaveCount(0);
    await expect(page.locator("header")).toHaveCount(0);
    await expect(page.locator("[data-environment-indicator]")).toHaveCount(0);
    await capture(page, "62-login-default-1440.png");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await expect(page.locator("html")).toHaveJSProperty("scrollWidth", 390);
    await page.getByLabel("Email").focus();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Password")).toBeFocused();
    const duration = await page
      .getByLabel("Password")
      .evaluate((node) => Number.parseFloat(getComputedStyle(node).transitionDuration));
    expect(duration).toBeLessThanOrEqual(0.001);
    await capture(page, "62-login-default-reduced-motion-390.png");
  });

  test("invalid credentials are rejected and set no session", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("nobody@example.test");
    await page.getByLabel("Password").fill("definitely-wrong");
    await page.getByRole("button", { name: "Sign in" }).click();

    const alert = page.locator("#auth-status");
    await expect(alert).toBeVisible();
    await expect(alert).toBeFocused();
    await expect(page.getByLabel("Email")).toHaveValue("nobody@example.test");
    await expect(page.getByLabel("Password")).toHaveValue("definitely-wrong");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
    await expect(page).toHaveURL(/\/login$/);
    const cookies = await page.context().cookies();
    expect(cookies.some((c) => c.name.includes("session_token"))).toBe(false);
    await capture(page, "62-login-error-focus-1440.png");
  });

  test("a guest is redirected before a protected page renders domain data", async ({ page }) => {
    await page.goto("/weekly-brief");

    await expect(page).toHaveURL(/\/login\?next=%2Fweekly-brief$/);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Your training log, with a little context.",
      })
    ).toHaveCount(0);
    await expect(page.getByText("Morning Easy Run")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "This week, in context." })).toHaveCount(0);
  });

  test("sign-up uses the fixed first-auth continuation and sign-in retains safe recovery", async ({
    page,
  }) => {
    await page.goto(await betaSignUpPath("guest@example.test"));
    await page.getByLabel("Name").fill("Guest Athlete");
    await page.getByLabel("Email").fill("guest@example.test");
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Your training log, with a little context.",
      })
    ).toBeVisible();
    await page.goto("/login?next=/settings");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByLabel("Email")).toHaveCount(0);
    await page.goto("/sign-up?invite=not-a-valid-token");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByLabel("Name")).toHaveCount(0);
    await expect(page.locator("[data-environment-indicator]")).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.reload();
    await expect(
      page.locator('[data-app-shell="compact"] [data-environment-indicator]')
    ).toHaveCount(0);
    const session = (await page.context().cookies()).find((c) => c.name.includes("session_token"));
    expect(session?.httpOnly).toBe(true);
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/login?next=/weekly-brief");
    await page.getByLabel("Email").fill("guest@example.test");
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/weekly-brief$/);
    await expect(page.getByRole("heading", { name: "This week, in context." })).toBeVisible();
  });
});
