import { test, expect } from "@playwright/test";
import path from "node:path";

async function captureEvidence(page: import("@playwright/test").Page, name: string) {
  if (process.env.CAPTURE_GEAR_EVIDENCE !== "1") return;
  await page.screenshot({
    path: path.join(process.cwd(), "evidence", "issue-56", name),
    fullPage: true,
  });
}

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
  let actionPosts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"]) actionPosts += 1;
  });
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
  await expect(page.getByText(kind === "shoe" ? "Shoe added" : "Bike added")).toHaveCount(1);
  await page.waitForTimeout(200);
  expect(actionPosts).toBe(1);
}

// Shoes and bikes are created by the baseline migration that the seed runs, so
// they are present regardless of any Strava connection.
test("shoes page shows a seeded baseline shoe", async ({ page }) => {
  await page.goto("/shoes");

  await expect(
    page.getByRole("heading", { level: 1, name: "Know what your gear has carried." })
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Shoes" })).toBeVisible();
  await expect(page.getByText("ASICS Superblast 3")).toBeVisible();
});

test("bikes page shows a seeded baseline bike", async ({ page }) => {
  await page.goto("/bikes");

  await expect(
    page.getByRole("heading", { level: 1, name: "Know what your gear has carried." })
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Bikes" })).toBeVisible();
  await expect(page.getByText("TSW TR10 Speed Bike")).toBeVisible();
});

test("authenticated athlete adds a shoe with click submission through a Server Action", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await addGear(page, "shoe", "Browser click shoe", "click");
  await captureEvidence(page, "56-gear-success-1440.png");
});

test("authenticated athlete adds a shoe with Enter submission through a Server Action", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await addGear(page, "shoe", "Browser Enter shoe", "enter");
  await expect(page.locator("html")).toHaveJSProperty("scrollWidth", 390);
  await captureEvidence(page, "56-gear-success-390.png");
});

test("authenticated athlete adds a bike through its Server Action", async ({ page }) => {
  await addGear(page, "bike", "Browser bike", "click");
});

test("native invalid gear input stays open and never sends a Server Action", async ({ page }) => {
  await page.goto("/gear");
  await page.getByRole("button", { name: "Add shoe" }).click();
  const dialog = page.getByRole("dialog");
  const name = dialog.getByLabel("Name");
  await expect(name).toBeFocused();

  let actionPosts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"]) actionPosts += 1;
  });
  await dialog.getByRole("button", { name: "Add shoe" }).click();
  await expect(dialog).toBeVisible();
  await expect(name).toBeFocused();
  await page.waitForTimeout(200);
  expect(actionPosts).toBe(0);

  await name.fill("Keyboard shoe");
  await name.press("Tab");
  await expect(dialog.getByLabel("Role")).toBeFocused();
  await dialog.getByLabel("Role").press("Tab");
  await expect(dialog.getByLabel("Baseline km")).toBeFocused();
});
