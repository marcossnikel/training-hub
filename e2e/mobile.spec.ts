import { test, expect } from "@playwright/test";

/**
 * Narrow-viewport layout guard. Runs only in the "mobile" project (375px wide).
 *
 * The header packs a logo, six nav links and a four-control right cluster into a
 * single 56px row. That does not fit a phone, so the nav is a horizontal
 * scroller below md. These specs assert the two halves of that contract: the
 * page never scrolls sideways, and the nav is the thing absorbing the overflow.
 */

const ROUTES = ["/", "/performance", "/races", "/gear", "/settings"];

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
  const header = page.locator("header");
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

test("the header stays a single 56px row at 375px", async ({ page }) => {
  await page.goto("/");
  const header = page.locator("header > div");
  await expect(header).toBeVisible();
  // h-14 = 56px. A wrapped nav would push this taller, which is the symptom the
  // desktop-only projects could never see.
  await expect(header).toHaveCSS("height", "56px");
});
