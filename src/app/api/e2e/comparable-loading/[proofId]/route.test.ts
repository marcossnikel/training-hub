import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitForComparableLoadingProof } from "@/lib/comparable-loading-proof";
import { GET, POST } from "./route";

const proofId = "aa60484a-960b-4792-a1de-ec4443f53972";
const context = { params: Promise.resolve({ proofId }) };

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "file:data/e2e.db");
  vi.stubEnv("TRAINING_HUB_COMPARABLE_LOADING_PROOF", "1");
  vi.stubEnv("TRAINING_HUB_DISPOSABLE_DATA", "1");
  vi.stubEnv("TRAINING_HUB_E2E", "1");
  vi.stubEnv("TRAINING_HUB_ENV", "e2e");
  vi.stubEnv("TURSO_AUTH_TOKEN", "");
  vi.stubEnv("TURSO_DATABASE_URL", "");
  vi.stubEnv("VERCEL_ENV", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  globalThis.__trainingHubComparableLoadingProofGates?.clear();
});

describe("disposable comparable loading proof endpoint", () => {
  it("returns fresh 404 responses when any disposable E2E guard is absent", async () => {
    const disabledEnvironments = [
      ["TRAINING_HUB_COMPARABLE_LOADING_PROOF", ""],
      ["TRAINING_HUB_DISPOSABLE_DATA", ""],
      ["TRAINING_HUB_E2E", ""],
      ["TRAINING_HUB_ENV", "development"],
      ["DATABASE_URL", ""],
      ["TURSO_AUTH_TOKEN", "token"],
      ["TURSO_DATABASE_URL", "libsql://production.example"],
      ["VERCEL_ENV", "production"],
    ] as const;
    const enabledValues = {
      DATABASE_URL: "file:data/e2e.db",
      TRAINING_HUB_COMPARABLE_LOADING_PROOF: "1",
      TRAINING_HUB_DISPOSABLE_DATA: "1",
      TRAINING_HUB_E2E: "1",
      TRAINING_HUB_ENV: "e2e",
      TURSO_AUTH_TOKEN: "",
      TURSO_DATABASE_URL: "",
      VERCEL_ENV: "",
    } as const;

    for (const [key, value] of disabledEnvironments) {
      vi.stubEnv(key, value);
      const getResponse = await GET(new Request("http://localhost"), context);
      const postResponse = await POST(new Request("http://localhost"), context);
      expect(getResponse.status, key).toBe(404);
      expect(postResponse.status, key).toBe(404);
      expect(getResponse, key).not.toBe(postResponse);
      vi.stubEnv(key, enabledValues[key]);
    }
  });

  it("reports, releases, and removes exactly one pending real-content gate", async () => {
    const waiting = waitForComparableLoadingProof(proofId);
    await expect(GET(new Request("http://localhost"), context)).resolves.toMatchObject({
      status: 204,
    });
    await expect(POST(new Request("http://localhost"), context)).resolves.toMatchObject({
      status: 204,
    });
    await expect(waiting).resolves.toBe(true);
    expect(globalThis.__trainingHubComparableLoadingProofGates).toBeUndefined();
    await expect(GET(new Request("http://localhost"), context)).resolves.toMatchObject({
      status: 409,
    });
    expect(globalThis.__trainingHubComparableLoadingProofGates).toBeUndefined();
  });
});
