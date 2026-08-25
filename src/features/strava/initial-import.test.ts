import { describe, expect, it } from "vitest";
import { classifyInitialImportStart } from "./initial-import";

describe("classifyInitialImportStart", () => {
  const cutoff = "2026-08-25T12:00:00.000Z";

  it("keeps activity before and exactly at the connection boundary confirmed", () => {
    expect(classifyInitialImportStart("2026-08-25T11:59:59.000Z", cutoff)).toBe("confirmed");
    expect(classifyInitialImportStart(cutoff, cutoff)).toBe("confirmed");
  });

  it("sends only a later valid activity to Review", () => {
    expect(classifyInitialImportStart("2026-08-25T12:00:00.001Z", cutoff)).toBe("pending_review");
  });

  it("rejects missing and malformed provider times", () => {
    expect(classifyInitialImportStart(undefined, cutoff)).toBe("invalid");
    expect(classifyInitialImportStart("not-a-time", cutoff)).toBe("invalid");
  });
});
