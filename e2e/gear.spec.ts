import { test, expect } from "@playwright/test";
import path from "node:path";

const EVIDENCE = path.join(process.cwd(), "evidence", "issue-56");

async function addGear(
  page: import("@playwright/test").Page,
  kind: "shoe" | "bike",
  name: string,
  submit: "click" | "enter"
) {
  const label = kind === "shoe" ? "Add shoe" : "Add bike";
  await page.goto(kind === "shoe" ? "/gear" : "/gear?tab=bikes");
  await page.getByRole("button", { name: label }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  const actionRequest = page.waitForRequest(
    (request) => request.method() === "POST" && Boolean(request.headers()["next-action"])
  );
  if (submit === "enter") {
    await dialog.getByLabel("Name").press("Enter");
  } else {
    await dialog.getByRole("button", { name: "Add" }).click();
  }

  await actionRequest;
  await expect(dialog).toBeHidden();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

// Shoes and bikes are created by the baseline migration that the seed runs, so
// they are present regardless of any Strava connection.
test("shoes page shows a seeded baseline shoe", async ({ page }) => {
  await page.goto("/shoes");

  await expect(page.getByRole("heading", { level: 1, name: "Shoes" })).toBeVisible();
  await expect(page.getByText("ASICS Superblast 3")).toBeVisible();
});

test("bikes page shows a seeded baseline bike", async ({ page }) => {
  await page.goto("/bikes");

  await expect(page.getByRole("heading", { level: 1, name: "Bikes" })).toBeVisible();
  await expect(page.getByText("TSW TR10 Speed Bike")).toBeVisible();
});

test("authenticated athlete adds a shoe with click submission through a Server Action", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await addGear(page, "shoe", "Browser click shoe", "click");
  await page.screenshot({ path: path.join(EVIDENCE, "56-gear-success-1440.png"), fullPage: true });
});

test("authenticated athlete adds a shoe with Enter submission through a Server Action", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await addGear(page, "shoe", "Browser Enter shoe", "enter");
  await expect(page.locator("html")).toHaveJSProperty("scrollWidth", 390);
  await page.screenshot({ path: path.join(EVIDENCE, "56-gear-success-390.png"), fullPage: true });
});

test("authenticated athlete adds a bike through its Server Action", async ({ page }) => {
  await addGear(page, "bike", "Browser bike", "click");
});
