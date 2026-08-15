import { test as setup, expect } from "@playwright/test";
import path from "node:path";
import { createClient } from "@libsql/client";

const STORAGE_STATE = "e2e/.auth/owner.json";
const PASSWORD = "e2e-test-password";
const FIXTURE_OWNER = "e2e-fixture-owner";

setup("create and authenticate the E2E athlete", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("E2E Athlete");
  await page.getByLabel("Email").fill("e2e@example.test");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();

  // The disposable domain seed runs before Better Auth creates this account.
  // Rebind its explicit fixture owner to the just-created auth subject so every
  // read-flow test exercises the same server-derived owner context as production.
  const sessionResponse = await page.request.get("/api/auth/get-session");
  expect(sessionResponse.ok()).toBe(true);
  const session = (await sessionResponse.json()) as { user?: { id?: string } };
  const authSubject = session.user?.id;
  expect(authSubject).toBeTruthy();
  const database = createClient({
    url: `file:${path.join(process.cwd(), "data", "e2e.db")}`,
    intMode: "number",
  });
  try {
    await database.batch(
      [
        { sql: "DELETE FROM users WHERE auth_subject = ?", args: [authSubject!] },
        {
          sql: "UPDATE users SET auth_subject = ? WHERE id = ?",
          args: [authSubject!, FIXTURE_OWNER],
        },
      ],
      "write"
    );
  } finally {
    database.close();
  }
  await page.context().storageState({ path: STORAGE_STATE });
});
