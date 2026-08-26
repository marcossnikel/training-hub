import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
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
const E2E_APP_COMMAND =
  process.env.E2E_PRODUCTION === "1"
    ? `echo "E2E production smoke: disposable file:data/e2e.db + loopback Strava provider" && npm run e2e:seed && echo "E2E production smoke: next build" && npm run build && echo "E2E production smoke: next start" && npm run start -- --port ${PORT}`
    : `npm run e2e:seed && npm run dev -- --port ${PORT}`;
const E2E_SERVER_COMMAND = `sh -c 'node scripts/e2e-strava-provider.mjs & training_hub_mock_pid=$!; trap "kill $training_hub_mock_pid 2>/dev/null || true" EXIT INT TERM; ${E2E_APP_COMMAND}'`;
process.env.STRAVA_CONNECTION_ENCRYPTION_KEY = E2E_CONNECTION_ENCRYPTION_KEY;

/**
 * E2E harness for Training Hub. The webServer command reseeds the isolated DB and
 * only then starts `next dev`, so the server always opens an already-seeded file
 * (no stale-inode race). The E2E harness uses only each disposable owner's stored
 * BYO connection; no process-wide Strava credential is available to the app.
 *
 * A disposable loopback Strava double runs only for this E2E process. Production
 * ignores its explicit loopback-only origin, so normal deployments retain
 * Strava's fixed HTTPS endpoints.
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
    // (src/proxy.ts) lets them through. The mutation lane below owns every
    // spec that can write to SQLite; this project stays parallel because it
    // only reads the seeded or already-proven fixture data.
    {
      name: "chromium",
      testIgnore: [
        /auth\.setup\.ts/,
        /auth\.refresh\.setup\.ts/,
        /auth\.spec\.ts/,
        /connection-activation\.spec\.ts/,
        /byo-connection\.spec\.ts/,
        /comparable-activity\.spec\.ts/,
        /gear\.spec\.ts/,
        /guest-data-boundary\.spec\.ts/,
        /insight-feedback\.spec\.ts/,
        /beta-invite\.spec\.ts/,
        /admin-invites\.spec\.ts/,
        /mobile\.spec\.ts/,
        /onboarding\.spec\.ts/,
        /private-beta-landing\.spec\.ts/,
        /tenant-isolation\.spec\.ts/,
        /production-smoke\.spec\.ts/,
      ],
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      dependencies: ["refresh-owner-session"],
    },
    // #37 temporarily changes only the disposable local schema to prove the
    // route's actual error boundary and retry. Run it alone and before other
    // read specs so that proof cannot leak into their shared seeded fixture.
    {
      name: "beta-invites",
      testMatch: /beta-invite\.spec\.ts/,
      workers: 1,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
    // R18 owns a brand-new disposable account and does not need the shared
    // fixture owner. Keeping it independent makes its callback-to-summary
    // proof executable even if an unrelated shared-read project is unhealthy.
    {
      name: "connection-activation",
      testMatch: /connection-activation\.spec\.ts/,
      workers: 1,
      use: { ...devices["Desktop Chrome"] },
      // It owns a separate account but still writes the shared disposable
      // SQLite file; keep it in the serialized mutation lane so account
      // creation cannot race any fixture writes.
      dependencies: ["insight-feedback"],
    },
    {
      name: "creator-invites",
      testMatch: /admin-invites\.spec\.ts/,
      workers: 1,
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      dependencies: ["setup"],
    },
    {
      name: "comparable-activity",
      testMatch: /comparable-activity\.spec\.ts/,
      workers: 1,
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      dependencies: ["beta-invites"],
    },
    // #38 mutates only its owner-scoped, disposable feedback records. Keep it
    // serial and before the remaining database-writing lane.
    {
      name: "insight-feedback",
      testMatch: /insight-feedback\.spec\.ts/,
      workers: 1,
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      dependencies: ["comparable-activity"],
    },
    // These are the remaining authenticated specs that mutate the one
    // disposable SQLite database. They deliberately run after the schema-error
    // proof above and before the guest-boundary proof, one worker at a time.
    // Read-only projects still run in parallel once this short mutation lane
    // completes; this is not a suite-wide serialization or a retry policy.
    {
      name: "owner-mutations",
      testMatch: [
        /byo-connection\.spec\.ts/,
        /gear\.spec\.ts/,
        /onboarding\.spec\.ts/,
        /tenant-isolation\.spec\.ts/,
      ],
      workers: 1,
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      dependencies: ["connection-activation"],
    },
    // The login/logout flow itself must run UNAUTHENTICATED (no storageState).
    {
      name: "chromium-guest",
      testMatch: /auth\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["guest-data-boundary"],
    },
    // Tenant isolation explicitly revokes the first saved fixture session.
    // Refresh it after every writing project completes, then fan out read-only
    // projects with a valid state instead of racing that intentional logout.
    {
      name: "refresh-owner-session",
      testMatch: /auth\.refresh\.setup\.ts/,
      workers: 1,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["chromium-guest"],
    },
    // #58 needs a completely cookie-free browser and HTTP client. It creates
    // disposable owner data first, then proves both HTML and RSC guests cannot
    // receive it after an authenticated render has primed the app.
    {
      name: "guest-data-boundary",
      testMatch: /guest-data-boundary\.spec\.ts/,
      workers: 1,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["owner-mutations"],
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
      dependencies: ["refresh-owner-session"],
    },
    // #40 is deliberately exercised with both a cookie-free landing document
    // and the refreshed authenticated owner state. It reads only, so it can
    // run beside the other final read-only projects.
    {
      name: "private-beta-landing",
      testMatch: /private-beta-landing\.spec\.ts/,
      workers: 1,
      use: { ...devices["Desktop Chrome"] },
      // This spec writes only a temporary volume fixture to prove the real
      // root loading boundary. Keep it after all other database consumers.
      dependencies: ["chromium", "mobile"],
    },
    // This has no setup dependency or saved browser state. It proves the
    // guest-only entry boundaries against a command-owned `next build` +
    // `next start` server and never enters the wider mutation graph.
    {
      name: "production-smoke",
      testMatch: /production-smoke\.spec\.ts/,
      workers: 1,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Reset + seed before the server opens the file, so it never sees an empty
    // database. The loopback provider serves only this E2E process;
    // E2E_PRODUCTION=1 switches the application process to build + start for
    // the narrow production smoke while the ordinary verification suite stays
    // fast. A production smoke always owns this port, even outside CI.
    command: E2E_SERVER_COMMAND,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI && process.env.E2E_PRODUCTION !== "1",
    // Generous timeout for seeding plus the first on-demand route compile.
    timeout: 120_000,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      // Blank Turso credentials keep every DB access local.
      TURSO_DATABASE_URL: "",
      TURSO_AUTH_TOKEN: "",
      BETTER_AUTH_SECRET: "e2e-signing-secret-please-do-not-reuse",
      BETTER_AUTH_URL: BASE_URL,
      STRAVA_CONNECTION_ENCRYPTION_KEY: E2E_CONNECTION_ENCRYPTION_KEY,
      TRAINING_HUB_E2E: "1",
      TRAINING_HUB_ENV: "e2e",
      TRAINING_HUB_DISPOSABLE_DATA: "1",
      TRAINING_HUB_INVITE_TARGET: "local",
      TRAINING_HUB_PUBLIC_ORIGIN: BASE_URL,
      BETA_INVITE_REGISTRATION_ENABLED: "1",
      TRAINING_HUB_INSIGHT_FEEDBACK_ENABLED: "1",
      TRAINING_HUB_STRAVA_TEST_PROVIDER_ORIGIN: "http://127.0.0.1:3210",
    },
  },
});
