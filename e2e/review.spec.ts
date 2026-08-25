import { test, expect } from "@playwright/test";

// The review queue surfaces the seeded pending activities. Pending items are
// ordered oldest-first, so "Evening Spin" (daysAgo 2) is the first card.
test("review queue shows the seeded pending activities", async ({ page }) => {
  await page.goto("/review");

  await expect(
    page.getByRole("heading", { level: 1, name: "Make imported activity yours." })
  ).toBeVisible();
  // Progress counter for the three-item seeded queue.
  await expect(page.getByText("1 of 3")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Evening Spin" })).toBeVisible();
  await expect(
    page.getByText(
      "Confirmed activities are the only ones used for Weekly Brief and Comparable Prior Activity."
    )
  ).toBeVisible();
});
