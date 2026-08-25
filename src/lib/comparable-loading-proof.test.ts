import { afterEach, describe, expect, it, vi } from "vitest";
import {
  comparableLoadingProofEnabled,
  hasPendingComparableLoadingProof,
  isComparableLoadingProofId,
  releaseComparableLoadingProof,
  waitForComparableLoadingProof,
} from "./comparable-loading-proof";

const proofId = "4d2284fd-0414-4ee9-93b4-8186b832106c";
const disposableE2E = {
  DATABASE_URL: "file:data/e2e.db",
  TRAINING_HUB_COMPARABLE_LOADING_PROOF: "1",
  TRAINING_HUB_DISPOSABLE_DATA: "1",
  TRAINING_HUB_E2E: "1",
  TRAINING_HUB_ENV: "e2e",
  TURSO_AUTH_TOKEN: "",
  TURSO_DATABASE_URL: "",
};

afterEach(() => {
  vi.unstubAllEnvs();
  globalThis.__trainingHubComparableLoadingProofGates?.clear();
});

describe("comparable loading production proof gate", () => {
  it("is unreachable unless every disposable local E2E guard is present", () => {
    expect(comparableLoadingProofEnabled(disposableE2E)).toBe(true);
    for (const key of [
      "TRAINING_HUB_COMPARABLE_LOADING_PROOF",
      "TRAINING_HUB_DISPOSABLE_DATA",
      "TRAINING_HUB_E2E",
      "TRAINING_HUB_ENV",
      "DATABASE_URL",
    ] as const) {
      expect(comparableLoadingProofEnabled({ ...disposableE2E, [key]: "" })).toBe(false);
    }
    expect(
      comparableLoadingProofEnabled({
        ...disposableE2E,
        TURSO_DATABASE_URL: "libsql://production.example",
      })
    ).toBe(false);
    expect(comparableLoadingProofEnabled({ ...disposableE2E, TURSO_AUTH_TOKEN: "token" })).toBe(
      false
    );
    expect(comparableLoadingProofEnabled({ ...disposableE2E, VERCEL_ENV: "production" })).toBe(
      false
    );
  });

  it("accepts only opaque UUID proof IDs", () => {
    expect(isComparableLoadingProofId(proofId)).toBe(true);
    expect(isComparableLoadingProofId(null)).toBe(false);
    expect(isComparableLoadingProofId("loading-proof")).toBe(false);
  });

  it("holds real content until the matching one-shot proof is released", async () => {
    const waiting = waitForComparableLoadingProof(proofId, disposableE2E);
    let settled = false;
    void waiting.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(hasPendingComparableLoadingProof(proofId, disposableE2E)).toBe(true);
    expect(releaseComparableLoadingProof(proofId, disposableE2E)).toBe(true);
    await expect(waiting).resolves.toBe(true);
    expect(globalThis.__trainingHubComparableLoadingProofGates).toBeUndefined();
    expect(hasPendingComparableLoadingProof(proofId, disposableE2E)).toBe(false);
    expect(globalThis.__trainingHubComparableLoadingProofGates).toBeUndefined();
    expect(releaseComparableLoadingProof(proofId, disposableE2E)).toBe(false);
  });

  it("is inert for invalid or non-E2E requests", async () => {
    await expect(waitForComparableLoadingProof(proofId, {})).resolves.toBe(false);
    await expect(waitForComparableLoadingProof("invalid", disposableE2E)).resolves.toBe(false);
    expect(releaseComparableLoadingProof(proofId, {})).toBe(false);
  });
});
