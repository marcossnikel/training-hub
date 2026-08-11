import { expect, test } from "@playwright/test";

test("seeded activity detail has no retired coach controls or focus stops", async ({ page }) => {
  await page.goto("/");
  const activity = page.locator('a[href^="/activity/"]').first();
  await expect(activity).toBeVisible();
  await activity.click();

  await expect(page.getByRole("heading", { level: 1, name: /.+/ })).toBeVisible();
  await expect(page.getByText("AI coach", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /send|attach image|generate insight|clear/i })
  ).toHaveCount(0);
  await expect(page.getByText(/ANTHROPIC_API_KEY/i)).toHaveCount(0);
});

test("activity and performance retain a non-overflowing 390px layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const route of ["/activity/1", "/performance"]) {
    await page.goto(route);
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  }
});
