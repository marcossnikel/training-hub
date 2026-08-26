import { THEORY_CATALOG } from "../theory-catalog";
import {
  TRAINING_ANALYST_RESPONSE_VERSION,
  type TrainingAnalystEvidencePacketV1,
  type TrainingAnalystResponseV1,
} from "../types";

export type ResponseValidation =
  { ok: true; response: TrainingAnalystResponseV1 } | { ok: false; code: string };

const prohibited =
  /\b(workout|weekly plan|calendar|schedule|target pace|target heart rate|target hr|supplement|diagnos|injur(?:y|ies)|rehab|rehabilitat|medical|readiness|clear(?:ed|ance)? to train|prescri(?:be|ption)|you should|you need to|must (?:run|ride|train|eat|take)|try (?:running|riding|eating|taking)|ask me anything|ignore (?:previous|the|this)|system prompt)\b/i;
const exactDose =
  /\b\d+(?:\.\d+)?\s*(?:km|kilometers?|mi(?:les?)?|minutes?|mins?|hours?|hrs?|g(?:rams?)?|mg|bpm|watts?|w)\b/i;
const opaqueIdInClaim = /\b[ETH]\d+\b/;

function stringWithin(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}

function references<T extends string>(
  value: unknown,
  allowed: Set<T>,
  min: number,
  max: number
): value is T[] {
  return (
    Array.isArray(value) &&
    value.length >= min &&
    value.length <= max &&
    value.every((item) => typeof item === "string" && allowed.has(item as T)) &&
    new Set(value).size === value.length
  );
}

function containsRealLimitation(
  value: string,
  packet: TrainingAnalystEvidencePacketV1,
  theoryIds: string[]
): boolean {
  const contexts = [
    ...packet.evidence.map((evidence) => evidence.limitation),
    ...packet.theoryCards
      .filter((card) => theoryIds.includes(card.id))
      .map((card) => card.limitation),
  ]
    .join(" ")
    .toLowerCase();
  return value
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word.length >= 5)
    .some((word) => contexts.includes(word));
}

function validModerate(
  packet: TrainingAnalystEvidencePacketV1,
  evidenceIds: string[],
  theoryIds: string[]
): boolean {
  if (evidenceIds.length < 2 || packet.dataQuality.some((quality) => quality !== "complete"))
    return false;
  return theoryIds.every((id) => {
    const weight = packet.theoryCards.find((card) => card.id === id)?.evidenceWeight;
    return weight === "strong" || weight === "moderate";
  });
}

export function validateTrainingAnalystResponse(
  raw: unknown,
  packet: TrainingAnalystEvidencePacketV1
): ResponseValidation {
  if (!raw || typeof raw !== "object") return { ok: false, code: "not_object" };
  const candidate = raw as Record<string, unknown>;
  if (
    candidate.schemaVersion !== TRAINING_ANALYST_RESPONSE_VERSION ||
    !Array.isArray(candidate.hypotheses)
  ) {
    return { ok: false, code: "schema_version" };
  }
  if (candidate.hypotheses.length < 1 || candidate.hypotheses.length > 4)
    return { ok: false, code: "count" };
  const evidenceIds = new Set(packet.evidence.map((item) => item.id));
  const theoryIds = new Set(packet.theoryCards.map((item) => item.id));
  const seen = new Set<string>();
  const hypotheses: TrainingAnalystResponseV1["hypotheses"] = [];
  for (const rawHypothesis of candidate.hypotheses) {
    if (!rawHypothesis || typeof rawHypothesis !== "object")
      return { ok: false, code: "item_object" };
    const item = rawHypothesis as Record<string, unknown>;
    if (typeof item.id !== "string" || !/^H[1-4]$/.test(item.id) || seen.has(item.id))
      return { ok: false, code: "id" };
    seen.add(item.id);
    if (
      !stringWithin(item.observation, 40, 280) ||
      !stringWithin(item.limitation, 20, 280) ||
      !stringWithin(item.hypothesis, 20, 280)
    )
      return { ok: false, code: "length" };
    if (item.question !== null && !stringWithin(item.question, 1, 180))
      return { ok: false, code: "question" };
    if (
      !references(item.evidenceIds, evidenceIds, 1, 4) ||
      !references(item.theoryIds, theoryIds, 1, 2)
    )
      return { ok: false, code: "references" };
    if (item.confidence !== "low" && item.confidence !== "moderate")
      return { ok: false, code: "confidence" };
    const text = [item.observation, item.limitation, item.hypothesis, item.question ?? ""].join(
      " "
    );
    if (prohibited.test(text) || exactDose.test(text) || opaqueIdInClaim.test(text))
      return { ok: false, code: "prohibited_content" };
    if (!containsRealLimitation(item.limitation, packet, item.theoryIds))
      return { ok: false, code: "generic_limitation" };
    if (item.confidence === "moderate" && !validModerate(packet, item.evidenceIds, item.theoryIds))
      return { ok: false, code: "unsupported_confidence" };
    hypotheses.push({
      id: item.id as `H${number}`,
      observation: item.observation,
      evidenceIds: item.evidenceIds,
      theoryIds: item.theoryIds,
      limitation: item.limitation,
      confidence: item.confidence,
      hypothesis: item.hypothesis,
      question: item.question,
    });
  }
  // Defense in depth: every catalog source belongs to the checked-in registry
  // and selected cards are the only possible theory references above.
  if (THEORY_CATALOG.some((card) => card.sourceIds.some((source) => !/^SRC-\d{3}$/.test(source)))) {
    return { ok: false, code: "catalog_source" };
  }
  return { ok: true, response: { schemaVersion: TRAINING_ANALYST_RESPONSE_VERSION, hypotheses } };
}
