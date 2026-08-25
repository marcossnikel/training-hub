export const COMPARABLE_LOADING_PROOF_HEADER = "x-training-hub-comparable-loading-proof";

type ProofEnvironment = Record<string, string | undefined>;
type ProofGate = {
  promise: Promise<void>;
  release: () => void;
};

declare global {
  var __trainingHubComparableLoadingProofGates: Map<string, ProofGate> | undefined;
}

const PROOF_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function proofGates(): Map<string, ProofGate> {
  globalThis.__trainingHubComparableLoadingProofGates ??= new Map();
  return globalThis.__trainingHubComparableLoadingProofGates;
}

/**
 * The route suspension exists only in Playwright's explicitly disposable local
 * environment. A normal local, preview, or production process cannot activate
 * it even if a request supplies the private proof header.
 */
export function comparableLoadingProofEnabled(env: ProofEnvironment = process.env): boolean {
  return (
    env.TRAINING_HUB_COMPARABLE_LOADING_PROOF === "1" &&
    env.TRAINING_HUB_E2E === "1" &&
    env.TRAINING_HUB_ENV === "e2e" &&
    env.TRAINING_HUB_DISPOSABLE_DATA === "1" &&
    env.VERCEL_ENV !== "production" &&
    !env.TURSO_DATABASE_URL &&
    !env.TURSO_AUTH_TOKEN &&
    Boolean(env.DATABASE_URL?.startsWith("file:"))
  );
}

export function hasPendingComparableLoadingProof(
  proofId: string,
  env: ProofEnvironment = process.env
): boolean {
  return (
    comparableLoadingProofEnabled(env) &&
    isComparableLoadingProofId(proofId) &&
    (globalThis.__trainingHubComparableLoadingProofGates?.has(proofId) ?? false)
  );
}

export function isComparableLoadingProofId(value: string | null): value is string {
  return value !== null && PROOF_ID_PATTERN.test(value);
}

/** Holds the real route content until Playwright has observed loading.tsx. */
export async function waitForComparableLoadingProof(
  proofId: string | null,
  env: ProofEnvironment = process.env
): Promise<boolean> {
  if (!comparableLoadingProofEnabled(env) || !isComparableLoadingProofId(proofId)) return false;

  const gates = proofGates();
  let gate = gates.get(proofId);
  if (!gate) {
    let release: () => void = () => undefined;
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    gate = { promise, release };
    gates.set(proofId, gate);
  }
  await gate.promise;
  return true;
}

/** Releases one pending disposable proof request and removes its process state. */
export function releaseComparableLoadingProof(
  proofId: string,
  env: ProofEnvironment = process.env
): boolean {
  if (!comparableLoadingProofEnabled(env) || !isComparableLoadingProofId(proofId)) return false;
  const gates = globalThis.__trainingHubComparableLoadingProofGates;
  if (!gates) return false;
  const gate = gates.get(proofId);
  if (!gate) return false;
  gates.delete(proofId);
  if (gates.size === 0) globalThis.__trainingHubComparableLoadingProofGates = undefined;
  gate.release();
  return true;
}
