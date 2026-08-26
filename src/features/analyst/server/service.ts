import "server-only";

import type { OwnerContext } from "@/lib/owner-context";
import { buildTrainingAnalystPacket } from "./packet";
import { openAiTrainingAnalystProvider, type TrainingAnalystProvider } from "./provider";
import {
  completeTrainingAnalystGeneration,
  failTrainingAnalystGeneration,
  getTrainingAnalystConsent,
  listTrainingAnalystHypotheses,
  reserveTrainingAnalystGeneration,
} from "./repository";
import { validateTrainingAnalystResponse } from "./validator";

export type GenerationResult =
  | { state: "success" }
  | { state: "no_consent" | "revoked" | "insufficient_evidence" | "unavailable" | "limit" };

export async function requestTrainingAnalystHypotheses(
  owner: OwnerContext,
  provider: TrainingAnalystProvider = openAiTrainingAnalystProvider
): Promise<GenerationResult> {
  const consent = await getTrainingAnalystConsent(owner);
  if (consent === "missing") return { state: "no_consent" };
  if (consent === "revoked") return { state: "revoked" };
  if (process.env.TRAINING_ANALYST_ENABLED !== "1" && provider === openAiTrainingAnalystProvider)
    return { state: "unavailable" };
  const packetResult = await buildTrainingAnalystPacket(owner);
  if (packetResult.kind !== "ready") return { state: "insufficient_evidence" };
  const reservation = await reserveTrainingAnalystGeneration(
    owner,
    packetResult.digest,
    packetResult.packet.evidence.map((item) => item.id),
    packetResult.packet.theoryCards.map((item) => item.id)
  );
  if ("reason" in reservation) return { state: "limit" };
  let result = await provider.generate(packetResult.packet);
  // Retrying is allowed only when we know the first request did not reach a provider.
  if (result.kind === "pre_response_failure") result = await provider.generate(packetResult.packet);
  if (result.kind === "ambiguous_timeout") {
    await failTrainingAnalystGeneration(owner, reservation.generationId, "ambiguous_timeout", true);
    return { state: "unavailable" };
  }
  if (result.kind !== "success") {
    await failTrainingAnalystGeneration(owner, reservation.generationId, result.kind);
    return { state: "unavailable" };
  }
  const validated = validateTrainingAnalystResponse(result.response, packetResult.packet);
  if (!validated.ok) {
    await failTrainingAnalystGeneration(owner, reservation.generationId, validated.code);
    return { state: "unavailable" };
  }
  const theorySources = new Map(
    packetResult.packet.theoryCards.map((card) => [card.id, card.sourceIds])
  );
  if (
    !(await completeTrainingAnalystGeneration(
      owner,
      reservation.generationId,
      validated.response,
      theorySources,
      result.estimatedCostMicros
    ))
  )
    return { state: "unavailable" };
  return { state: "success" };
}

export async function trainingAnalystView(owner: OwnerContext) {
  const consent = await getTrainingAnalystConsent(owner);
  const hypotheses = consent === "enabled" ? await listTrainingAnalystHypotheses(owner) : [];
  return { consent, hypotheses };
}
