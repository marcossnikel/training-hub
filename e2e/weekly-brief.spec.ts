import { expect, test } from "@playwright/test";

test("weekly brief renders the completed-week route with source evidence", async ({ page }) => {
  await page.goto("/weekly-brief");
  await expect(page.getByRole("heading", { level: 1, name: "Weekly brief" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Weekly brief" })).toHaveAttribute(
    "aria-current",
    "page"
  );
  await expect(page.getByText(/How this comparison is calculated/)).toBeVisible();
  const currentEvidence = page.getByRole("region", { name: "Current-week evidence" });
  const baselineEvidence = page.getByRole("region", { name: "Baseline evidence" });
  await expect(currentEvidence).toBeVisible();
  await expect(baselineEvidence).toBeVisible();
  await expect(page.locator("main")).not.toContainText("fresh");
  const source = currentEvidence.getByRole("link", { name: /^Open .+ activity$/ }).first();
  await expect(source).toBeVisible();
  await source.click();
  await expect(page).toHaveURL(/\/activity\/\d+$/);
  await expect(page.getByRole("main")).toBeVisible();
});
