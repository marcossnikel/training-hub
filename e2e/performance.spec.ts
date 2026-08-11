import { test, expect } from "@playwright/test";

// The performance dashboard reads confirmed run summaries. The seed has runs but
// no races, so best efforts and Riegel predictions populate while Critical Speed
// falls back to its "need ≥2 race distances" state.
test("performance dashboard shows best efforts and the CS suggestion state", async ({ page }) => {
  await page.goto("/performance");

  await expect(page.getByRole("heading", { level: 1, name: "Performance" })).toBeVisible();
  await expect(page.getByRole("button", { name: /calculate|recalculate/i })).toHaveCount(0);
  await expect(page.getByText(/ANTHROPIC_API_KEY/i)).toHaveCount(0);
  await expect(page.getByText("Best efforts by distance")).toBeVisible();
  await expect(page.getByText("Race predictions", { exact: true })).toBeVisible();
  // No seeded races, so the critical-speed estimate shows its empty guidance.
  await expect(
    page.getByText("Mark at least 2 races at different distances to estimate your critical speed.")
  ).toBeVisible();
});
