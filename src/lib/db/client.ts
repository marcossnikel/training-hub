import fs from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import {
  requireValidRuntimeConfiguration,
  type DatabaseConfiguration,
} from "@/server/config/runtime";

export type { Client, InStatement, Row } from "@libsql/client";

const DATA_DIR = path.join(process.cwd(), "data");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

// Local development uses a plain SQLite file; production points
// TURSO_DATABASE_URL (+ TURSO_AUTH_TOKEN) at a Turso database.
// DATABASE_URL is a local-only override for an isolated SQLite file (E2E tests
// point it at data/e2e.db). Unset in dev/prod, so the default path is unchanged.
const runtimeConfiguration = requireValidRuntimeConfiguration(process.env);
const DB_URL = runtimeConfiguration.database.url;
export const IS_LOCAL_FILE = runtimeConfiguration.database.kind === "file";

export function createDatabaseClient(configuration: DatabaseConfiguration): Client {
  if (configuration.kind === "file") fs.mkdirSync(DATA_DIR, { recursive: true });
  return createClient({
    url: configuration.url,
    authToken: configuration.authToken,
    intMode: "number",
  });
}

declare global {
  var __trainingHubClient: Client | undefined;
}

export const client: Client =
  globalThis.__trainingHubClient ?? createDatabaseClient(runtimeConfiguration.database);
if (process.env.NODE_ENV !== "production") globalThis.__trainingHubClient = client;
