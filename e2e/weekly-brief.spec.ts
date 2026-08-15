import { expect, test } from "@playwright/test";

test("weekly brief renders the completed-week route with source evidence", async ({ page }) => {
  await page.goto("/weekly-brief");
  await expect(page.getByRole("heading", { level: 1, name: "Weekly brief" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Weekly brief" })).toHaveAttribute(
    "aria-current",
    "page"
  );
  await expect(page.getByText(/How this comparison is calculated/)).toBeVisible();
  await expect(page.locator("main")).not.toContainText("fresh");
});
