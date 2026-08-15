import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@libsql/client";
import { encryptStravaSecret } from "@/lib/crypto";
import { expect, test, type BrowserContext, type Page, type Request } from "@playwright/test";
import { betaSignUpPath } from "./beta-invite";

const PASSWORD = "e2e-test-password";
const E2E_CONNECTION_ENCRYPTION_KEY = Buffer.alloc(32, 58).toString("base64url");
process.env.STRAVA_CONNECTION_ENCRYPTION_KEY = E2E_CONNECTION_ENCRYPTION_KEY;
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

async function captureEvidence(page: Page, name: string) {
  if (process.env.CAPTURE_TENANT_ISOLATION_EVIDENCE !== "1") return;
  const evidenceDir = path.join(process.cwd(), "evidence", "issue-27");
  await fs.mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, name), fullPage: true });
}

async function tabTo(page: Page, target: ReturnType<Page["locator"]>, maxTabs = 5) {
  for (let attempt = 0; attempt < maxTabs; attempt += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => document.activeElement === element)) return;
  }
  await expect(target).toBeFocused();
}

function assertNoSecretMaterial(text: string, forbidden: readonly string[] = SECRET_SENTINELS) {
  for (const value of forbidden) expect(text).not.toContain(value);
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
  const email = `isolation-${suffix}@example.test`;
  await page.goto(await betaSignUpPath(email));
  await page.getByLabel("Name").fill(`Isolation ${suffix}`);
  await page.getByLabel("Name").press("Tab");
  await expect(page.getByLabel("Email")).toBeFocused();
  await page.getByLabel("Email").fill(email);
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
  const manualDate = page.getByLabel("Date", { exact: true });
  const manualKm = page.locator("#manual-km");
  const manualShoe = page.locator("#manual-shoe");
  const addEntry = page.getByRole("button", { name: "Add entry" });
  await manualDate.fill("2026-08-15");
  // Native date inputs can tab through browser-managed day/month/year segments;
  // stay on the real keyboard path until the next actual form control is focused.
  await tabTo(page, manualKm);
  await expect(manualKm).toBeFocused();
  await manualKm.fill("12.34");
  await tabTo(page, manualShoe);
  await expect(manualShoe).toBeFocused();
  await manualShoe.press("Enter");
  await page.getByRole("option", { name: shoeName }).click();
  await tabTo(page, addEntry);
  await expect(addEntry).toBeFocused();
  await addEntry.press("Enter");
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

async function seedEncryptedConnection(owner: BrowserOwner, suffix: string): Promise<string[]> {
  const plaintext = SECRET_SENTINELS.map((kind) => `${kind}-${suffix}`);
  const [accessToken, refreshToken, clientSecret, ciphertextMarker, keyMarker] = plaintext;
  const clientSecretCiphertext = encryptStravaSecret(owner.ownerId, "client_secret", clientSecret!);
  const accessTokenCiphertext = encryptStravaSecret(owner.ownerId, "access_token", accessToken!);
  const refreshTokenCiphertext = encryptStravaSecret(owner.ownerId, "refresh_token", refreshToken!);
  const database = createClient({
    url: `file:${path.join(process.cwd(), "data", "e2e.db")}`,
    intMode: "number",
  });
  try {
    await database.execute({
      sql: `INSERT INTO strava_connections
              (id, user_id, client_id, client_secret_ciphertext, access_token_ciphertext,
               refresh_token_ciphertext, encryption_key_version, expires_at, status)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, 'connected')`,
      args: [
        crypto.randomUUID(),
        owner.ownerId,
        "e2e-client-id",
        clientSecretCiphertext,
        accessTokenCiphertext,
        refreshTokenCiphertext,
        4_000_000_000,
      ],
    });
  } finally {
    database.close();
  }
  return [
    ...plaintext,
    ciphertextMarker!,
    keyMarker!,
    E2E_CONNECTION_ENCRYPTION_KEY,
    clientSecretCiphertext,
    accessTokenCiphertext,
    refreshTokenCiphertext,
  ];
}

async function captureRetireAction(page: Page): Promise<Request> {
  await page.goto("/gear");
  const requestPromise = page.waitForRequest(
    (request) => request.method() === "POST" && Boolean(request.headers()["next-action"])
  );
  await page.getByRole("button", { name: "Retire" }).click();
  const request = await requestPromise;
  expect(request.postData()).toContain("true");
  return request;
}

async function replayActionAsOwnerA(page: Page, request: Request, forbidden: readonly string[]) {
  const capturedHeaders = request.headers();
  const headers = Object.fromEntries(
    Object.entries(capturedHeaders).filter(([name]) =>
      [
        "accept",
        "content-type",
        "next-action",
        "next-router-state-tree",
        "next-url",
        "origin",
        "referer",
        "rsc",
      ].includes(name)
    )
  );
  const response = await page.request.fetch(request.url(), {
    method: request.method(),
    headers,
    data: request.postDataBuffer()!,
  });
  expect(response.status()).toBe(200);
  const responseBody = await response.text();
  expect(responseBody).toContain("Shoe not found");
  assertNoSecretMaterial(responseBody, forbidden);
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
    const forbiddenTransportValues = await seedEncryptedConnection(ownerB, suffix);

    // B can read both records it created through the normal UI/route path.
    await pageB.goto(`/activity/${b.activityId}`);
    await expect(pageB.getByText("Manual adjustment", { exact: true })).toBeVisible();
    const bPhoto = await pageB.request.get(`/api/uploads/${encodeURIComponent(b.photoPath)}`);
    expect(bPhoto.status()).toBe(200);
    assertNoSecretMaterial(await pageB.content(), forbiddenTransportValues);
    assertNoSecretMaterial(await bPhoto.text(), forbiddenTransportValues);
    await pageB.goto("/settings");
    // The test server has no Strava client ID/secret, so Settings intentionally
    // shows the missing-app setup copy. The enabled header control proves its
    // server-side owner-bound connection read/decryption still succeeded.
    await expect(pageB.getByRole("banner").getByRole("button", { name: "Sync" })).toBeEnabled();
    assertNoSecretMaterial(await pageB.content(), forbiddenTransportValues);
    await captureEvidence(pageB, "27-owner-b-settings-390.png");

    // A has seeded data, but no B labels, activity, gear-photo content, or IDs.
    await page.goto("/");
    await expect(page.getByText("Long Run 28k with 10k @ MP")).toBeVisible();
    await expect(page.getByText(`B isolation shoe ${suffix}`, { exact: true })).toHaveCount(0);
    await page.goto("/gear");
    await expect(page.getByText(`B isolation shoe ${suffix}`, { exact: true })).toHaveCount(0);
    assertNoSecretMaterial(await page.content(), forbiddenTransportValues);
    await captureEvidence(page, "27-owner-a-gear-1440.png");
    const hiddenActivity = await page.goto(`/activity/${b.activityId}`);
    // In Next dev, this streamed App Router notFound boundary reports 200 while
    // rendering an empty main region. The observable security contract is no
    // domain payload, rather than its development-only outer response status.
    expect(hiddenActivity?.status()).toBe(200);
    await expect(page.locator("main")).toBeEmpty();
    assertNoSecretMaterial(await page.content(), forbiddenTransportValues);
    await expect(page.getByText("Manual adjustment", { exact: true })).toHaveCount(0);
    await expect(page.getByText(String(b.activityId), { exact: true })).toHaveCount(0);

    const hiddenPhoto = await page.request.get(`/api/uploads/${encodeURIComponent(b.photoPath)}`);
    expect(hiddenPhoto.status()).toBe(404);
    assertNoSecretMaterial(await hiddenPhoto.text(), forbiddenTransportValues);

    // Capture B's actual Server Action protocol, then replay its exact body and
    // action identifier as A. This is a real authenticated action denial, with no
    // fabricated owner field or application endpoint.
    const retireAction = await captureRetireAction(pageB);
    expect(retireAction.postData()).toContain(String(b.shoeId));
    await replayActionAsOwnerA(page, retireAction, forbiddenTransportValues);
    await pageB.goto("/gear");
    await expect(pageB.getByText(`B isolation shoe ${suffix}`, { exact: true })).toBeVisible();
    await expect(pageB.getByRole("button", { name: "Unretire" })).toBeVisible();

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
    assertNoSecretMaterial(await guestUpload.text(), forbiddenTransportValues);

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
    assertNoSecretMaterial(await guestCallback.text(), forbiddenTransportValues);
  } finally {
    await contextB.close();
  }
});
