import { client, IS_LOCAL_FILE } from "./client";
import { ensureMigrated } from "./migrations";
import { many, one } from "./helpers";
import {
  INSIGHT_FEEDBACK_KINDS,
  INSIGHT_NOTE_MAX_LENGTH,
  INSIGHT_USEFULNESS,
  type InsightFeedbackKind,
  type InsightReference,
  type InsightUsefulness,
} from "../insight-feedback";
import type { OwnerContext } from "../owner-context";

type FeedbackEnvironment = Record<string, string | undefined>;

export interface InsightFeedbackResponse {
  usefulness: InsightUsefulness;
  note: string | null;
}

/**
 * Product feedback is intentionally not bootstrapped on a shared database.
 * The existing owner-schema policy permits only fresh, disposable local/E2E
 * stores; a future reviewed remote migration can replace this narrow seam.
 */
export function insightFeedbackEnabled(env: FeedbackEnvironment = process.env): boolean {
  const mode = env.TRAINING_HUB_ENV || "local";
  return (
    env.TRAINING_HUB_INSIGHT_FEEDBACK_ENABLED === "1" &&
    (mode === "local" || mode === "e2e") &&
    IS_LOCAL_FILE &&
    !env.TURSO_DATABASE_URL &&
    !env.TURSO_AUTH_TOKEN
  );
}

let schemaReady: Promise<void> | undefined;

export async function ensureInsightFeedbackSchema(): Promise<void> {
  if (!insightFeedbackEnabled()) {
    throw new Error(
      "Insight feedback is available only in an explicitly enabled disposable local/E2E database."
    );
  }
  if (!schemaReady) {
    schemaReady = (async () => {
      await ensureMigrated();
      await client.batch(
        [
          `CREATE TABLE IF NOT EXISTS insight_feedback (
             id TEXT PRIMARY KEY,
             user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
             insight_kind TEXT NOT NULL CHECK (insight_kind IN ('weekly_brief', 'comparable_prior_activity')),
             insight_key TEXT NOT NULL,
             insight_version TEXT NOT NULL,
             evaluated_at TEXT NOT NULL,
             usefulness TEXT NOT NULL CHECK (usefulness IN ('useful', 'not_useful')),
             note TEXT CHECK (note IS NULL OR length(note) <= ${INSIGHT_NOTE_MAX_LENGTH}),
             created_at TEXT NOT NULL DEFAULT (datetime('now')),
             updated_at TEXT NOT NULL DEFAULT (datetime('now')),
             UNIQUE(user_id, insight_kind, insight_key)
           )`,
          "CREATE INDEX IF NOT EXISTS idx_insight_feedback_owner ON insight_feedback(user_id, updated_at DESC)",
        ],
        "write"
      );
    })().catch((error) => {
      schemaReady = undefined;
      throw error;
    });
  }
  return schemaReady;
}

function validReference(reference: InsightReference): boolean {
  return (
    INSIGHT_FEEDBACK_KINDS.includes(reference.kind) &&
    typeof reference.key === "string" &&
    reference.key.length > 0 &&
    reference.key.length <= 600 &&
    reference.version === "v1" &&
    Number.isFinite(Date.parse(reference.evaluatedAt))
  );
}

function validUsefulness(value: InsightUsefulness): boolean {
  return INSIGHT_USEFULNESS.includes(value);
}

export async function getInsightFeedback(
  owner: OwnerContext,
  reference: InsightReference
): Promise<InsightFeedbackResponse | null> {
  if (!insightFeedbackEnabled() || !validReference(reference)) return null;
  await ensureInsightFeedbackSchema();
  return one<InsightFeedbackResponse>(
    `SELECT usefulness, note FROM insight_feedback
     WHERE user_id = ? AND insight_kind = ? AND insight_key = ?`,
    [owner.userId, reference.kind, reference.key]
  );
}

/** Upsert keeps the one current response per owner + server-derived insight key. */
export async function saveInsightFeedback(
  owner: OwnerContext,
  input: { reference: InsightReference; usefulness: InsightUsefulness; note?: string | null }
): Promise<void> {
  const { reference, usefulness, note } = input;
  if (!validReference(reference) || !validUsefulness(usefulness)) {
    throw new Error("Invalid insight feedback reference.");
  }
  if (note != null && (typeof note !== "string" || note.length > INSIGHT_NOTE_MAX_LENGTH)) {
    throw new Error("Invalid insight feedback note.");
  }
  await ensureInsightFeedbackSchema();
  await client.execute({
    sql: `INSERT INTO insight_feedback
            (id, user_id, insight_kind, insight_key, insight_version, evaluated_at, usefulness, note)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, insight_kind, insight_key) DO UPDATE SET
            insight_version = excluded.insight_version,
            evaluated_at = excluded.evaluated_at,
            usefulness = excluded.usefulness,
            note = COALESCE(excluded.note, insight_feedback.note),
            updated_at = datetime('now')`,
    args: [
      crypto.randomUUID(),
      owner.userId,
      reference.kind,
      reference.key,
      reference.version,
      reference.evaluatedAt,
      usefulness,
      note ?? null,
    ],
  });
}

export async function saveInsightFeedbackNote(
  owner: OwnerContext,
  input: { reference: InsightReference; note: string | null }
): Promise<boolean> {
  const { reference, note } = input;
  if (!validReference(reference) || (note != null && note.length > INSIGHT_NOTE_MAX_LENGTH)) {
    throw new Error("Invalid insight feedback note.");
  }
  await ensureInsightFeedbackSchema();
  const result = await client.execute({
    sql: `UPDATE insight_feedback SET note = ?, insight_version = ?, evaluated_at = ?, updated_at = datetime('now')
          WHERE user_id = ? AND insight_kind = ? AND insight_key = ?`,
    args: [
      note,
      reference.version,
      reference.evaluatedAt,
      owner.userId,
      reference.kind,
      reference.key,
    ],
  });
  return result.rowsAffected === 1;
}

export async function removeInsightFeedback(
  owner: OwnerContext,
  reference: InsightReference
): Promise<void> {
  if (!validReference(reference)) throw new Error("Invalid insight feedback reference.");
  await ensureInsightFeedbackSchema();
  await client.execute({
    sql: `DELETE FROM insight_feedback WHERE user_id = ? AND insight_kind = ? AND insight_key = ?`,
    args: [owner.userId, reference.kind, reference.key],
  });
}

export interface RedactedInsightFeedbackRecord {
  kind: InsightFeedbackKind;
  key: string;
  version: string;
  evaluatedAt: string;
  usefulness: InsightUsefulness;
  note: string | null;
  respondedAt: string;
}

/**
 * Server-only analysis seam. It intentionally omits primary ids and user ids;
 * callers must already hold the owner context and this module is never imported
 * by a route handler or client component.
 */
export async function listRedactedInsightFeedbackForProductAnalysis(
  owner: OwnerContext
): Promise<RedactedInsightFeedbackRecord[]> {
  if (!insightFeedbackEnabled()) return [];
  await ensureInsightFeedbackSchema();
  return many<RedactedInsightFeedbackRecord>(
    `SELECT insight_kind AS kind, insight_key AS key, insight_version AS version,
            evaluated_at AS evaluatedAt, usefulness, note, updated_at AS respondedAt
     FROM insight_feedback WHERE user_id = ? ORDER BY updated_at DESC`,
    [owner.userId]
  );
}
