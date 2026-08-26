import { test, expect } from "@playwright/test";

// The performance dashboard reads confirmed run summaries. The seed has runs but
// no races, so best efforts and Riegel predictions populate while Critical Speed
// falls back to its "need ≥2 race distances" state.
test("performance dashboard shows best efforts and the CS suggestion state", async ({ page }) => {
  await page.goto("/performance");

  await expect(
    page.getByRole("heading", { level: 1, name: "Patterns, with their evidence attached." })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /calculate|recalculate/i })).toHaveCount(0);
  await expect(page.getByText(/ANTHROPIC_API_KEY/i)).toHaveCount(0);
  await expect(page.getByText("Best efforts by distance")).toBeVisible();
  await expect(page.getByText("Race predictions", { exact: true })).toBeVisible();
  // No seeded races, so the critical-speed estimate shows its empty guidance.
  await expect(
    page.getByText("Mark at least 2 races at different distances to estimate your critical speed.")
  ).toBeVisible();
});

test("Performance period and curve controls preserve each other on desktop and mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/performance?window=6m");
  await page.getByRole("link", { name: "Months", exact: true }).click();
  await expect(page).toHaveURL(/period=months&window=6m/);
  await page.getByRole("link", { name: "1 year", exact: true }).click();
  await expect(page).toHaveURL(/period=months&window=1y/);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("link", { name: "Months", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveJSProperty("scrollWidth", 390);
  await page.getByRole("link", { name: "Weeks", exact: true }).focus();
  await expect(page.getByRole("link", { name: "Weeks", exact: true })).toBeFocused();
});
