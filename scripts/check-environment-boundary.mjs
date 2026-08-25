#!/usr/bin/env node

const mode = process.env.TRAINING_HUB_ENV || "local";
const allowedModes = new Set(["local", "e2e", "preview", "production"]);
const failures = [];

const tursoUrl = process.env.TURSO_DATABASE_URL || "";
const databaseUrl = process.env.DATABASE_URL || "";
const resolvedDatabaseUrl = tursoUrl || databaseUrl || "file:data/app.db";
const isLocalFile = resolvedDatabaseUrl.startsWith("file:");
const isRemoteDatabase = !isLocalFile;

function fail(message) {
  failures.push(message);
}

function urlHost(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

if (!allowedModes.has(mode)) {
  fail(`TRAINING_HUB_ENV must be one of local, e2e, preview, production (got ${mode})`);
}

if (mode === "local" || mode === "e2e") {
  if (tursoUrl || process.env.TURSO_AUTH_TOKEN) {
    fail(`${mode} must not set TURSO_DATABASE_URL or TURSO_AUTH_TOKEN`);
  }
  if (isRemoteDatabase) {
    fail(`${mode} must resolve to a file: database, got ${urlHost(resolvedDatabaseUrl)}`);
  }
}

if (mode === "e2e" && databaseUrl && !databaseUrl.startsWith("file:")) {
  fail("e2e DATABASE_URL must be a file: URL");
}

if (mode === "preview") {
  if (process.env.VERCEL_ENV !== "preview") {
    fail("preview requires VERCEL_ENV=preview");
  }
  if (!isRemoteDatabase) {
    fail("preview must use its dedicated remote preview/staging database");
  }
  if (!/preview|staging/i.test(urlHost(resolvedDatabaseUrl))) {
    fail("preview database host must contain preview or staging");
  }
  if (process.env.ALLOW_REMOTE_DB === "1") {
    fail("preview must not set ALLOW_REMOTE_DB=1");
  }
}

if (mode === "production") {
  if (process.env.VERCEL_ENV !== "production") {
    fail("production requires VERCEL_ENV=production");
  }
  if (process.env.TRAINING_HUB_PRODUCTION_APPROVED !== "1") {
    fail("production requires explicit TRAINING_HUB_PRODUCTION_APPROVED=1");
  }
  if (!isRemoteDatabase) {
    fail("production must use its dedicated remote production database");
  }
}

const stripeMode = process.env.STRIPE_MODE || "";
if (mode !== "production" && stripeMode === "live") {
  fail(`${mode} must not set STRIPE_MODE=live`);
}
if (stripeMode && stripeMode !== "test" && stripeMode !== "live") {
  fail("STRIPE_MODE must be test or live");
}

for (const [name, value] of Object.entries(process.env)) {
  if (!name.startsWith("STRIPE_") || !value) continue;
  if (mode !== "production" && /^sk_live_|^pk_live_/i.test(value)) {
    fail(`${mode} must not expose a live Stripe key in ${name}`);
  }
}

if (failures.length > 0) {
  console.error("Environment boundary check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const databaseKind = isLocalFile ? "file" : "dedicated remote";
const stripeKind = stripeMode || "unset";
console.log(`Environment boundary OK: ${mode} (database=${databaseKind}, stripe=${stripeKind})`);
