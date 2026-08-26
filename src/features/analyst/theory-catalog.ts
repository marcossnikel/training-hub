import { TRAINING_ANALYST_LIBRARY_VERSION, type TrainingAnalystTheoryCard } from "./types";

export { TRAINING_ANALYST_LIBRARY_VERSION };

type CatalogCard = Omit<TrainingAnalystTheoryCard, "id"> & {
  cardId: string;
  sports: Array<"run" | "ride">;
};

// Manually distilled, bounded claims from the accepted library. These are data
// for the model, not an arbitrary Markdown/RAG path.
export const THEORY_CATALOG: readonly CatalogCard[] = [
  {
    cardId: "volume-change-uncertainty",
    sports: ["run", "ride"],
    sourceIds: ["SRC-015", "SRC-016"],
    claim:
      "Observed changes in training volume or frequency do not establish a universal individual outcome or threshold.",
    population: "Runners in heterogeneous prospective studies and reviews.",
    evidenceWeight: "moderate",
    limitation:
      "The studies use differing load definitions and cannot establish a personal causal rule.",
  },
  {
    cardId: "aerobic-adaptation-context",
    sports: ["run", "ride"],
    sourceIds: ["SRC-001", "SRC-002"],
    claim:
      "Endurance adaptation reflects multiple interacting physiological factors and training exposure, not a single summary metric.",
    population: "Human endurance-exercise literature.",
    evidenceWeight: "strong",
    limitation:
      "The evidence is a broad conceptual and heterogeneous synthesis, not an individualized explanation.",
  },
  {
    cardId: "running-economy-context",
    sports: ["run"],
    sourceIds: ["SRC-013", "SRC-014"],
    claim:
      "Running economy is multifactorial; group-level strength or plyometric findings do not identify one runner's limiting factor.",
    population: "Middle- and long-distance runners and healthy adults.",
    evidenceWeight: "moderate",
    limitation:
      "Studies are heterogeneous and observational biomechanics findings do not prove an individual cause.",
  },
  {
    cardId: "durability-context",
    sports: ["run", "ride"],
    sourceIds: ["SRC-009", "SRC-010"],
    claim:
      "Durability describes change during prolonged work, but its measurement and causal training evidence remain incomplete.",
    population: "Endurance physiology literature.",
    evidenceWeight: "limited",
    limitation:
      "There is no standardized individual durability test in this product evidence packet.",
  },
  {
    cardId: "cycling-transfer-context",
    sports: ["run", "ride"],
    sourceIds: ["SRC-001", "SRC-003"],
    claim:
      "Cycling and running can share some central endurance adaptations while retaining sport-specific demands.",
    population: "Human running and cycling endurance literature.",
    evidenceWeight: "limited",
    limitation:
      "The packet has no direct measure of sport-specific mechanics or adaptation transfer.",
  },
  {
    cardId: "training-age-context",
    sports: ["run", "ride"],
    sourceIds: ["SRC-002", "SRC-019"],
    claim:
      "Training exposure and baseline status can influence observed endurance adaptations and performance associations.",
    population: "Broad endurance and marathon literature.",
    evidenceWeight: "moderate",
    limitation:
      "The available evidence is not a validated classification of this athlete's training age.",
  },
] as const;

export function theoryCardsFor(sport: "run" | "ride" | "mixed"): TrainingAnalystTheoryCard[] {
  const eligible = THEORY_CATALOG.filter(
    (card) => sport === "mixed" || card.sports.includes(sport)
  ).slice(0, 8);
  return eligible.map((card, index) => ({
    id: `T${index + 1}`,
    sourceIds: [...card.sourceIds],
    claim: card.claim,
    population: card.population,
    evidenceWeight: card.evidenceWeight,
    limitation: card.limitation,
  }));
}
