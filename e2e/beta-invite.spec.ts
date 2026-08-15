import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { expect, test } from "@playwright/test";
import { betaSignUpPath } from "./beta-invite";

async function capture(page: import("@playwright/test").Page, name: string) {
  if (process.env.CAPTURE_BETA_INVITE_EVIDENCE !== "1") return;
  const evidenceDir = path.join(process.cwd(), "evidence", "issue-60");
  await fs.mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, name), fullPage: false });
}

test.describe("private beta registration", () => {
  test("keeps the no-invite boundary accessible at desktop and narrow reduced-motion widths", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/sign-up");
    await expect(page.getByRole("heading", { name: "Private beta" })).toBeVisible();
    await expect(page.getByText("This beta is invitation-only.")).toBeVisible();
    await expect(page.getByLabel("Name")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Create account" })).toHaveCount(0);
    const login = page
      .locator("p")
      .filter({ hasText: "Already have an account?" })
      .getByRole("link");
    await login.focus();
    await expect(login).toBeFocused();
    await capture(page, "60-sign-up-boundary-1440.png");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/sign-up");
    await expect(page.locator("html")).toHaveJSProperty("scrollWidth", 390);
    await expect(login).toBeVisible();
    await capture(page, "60-sign-up-boundary-reduced-motion-390.png");
  });

  test("redeems an invite through keyboard submission and gives a generic recoverable invalid-link error", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const email = `invite-ui-${Date.now()}@example.test`;
    const invitePath = await betaSignUpPath(email);
    const inviteToken = new URL(`http://localhost${invitePath}`).searchParams.get("invite");
    await page.goto(invitePath);
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
    await expect(page).toHaveURL(/\/sign-up$/);
    await page.getByLabel("Name").fill("Invite UI athlete");
    await page.getByLabel("Name").press("Tab");
    await expect(page.getByLabel("Email")).toBeFocused();
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("e2e-test-password");
    await page.getByRole("button", { name: "Create account" }).press("Enter");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "Training log" })).toBeVisible();
    await capture(page, "60-sign-up-success-1440.png");
    const persistedStorage = await page.evaluate(() => ({
      local: Object.entries(localStorage),
      session: Object.entries(sessionStorage),
    }));
    expect(JSON.stringify(persistedStorage)).not.toContain(inviteToken);

    await page.context().clearCookies();
    const invalidToken = crypto.randomBytes(32).toString("base64url");
    await page.goto(`/sign-up?invite=${invalidToken}`);
    await expect(page).toHaveURL(/\/sign-up$/);
    await page.getByLabel("Name").fill("Retry athlete");
    await page.getByLabel("Email").fill("retry-ui@example.test");
    await page.getByLabel("Password").fill("e2e-test-password");

    let resolveRequestStarted!: () => void;
    const requestStarted = new Promise<void>((resolve) => {
      resolveRequestStarted = resolve;
    });
    let resolveResponse!: () => void;
    const releaseResponse = new Promise<void>((resolve) => {
      resolveResponse = resolve;
    });
    await page.route("**/api/auth/sign-up/email", async (route) => {
      resolveRequestStarted();
      await releaseResponse;
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "Registration is unavailable." }),
      });
    });
    await page.getByRole("button", { name: "Create account" }).click();
    await requestStarted;
    await expect(page.getByRole("button", { name: "Working…" })).toBeDisabled();
    await capture(page, "60-sign-up-pending-1440.png");
    resolveResponse();
    await expect(page.locator("#auth-status")).toHaveText(
      "We couldn't create that account. Try another email or sign in."
    );
    await expect(page.getByRole("button", { name: "Create account" })).toBeEnabled();
    await capture(page, "60-sign-up-invalid-retry-1440.png");
  });
});
