import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const RETIRED_TOKENS = [
  "ANTHROPIC_API_KEY",
  "@anthropic-ai/sdk",
  "activity_chat",
  "coach_insight",
  "CoachChat",
  "sendCoachMessageAction",
  "clearCoachAction",
  "computeZonesAction",
  "generateActivityInsightAction",
] as const;

function filesUnder(relative: string): string[] {
  const absolute = path.join(ROOT, relative);
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(relative, entry.name);
    return entry.isDirectory() ? filesUnder(child) : [child];
  });
}

describe("retired prototype coach", () => {
  it("has no coach SDK, configuration, action, UI, or persistence references in product code", () => {
    const files = filesUnder("src").filter(
      (file) => /\.(ts|tsx)$/.test(file) && !/\.test\.[tj]sx?$/.test(file)
    );
    const productCode = files.map((file) => ({
      file,
      text: fs.readFileSync(path.join(ROOT, file), "utf8"),
    }));

    for (const token of RETIRED_TOKENS) {
      expect(
        productCode.filter(({ text }) => text.includes(token)).map(({ file }) => file)
      ).toEqual([]);
    }
    expect(fs.existsSync(path.join(ROOT, "src/lib/coach.ts"))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, "src/lib/db/coach.ts"))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, "src/components/coach-chat.tsx"))).toBe(false);
    expect(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).not.toContain(
      "@anthropic-ai/sdk"
    );
  });
});
