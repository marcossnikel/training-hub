import crypto from "node:crypto";
import path from "node:path";
import { createClient } from "@libsql/client";
import { expect, test, type Page } from "@playwright/test";

const dbUrl = `file:${path.join(process.cwd(), "data", "e2e.db")}`;
const ownerId = "e2e-fixture-owner";

async function addComparableFixture(): Promise<number> {
  const db = createClient({ url: dbUrl, intMode: "number" });
  const suffix = crypto.randomUUID();
  try {
    const rows = await db.batch(
      [
        {
          sql: `INSERT INTO activities (user_id, name, sport_type, started_at, distance_km, moving_time_s, status)
                VALUES (?, ?, 'Run', ?, 10, 3000, 'confirmed')`,
          args: [
            ownerId,
            `Feedback source ${suffix}`,
            new Date(Date.now() - 86_400_000).toISOString(),
          ],
        },
        {
          sql: `INSERT INTO activities (user_id, name, sport_type, started_at, distance_km, moving_time_s, status)
                VALUES (?, ?, 'Run', ?, 10.1, 3030, 'confirmed')`,
          args: [
            ownerId,
            `Feedback prior ${suffix}`,
            new Date(Date.now() - 3 * 86_400_000).toISOString(),
          ],
        },
      ],
      "write"
    );
    return Number(rows[0]?.lastInsertRowid);
  } finally {
    db.close();
  }
}

async function capture(page: Page, name: string) {
  if (process.env.CAPTURE_INSIGHT_FEEDBACK_EVIDENCE !== "1") return;
  await page.screenshot({
    path: path.join(process.cwd(), "evidence", "issue-38", name),
    fullPage: true,
  });
}

test.describe.configure({ mode: "serial" });

test("weekly brief feedback supports keyboard selection, note escape, save, and removal at desktop and narrow widths", async ({
  page,
}) => {
  for (const [width, height] of [
    [1440, 1000],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/weekly-brief");
    const useful = page.getByRole("button", { name: "Useful", exact: true });
    await expect(useful).toHaveAttribute("aria-pressed", "false");
    await useful.focus();
    await page.keyboard.press("Enter");
    await expect(useful).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Feedback saved.")).toBeVisible();
    await capture(page, `38-weekly-brief-feedback-selected-${width}.png`);

    const addNote = page.getByRole("button", { name: "Add a note" });
    await addNote.click();
    const note = page.getByLabel("Optional note");
    await note.fill("The comparison window was clear.");
    await page.keyboard.press("Escape");
    await expect(note).toBeHidden();
    await expect(page.getByRole("button", { name: "Add a note" })).toBeFocused();

    await page.getByRole("button", { name: "Add a note" }).click();
    await page.getByLabel("Optional note").fill("The comparison window was clear.");
    await page.getByRole("button", { name: "Save note" }).click();
    await expect(page.getByText("Feedback saved.")).toBeVisible();
    await capture(page, `38-weekly-brief-feedback-success-${width}.png`);
    if (width === 390) await expect(page.locator("html")).toHaveJSProperty("scrollWidth", 390);

    await page.getByRole("button", { name: "Remove response" }).click();
    await expect(page.getByText("Feedback removed.")).toBeVisible();
    await expect(useful).toBeFocused();
    await capture(page, `38-weekly-brief-feedback-removed-${width}.png`);
  }
});

test("comparable prior activity exposes feedback only for a delivered reliable match", async ({
  page,
}) => {
  const sourceId = await addComparableFixture();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/activity/${sourceId}/compare`);
  await expect(
    page.getByRole("heading", { name: "A prior session with a similar shape." })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Was this useful?" })).toBeVisible();
  await page.getByRole("button", { name: "Not useful", exact: true }).click();
  await expect(page.getByText("Feedback saved.")).toBeVisible();
  await capture(page, "38-comparable-feedback-selected-1440.png");
});
