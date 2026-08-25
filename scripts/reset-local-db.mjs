#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const confirmation = "--confirm-reset-disposable-data";
const dryRun = process.argv.includes("--dry-run");
const mode = process.env.TRAINING_HUB_ENV || "local";
const tursoUrl =
  process.env.TRAINING_HUB_TURSO_DATABASE_URL || process.env.TURSO_DATABASE_URL || "";
const tursoAuthToken =
  process.env.TRAINING_HUB_TURSO_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || "";
const vercelEnvironment = process.env.VERCEL_ENV || "";
const databaseUrl = process.env.DATABASE_URL || "file:data/app.db";

function refuse(message) {
  console.error(`Refusing database reset: ${message}`);
  process.exit(1);
}

if (!new Set(["local", "e2e"]).has(mode)) {
  refuse(`TRAINING_HUB_ENV=${mode} is not a disposable local/E2E environment`);
}
if (tursoUrl)
  refuse("a Turso database URL is set; remote databases are never reset by this command");
if (tursoAuthToken)
  refuse("a Turso auth token is set; remote credentials are never accepted by this command");
if (vercelEnvironment === "preview" || vercelEnvironment === "production") {
  refuse(`VERCEL_ENV=${vercelEnvironment} is never a disposable reset target`);
}
if (!databaseUrl.startsWith("file:")) refuse("DATABASE_URL must be a local file: URL");
if (!process.argv.includes(confirmation)) {
  refuse(`pass ${confirmation} after verifying the target is disposable`);
}

const target = path.resolve(process.cwd(), databaseUrl.slice("file:".length));
const allowedTargets = new Set([
  path.resolve(process.cwd(), "data/app.db"),
  path.resolve(process.cwd(), "data/e2e.db"),
]);
if (!allowedTargets.has(target)) {
  refuse("target must be exactly data/app.db or data/e2e.db");
}

if (dryRun) {
  console.log(`Disposable reset target verified: ${target}`);
  process.exit(0);
}

for (const suffix of ["", "-shm", "-wal", "-journal"]) {
  fs.rmSync(`${target}${suffix}`, { force: true });
}
console.log(`Reset disposable ${mode} database: ${target}`);
