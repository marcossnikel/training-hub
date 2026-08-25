import { test, expect } from "@playwright/test";

// Home training log, rendered against the seeded isolated DB.
test.describe("training log", () => {
  test("renders the log and lists a seeded confirmed activity", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Your training log, with a little context.",
      })
    ).toBeVisible();
    await expect(page.getByRole("region", { name: "This week" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open this week's brief" })).toHaveAttribute(
      "href",
      "/weekly-brief"
    );

    // A deterministic confirmed seed activity (daysAgo 3, always in an open week).
    await expect(page.getByText("Long Run 28k with 10k @ MP")).toBeVisible();
  });

  test("shows the pending-review banner for the seeded queue", async ({ page }) => {
    await page.goto("/");

    // The seed inserts three pending activities.
    await expect(page.getByText(/3\s+activities waiting for review/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Review now" })).toBeVisible();
  });
});
