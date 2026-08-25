import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
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

function committedConfigArtifacts(): string[] {
  return execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter((file) => /(^|\/)\.env(?:\.[^/]+)?$|(?:^|\/)\w+\.config\.[^/]+$/.test(file))
    .filter((file) => fs.existsSync(path.join(ROOT, file)));
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

  it("has no retired provider configuration in committed environment or config templates", () => {
    const artifacts = committedConfigArtifacts();
    expect(artifacts).toContain(".env.example");

    for (const file of artifacts) {
      const text = fs.readFileSync(path.join(ROOT, file), "utf8");
      expect(text, file).not.toContain("ANTHROPIC_API_KEY");
      expect(text, file).not.toContain("@anthropic-ai/sdk");
    }
  });
});
