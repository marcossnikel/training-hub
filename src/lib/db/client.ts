import fs from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { resolveDatabaseUrl, resolveTursoAuthToken } from "./config";

export type { Client, InStatement, Row } from "@libsql/client";

const DATA_DIR = path.join(process.cwd(), "data");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

// Local development uses a plain SQLite file; production points
// TURSO_DATABASE_URL (+ TURSO_AUTH_TOKEN) at a Turso database.
// DATABASE_URL is a local-only override for an isolated SQLite file (E2E tests
// point it at data/e2e.db). Unset in dev/prod, so the default path is unchanged.
const DB_URL = resolveDatabaseUrl();
export const IS_LOCAL_FILE = DB_URL.startsWith("file:");

function makeClient(): Client {
  if (IS_LOCAL_FILE) fs.mkdirSync(DATA_DIR, { recursive: true });
  return createClient({
    url: DB_URL,
    authToken: resolveTursoAuthToken(),
    intMode: "number",
  });
}

declare global {
  var __trainingHubClient: Client | undefined;
}

export const client: Client = globalThis.__trainingHubClient ?? makeClient();
if (process.env.NODE_ENV !== "production") globalThis.__trainingHubClient = client;
