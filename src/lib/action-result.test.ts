import { describe, expect, it } from "vitest";
import { dictionaries } from "@/lib/i18n";
import { fail } from "@/lib/action-result";

// Regression guard for G6.3: fail() must never surface a raw Error.message to the
// client. A caught internal/DB exception carries text like the SQLite constraint
// message below; the UI shows result.error verbatim (toast.error), so leaking it
// exposes internal detail. fail() must return the caller's CONTROLLED, localized
// fallback instead and keep the raw error observable server-side (telemetry).
const RAW = "SQLITE_CONSTRAINT: UNIQUE constraint failed: shoes.strava_gear_id";

describe("fail (G6.3: no raw error text reaches the client)", () => {
  it("returns the controlled localized fallback for an unexpected Error, not the raw message", () => {
    const fallback = dictionaries.en.errors.generic;
    const result = fail(new Error(RAW), fallback);
    expect(result.ok).toBe(false);
    expect(result.error).toBe(fallback);
    expect(result.error).not.toContain("SQLITE_CONSTRAINT");
    expect(result.error).not.toContain(RAW);
  });

  it("returns the controlled localized fallback in Portuguese too", () => {
    const fallback = dictionaries.pt.errors.generic;
    const result = fail(new Error(RAW), fallback);
    expect(result.error).toBe(fallback);
    expect(result.error).not.toContain("SQLITE_CONSTRAINT");
  });

  it("preserves a caller's specific localized fallback for an Error (does not force generic)", () => {
    const fallback = dictionaries.en.errors.syncFailed;
    const result = fail(new Error(RAW), fallback);
    expect(result.error).toBe(fallback);
    expect(result.error).not.toBe(dictionaries.en.errors.generic);
  });

  it("passes a controlled localized fallback through unchanged for a non-Error throw", () => {
    const fallback = dictionaries.en.errors.syncFailed;
    const result = fail("boom", fallback);
    expect(result.error).toBe(fallback);
  });
});
