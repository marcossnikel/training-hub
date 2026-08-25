import { describe, expect, it } from "vitest";
import { canAdvanceImport, classifyImportError, sportFamily } from "./import-progress";

describe("initial import progress contract", () => {
  it("allows resume states but never a completed lifecycle", () => {
    expect(canAdvanceImport("queued")).toBe(true);
    expect(canAdvanceImport("running")).toBe(true);
    expect(canAdvanceImport("partial")).toBe(true);
    expect(canAdvanceImport("failed")).toBe(true);
    expect(canAdvanceImport("completed")).toBe(false);
  });

  it("uses canonical sport families and redacted error categories", () => {
    expect(sportFamily("TrailRun")).toBe("run");
    expect(sportFamily("GravelRide")).toBe("ride");
    expect(sportFamily(undefined)).toBe("unknown");
    expect(classifyImportError(new Error("Strava API error (500)."))).toBe("provider_unavailable");
    expect(classifyImportError(new Error("provider payload: canary-secret"))).toBe("unexpected");
  });
});
