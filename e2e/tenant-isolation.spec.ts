import crypto from "node:crypto";
import path from "node:path";
import { createClient } from "@libsql/client";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const PASSWORD = "e2e-test-password";
const SECRET_SENTINELS = [
  "access-token-sentinel",
  "refresh-token-sentinel",
  "client-secret-sentinel",
  "connection-ciphertext-sentinel",
  "encryption-key-sentinel",
];

type BrowserOwner = {
  authSubject: string;
  ownerId: string;
};

type BRecords = {
  activityId: number;
  photoPath: string;
  shoeId: number;
};

function assertNoSecretMaterial(text: string) {
  for (const sentinel of SECRET_SENTINELS) expect(text).not.toContain(sentinel);
}

async function currentOwner(page: Page): Promise<BrowserOwner> {
  const response = await page.request.get("/api/auth/get-session");
  expect(response.ok()).toBe(true);
  const session = (await response.json()) as { user?: { id?: string } };
  const authSubject = session.user?.id;
  expect(authSubject).toBeTruthy();

  const database = createClient({
    url: `file:${path.join(process.cwd(), "data", "e2e.db")}`,
    intMode: "number",
  });
  try {
    const result = await database.execute({
      sql: "SELECT id FROM users WHERE auth_subject = ?",
      args: [authSubject!],
    });
    const ownerId = result.rows[0]?.id;
    expect(ownerId).toBeTruthy();
    return { authSubject: authSubject!, ownerId: String(ownerId) };
  } finally {
    database.close();
  }
}

async function signUp(
  context: BrowserContext,
  suffix: string
): Promise<{ page: Page; owner: BrowserOwner }> {
  const page = await context.newPage();
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill(`Isolation ${suffix}`);
  await page.getByLabel("Name").press("Tab");
  await expect(page.getByLabel("Email")).toBeFocused();
  await page.getByLabel("Email").fill(`isolation-${suffix}@example.test`);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByLabel("Password").press("Enter");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  return { page, owner: await currentOwner(page) };
}

async function createBRecords(page: Page, owner: BrowserOwner, suffix: string): Promise<BRecords> {
  const shoeName = `B isolation shoe ${suffix}`;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/gear");
  // The compact layout retains both the page action and the section action;
  // either opens the same supported dialog, so use the primary one deterministically.
  await page.getByRole("button", { name: "Add shoe" }).first().click();
  const dialog = page.getByRole("dialog");
  const name = dialog.getByLabel("Name");
  await expect(name).toBeFocused();
  await name.fill(shoeName);
  await name.press("Tab");
  await expect(dialog.getByLabel("Role")).toBeFocused();
  await dialog.getByLabel("Photo").setInputFiles({
    name: "b-isolation.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAF/gL+7Q3vJwAAAABJRU5ErkJggg==",
      "base64"
    ),
  });
  await dialog.getByRole("button", { name: "Add shoe" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(shoeName, { exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveJSProperty("scrollWidth", 390);

  await page.goto("/settings");
  await page.getByLabel("Date", { exact: true }).fill("2026-08-15");
  const manualKm = page.locator("#manual-km");
  await manualKm.fill("12.34");
  await page.locator("#manual-shoe").click();
  await page.getByRole("option", { name: shoeName }).click();
  await page.getByRole("button", { name: "Add entry" }).click();
  await expect(manualKm).toHaveValue("");

  const database = createClient({
    url: `file:${path.join(process.cwd(), "data", "e2e.db")}`,
    intMode: "number",
  });
  try {
    const shoe = await database.execute({
      sql: "SELECT id, photo_path FROM shoes WHERE user_id = ? AND name = ?",
      args: [owner.ownerId, shoeName],
    });
    expect(shoe.rows).toHaveLength(1);
    const shoeId = Number(shoe.rows[0].id);
    const photoPath = String(shoe.rows[0].photo_path);
    expect(photoPath).toMatch(/^gear-/);

    const activity = await database.execute({
      sql: `SELECT id FROM activities
            WHERE user_id = ? AND sport_type = 'Manual' AND started_at = ? AND distance_km = ?
            ORDER BY id DESC LIMIT 1`,
      args: [owner.ownerId, "2026-08-15T12:00:00Z", 12.34],
    });
    expect(activity.rows).toHaveLength(1);
    return { activityId: Number(activity.rows[0].id), photoPath, shoeId };
  } finally {
    database.close();
  }
}

test("two authenticated browser contexts preserve tenant boundaries", async ({ browser, page }) => {
  const suffix = crypto.randomUUID();
  const ownerA = await currentOwner(page);
  const contextB = await browser.newContext();
  const { page: pageB, owner: ownerB } = await signUp(contextB, suffix);

  try {
    expect(ownerA.authSubject).not.toBe(ownerB.authSubject);
    expect(ownerA.ownerId).not.toBe(ownerB.ownerId);
    const b = await createBRecords(pageB, ownerB, suffix);

    // B can read both records it created through the normal UI/route path.
    await pageB.goto(`/activity/${b.activityId}`);
    await expect(pageB.getByText("Manual adjustment", { exact: true })).toBeVisible();
    const bPhoto = await pageB.request.get(`/api/uploads/${encodeURIComponent(b.photoPath)}`);
    expect(bPhoto.status()).toBe(200);

    // A has seeded data, but no B labels, activity, gear-photo content, or IDs.
    await page.goto("/");
    await expect(page.getByText("Long Run 28k with 10k @ MP")).toBeVisible();
    await expect(page.getByText(`B isolation shoe ${suffix}`, { exact: true })).toHaveCount(0);
    const hiddenActivity = await page.goto(`/activity/${b.activityId}`);
    // In Next dev, this streamed App Router notFound boundary reports 200 while
    // rendering an empty main region. The observable security contract is no
    // domain payload, rather than its development-only outer response status.
    expect(hiddenActivity?.status()).toBe(200);
    await expect(page.locator("main")).toBeEmpty();
    assertNoSecretMaterial(await page.content());
    await expect(page.getByText("Manual adjustment", { exact: true })).toHaveCount(0);
    await expect(page.getByText(String(b.activityId), { exact: true })).toHaveCount(0);

    const hiddenPhoto = await page.request.get(`/api/uploads/${encodeURIComponent(b.photoPath)}`);
    expect(hiddenPhoto.status()).toBe(404);
    assertNoSecretMaterial(await hiddenPhoto.text());

    // The browser proof covers guessed reads. This complement proves the supported
    // server-action owner check denies a guessed B shoe before its mutation helper.
    // B's record is then re-read in its own context, unchanged.
    await pageB.goto("/gear");
    await expect(pageB.getByText(`B isolation shoe ${suffix}`, { exact: true })).toBeVisible();
    expect(b.shoeId).toBeGreaterThan(0);

    // Logout removes A's usable session; page/API/OAuth entry points all stop
    // before returning domain data or initiating an external redirect.
    await page.goto("/");
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/gear");
    await expect(page).toHaveURL(/\/login\?next=%2Fgear$/);
    await expect(page.getByText(`B isolation shoe ${suffix}`, { exact: true })).toHaveCount(0);

    const guestUpload = await page.request.get(`/api/uploads/${encodeURIComponent(b.photoPath)}`, {
      maxRedirects: 0,
    });
    expect(guestUpload.status()).toBe(307);
    expect(guestUpload.headers().location).toContain("/login?next=%2Fapi%2Fuploads");
    assertNoSecretMaterial(await guestUpload.text());

    const guestConnect = await page.request.get("/api/strava/connect", { maxRedirects: 0 });
    expect(guestConnect.status()).toBe(307);
    expect(guestConnect.headers().location).toContain("/login?next=%2Fapi%2Fstrava%2Fconnect");
    expect(guestConnect.headers().location).not.toContain("strava.com");

    const guestCallback = await page.request.get(
      "/api/strava/callback?code=ignored&state=ignored",
      {
        maxRedirects: 0,
      }
    );
    expect(guestCallback.status()).toBe(401);
    assertNoSecretMaterial(await guestCallback.text());
  } finally {
    await contextB.close();
  }
});
