import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { expect, test } from "@playwright/test";
import { betaSignUpPath } from "./beta-invite";

async function capture(page: import("@playwright/test").Page, name: string) {
  const issue62 = process.env.CAPTURE_ISSUE_62_EVIDENCE === "1";
  if (!issue62 && process.env.CAPTURE_BETA_INVITE_EVIDENCE !== "1") return;
  const evidenceDir = path.join(process.cwd(), "evidence", issue62 ? "issue-62" : "issue-60");
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
    const login = page.getByRole("link", { name: "Sign in instead" });
    await login.focus();
    await expect(login).toBeFocused();
    await capture(page, "62-sign-up-boundary-1440.png");

    await page.goto("/sign-up?invite=malformed");
    await expect(page).toHaveURL(/\/sign-up$/);
    await expect(page.getByRole("heading", { name: "Private beta" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("malformed");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/sign-up");
    await expect(page.locator("html")).toHaveJSProperty("scrollWidth", 390);
    await expect(login).toBeVisible();
    await capture(page, "62-sign-up-boundary-reduced-motion-390.png");
  });

  test("redeems an invite through keyboard submission and gives a generic recoverable invalid-link error", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const email = `invite-ui-${Date.now()}@example.test`;
    const invitePath = await betaSignUpPath(email);
    const inviteToken = new URL(`http://localhost${invitePath}`).searchParams.get("invite");
    await page.goto(invitePath);
    await expect(
      page.getByRole("heading", { name: "Create your private beta account." })
    ).toBeVisible();
    await expect(page).toHaveURL(/\/sign-up$/);
    await expect(page.getByText("Private invitation ready")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(inviteToken!);
    await capture(page, "62-sign-up-invited-default-1440.png");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator("html")).toHaveJSProperty("scrollWidth", 390);
    await capture(page, "62-sign-up-invited-reduced-motion-390.png");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.getByLabel("Name").fill("Invite UI athlete");
    await page.getByLabel("Name").press("Tab");
    await expect(page.getByLabel("Email")).toBeFocused();
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("e2e-test-password");
    await page.getByRole("button", { name: "Create account" }).press("Enter");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "Training log" })).toBeVisible();
    await capture(page, "62-sign-up-success-shell-1440.png");
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
    let requestCount = 0;
    await page.route("**/api/auth/sign-up/email", async (route) => {
      requestCount += 1;
      resolveRequestStarted();
      await releaseResponse;
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "Registration is unavailable." }),
      });
    });
    await page.locator("form").evaluate((form: HTMLFormElement) => {
      form.requestSubmit();
      form.requestSubmit();
    });
    await requestStarted;
    await expect(page.getByRole("button", { name: "Creating account…" })).toBeDisabled();
    await capture(page, "62-sign-up-pending-1440.png");
    resolveResponse();
    const alert = page.locator("#auth-status");
    await expect(alert).toHaveText(
      "We couldn't create that account. Try another email or sign in."
    );
    await expect(alert).toBeFocused();
    await expect(page.getByLabel("Email")).toHaveValue("retry-ui@example.test");
    await expect(page.getByLabel("Password")).toHaveValue("e2e-test-password");
    await expect(page.getByRole("button", { name: "Create account" })).toBeEnabled();
    await expect.poll(() => requestCount).toBe(1);
    await capture(page, "62-sign-up-invalid-retry-1440.png");
  });
});
