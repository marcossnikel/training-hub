export const TRAINING_ANALYST_CONSENT_VERSION = "training-analyst-v1";
export const TRAINING_ANALYST_DISCLOSURE_REVISION = "2026-08-26";
export const TRAINING_ANALYST_LIBRARY_VERSION = "training-theory-2026-08-25";
export const TRAINING_ANALYST_PACKET_VERSION = "training-analyst-evidence-v1";
export const TRAINING_ANALYST_RESPONSE_VERSION = "training-analyst-response-v1";
export const TRAINING_ANALYST_PROMPT_VERSION = "training-analyst-system-v1";

export type EvidenceId = `E${number}`;
export type TheoryId = `T${number}`;
export type AnalystState = "pending" | "confirmed" | "edited" | "rejected" | "deferred";
export type AnalystAction = Exclude<AnalystState, "pending">;

export type TrainingAnalystEvidence = {
  id: EvidenceId;
  kind: "activity_summary" | "weekly_brief" | "comparable_activity" | "parameter_observation";
  observedAt: string;
  values: Record<string, number>;
  comparisonEvidenceIds?: EvidenceId[];
  limitation: string;
};

export type TrainingAnalystTheoryCard = {
  id: TheoryId;
  sourceIds: `SRC-${string}`[];
  claim: string;
  population: string;
  evidenceWeight: "strong" | "moderate" | "limited" | "mixed" | "insufficient";
  limitation: string;
};

export type TrainingAnalystEvidencePacketV1 = {
  schemaVersion: typeof TRAINING_ANALYST_PACKET_VERSION;
  packetId: string;
  asOfDate: string;
  window: { startDate: string; endDate: string; timezone: string | null };
  sport: "run" | "ride" | "mixed";
  dataQuality: Array<
    | "complete"
    | "partial_import"
    | "summary_only"
    | "missing_timezone"
    | "insufficient_history"
    | "contradictory_input"
  >;
  athleteContext: {
    runningTrainingAge: "unknown" | "novice" | "developing" | "trained" | "highly_trained";
    performanceParameters: Array<{
      key: string;
      value: number;
      unit: "bpm" | "s/km" | "W" | "ml/kg/min";
      provenance: "athlete_entered" | "provider" | "calculated";
      observedAt: string | null;
    }>;
  };
  evidence: TrainingAnalystEvidence[];
  theoryCards: TrainingAnalystTheoryCard[];
};

export type TrainingAnalystResponseV1 = {
  schemaVersion: typeof TRAINING_ANALYST_RESPONSE_VERSION;
  hypotheses: Array<{
    id: `H${number}`;
    observation: string;
    evidenceIds: EvidenceId[];
    theoryIds: TheoryId[];
    limitation: string;
    confidence: "low" | "moderate";
    hypothesis: string;
    question: string | null;
  }>;
};

export type AnalystHypothesis = Omit<TrainingAnalystResponseV1["hypotheses"][number], "id"> & {
  id: string;
  state: AnalystState;
  generationId: string;
  sourceIds: `SRC-${string}`[];
};
