import crypto from "node:crypto";
import path from "node:path";
import { createClient } from "@libsql/client";
import { expect, test, type Page } from "@playwright/test";

const dbUrl = `file:${path.join(process.cwd(), "data", "e2e.db")}`;
const ownerId = "legacy-local-owner";

type ComparableFixture = { sourceId: number; priorId: number; pendingId: number };
const fixtureActivityIds = new Set<number>();

// This one spec writes disposable route fixtures into the same SQLite file as
// its browser reads. Keep those writes serial so a proof failure cannot be
// mistaken for the product's owner-scoped behavior.
test.describe.configure({ mode: "serial" });

async function retryLocked<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!(error instanceof Error) || !error.message.includes("SQLITE_BUSY") || attempt === 7) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 75 * (attempt + 1)));
    }
  }
  throw lastError;
}

function isoBefore(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

async function addFixture(): Promise<ComparableFixture> {
  const suffix = crypto.randomUUID();
  const db = createClient({ url: dbUrl, intMode: "number" });
  try {
    const rows = await retryLocked(() =>
      db.batch(
        [
          {
            sql: `INSERT INTO activities
                (user_id, name, sport_type, started_at, distance_km, moving_time_s, status)
                VALUES (?, ?, 'Run', ?, ?, ?, 'confirmed')`,
            args: [ownerId, `Comparable source ${suffix}`, isoBefore(1), 10, 3_000],
          },
          {
            sql: `INSERT INTO activities
                (user_id, name, sport_type, started_at, distance_km, moving_time_s, status)
                VALUES (?, ?, 'TrailRun', ?, ?, ?, 'confirmed')`,
            args: [ownerId, `Comparable prior ${suffix}`, isoBefore(3), 10, 3_000],
          },
          {
            sql: `INSERT INTO activities
                (user_id, name, sport_type, started_at, distance_km, moving_time_s, status)
                VALUES (?, ?, 'Run', ?, ?, ?, 'pending_review')`,
            args: [ownerId, `Comparable pending ${suffix}`, isoBefore(2), 10, 3_000],
          },
        ],
        "write"
      )
    );
    const fixture = {
      sourceId: Number(rows[0]?.lastInsertRowid),
      priorId: Number(rows[1]?.lastInsertRowid),
      pendingId: Number(rows[2]?.lastInsertRowid),
    };
    fixtureActivityIds.add(fixture.sourceId);
    fixtureActivityIds.add(fixture.priorId);
    fixtureActivityIds.add(fixture.pendingId);
    return fixture;
  } finally {
    db.close();
  }
}

test.afterEach(async () => {
  if (fixtureActivityIds.size === 0) return;
  const db = createClient({ url: dbUrl, intMode: "number" });
  try {
    await retryLocked(() =>
      db.batch(
        [...fixtureActivityIds].map((id) => ({
          sql: "DELETE FROM activities WHERE id = ?",
          args: [id],
        })),
        "write"
      )
    );
  } finally {
    db.close();
    fixtureActivityIds.clear();
  }
});

async function capture(page: Page, name: string) {
  if (process.env.CAPTURE_COMPARABLE_ACTIVITY_EVIDENCE !== "1") return;
  await page.screenshot({
    path: path.join(process.cwd(), "evidence", "issue-37", name),
    fullPage: true,
  });
}

test("a confirmed source enters one evidence-linked comparable prior activity", async ({
  page,
}) => {
  const fixture = await addFixture();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/activity/${fixture.sourceId}`);
  const entry = page.getByRole("link", { name: "Compare with a prior activity" });
  await expect(entry).toBeVisible();
  await entry.focus();
  await expect(entry).toBeFocused();
  await entry.press("Enter");

  await expect(page).toHaveURL(`/activity/${fixture.sourceId}/compare`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Comparable prior activity" })
  ).toBeVisible();
  const source = page.getByRole("link", { name: `Open current activity #${fixture.sourceId}` });
  const prior = page.getByRole("link", { name: `Open prior activity #${fixture.priorId}` });
  await expect(source).toHaveAttribute("href", `/activity/${fixture.sourceId}`);
  await expect(prior).toHaveAttribute("href", `/activity/${fixture.priorId}`);
  await expect(page.getByText(/^This match uses confirmed activity summaries:/)).toBeVisible();
  await capture(page, "37-comparable-prior-activity-reliable-1440.png");

  source.focus();
  await expect(source).toBeFocused();
  prior.focus();
  await expect(prior).toBeFocused();
  const method = page.getByText("How matching works");
  await method.focus();
  await expect(method).toBeFocused();
  await method.press("Space");
  await expect(page.getByText("Candidates are confirmed prior activities")).toBeVisible();
  await capture(page, "37-comparable-prior-activity-focus-press-1440.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("html")).toHaveJSProperty("scrollWidth", 390);
  await capture(page, "37-comparable-prior-activity-reliable-390.png");
});

test("the no-match result is exact and an unavailable source never renders a comparison card", async ({
  page,
}) => {
  const fixture = await addFixture();
  const db = createClient({ url: dbUrl, intMode: "number" });
  let noMatchId = 0;
  try {
    const row = await retryLocked(() =>
      db.execute({
        sql: `INSERT INTO activities
            (user_id, name, sport_type, started_at, distance_km, moving_time_s, status)
            VALUES (?, ?, 'Ride', ?, ?, ?, 'confirmed')`,
        args: [ownerId, `Comparable no match ${crypto.randomUUID()}`, isoBefore(1), 80, 10_000],
      })
    );
    noMatchId = Number(row.lastInsertRowid);
    fixtureActivityIds.add(noMatchId);
  } finally {
    db.close();
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/activity/${noMatchId}/compare`);
  await expect(
    page.getByRole("heading", { level: 1, name: "No reliable prior match" })
  ).toBeVisible();
  await expect(
    page.getByText("There isn’t a prior activity that meets the current comparison criteria.")
  ).toBeVisible();
  await expect(
    page.getByText(/^Matches require the same sport family, distance within 10%/)
  ).toBeVisible();
  await capture(page, "37-comparable-prior-activity-no-match-1440.png");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("html")).toHaveJSProperty("scrollWidth", 390);
  await capture(page, "37-comparable-prior-activity-no-match-390.png");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/activity/${fixture.pendingId}/compare`);
  await expect(
    page.getByRole("heading", { name: /Comparable prior activity|No reliable prior match/ })
  ).toHaveCount(0);
  await expect(page.locator("main")).toBeEmpty();
  await capture(page, "37-comparable-prior-activity-unavailable-1440.png");
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, "37-comparable-prior-activity-unavailable-390.png");
});

test("a real owner-scoped read failure announces safely and retry restores the final route", async ({
  page,
}) => {
  const fixture = await addFixture();
  const db = createClient({ url: dbUrl, intMode: "number" });
  async function renameForFailure(): Promise<void> {
    await retryLocked(() =>
      db.execute("ALTER TABLE activities RENAME COLUMN moving_time_s TO moving_time_s_proof_error")
    );
  }
  async function restoreColumn(): Promise<void> {
    await retryLocked(() =>
      db.execute("ALTER TABLE activities RENAME COLUMN moving_time_s_proof_error TO moving_time_s")
    );
  }

  try {
    for (const [width, height] of [
      [1440, 1000],
      [390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      await renameForFailure();
      await page.goto(`/activity/${fixture.sourceId}/compare`, { waitUntil: "commit" });
      const error = page.getByRole("heading", {
        level: 1,
        name: "We couldn’t load this comparison.",
      });
      await expect(error).toBeVisible();
      const retry = page.getByRole("button", { name: "Try again" });
      await retry.focus();
      await expect(retry).toBeFocused();
      await capture(page, `37-comparable-prior-activity-error-focus-${width}.png`);
      await restoreColumn();
      await retry.press("Enter");
      await expect(
        page.getByRole("heading", { level: 1, name: "Comparable prior activity" })
      ).toBeVisible();
      await capture(page, `37-comparable-prior-activity-retried-success-${width}.png`);
    }
  } finally {
    const columns = await db.execute("PRAGMA table_info(activities)");
    if (columns.rows.some((column) => String(column.name) === "moving_time_s_proof_error")) {
      await restoreColumn();
    }
    db.close();
  }
});

test("reduced motion keeps the same comparable activity meaning and focus affordance", async ({
  page,
}) => {
  const fixture = await addFixture();
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [width, height] of [
    [1440, 1000],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto(`/activity/${fixture.sourceId}/compare`);
    const source = page.getByRole("link", {
      name: `Open current activity #${fixture.sourceId}`,
    });
    await source.focus();
    await expect(source).toBeFocused();
    expect(await source.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe(
      "0.001s"
    );
    await expect(page.getByRole("heading", { name: "Comparable prior activity" })).toBeVisible();
    await capture(page, `37-comparable-prior-activity-reduced-motion-focus-${width}.png`);
  }
});
