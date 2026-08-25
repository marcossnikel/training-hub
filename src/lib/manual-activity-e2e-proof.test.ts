import { describe, expect, it } from "vitest";
import {
  matchesManualActivityActionRequest,
  parseManualActivityActionResult,
  requireSuccessfulManualActivityActionResult,
} from "../../e2e/manual-activity";

const expected = {
  date: "2026-08-15",
  km: 12.58,
  shoe: { id: 7, name: "Exact owner shoe" },
  successMessage: "Added 12.6 km to Exact owner shoe",
};

describe("manual-activity E2E action proof", () => {
  it("matches only the /settings action carrying the exact serialized manual inputs", () => {
    expect(
      matchesManualActivityActionRequest(
        {
          method: "POST",
          url: "http://localhost:3100/settings",
          actionId: "manual-action-id",
          body: '[{"date":"2026-08-15","km":12.58,"shoeId":7}]',
        },
        expected
      )
    ).toBe(true);

    for (const adjacentAction of [
      {
        method: "POST",
        url: "http://localhost:3100/gear",
        actionId: "adjacent-action-id",
        body: '[{"date":"2026-08-15","km":12.58,"shoeId":7}]',
      },
      {
        method: "POST",
        url: "http://localhost:3100/settings",
        actionId: "adjacent-action-id",
        body: '[{"date":"2026-08-15","km":12.58,"shoeId":8}]',
      },
      {
        method: "POST",
        url: "http://localhost:3100/settings",
        actionId: undefined,
        body: '[{"date":"2026-08-15","km":12.58,"shoeId":7}]',
      },
    ]) {
      expect(matchesManualActivityActionRequest(adjacentAction, expected)).toBe(false);
    }
  });

  it("resolves only the Flight root action reference and preserves ok:false", () => {
    const payload = [
      '2:{"ok":true,"source":"adjacent action"}',
      '0:{"a":"$@a","f":[],"q":"","i":true,"b":"development"}',
      'a:D"$b"',
      'a:{"ok":false,"error":"Pick a shoe."}',
    ].join("\n");

    expect(payload).toContain('"ok":true');
    expect(parseManualActivityActionResult(payload)).toEqual({
      ok: false,
      error: "Pick a shoe.",
    });
    expect(() => requireSuccessfulManualActivityActionResult(payload)).toThrow(
      "Manual activity Server Action failed: Pick a shoe."
    );
  });

  it("parses the referenced successful action row after a debug row", () => {
    const payload = [
      '0:{"a":"$@1","f":[],"q":"","i":true,"b":"development"}',
      '1:D"$2"',
      '1:{"ok":true}',
    ].join("\n");

    expect(parseManualActivityActionResult(payload)).toEqual({ ok: true });
  });
});
