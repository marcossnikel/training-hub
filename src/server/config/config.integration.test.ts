import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { catalogParityErrors } from "./catalog";
import { requireValidRuntimeConfiguration, resolveRuntimeConfiguration } from "./runtime";
import { createDatabaseClient } from "@/lib/db/client";

const temporaryPaths: string[] = [];

function temporaryDatabase(name: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "training-hub-config-"));
  temporaryPaths.push(directory);
  return path.join(directory, `${name}.db`);
}

function syntheticEnvironment(overrides: Record<string, string | undefined>) {
  const env = { ...process.env };
  for (const key of [
    "TRAINING_HUB_ENV",
    "DATABASE_URL",
    "TURSO_DATABASE_URL",
    "TURSO_AUTH_TOKEN",
    "TRAINING_HUB_TURSO_DATABASE_URL",
    "TRAINING_HUB_TURSO_AUTH_TOKEN",
    "VERCEL_ENV",
    "TRAINING_HUB_PRODUCTION_APPROVED",
    "ALLOW_REMOTE_DB",
    "STRIPE_MODE",
    "BETTER_AUTH_SECRET",
  ]) {
    delete env[key];
  }
  return { ...env, ...overrides } as NodeJS.ProcessEnv;
}

function run(command: string, env: NodeJS.ProcessEnv) {
  return spawnSync("npx", ["tsx", command], { cwd: process.cwd(), env, encoding: "utf8" });
}

afterEach(async () => {
  for (const target of temporaryPaths.splice(0))
    fs.rmSync(target, { recursive: true, force: true });
});

describe("runtime configuration integration", () => {
  it("prefers the explicit Training Hub Turso target over Marketplace overrides", () => {
    const env = {
      TRAINING_HUB_TURSO_DATABASE_URL: "libsql://stable-production.example",
      TRAINING_HUB_TURSO_AUTH_TOKEN: "stable-token",
      TURSO_DATABASE_URL: "libsql://dpl-preview.example",
      TURSO_AUTH_TOKEN: "deployment-token",
      DATABASE_URL: "file:data/ignored.db",
    };

    expect(resolveRuntimeConfiguration(env).database.url).toBe(
      "libsql://stable-production.example"
    );
    expect(resolveRuntimeConfiguration(env).database.authToken).toBe("stable-token");
  });

  it("keeps the existing Turso, local override, and default fallbacks", () => {
    expect(
      resolveRuntimeConfiguration({ TURSO_DATABASE_URL: "libsql://existing.example" }).database.url
    ).toBe("libsql://existing.example");
    expect(resolveRuntimeConfiguration({ DATABASE_URL: "file:data/e2e.db" }).database.url).toBe(
      "file:data/e2e.db"
    );
    expect(resolveRuntimeConfiguration({}).database.url).toBe("file:data/app.db");
  });

  it("resolves every runtime identity without shared process mutation", () => {
    const cases = [
      [{ TRAINING_HUB_ENV: "local" }, "local", []],
      [
        { TRAINING_HUB_ENV: "e2e", DATABASE_URL: "file:data/e2e.db", NODE_ENV: "production" },
        "e2e",
        [],
      ],
      [
        {
          TRAINING_HUB_ENV: "preview",
          VERCEL_ENV: "preview",
          TURSO_DATABASE_URL: "libsql://preview-db.example",
        },
        "preview",
        [],
      ],
      [
        {
          TRAINING_HUB_ENV: "production",
          VERCEL_ENV: "production",
          TRAINING_HUB_PRODUCTION_APPROVED: "1",
          TURSO_DATABASE_URL: "libsql://production-db.example",
        },
        "production",
        [],
      ],
      [
        { TRAINING_HUB_ENV: "preview", DATABASE_URL: "file:data/app.db" },
        "preview",
        ["preview-vercel-environment", "preview-local-database", "preview-database-host"],
      ],
      [{ TRAINING_HUB_ENV: "unknown" }, "local", ["invalid-runtime-identity"]],
    ] as const;

    for (const [env, identity, issues] of cases) {
      const result = resolveRuntimeConfiguration(env);
      expect(result.identity).toBe(identity);
      expect(result.issues).toEqual(issues);
    }
  });

  it("refuses invalid application composition without disclosing values", () => {
    const canary = "runtime-config-canary-secret";
    expect(() =>
      requireValidRuntimeConfiguration({
        TRAINING_HUB_ENV: "local",
        TURSO_DATABASE_URL: "libsql://shared.example",
        TURSO_AUTH_TOKEN: canary,
      })
    ).toThrow("local-remote-database");
    try {
      requireValidRuntimeConfiguration({
        TURSO_DATABASE_URL: "libsql://shared.example",
        TURSO_AUTH_TOKEN: canary,
      });
    } catch (error) {
      expect(String(error)).not.toContain(canary);
    }
  });

  it("creates isolated disposable database clients concurrently", async () => {
    const first = createDatabaseClient({
      url: `file:${temporaryDatabase("first")}`,
      authToken: undefined,
      kind: "file",
      host: null,
    });
    const second = createDatabaseClient({
      url: `file:${temporaryDatabase("second")}`,
      authToken: undefined,
      kind: "file",
      host: null,
    });
    await Promise.all([
      first.execute("CREATE TABLE values_table (value TEXT)"),
      second.execute("CREATE TABLE values_table (value TEXT)"),
    ]);
    await Promise.all([
      first.execute("INSERT INTO values_table VALUES ('first')"),
      second.execute("INSERT INTO values_table VALUES ('second')"),
    ]);
    expect((await first.execute("SELECT value FROM values_table")).rows[0].value).toBe("first");
    expect((await second.execute("SELECT value FROM values_table")).rows[0].value).toBe("second");
    first.close();
    second.close();
  });

  it("runs doctor and boundary checks without revealing a canary secret", () => {
    const canary = "runtime-config-canary-secret";
    const local = run("scripts/doctor.ts", syntheticEnvironment({ BETTER_AUTH_SECRET: canary }));
    expect(local.status).toBe(0);
    expect(local.stdout).toContain('"runtime":"local"');
    expect(`${local.stdout}${local.stderr}`).not.toContain(canary);

    const preview = run(
      "scripts/doctor.ts",
      syntheticEnvironment({
        TRAINING_HUB_ENV: "preview",
        VERCEL_ENV: "preview",
        TURSO_DATABASE_URL: "libsql://preview-config.example",
        BETTER_AUTH_SECRET: canary,
      })
    );
    expect(preview.status).toBe(0);
    expect(preview.stdout).toContain('"kind":"remote"');
    expect(`${preview.stdout}${preview.stderr}`).not.toContain(canary);

    const unsafeLocal = run(
      "scripts/check-environment-boundary.ts",
      syntheticEnvironment({ TURSO_DATABASE_URL: "libsql://shared.example" })
    );
    const unsafePreview = run(
      "scripts/check-environment-boundary.ts",
      syntheticEnvironment({
        TRAINING_HUB_ENV: "preview",
        VERCEL_ENV: "preview",
        TURSO_DATABASE_URL: "libsql://production.example",
      })
    );
    const unsafeProduction = run(
      "scripts/check-environment-boundary.ts",
      syntheticEnvironment({
        TRAINING_HUB_ENV: "production",
        VERCEL_ENV: "production",
        TURSO_DATABASE_URL: "libsql://production.example",
      })
    );
    expect(unsafeLocal.status).toBe(1);
    expect(unsafePreview.status).toBe(1);
    expect(unsafeProduction.status).toBe(1);
    expect(
      `${unsafeLocal.stdout}${unsafeLocal.stderr}${unsafePreview.stdout}${unsafePreview.stderr}${unsafeProduction.stdout}${unsafeProduction.stderr}`
    ).not.toContain(canary);
  });

  it("keeps the documented environment catalog in parity and fails stale fixtures", () => {
    const example = fs.readFileSync(path.join(process.cwd(), ".env.example"), "utf8");
    const documentation = fs.readFileSync(
      path.join(process.cwd(), "docs/environment-boundaries.md"),
      "utf8"
    );
    expect(catalogParityErrors({ example, documentation })).toEqual([]);
    expect(
      catalogParityErrors({ example: `${example}\nSTALE_FIXTURE_VALUE=\n`, documentation })
    ).toContain("STALE_FIXTURE_VALUE is present in .env.example but absent from the catalog");
  });

  it("uses Next's server-only marker, which rejects the client marker module", async () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/server/config/server.ts"), "utf8");
    expect(source).toContain('import "server-only"');
    await expect(
      import(pathToFileURL(path.join(process.cwd(), "node_modules/server-only/index.js")).href)
    ).rejects.toThrow("cannot be imported from a Client Component");
  });
});
