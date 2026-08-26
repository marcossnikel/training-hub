import "server-only";

import { client } from "@/lib/db/client";
import { ensureMigrated } from "@/lib/db/migrations";
import { many, one } from "@/lib/db/helpers";
import type { OwnerContext } from "@/lib/owner-context";
import {
  TRAINING_ANALYST_CONSENT_VERSION,
  TRAINING_ANALYST_DISCLOSURE_REVISION,
  TRAINING_ANALYST_LIBRARY_VERSION,
  TRAINING_ANALYST_PACKET_VERSION,
  TRAINING_ANALYST_PROMPT_VERSION,
  TRAINING_ANALYST_RESPONSE_VERSION,
  type AnalystAction,
  type AnalystHypothesis,
  type AnalystState,
  type TrainingAnalystResponseV1,
} from "../types";

type HypothesisRow = {
  id: string;
  generation_id: string;
  observation: string;
  evidence_ids_json: string;
  theory_ids_json: string;
  theory_source_ids_json: string;
  limitation: string;
  confidence: "low" | "moderate";
  hypothesis: string;
  question: string | null;
  state: AnalystState;
};

function parseIds(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((id) => typeof id === "string") ? parsed : [];
  } catch {
    return [];
  }
}
function decode(row: HypothesisRow): AnalystHypothesis {
  return {
    id: row.id,
    generationId: row.generation_id,
    observation: row.observation,
    evidenceIds: parseIds(row.evidence_ids_json) as `E${number}`[],
    theoryIds: parseIds(row.theory_ids_json) as `T${number}`[],
    sourceIds: parseIds(row.theory_source_ids_json) as `SRC-${string}`[],
    limitation: row.limitation,
    confidence: row.confidence,
    hypothesis: row.hypothesis,
    question: row.question,
    state: row.state,
  };
}

export async function getTrainingAnalystConsent(
  owner: OwnerContext
): Promise<"enabled" | "revoked" | "missing"> {
  const row = await one<{ revoked_at: string | null }>(
    "SELECT revoked_at FROM training_analyst_consents WHERE user_id = ? AND version = ?",
    [owner.userId, TRAINING_ANALYST_CONSENT_VERSION]
  );
  return !row ? "missing" : row.revoked_at ? "revoked" : "enabled";
}

export async function enableTrainingAnalystConsent(owner: OwnerContext): Promise<void> {
  await ensureMigrated();
  const now = new Date().toISOString();
  await client.execute({
    sql: `INSERT INTO training_analyst_consents (user_id, version, disclosure_revision, accepted_at, revoked_at)
    VALUES (?, ?, ?, ?, NULL) ON CONFLICT(user_id, version) DO UPDATE SET disclosure_revision = excluded.disclosure_revision, accepted_at = excluded.accepted_at, revoked_at = NULL`,
    args: [
      owner.userId,
      TRAINING_ANALYST_CONSENT_VERSION,
      TRAINING_ANALYST_DISCLOSURE_REVISION,
      now,
    ],
  });
}

/** Revocation retains consent history but removes every locally rendered/request artifact atomically. */
export async function revokeTrainingAnalystConsent(owner: OwnerContext): Promise<void> {
  await ensureMigrated();
  const tx = await client.transaction("write");
  try {
    await tx.execute({
      sql: "UPDATE training_analyst_consents SET revoked_at = ? WHERE user_id = ? AND version = ?",
      args: [new Date().toISOString(), owner.userId, TRAINING_ANALYST_CONSENT_VERSION],
    });
    await tx.execute({
      sql: "DELETE FROM training_analyst_generations WHERE user_id = ?",
      args: [owner.userId],
    });
    await tx.execute({
      sql: "DELETE FROM training_analyst_monthly_usage WHERE user_id = ?",
      args: [owner.userId],
    });
    await tx.commit();
  } finally {
    tx.close();
  }
}

export async function listTrainingAnalystHypotheses(
  owner: OwnerContext
): Promise<AnalystHypothesis[]> {
  return (
    await many<HypothesisRow>(
      `SELECT h.id, h.generation_id, h.observation, h.evidence_ids_json, h.theory_ids_json, h.theory_source_ids_json, h.limitation, h.confidence, h.hypothesis, h.question, h.state
    FROM training_analyst_hypotheses h JOIN training_analyst_generations g ON g.id = h.generation_id
    WHERE h.user_id = ? AND g.user_id = ? AND g.status = 'succeeded' ORDER BY g.requested_at DESC, h.ordinal ASC`,
      [owner.userId, owner.userId]
    )
  ).map(decode);
}

export type Reservation = { generationId: string };
export type ReservationResult =
  Reservation | { reason: "rate_limit" | "budget_limit" | "concurrency_limit" };

export async function reserveTrainingAnalystGeneration(
  owner: OwnerContext,
  digest: string,
  evidenceIds: string[],
  theoryIds: string[]
): Promise<ReservationResult> {
  await ensureMigrated();
  const now = new Date();
  const nowIso = now.toISOString();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const month = nowIso.slice(0, 7);
  const tx = await client.transaction("write");
  try {
    const [recent, inFlight, usage] = await Promise.all([
      tx.execute({
        sql: "SELECT COUNT(*) AS count FROM training_analyst_generations WHERE user_id = ? AND status = 'succeeded' AND requested_at >= ?",
        args: [owner.userId, since],
      }),
      tx.execute(
        "SELECT COUNT(*) AS count FROM training_analyst_generations WHERE status = 'in_flight'"
      ),
      tx.execute({
        sql: "SELECT estimated_cost_micros FROM training_analyst_monthly_usage WHERE user_id = ? AND month_utc = ?",
        args: [owner.userId, month],
      }),
    ]);
    const reason =
      Number(recent.rows[0]?.count ?? 0) >= 1
        ? "rate_limit"
        : Number(inFlight.rows[0]?.count ?? 0) >= 10
          ? "concurrency_limit"
          : Number(usage.rows[0]?.estimated_cost_micros ?? 0) >= 20_000_000
            ? "budget_limit"
            : null;
    if (reason) {
      await tx.rollback();
      return { reason };
    }
    const generationId = crypto.randomUUID();
    await tx.execute({
      sql: `INSERT INTO training_analyst_generations (id, user_id, packet_version, response_schema_version, prompt_version, library_version, packet_digest, evidence_ids_json, theory_ids_json, provider, model, status, requested_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'openai', 'gpt-5.6-terra', 'in_flight', ?)`,
      args: [
        generationId,
        owner.userId,
        TRAINING_ANALYST_PACKET_VERSION,
        TRAINING_ANALYST_RESPONSE_VERSION,
        TRAINING_ANALYST_PROMPT_VERSION,
        TRAINING_ANALYST_LIBRARY_VERSION,
        digest,
        JSON.stringify(evidenceIds),
        JSON.stringify(theoryIds),
        nowIso,
      ],
    });
    await tx.commit();
    return { generationId };
  } finally {
    tx.close();
  }
}

export async function failTrainingAnalystGeneration(
  owner: OwnerContext,
  generationId: string,
  code: string,
  unknown = false
): Promise<void> {
  await client.execute({
    sql: "UPDATE training_analyst_generations SET status = ?, completed_at = ?, validation_code = ? WHERE id = ? AND user_id = ? AND status = 'in_flight'",
    args: [
      unknown ? "unknown" : "failed",
      new Date().toISOString(),
      code.slice(0, 80),
      generationId,
      owner.userId,
    ],
  });
}

export async function completeTrainingAnalystGeneration(
  owner: OwnerContext,
  generationId: string,
  response: TrainingAnalystResponseV1,
  theorySources: Map<string, string[]>,
  estimatedCostMicros = 0
): Promise<boolean> {
  const tx = await client.transaction("write");
  const now = new Date().toISOString();
  const month = now.slice(0, 7);
  try {
    const active = await tx.execute({
      sql: "SELECT 1 FROM training_analyst_generations WHERE id = ? AND user_id = ? AND status = 'in_flight'",
      args: [generationId, owner.userId],
    });
    if (active.rows.length !== 1) {
      await tx.rollback();
      return false;
    }
    await tx.execute({
      sql: "UPDATE training_analyst_generations SET status = 'succeeded', completed_at = ?, estimated_cost_micros = ? WHERE id = ? AND user_id = ?",
      args: [now, estimatedCostMicros, generationId, owner.userId],
    });
    for (const [ordinal, item] of response.hypotheses.entries())
      await tx.execute({
        sql: `INSERT INTO training_analyst_hypotheses (id, generation_id, user_id, ordinal, observation, evidence_ids_json, theory_ids_json, theory_source_ids_json, limitation, confidence, hypothesis, question, state)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        args: [
          crypto.randomUUID(),
          generationId,
          owner.userId,
          ordinal,
          item.observation,
          JSON.stringify(item.evidenceIds),
          JSON.stringify(item.theoryIds),
          JSON.stringify(item.theoryIds.flatMap((id) => theorySources.get(id) ?? [])),
          item.limitation,
          item.confidence,
          item.hypothesis,
          item.question,
        ],
      });
    await tx.execute({
      sql: `INSERT INTO training_analyst_monthly_usage (user_id, month_utc, successful_count, estimated_cost_micros) VALUES (?, ?, 1, ?)
      ON CONFLICT(user_id, month_utc) DO UPDATE SET successful_count = successful_count + 1, estimated_cost_micros = estimated_cost_micros + excluded.estimated_cost_micros`,
      args: [owner.userId, month, estimatedCostMicros],
    });
    await tx.commit();
    return true;
  } finally {
    tx.close();
  }
}

export async function saveTrainingAnalystFeedback(
  owner: OwnerContext,
  input: {
    hypothesisId: string;
    action: AnalystAction;
    requestId: string;
    editedHypothesis?: string | null;
  }
): Promise<"saved" | "already_saved" | "unavailable"> {
  if (!/^[0-9a-f-]{36}$/i.test(input.hypothesisId) || !/^[0-9a-f-]{36}$/i.test(input.requestId))
    return "unavailable";
  const edited = input.editedHypothesis?.trim() ?? null;
  if (input.action === "edited" && (!edited || edited.length > 280)) return "unavailable";
  if (input.action !== "edited" && edited) return "unavailable";
  const tx = await client.transaction("write");
  try {
    const existing = await tx.execute({
      sql: "SELECT 1 FROM training_analyst_feedback WHERE hypothesis_id = ? AND request_id = ? AND user_id = ?",
      args: [input.hypothesisId, input.requestId, owner.userId],
    });
    if (existing.rows.length) {
      await tx.rollback();
      return "already_saved";
    }
    const updated = await tx.execute({
      sql: "UPDATE training_analyst_hypotheses SET state = ? WHERE id = ? AND user_id = ? AND state = 'pending' RETURNING id",
      args: [input.action, input.hypothesisId, owner.userId],
    });
    if (!updated.rows.length) {
      await tx.rollback();
      return "unavailable";
    }
    await tx.execute({
      sql: "INSERT INTO training_analyst_feedback (id, hypothesis_id, user_id, action, request_id, edited_hypothesis, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [
        crypto.randomUUID(),
        input.hypothesisId,
        owner.userId,
        input.action,
        input.requestId,
        edited,
        new Date().toISOString(),
      ],
    });
    await tx.commit();
    return "saved";
  } finally {
    tx.close();
  }
}
