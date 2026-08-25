import { test, expect } from "@playwright/test";

/**
 * Narrow-viewport layout guard. Runs only in the "mobile" project (375px wide).
 *
 * The compact shell keeps account/connection context and utilities above a
 * horizontal destination rail. These specs assert that the document never
 * scrolls sideways and that the rail—not the page—absorbs navigation overflow.
 */

const ROUTES = ["/", "/review", "/weekly-brief", "/performance", "/races", "/gear", "/settings"];

for (const route of ROUTES) {
  test(`${route} does not overflow horizontally at 375px`, async ({ page }) => {
    await page.goto(route);
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return {
        docScroll: doc.scrollWidth,
        docClient: doc.clientWidth,
        bodyScroll: document.body.scrollWidth,
      };
    });

    // A sideways scrollbar on the document is the failure this project exists to
    // catch; allow 1px for sub-pixel rounding.
    expect(overflow.docScroll).toBeLessThanOrEqual(overflow.docClient + 1);
    expect(overflow.bodyScroll).toBeLessThanOrEqual(overflow.docClient + 1);
  });
}

test("the header nav absorbs its own overflow instead of widening the page", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav).toBeVisible();

  const box = await nav.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    overflowX: getComputedStyle(el).overflowX,
  }));

  // The nav is the scroll container...
  expect(box.overflowX).toBe("auto");
  // ...and it really is scrolling, which proves the links are still all present
  // rather than having been dropped or wrapped to a second line.
  expect(box.scrollWidth).toBeGreaterThan(box.clientWidth);

  // The header row itself must not overflow — the nav clips instead.
  const header = page.locator('header[data-app-shell="compact"]');
  const headerBox = await header.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(headerBox.scrollWidth).toBeLessThanOrEqual(headerBox.clientWidth + 1);
});

test("the icon-only sync button keeps its accessible name at 375px", async ({ page }) => {
  await page.goto("/");
  // Below sm the label is sr-only, not hidden, so the button is icon-only to the
  // eye but still named to a screen reader. That is what makes it safe for the
  // button to carry no aria-label (an aria-label saying "Sync" while the visible
  // text says "Syncing" would contradict it — WCAG 2.5.3).
  const sync = page.getByRole("button", { name: "Sync", exact: true });
  await expect(sync).toBeVisible();
  // The label must not be taking up layout width at this viewport.
  const labelWidth = await sync.locator("span").evaluate((el) => el.getBoundingClientRect().width);
  expect(labelWidth).toBeLessThan(2);
});

test("the compact shell preserves destination order, current location and account context", async ({
  page,
}) => {
  await page.goto("/");
  const shell = page.locator('[data-app-shell="compact"]');
  await expect(shell).toBeVisible();
  await expect(page.locator('[data-app-shell="wide"]')).toBeHidden();

  const links = shell.getByRole("navigation", { name: "Main" }).getByRole("link");
  await expect(links).toHaveCount(7);
  await expect(links).toHaveText([
    "Training log",
    /Review/,
    "Weekly brief",
    "Performance",
    "Races",
    "Gear",
    "Settings",
  ]);
  await expect(links.nth(0)).toHaveAttribute("href", "/");
  await expect(links.nth(0)).toHaveAttribute("aria-current", "page");
  await expect(shell.getByText("e2e@example.test")).toBeVisible();
  await expect(shell.getByText("Strava not connected")).toBeVisible();
  await expect(shell.getByRole("button", { name: "Dark theme" })).toHaveAttribute(
    "aria-pressed",
    /true|false/
  );
  await expect(shell.getByRole("group", { name: "Language" })).toBeVisible();

  for (const name of ["Sync", "Dark theme", "Log out"]) {
    const box = await shell.getByRole("button", { name, exact: true }).boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(40);
    expect(box?.height).toBeGreaterThanOrEqual(40);
  }
});
