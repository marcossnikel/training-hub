import { expect, test } from "@playwright/test";

test("creator issues, copies, and revokes an invitation without exposing it in the list", async ({
  page,
}) => {
  const email = `creator-ui-${Date.now()}@example.test`;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin/invites");
  await expect(page.getByRole("heading", { name: "Private beta invitations" })).toBeVisible();
  await page.getByLabel("Intended email").fill(email);
  await page.getByRole("button", { name: "Issue invitation" }).click();
  await expect(page.getByRole("heading", { name: "Private invitation ready" })).toBeFocused();
  const message = page.getByLabel("Ready-to-send message");
  await expect(message).toContainText(email);
  const secret = await message.inputValue();
  expect(secret).toContain("sign-up?invite=");
  await expect(page.getByRole("button", { name: "Copy message" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy link only" })).toBeVisible();
  await expect(page.getByText(email, { exact: true }).last()).toBeVisible();
  const issuedRow = page.getByText(email, { exact: true }).last().locator("..").locator("..");
  await expect(issuedRow).not.toContainText(secret);
  await issuedRow.getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Revoke invitation" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("Revoked", { exact: true }).first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await expect(page.locator("html")).toHaveJSProperty("scrollWidth", 390);
});

test("a guest cannot read creator invite management", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await context.clearCookies();
    await page.goto("/admin/invites");
    await expect(page.getByRole("heading", { name: "Private beta invitations" })).toHaveCount(0);
    await expect(page.getByLabel("Intended email")).toHaveCount(0);
  } finally {
    await context.close();
  }
});
