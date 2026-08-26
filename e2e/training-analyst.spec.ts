import { expect, test } from "@playwright/test";
import { createClient } from "@libsql/client";
import path from "node:path";

test.describe.configure({ mode: "serial" });

test.beforeEach(async () => {
  const database = createClient({
    url: `file:${path.join(process.cwd(), "data", "e2e.db")}`,
    intMode: "number",
  });
  try {
    await database.batch(
      [
        {
          sql: "DELETE FROM training_analyst_generations WHERE user_id = ?",
          args: ["e2e-fixture-owner"],
        },
        {
          sql: "DELETE FROM training_analyst_monthly_usage WHERE user_id = ?",
          args: ["e2e-fixture-owner"],
        },
        {
          sql: "DELETE FROM training_analyst_consents WHERE user_id = ?",
          args: ["e2e-fixture-owner"],
        },
      ],
      "write"
    );
  } finally {
    database.close();
  }
});

test("Training Analyst consent and deterministic fallback remain usable at desktop and mobile widths", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/weekly-brief");
  await expect(
    page.getByText("Training Analyst is off. Your training summaries still work without it.")
  ).toBeVisible();
  await page.getByRole("link", { name: "Review settings" }).click();
  await expect(page.getByRole("heading", { name: "Training Analyst" })).toBeVisible();
  const consent = page.getByLabel("I understand and want to use OpenAI for these hypotheses.");
  await expect(page.getByRole("button", { name: "Enable Training Analyst" })).toBeDisabled();
  await consent.check();
  await page.getByRole("button", { name: "Enable Training Analyst" }).click();
  await expect(page.getByText("Training Analyst is enabled.", { exact: true })).toBeVisible();
  await page.goto("/weekly-brief");
  await page.getByRole("button", { name: "Request hypotheses" }).click();
  await expect(
    page.getByText(
      "Training Analyst is unavailable right now. Your deterministic training summary is still available."
    )
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.getByRole("heading", { name: "Training Analyst" })).toBeVisible();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
});

test("Training Analyst history exposes citations and all feedback controls without applying a profile value", async ({
  page,
}) => {
  const database = createClient({
    url: `file:${path.join(process.cwd(), "data", "e2e.db")}`,
    intMode: "number",
  });
  const now = new Date().toISOString();
  const generation = "00000000-0000-4000-8000-000000000021";
  try {
    await database.batch(
      [
        {
          sql: "INSERT INTO training_analyst_consents (user_id, version, disclosure_revision, accepted_at) VALUES (?, 'training-analyst-v1', 'test', ?)",
          args: ["e2e-fixture-owner", now],
        },
        {
          sql: `INSERT INTO training_analyst_generations (id, user_id, packet_version, response_schema_version, prompt_version, library_version, packet_digest, evidence_ids_json, theory_ids_json, provider, model, status, requested_at, completed_at) VALUES (?, ?, 'training-analyst-evidence-v1', 'training-analyst-response-v1', 'training-analyst-system-v1', 'training-theory-2026-08-25', ?, '["E1","E2"]', '["T1"]', 'test', 'test', 'succeeded', ?, ?)`,
          args: [generation, "e2e-fixture-owner", "0".repeat(64), now, now],
        },
        ...["Confirm", "Edit", "Reject", "Defer"].map((label, ordinal) => ({
          sql: `INSERT INTO training_analyst_hypotheses (id, generation_id, user_id, ordinal, observation, evidence_ids_json, theory_ids_json, theory_source_ids_json, limitation, confidence, hypothesis, question, state) VALUES (?, ?, ?, ?, ?, '["E1","E2"]', '["T1"]', '["SRC-015"]', 'Only confirmed activity summary values are available; intensity and session context are not included.', 'low', 'This is a confirmable hypothesis and remains a proposal until a separate profile action.', NULL, 'pending')`,
          args: [
            `00000000-0000-4000-8000-${String(ordinal + 1).padStart(12, "0")}`,
            generation,
            "e2e-fixture-owner",
            ordinal,
            `${label} evidence observation with sufficient text for an accessible hypothesis card.`,
          ],
        })),
      ],
      "write"
    );
  } finally {
    database.close();
  }
  await page.goto("/weekly-brief");
  await expect(page.getByText("SRC-015").first()).toBeVisible();
  const cards = page
    .locator("article")
    .filter({ hasText: "Only confirmed activity summary values" });
  await cards.nth(0).getByRole("button", { name: "Confirm" }).click();
  await expect(cards.nth(0).getByText("confirmed", { exact: true })).toBeVisible();
  await cards.nth(1).getByRole("button", { name: "Edit" }).click();
  const edit = cards.nth(1).getByLabel("Edit this hypothesis");
  await expect(edit).toBeFocused();
  await edit.fill("This edited proposal remains evidence-linked and is not a profile mutation.");
  await cards.nth(1).getByRole("button", { name: "Save edit" }).click();
  await expect(cards.nth(1).getByText("edited", { exact: true })).toBeVisible();
  await cards.nth(2).getByRole("button", { name: "Reject" }).click();
  await expect(cards.nth(2).getByText("rejected", { exact: true })).toBeVisible();
  await cards.nth(3).getByRole("button", { name: "Defer" }).click();
  await expect(cards.nth(3).getByText("deferred", { exact: true })).toBeVisible();
});
