import fs from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";
import {
  BehindSchemaError,
  OWNER_SCHEMA_FLOOR,
  OWNER_SCHEMA_VERSION,
  createVersion23Fixture,
  runMigrations,
  type AdditiveMigration,
} from "./db/migrations";
import { validateMigrationCommand } from "@/server/config/migration-command";

const files: string[] = [];

function disposableClient(label: string): { client: Client; file: string } {
  const file = path.join(
    os.tmpdir(),
    `training-hub-r2m-${label}-${process.pid}-${Date.now()}-${files.length}.db`
  );
  files.push(file);
  return { client: createClient({ url: `file:${file}`, intMode: "number" }), file };
}

async function schemaVersion(client: Client): Promise<number> {
  const result = await client.execute("SELECT version FROM schema_version WHERE id = 1");
  return Number(result.rows[0].version);
}

async function hasColumn(client: Client, table: string, column: string): Promise<boolean> {
  const result = await client.execute(`SELECT name FROM pragma_table_info('${table}')`);
  return result.rows.some((row) => String(row.name) === column);
}

afterEach(() => {
  for (const file of files.splice(0)) {
    for (const suffix of ["", "-shm", "-wal", "-journal"])
      fs.rmSync(`${file}${suffix}`, { force: true });
  }
});

describe("additive owner schema migrations", () => {
  it("builds a fresh latest schema once and preserves seeded rows on a second start", async () => {
    const { client } = disposableClient("fresh");
    try {
      await runMigrations(client, { autoApply: true });
      await client.batch(
        [
          {
            sql: 'INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
            args: ["auth-fresh", "Fresh", "fresh@example.test", 0, "2026-01-01", "2026-01-01"],
          },
          {
            sql: "INSERT INTO users (id, auth_subject) VALUES (?, ?)",
            args: ["fresh", "auth-fresh"],
          },
        ],
        "write"
      );
      await runMigrations(client, { autoApply: true });
      expect(await schemaVersion(client)).toBe(OWNER_SCHEMA_VERSION);
      expect(await hasColumn(client, "schema_version", "applied_at")).toBe(true);
      const rows = await client.execute("SELECT id, auth_subject FROM users");
      expect(rows.rows).toEqual([{ id: "fresh", auth_subject: "auth-fresh" }]);
    } finally {
      client.close();
    }
  });

  it("migrates the exact v23 fixture additively and idempotently", async () => {
    const { client } = disposableClient("v23");
    try {
      await createVersion23Fixture(client);
      await client.batch(
        [
          {
            sql: 'INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
            args: ["auth-v23", "V23", "v23@example.test", 0, "2026-01-01", "2026-01-01"],
          },
          { sql: "INSERT INTO users (id, auth_subject) VALUES (?, ?)", args: ["v23", "auth-v23"] },
        ],
        "write"
      );
      expect(await schemaVersion(client)).toBe(OWNER_SCHEMA_FLOOR);
      await runMigrations(client, { autoApply: true });
      await runMigrations(client, { autoApply: true });
      expect(await schemaVersion(client)).toBe(OWNER_SCHEMA_VERSION);
      expect(await hasColumn(client, "schema_version", "applied_at")).toBe(true);
      const rows = await client.execute("SELECT id, auth_subject FROM users");
      expect(rows.rows).toEqual([{ id: "v23", auth_subject: "auth-v23" }]);
    } finally {
      client.close();
    }
  });

  it("migrates only saved legacy profile values into athlete-entered observations", async () => {
    const { client } = disposableClient("r19-profile");
    try {
      await runMigrations(client, { autoApply: true });
      await client.batch(
        [
          {
            sql: 'INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
            args: ["auth-saved", "Saved", "saved@example.test", 0, "2026-01-01", "2026-01-01"],
          },
          {
            sql: "INSERT INTO users (id, auth_subject) VALUES (?, ?)",
            args: ["saved", "auth-saved"],
          },
          {
            sql: "INSERT INTO athlete_profiles (user_id, max_hr, threshold_pace_s_per_km, updated_at) VALUES (?, ?, ?, ?)",
            args: ["saved", 193, 287, "2026-02-03T04:05:06Z"],
          },
          {
            sql: 'INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
            args: ["auth-empty", "Empty", "empty@example.test", 0, "2026-01-01", "2026-01-01"],
          },
          {
            sql: "INSERT INTO users (id, auth_subject) VALUES (?, ?)",
            args: ["empty", "auth-empty"],
          },
          "DELETE FROM athlete_parameter_effective",
          "DELETE FROM athlete_parameter_observations",
          "UPDATE schema_version SET version = 31 WHERE id = 1",
        ],
        "write"
      );
      await runMigrations(client, { autoApply: true });
      expect(await schemaVersion(client)).toBe(OWNER_SCHEMA_VERSION);
      expect(
        (
          await client.execute({
            sql: `SELECT parameter_key, numeric_value, unit, provenance, observed_at
                    FROM athlete_parameter_observations WHERE user_id = ? ORDER BY parameter_key`,
            args: ["saved"],
          })
        ).rows
      ).toEqual([
        {
          parameter_key: "max_hr_bpm",
          numeric_value: 193,
          unit: "bpm",
          provenance: "athlete_entered",
          observed_at: "2026-02-03T04:05:06Z",
        },
        {
          parameter_key: "threshold_pace_sec_per_km",
          numeric_value: 287,
          unit: "s/km",
          provenance: "athlete_entered",
          observed_at: "2026-02-03T04:05:06Z",
        },
      ]);
      expect(
        (
          await client.execute({
            sql: "SELECT * FROM athlete_parameter_effective WHERE user_id = ?",
            args: ["empty"],
          })
        ).rows
      ).toEqual([]);
    } finally {
      client.close();
    }
  });

  it("rolls back a failed additive migration without changing v23 data or schema", async () => {
    const { client } = disposableClient("rollback");
    const failing: readonly AdditiveMigration[] = [
      {
        version: OWNER_SCHEMA_VERSION,
        statements: ["ALTER TABLE users ADD COLUMN migration_failure_probe TEXT", "INVALID SQL"],
      },
    ];
    try {
      await createVersion23Fixture(client);
      await client.batch(
        [
          {
            sql: 'INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
            args: ["auth-keep", "Keep", "keep@example.test", 0, "2026-01-01", "2026-01-01"],
          },
          {
            sql: "INSERT INTO users (id, auth_subject) VALUES (?, ?)",
            args: ["keep", "auth-keep"],
          },
        ],
        "write"
      );
      await expect(
        runMigrations(client, { autoApply: true, migrations: failing })
      ).rejects.toThrow();
      expect(await schemaVersion(client)).toBe(OWNER_SCHEMA_FLOOR);
      expect(await hasColumn(client, "users", "migration_failure_probe")).toBe(false);
      expect(await hasColumn(client, "schema_version", "applied_at")).toBe(false);
      expect((await client.execute("SELECT id FROM users")).rows).toEqual([{ id: "keep" }]);
    } finally {
      client.close();
    }
  });

  it("auto-applies for disposable local/E2E runners but remote startup only reads and refuses", async () => {
    const { client } = disposableClient("remote-gate");
    try {
      await createVersion23Fixture(client);
      await expect(runMigrations(client, { autoApply: false })).rejects.toBeInstanceOf(
        BehindSchemaError
      );
      expect(await schemaVersion(client)).toBe(OWNER_SCHEMA_FLOOR);
      expect(await hasColumn(client, "schema_version", "applied_at")).toBe(false);
      await runMigrations(client, { autoApply: true });
      expect(await schemaVersion(client)).toBe(OWNER_SCHEMA_VERSION);
    } finally {
      client.close();
    }
  });

  it("serializes two concurrent v23 runners into one complete v24 migration", async () => {
    const { client: setup, file } = disposableClient("concurrent");
    await createVersion23Fixture(setup);
    setup.close();
    const one = createClient({ url: `file:${file}`, intMode: "number" });
    const two = createClient({ url: `file:${file}`, intMode: "number" });
    try {
      await Promise.all([
        runMigrations(one, { autoApply: true }),
        runMigrations(two, { autoApply: true }),
      ]);
      expect(await schemaVersion(one)).toBe(OWNER_SCHEMA_VERSION);
      expect(await hasColumn(one, "schema_version", "applied_at")).toBe(true);
    } finally {
      one.close();
      two.close();
    }
  });
});

describe("guarded remote migration command", () => {
  const secretCanary = "do-not-print-this-token";
  const preview = {
    TRAINING_HUB_ENV: "preview",
    VERCEL_ENV: "preview",
    TURSO_DATABASE_URL: "libsql://training-hub-preview.example",
    TURSO_AUTH_TOKEN: secretCanary,
    STRIPE_MODE: "test",
  };

  it("refuses missing approval, mismatched target, and unsafe configuration before client creation", () => {
    for (const [args, env] of [
      [["--target=preview"], preview],
      [["--target=production", "--approve-remote-migration"], preview],
      [
        ["--target=preview", "--approve-remote-migration"],
        { ...preview, VERCEL_ENV: "production" },
      ],
    ] as const) {
      try {
        validateMigrationCommand(args, env);
        throw new Error("expected command validation to fail");
      } catch (error) {
        expect(String(error)).not.toContain(secretCanary);
      }
    }
  });

  it("accepts only an explicitly approved matching remote target", () => {
    expect(
      validateMigrationCommand(["--target=preview", "--approve-remote-migration"], preview).command
    ).toEqual({ target: "preview" });
  });

  it("keeps secret-bearing configuration out of rejected command output", () => {
    const result = spawnSync(
      path.join(process.cwd(), "node_modules/.bin/tsx"),
      ["scripts/migrate.ts", "--target=production", "--approve-remote-migration"],
      { env: { ...process.env, ...preview }, encoding: "utf8" }
    );
    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).not.toContain(secretCanary);
  });
});
