import { describe, expect, it } from "vitest";
import { resolveDatabaseUrl, resolveTursoAuthToken, resolveTursoDatabaseUrl } from "./db/config";

describe("database configuration", () => {
  it("prefers the explicit Training Hub Turso target over Marketplace overrides", () => {
    const env = {
      TRAINING_HUB_TURSO_DATABASE_URL: "libsql://stable-production.example",
      TRAINING_HUB_TURSO_AUTH_TOKEN: "stable-token",
      TURSO_DATABASE_URL: "libsql://dpl-preview.example",
      TURSO_AUTH_TOKEN: "deployment-token",
      DATABASE_URL: "file:data/ignored.db",
    };

    expect(resolveTursoDatabaseUrl(env)).toBe("libsql://stable-production.example");
    expect(resolveTursoAuthToken(env)).toBe("stable-token");
    expect(resolveDatabaseUrl(env)).toBe("libsql://stable-production.example");
  });

  it("keeps the existing Turso, local override, and default fallbacks", () => {
    expect(resolveDatabaseUrl({ TURSO_DATABASE_URL: "libsql://existing.example" })).toBe(
      "libsql://existing.example"
    );
    expect(resolveDatabaseUrl({ DATABASE_URL: "file:data/e2e.db" })).toBe("file:data/e2e.db");
    expect(resolveDatabaseUrl({})).toBe("file:data/app.db");
  });
});
