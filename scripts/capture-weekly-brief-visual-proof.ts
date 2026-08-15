/**
 * Captures #35's final route-boundary visual evidence against the isolated E2E
 * database. Run only after the E2E auth setup has written e2e/.auth/owner.json.
 * It deliberately uses the final route, final error boundary, and normal client
 * navigation — no request interception, preview route, or runtime delay.
 */
import { chromium, type Page } from "@playwright/test";
import { createClient } from "@libsql/client";
import path from "node:path";

const baseUrl = process.env.WEEKLY_BRIEF_PROOF_BASE_URL || "http://localhost:3100";
const dbUrl = `file:${path.join(process.cwd(), "data", "e2e.db")}`;
const storageState = "e2e/.auth/owner.json";
const evidence = path.join(process.cwd(), "evidence", "issue-35");

async function authenticateDisposableFixture(): Promise<void> {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/sign-up`);
    await page.getByLabel("Name").fill("Weekly Brief Visual Proof");
    await page.getByLabel("Email").fill("weekly-brief-proof@example.test");
    await page.getByLabel("Password").fill("weekly-brief-proof-password");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByRole("button", { name: "Log out" }).waitFor();
    const session = (await (await page.request.get(`${baseUrl}/api/auth/get-session`)).json()) as {
      user?: { id?: string };
    };
    if (!session.user?.id)
      throw new Error("Could not obtain the disposable visual-proof auth subject.");
    const database = createClient({ url: dbUrl, intMode: "number" });
    try {
      await database.batch(
        [
          { sql: "DELETE FROM users WHERE auth_subject = ?", args: [session.user.id] },
          {
            sql: "UPDATE users SET auth_subject = ? WHERE id = ?",
            args: [session.user.id, "legacy-local-owner"],
          },
        ],
        "write"
      );
    } finally {
      database.close();
    }
    await context.storageState({ path: storageState });
  } finally {
    await context.close();
    await browser.close();
  }
}

async function gotoWeeklyBrief(page: Page) {
  await page.goto(baseUrl);
  await page.getByRole("link", { name: "Weekly brief", exact: true }).click();
}

async function captureLoading(reducedMotion: boolean, output: string): Promise<number> {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    storageState,
    viewport: { width: 390, height: 844 },
    reducedMotion: reducedMotion ? "reduce" : "no-preference",
  });
  const page = await context.newPage();
  const started = performance.now();
  await gotoWeeklyBrief(page);
  const loading = page.getByLabel("Loading weekly brief");
  const loaderVisible = await loading
    .waitFor({ state: "visible", timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  const visibleAtMs = Math.round(performance.now() - started);
  if (loaderVisible) await page.screenshot({ path: path.join(evidence, output), fullPage: false });
  await page.getByRole("heading", { level: 1, name: "Weekly brief" }).waitFor({
    state: "visible",
    timeout: 120_000,
  });
  const completedAtMs = Math.round(performance.now() - started);
  await context.close();
  await browser.close();
  console.log(
    `${output}: loader ${loaderVisible ? `visible at ${visibleAtMs}ms` : `not visible in ${visibleAtMs}ms`}; final route ${completedAtMs}ms.`
  );
  return completedAtMs;
}

async function captureDefaultAndMobile(): Promise<void> {
  const browser = await chromium.launch();
  const desktop = await browser.newContext({
    storageState,
    viewport: { width: 1440, height: 1000 },
  });
  const desktopPage = await desktop.newPage();
  await desktopPage.goto(`${baseUrl}/weekly-brief`);
  await desktopPage.getByRole("region", { name: "Baseline evidence" }).waitFor();
  await desktopPage.screenshot({
    path: path.join(evidence, "35-weekly-brief-default-1440.png"),
    fullPage: false,
  });
  await desktop.close();

  const mobile = await browser.newContext({
    storageState,
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(`${baseUrl}/weekly-brief`);
  const current = mobilePage.getByRole("region", { name: "Current-week evidence" });
  const baseline = mobilePage.getByRole("region", { name: "Baseline evidence" });
  await current.waitFor();
  await mobilePage.screenshot({
    path: path.join(evidence, "35-weekly-brief-default-390.png"),
    fullPage: false,
  });
  await baseline.scrollIntoViewIfNeeded();
  await mobilePage.screenshot({
    path: path.join(evidence, "35-weekly-brief-default-baseline-390.png"),
    fullPage: false,
  });
  await mobile.close();
  await browser.close();
}

async function captureError(): Promise<void> {
  const database = createClient({ url: dbUrl, intMode: "number" });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    storageState,
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  try {
    await database.execute("DROP TABLE activities");
    await page.goto(`${baseUrl}/weekly-brief`);
    await page
      .getByRole("heading", { level: 1, name: "We couldn’t load this weekly brief." })
      .waitFor({
        timeout: 30_000,
      });
    await page.screenshot({
      path: path.join(evidence, "35-weekly-brief-error-390.png"),
      fullPage: false,
    });
    await page.getByRole("button", { name: "Try again" }).focus();
    await page.screenshot({
      path: path.join(evidence, "35-weekly-brief-error-focus-reduced-motion-390.png"),
      fullPage: false,
    });
  } finally {
    await context.close();
    await browser.close();
    database.close();
  }
}

async function main() {
  if (process.argv.includes("--authenticate")) await authenticateDisposableFixture();
  if (process.argv.includes("--loading")) {
    const denseFinalMs = await captureLoading(false, "35-weekly-brief-loading-390.png");
    const denseReducedMotionFinalMs = await captureLoading(
      true,
      "35-weekly-brief-loading-reduced-motion-390.png"
    );
    console.log(
      `Dense final-route durations: normal ${denseFinalMs}ms; reduced motion ${denseReducedMotionFinalMs}ms.`
    );
    return;
  }
  if (process.argv.includes("--normal")) {
    await captureDefaultAndMobile();
    await captureError();
    return;
  }
  throw new Error("Pass --loading or --normal.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
