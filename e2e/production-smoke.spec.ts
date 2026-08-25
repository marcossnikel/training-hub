import { expect, test, type Page } from "@playwright/test";

function captureBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  return errors;
}

test("production build serves the guest landing and login without browser errors", async ({
  page,
}) => {
  const errors = captureBrowserErrors(page);

  const landingResponse = await page.goto("/");
  expect(landingResponse?.ok()).toBe(true);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "See the part of your training history you cannot see alone.",
    })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Invitation-only access" })).toBeVisible();

  const loginResponse = await page.goto("/login");
  expect(loginResponse?.ok()).toBe(true);
  await expect(page.getByRole("heading", { level: 1, name: "Welcome back." })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();

  expect(errors).toEqual([]);
});
