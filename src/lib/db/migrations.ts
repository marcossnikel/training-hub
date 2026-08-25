import type { Client, InStatement } from "@libsql/client";
import { client, IS_LOCAL_FILE } from "./client";

// #23 is a deliberate fresh-schema cutover under D-005. It is not a destructive
// migration for an existing database: callers must explicitly reset disposable
// local/E2E data before bootstrapping this schema.
export const OWNER_SCHEMA_FLOOR = 23;
export const OWNER_SCHEMA_VERSION = 25;

export const OWNER_SCHEMA_V23: readonly string[] = [
  // Better Auth tables are retained exactly as established by #22.
  `CREATE TABLE IF NOT EXISTS "user" (
     "id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL,
     "email" TEXT NOT NULL UNIQUE, "emailVerified" INTEGER NOT NULL,
     "image" TEXT, "createdAt" DATE NOT NULL, "updatedAt" DATE NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS "session" (
     "id" TEXT NOT NULL PRIMARY KEY, "expiresAt" DATE NOT NULL,
     "token" TEXT NOT NULL UNIQUE, "createdAt" DATE NOT NULL,
     "updatedAt" DATE NOT NULL, "ipAddress" TEXT, "userAgent" TEXT,
     "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
   )`,
  `CREATE TABLE IF NOT EXISTS "account" (
     "id" TEXT NOT NULL PRIMARY KEY, "accountId" TEXT NOT NULL,
     "providerId" TEXT NOT NULL, "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
     "accessToken" TEXT, "refreshToken" TEXT, "idToken" TEXT,
     "accessTokenExpiresAt" DATE, "refreshTokenExpiresAt" DATE, "scope" TEXT,
     "password" TEXT, "createdAt" DATE NOT NULL, "updatedAt" DATE NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS "verification" (
     "id" TEXT NOT NULL PRIMARY KEY, "identifier" TEXT NOT NULL,
     "value" TEXT NOT NULL, "expiresAt" DATE NOT NULL,
     "createdAt" DATE NOT NULL, "updatedAt" DATE NOT NULL
   )`,
  'CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session"("userId")',
  'CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account"("userId")',
  'CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification"("identifier")',

  // Application ownership is deliberately distinct from Better Auth's library
  // tables. auth_subject is the one-way identity bridge; tenant data keys from
  // this local users.id, never an authentication-provider subject.
  `CREATE TABLE IF NOT EXISTS users (
     id TEXT PRIMARY KEY,
     auth_subject TEXT NOT NULL UNIQUE REFERENCES "user"("id") ON DELETE CASCADE,
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     deleted_at TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS athlete_profiles (
     user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
     max_hr INTEGER,
     resting_hr INTEGER,
     lthr INTEGER,
     threshold_pace_s_per_km REAL,
     ftp_w INTEGER,
     resting_hr_estimated INTEGER NOT NULL DEFAULT 1,
     ftp_provisional INTEGER NOT NULL DEFAULT 1,
     updated_at TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS user_meta (
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     key TEXT NOT NULL,
     value TEXT NOT NULL,
     PRIMARY KEY (user_id, key)
   )`,
  `CREATE TABLE IF NOT EXISTS shoes (
     id INTEGER PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     name TEXT NOT NULL,
     role TEXT,
     strava_gear_id TEXT,
     photo_path TEXT,
     initial_km REAL NOT NULL DEFAULT 0,
     retirement_km REAL DEFAULT 700,
     retired_at TEXT,
     created_at TEXT DEFAULT (datetime('now')),
     UNIQUE(user_id, strava_gear_id)
   )`,
  `CREATE TABLE IF NOT EXISTS bikes (
     id INTEGER PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     name TEXT NOT NULL,
     role TEXT,
     strava_gear_id TEXT,
     photo_path TEXT,
     initial_km REAL NOT NULL DEFAULT 0,
     retired_at TEXT,
     created_at TEXT DEFAULT (datetime('now')),
     UNIQUE(user_id, strava_gear_id)
   )`,
  `CREATE TABLE IF NOT EXISTS activities (
     id INTEGER PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     strava_id INTEGER,
     name TEXT,
     sport_type TEXT,
     started_at TEXT,
     started_at_local TEXT,
     distance_km REAL,
     moving_time_s INTEGER,
     avg_pace_s_per_km REAL,
     avg_hr REAL,
     elevation_gain_m REAL,
     status TEXT NOT NULL DEFAULT 'pending_review',
     rpe INTEGER,
     feeling TEXT,
     workout_notes TEXT,
     health_notes TEXT,
     raw_json TEXT,
     detail_json TEXT,
     detail_synced_at TEXT,
     bike_id INTEGER REFERENCES bikes(id),
     is_race INTEGER NOT NULL DEFAULT 0,
     goal_pace_s_per_km REAL,
     created_at TEXT DEFAULT (datetime('now')),
     UNIQUE(user_id, strava_id)
   )`,
  `CREATE TABLE IF NOT EXISTS activity_splits (
     id INTEGER PRIMARY KEY,
     activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
     shoe_id INTEGER REFERENCES shoes(id),
     km REAL NOT NULL,
     note TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS activity_streams (
     activity_id INTEGER PRIMARY KEY REFERENCES activities(id) ON DELETE CASCADE,
     json TEXT NOT NULL,
     synced_at TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS activity_best_efforts (
     id INTEGER PRIMARY KEY,
     activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
     name TEXT NOT NULL,
     distance_m REAL,
     elapsed_time_s INTEGER,
     moving_time_s INTEGER,
     pr_rank INTEGER,
     UNIQUE(activity_id, name)
   )`,
  `CREATE TABLE IF NOT EXISTS activity_metrics (
     activity_id INTEGER PRIMARY KEY REFERENCES activities(id) ON DELETE CASCADE,
     ef REAL,
     decoupling_pct REAL,
     np_w REAL,
     hr_zone_secs TEXT,
     pace_zone_secs TEXT,
     metrics_version INTEGER NOT NULL,
     computed_at TEXT,
     avg_gap_s_per_km REAL
   )`,
  `CREATE TABLE IF NOT EXISTS activity_curve_points (
     activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
     kind TEXT NOT NULL,
     bucket TEXT NOT NULL,
     value REAL NOT NULL,
     PRIMARY KEY (activity_id, kind, bucket)
   )`,
  `CREATE TABLE IF NOT EXISTS athlete_goals (
     id INTEGER PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     name TEXT NOT NULL,
     race_date TEXT,
     distance_km REAL,
     goal_time_s INTEGER,
     notes TEXT,
     priority INTEGER NOT NULL DEFAULT 0,
     created_at TEXT DEFAULT (datetime('now'))
   )`,
  // Storage/encryption behavior arrives in #26; #23 reserves only the
  // owner-bound records and constraints so plaintext singleton storage cannot
  // return in the interim.
  `CREATE TABLE IF NOT EXISTS strava_connections (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
     strava_athlete_id INTEGER,
     client_id TEXT,
     client_secret_ciphertext TEXT,
     access_token_ciphertext TEXT,
     refresh_token_ciphertext TEXT,
     encryption_key_version INTEGER,
     expires_at INTEGER,
     granted_scope TEXT,
     status TEXT NOT NULL DEFAULT 'disconnected',
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     updated_at TEXT NOT NULL DEFAULT (datetime('now')),
     UNIQUE(user_id, strava_athlete_id)
   )`,
  `CREATE TABLE IF NOT EXISTS oauth_states (
     state_hash TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     connection_intent TEXT NOT NULL,
     redirect_key TEXT NOT NULL,
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     expires_at TEXT NOT NULL,
     consumed_at TEXT
   )`,
  "CREATE INDEX IF NOT EXISTS idx_activities_owner_started ON activities(user_id, started_at DESC, id DESC)",
  "CREATE INDEX IF NOT EXISTS idx_activities_owner_status_started ON activities(user_id, status, started_at)",
  "CREATE INDEX IF NOT EXISTS idx_activities_owner_bike ON activities(user_id, bike_id)",
  "CREATE INDEX IF NOT EXISTS idx_shoes_owner_retired_name ON shoes(user_id, retired_at, name)",
  "CREATE INDEX IF NOT EXISTS idx_bikes_owner_retired_name ON bikes(user_id, retired_at, name)",
  "CREATE INDEX IF NOT EXISTS idx_goals_owner_race_date ON athlete_goals(user_id, race_date, id)",
  "CREATE INDEX IF NOT EXISTS idx_splits_activity_id ON activity_splits(activity_id)",
  "CREATE INDEX IF NOT EXISTS idx_splits_shoe_id ON activity_splits(shoe_id)",
  "CREATE INDEX IF NOT EXISTS idx_oauth_states_owner_expiry ON oauth_states(user_id, expires_at)",
];

export type AdditiveMigration = {
  version: number;
  statements: readonly InStatement[];
};

// Future product schema tasks append an ordered entry here and own its
// compatibility, backfill, counts, and forward fix.
export const ADDITIVE_MIGRATIONS: readonly AdditiveMigration[] = [
  {
    version: 24,
    statements: [
      "ALTER TABLE schema_version ADD COLUMN applied_at TEXT",
      "CREATE INDEX IF NOT EXISTS idx_schema_version_version ON schema_version(version)",
    ],
  },
  {
    // Application authorization is intentionally separate from Better Auth's
    // tables. Existing accounts start as members; a constrained local operator
    // command is the only bootstrap path to creator.
    version: 25,
    statements: [
      "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('creator', 'member'))",
    ],
  },
];

const VERSION_23_SCHEMA_VERSION_TABLE = `CREATE TABLE IF NOT EXISTS schema_version (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL
)`;

export class BehindSchemaError extends Error {
  constructor() {
    super(
      `Database schema is behind required version ${OWNER_SCHEMA_VERSION}. ` +
        "Run the explicitly approved operator migration command for this environment."
    );
    this.name = "BehindSchemaError";
  }
}

async function currentSchemaVersion(target: Client): Promise<number> {
  const result = await target.execute("SELECT version FROM schema_version WHERE id = 1");
  return result.rows.length > 0 ? Number(result.rows[0].version) : 0;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function applyMigration(target: Client, migration: AdditiveMigration): Promise<void> {
  // Each batch is one SQLite write transaction. A runner that loses the race
  // retries from the committed schema version, so it never replays DDL already
  // committed by the winner.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await target.batch(
        [
          ...migration.statements,
          {
            sql: "UPDATE schema_version SET version = ?, applied_at = datetime('now') WHERE id = 1",
            args: [migration.version],
          },
        ],
        "write"
      );
      return;
    } catch (error) {
      if ((await currentSchemaVersion(target)) >= migration.version) return;
      if (!String(error).includes("SQLITE_BUSY") || attempt === 19) throw error;
      await wait(10 * (attempt + 1));
    }
  }
}

export async function createVersion23Fixture(target: Client): Promise<void> {
  await target.batch([VERSION_23_SCHEMA_VERSION_TABLE, ...OWNER_SCHEMA_V23], "write");
  await target.execute({
    sql: "INSERT INTO schema_version (id, version) VALUES (1, ?)",
    args: [OWNER_SCHEMA_FLOOR],
  });
}

/** Runs only file-backed local/E2E schema writes; remote callers get a read-only gate. */
export async function runMigrations(
  target: Client,
  {
    autoApply,
    migrations = ADDITIVE_MIGRATIONS,
  }: { autoApply: boolean; migrations?: readonly AdditiveMigration[] }
): Promise<void> {
  if (autoApply) {
    await target.execute("PRAGMA foreign_keys = ON");
    // Start new disposable databases from the exact v23 floor, then take the
    // same additive path as existing databases. This keeps current-schema
    // bootstraps honest and keeps createVersion23Fixture representative.
    await target.execute(VERSION_23_SCHEMA_VERSION_TABLE);
  }

  if (!autoApply) {
    try {
      if ((await currentSchemaVersion(target)) < OWNER_SCHEMA_VERSION)
        throw new BehindSchemaError();
      return;
    } catch (error) {
      if (error instanceof BehindSchemaError) throw error;
      throw new BehindSchemaError();
    }
  }

  let current = await currentSchemaVersion(target);
  if (current !== 0 && current < OWNER_SCHEMA_FLOOR) {
    throw new Error(
      "This database predates the #23 owner schema. Reset only disposable local/E2E data with npm run db:reset; never reset a remote, shared, preview, or production database."
    );
  }
  if (current === 0) {
    await target.batch(
      [
        ...OWNER_SCHEMA_V23,
        {
          sql: "INSERT INTO schema_version (id, version) VALUES (1, ?)",
          args: [OWNER_SCHEMA_FLOOR],
        },
      ],
      "write"
    );
    current = OWNER_SCHEMA_FLOOR;
  }
  for (const migration of migrations) {
    if (migration.version <= current) continue;
    await applyMigration(target, migration);
  }
  if ((await currentSchemaVersion(target)) < OWNER_SCHEMA_VERSION) throw new BehindSchemaError();
}

async function migrate(): Promise<void> {
  await runMigrations(client, { autoApply: IS_LOCAL_FILE });
}

let migrated: Promise<void> | null = null;
export function ensureMigrated(): Promise<void> {
  if (!migrated) migrated = migrate();
  return migrated;
}
