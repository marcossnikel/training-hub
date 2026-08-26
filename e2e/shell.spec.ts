import fs from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

async function capture(page: Page, name: string) {
  if (process.env.CAPTURE_ISSUE_62_EVIDENCE !== "1") return;
  const evidenceDir = path.join(process.cwd(), "evidence", "issue-62");
  await fs.mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, name), fullPage: false });
}

const destinationHrefs = [
  "/",
  "/review",
  "/weekly-brief",
  "/performance",
  "/races",
  "/gear",
  "/settings",
  "/admin/invites",
];

async function tabTo(page: Page, target: ReturnType<Page["locator"]>, maxTabs = 10) {
  for (let attempt = 0; attempt < maxTabs; attempt += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => document.activeElement === element)) return;
  }
  await expect(target).toBeFocused();
}

test("the wide authenticated rail keeps route, account and connection context", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/weekly-brief");

  const shell = page.locator('[data-app-shell="wide"]');
  await expect(shell).toBeVisible();
  await expect(page.locator('[data-app-shell="compact"]')).toBeHidden();
  const links = shell.getByRole("navigation", { name: "Main" }).getByRole("link");
  await expect(links).toHaveCount(destinationHrefs.length);
  for (const [index, href] of destinationHrefs.entries()) {
    await expect(links.nth(index)).toHaveAttribute("href", href);
  }
  await expect(shell.getByRole("link", { name: "Weekly brief" })).toHaveAttribute(
    "aria-current",
    "page"
  );
  await expect(shell.getByText("e2e@example.test")).toBeVisible();
  await expect(shell.getByText("Strava not connected")).toBeVisible();
  await expect(shell.getByRole("button", { name: "Sync" })).toBeDisabled();
  await expect(shell.getByRole("button", { name: "Dark theme" })).toHaveAttribute(
    "aria-pressed",
    /true|false/
  );
  await expect(shell.getByRole("button", { name: "Language: EN" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  const focusTarget = shell.getByRole("link", { name: "Weekly brief" });
  await tabTo(page, focusTarget);
  await expect(focusTarget).toBeFocused();
  const focusStyle = await focusTarget.evaluate((node) => ({
    width: Number.parseFloat(getComputedStyle(node).outlineWidth),
    style: getComputedStyle(node).outlineStyle,
  }));
  expect(focusStyle.style).not.toBe("none");
  expect(focusStyle.width).toBeGreaterThanOrEqual(2);
  await capture(page, "62-authenticated-shell-focus-1440.png");
});

test("the compact shell preserves the same meaning at 390px with reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/settings");

  const shell = page.locator('[data-app-shell="compact"]');
  await expect(shell).toBeVisible();
  const links = shell.getByRole("navigation", { name: "Main" }).getByRole("link");
  await expect(links).toHaveCount(destinationHrefs.length);
  await expect(shell.getByRole("link", { name: "Settings" })).toHaveAttribute(
    "aria-current",
    "page"
  );
  await expect(page.locator("html")).toHaveJSProperty("scrollWidth", 390);

  const nav = shell.getByRole("navigation", { name: "Main" });
  const current = shell.getByRole("link", { name: "Settings" });
  const [navBox, currentBox] = await Promise.all([nav.boundingBox(), current.boundingBox()]);
  expect(navBox).not.toBeNull();
  expect(currentBox).not.toBeNull();
  expect(currentBox!.x).toBeGreaterThanOrEqual(navBox!.x);
  expect(currentBox!.x + currentBox!.width).toBeLessThanOrEqual(navBox!.x + navBox!.width + 1);
  await current.focus();
  await expect(current).toBeFocused();
  const duration = await current.evaluate((node) =>
    Number.parseFloat(getComputedStyle(node).transitionDuration)
  );
  expect(duration).toBeLessThanOrEqual(0.001);
  await capture(page, "62-authenticated-shell-reduced-motion-390.png");
});
