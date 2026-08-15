import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@libsql/client";
import { expect, request, test, type Browser, type Page } from "@playwright/test";
import { betaSignUpPath } from "./beta-invite";

const BASE_URL = "http://localhost:3100";

function unique(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function captureEvidence(page: Page, name: string) {
  if (process.env.CAPTURE_GUEST_BOUNDARY_EVIDENCE !== "1") return;
  const evidenceDir = path.join(process.cwd(), "evidence", "issue-58");
  await fs.mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, name), fullPage: false });
}

/**
 * The test intentionally creates unique owner data through real Server Actions.
 * Wait for the resulting owner-scoped rows, rather than assuming that a dismissed
 * dialog means the next server render has observed the SQLite commit. This is a
 * persistence invariant, not a blind retry of the guest-boundary assertion.
 */
async function waitForPersistedOwnerFixture(email: string, shoeName: string): Promise<void> {
  const database = createClient({
    url: `file:${path.join(process.cwd(), "data", "e2e.db")}`,
    intMode: "number",
  });
  try {
    await expect
      .poll(
        async () => {
          const result = await database.execute({
            sql: `SELECT
                    (SELECT COUNT(*)
                     FROM shoes
                     JOIN users ON users.id = shoes.user_id
                     JOIN "user" ON "user".id = users.auth_subject
                     WHERE "user".email = ? AND shoes.name = ?) AS shoe_count,
                    (SELECT COUNT(*)
                     FROM activities
                     JOIN users ON users.id = activities.user_id
                     JOIN "user" ON "user".id = users.auth_subject
                     WHERE "user".email = ?
                       AND activities.sport_type = 'Manual'
                       AND activities.started_at = '2026-08-15T12:00:00Z'
                       AND activities.distance_km = 12.58) AS activity_count`,
            args: [email, shoeName, email],
          });
          const row = result.rows[0];
          return {
            shoeCount: Number(row?.shoe_count),
            activityCount: Number(row?.activity_count),
          };
        },
        {
          message: "owner-only shoe and manual activity should be committed before guest probes",
        }
      )
      .toEqual({ shoeCount: 1, activityCount: 1 });
  } finally {
    database.close();
  }
}

async function signUpAndCreateOwnerOnlyActivity(
  browser: Browser,
  shoeName: string,
  account: string
): Promise<string> {
  const email = `${account}@example.test`;
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  try {
    await page.goto(await betaSignUpPath(email));
    await page.getByLabel("Name").fill(`Guest boundary ${account}`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("e2e-test-password");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.goto("/gear");
    await page.getByRole("button", { name: "Add shoe" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(shoeName);
    await dialog.getByRole("button", { name: "Add shoe" }).click();
    await expect(dialog).toBeHidden();

    await page.goto("/settings");
    await page.getByLabel("Date", { exact: true }).fill("2026-08-15");
    await page.locator("#manual-km").fill("12.58");
    await page.locator("#manual-shoe").press("Enter");
    await page.getByRole("option", { name: shoeName }).click();
    await page.getByRole("button", { name: "Add entry" }).click();
    await expect(page.locator("#manual-km")).toHaveValue("");

    await waitForPersistedOwnerFixture(email, shoeName);

    // Prime an authenticated root/RSC render with this owner-specific value.
    // The subsequent cookie-free probes prove that neither the HTML nor RSC
    // request can reuse it from an intermediary or route cache.
    await page.goto("/");
    await expect(page.getByText(shoeName, { exact: true })).toBeVisible();
    const activityPath = await page.locator('a[href^="/activity/"]').first().getAttribute("href");
    expect(activityPath).toMatch(/^\/activity\/\d+$/);
    return activityPath!;
  } finally {
    await context.close();
  }
}

function assertNoDomainPayload(body: string, sentinels: readonly string[]) {
  for (const sentinel of sentinels) expect(body).not.toContain(sentinel);
  expect(body).not.toContain("Manual adjustment");
  expect(body).not.toContain("Long Run 28k with 10k @ MP");
}

function expectGuestRootCacheControl(value: string | undefined): void {
  // Next 16's development server deliberately overwrites rendered-page cache
  // headers with `no-cache, must-revalidate`; the production server emits the
  // documented private/no-store dynamic response. Keep both environments
  // observable without claiming a dev-only header is production evidence.
  if (process.env.E2E_PRODUCTION === "1") {
    expect(value).toContain("private");
    expect(value).toContain("no-store");
    return;
  }
  expect(value).toBe("no-cache, must-revalidate");
}

test("cookie-free HTTP and RSC requests stop before owner data can stream", async ({ browser }) => {
  const shoeSentinel = unique("private-shoe-58");
  const accountSentinel = unique("private-account-58");
  const activityPath = await signUpAndCreateOwnerOnlyActivity(
    browser,
    shoeSentinel,
    accountSentinel
  );
  const guest = await request.newContext({ baseURL: BASE_URL });

  try {
    const routes = ["/", "/settings", activityPath, "/weekly-brief", `${activityPath}/compare`];
    const requestKinds = [
      { label: "HTML", headers: {} },
      { label: "RSC", headers: { RSC: "1" } },
    ] as const;
    for (const route of routes) {
      for (const requestKind of requestKinds) {
        const response = await guest.get(route, {
          headers: requestKind.headers,
          maxRedirects: 0,
        });
        if (route === "/") {
          expect(response.status(), `${route} ${requestKind.label}`).toBe(200);
          expectGuestRootCacheControl(response.headers()["cache-control"]);
          const body = await response.text();
          expect(body).toContain("Understand the patterns in your own training history.");
          expect(body).not.toContain("speed-insights");
          assertNoDomainPayload(body, [shoeSentinel, accountSentinel]);
          continue;
        }

        expect(response.status(), `${route} ${requestKind.label}`).toBe(307);
        expect(response.headers()["cache-control"]).toBe("private, no-store, max-age=0");
        const location = new URL(response.headers().location ?? "", BASE_URL);
        expect(`${location.pathname}${location.search}`).toBe(
          `/login?next=${encodeURIComponent(route)}`
        );
        assertNoDomainPayload(await response.text(), [shoeSentinel, accountSentinel]);
      }
    }

    // The public callback intentionally does not redirect, but its guest error
    // body must still stop before touching owner data or provider credentials.
    const callback = await guest.get("/api/strava/callback?code=ignored&state=ignored", {
      maxRedirects: 0,
    });
    expect(callback.status()).toBe(401);
    assertNoDomainPayload(await callback.text(), [shoeSentinel, accountSentinel]);
  } finally {
    await guest.dispose();
  }
});

test("guest landing remains separate from protected recovery at desktop and narrow reduced-motion widths", async ({
  browser,
}) => {
  const shoeSentinel = unique("guest-ui-shoe-58");
  const accountSentinel = unique("guest-ui-account-58");
  const activityPath = await signUpAndCreateOwnerOnlyActivity(
    browser,
    shoeSentinel,
    accountSentinel
  );
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  try {
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Understand the patterns in your own training history.",
      })
    ).toBeVisible();
    await expect(page.getByText(shoeSentinel, { exact: true })).toHaveCount(0);
    await captureEvidence(page, "58-guest-landing-1440.png");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${activityPath}/compare`);
    await expect(page).toHaveURL(
      new RegExp(`/login\\?next=${encodeURIComponent(`${activityPath}/compare`)}`)
    );
    await expect(page.getByText(shoeSentinel, { exact: true })).toHaveCount(0);
    await expect(page.locator("html")).toHaveJSProperty("scrollWidth", 390);
    await page.getByLabel("Email").focus();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Password")).toBeFocused();
    await captureEvidence(page, "58-guest-login-reduced-motion-390.png");
  } finally {
    await context.close();
  }
});
