import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

// Saved owner session from the auth.setup project. The read specs reuse it so
// they pass the now-active page gate; kept in sync with e2e/auth.setup.ts.
const STORAGE_STATE = "e2e/.auth/owner.json";

// Isolated SQLite file for E2E: lives under data/ (gitignored) but is a distinct
// file from the dev database (data/app.db) and is never a Turso database. The app
// reads it via the DATABASE_URL override in src/lib/db.ts. The seed step and the
// dev server are given this exact same URL so they hit the same file.
const E2E_DATABASE_URL = `file:${path.join(process.cwd(), "data", "e2e.db")}`;
// This deterministic throwaway key exists only in the test process and the local
// Playwright web server. It is never read from an env file or deployment config.
const E2E_CONNECTION_ENCRYPTION_KEY = Buffer.alloc(32, 58).toString("base64url");
process.env.STRAVA_CONNECTION_ENCRYPTION_KEY = E2E_CONNECTION_ENCRYPTION_KEY;

/**
 * E2E harness for Training Hub. The webServer command reseeds the isolated DB and
 * only then starts `next dev`, so the server always opens an already-seeded file
 * (no stale-inode race). Strava is deliberately kept out of the loop: STRAVA_CLIENT_ID
 * and STRAVA_CLIENT_SECRET are blank, so stravaConfigured() is false and no server-side
 * Strava request is ever made — the connect UI simply shows its disconnected state.
 *
 * Strava-sync E2E (which would need a mock HTTP server) is intentionally out of scope
 * here; the Strava client in src/lib/strava.ts is covered by mocked-fetch unit tests.
 * These specs cover seeded-data read flows only.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    // Logs in once and writes STORAGE_STATE; the read project depends on it.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    // The seeded read flows, run with the saved owner session so the page gate
    // (src/proxy.ts) lets them through. Excludes the setup and the auth spec.
    {
      name: "chromium",
      testIgnore: [/auth\.setup\.ts/, /auth\.spec\.ts/, /mobile\.spec\.ts/],
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      dependencies: ["setup"],
    },
    // The login/logout flow itself must run UNAUTHENTICATED (no storageState).
    {
      name: "chromium-guest",
      testMatch: /auth\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
    // A narrow viewport, because every project above is Desktop Chrome and so the
    // gate could never catch a layout that only breaks on a phone. 375px is the
    // narrowest width we support (iPhone SE / 13 mini).
    {
      name: "mobile",
      testMatch: /mobile\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 667 },
        storageState: STORAGE_STATE,
      },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    // Reset + seed the isolated DB, then boot `next dev` (fast boot; a build+start
    // is unnecessary for these read flows). Seeding runs before the server opens
    // the file, so the server never sees an empty database.
    command: `npm run e2e:seed && npm run dev -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    // Generous timeout for seeding plus the first on-demand route compile.
    timeout: 120_000,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      // No valid Strava app; blank Turso creds keep every DB access local.
      STRAVA_CLIENT_ID: "",
      STRAVA_CLIENT_SECRET: "",
      TURSO_DATABASE_URL: "",
      TURSO_AUTH_TOKEN: "",
      BETTER_AUTH_SECRET: "e2e-signing-secret-please-do-not-reuse",
      BETTER_AUTH_URL: BASE_URL,
      STRAVA_CONNECTION_ENCRYPTION_KEY: E2E_CONNECTION_ENCRYPTION_KEY,
    },
  },
});
