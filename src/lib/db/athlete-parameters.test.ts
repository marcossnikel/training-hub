import { describe, expect, it } from "vitest";
import { validateIanaTimezone, validateParameterValue } from "./athlete-parameters";

describe("athlete performance parameter validation", () => {
  it("uses key-specific canonical ranges without accepting NaN or infinity", () => {
    expect(validateParameterValue("lthr_bpm", 176.4)).toBe(176.4);
    expect(validateParameterValue("lthr_bpm", 89)).toBeNull();
    expect(validateParameterValue("cycling_ftp_watts", Number.NaN)).toBeNull();
    expect(
      validateParameterValue("measured_vo2max_ml_kg_min", Number.POSITIVE_INFINITY)
    ).toBeNull();
  });

  it("accepts complete IANA identifiers, canonicalizes aliases, and rejects offsets", () => {
    expect(validateIanaTimezone("America/Sao_Paulo")).toBe("America/Sao_Paulo");
    expect(validateIanaTimezone("US/Eastern")).toBe("America/New_York");
    expect(validateIanaTimezone("-03:00")).toBeNull();
    expect(validateIanaTimezone("UTC-3")).toBeNull();
  });
});
