import type { Client, InStatement } from "@libsql/client";
import { client, IS_LOCAL_FILE } from "./client";

// #23 is a deliberate fresh-schema cutover under D-005. It is not a destructive
// migration for an existing database: callers must explicitly reset disposable
// local/E2E data before bootstrapping this schema.
export const OWNER_SCHEMA_FLOOR = 23;
export const OWNER_SCHEMA_VERSION = 32;

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
  /** Selects no-op/forward SQL from the existing shape before one write batch. */
  statementsFor?: (target: Client) => Promise<readonly InStatement[]>;
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
  {
    // Establish the old invitation shape first. Databases that used the
    // pre-migration invitation feature already have this exact table; fresh
    // databases receive it here before the additive provenance upgrade below.
    version: 26,
    statements: [
      `CREATE TABLE IF NOT EXISTS beta_invites (
         id TEXT PRIMARY KEY,
         token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
         intended_email TEXT NOT NULL,
         issued_by TEXT NOT NULL,
         created_at TEXT NOT NULL,
         expires_at TEXT NOT NULL,
         redeemed_at TEXT,
         redeemed_auth_subject TEXT UNIQUE,
         revoked_at TEXT
       )`,
      "CREATE INDEX IF NOT EXISTS idx_beta_invites_lookup ON beta_invites(token_hash, intended_email)",
      "CREATE INDEX IF NOT EXISTS idx_beta_invites_email ON beta_invites(intended_email)",
    ],
    statementsFor: async (target) => {
      const columns = await target.execute('PRAGMA table_info("user")');
      return columns.rows.some((column) => column.name === "betaInviteClaim")
        ? []
        : ['ALTER TABLE "user" ADD COLUMN "betaInviteClaim" TEXT'];
    },
  },
  {
    // `issued_by` is retained only for the temporary CLI adapter. Product
    // operations use the local creator id, which is provenance not ownership.
    version: 27,
    statements: [
      `CREATE TABLE beta_invites_next (
         id TEXT PRIMARY KEY,
         token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
         intended_email TEXT NOT NULL,
         issued_by TEXT,
         issued_by_user_id TEXT REFERENCES users(id),
         created_at TEXT NOT NULL,
         expires_at TEXT NOT NULL,
         redeemed_at TEXT,
         redeemed_auth_subject TEXT UNIQUE,
         revoked_at TEXT
       )`,
      `INSERT INTO beta_invites_next
         (id, token_hash, intended_email, issued_by, created_at, expires_at, redeemed_at, redeemed_auth_subject, revoked_at)
       SELECT id, token_hash, intended_email, issued_by, created_at, expires_at, redeemed_at, redeemed_auth_subject, revoked_at
       FROM beta_invites`,
      "DROP TRIGGER IF EXISTS beta_invites_redeem_on_user_insert",
      "DROP TABLE beta_invites",
      "ALTER TABLE beta_invites_next RENAME TO beta_invites",
      "CREATE INDEX IF NOT EXISTS idx_beta_invites_lookup ON beta_invites(token_hash, intended_email)",
      "CREATE INDEX IF NOT EXISTS idx_beta_invites_email ON beta_invites(intended_email)",
      "CREATE INDEX IF NOT EXISTS idx_beta_invites_created_at ON beta_invites(created_at DESC)",
      `CREATE TRIGGER IF NOT EXISTS beta_invites_redeem_on_user_insert
         AFTER INSERT ON "user"
         WHEN NEW."betaInviteClaim" IS NOT NULL
         BEGIN
           SELECT CASE WHEN NOT EXISTS (
             SELECT 1 FROM beta_invites
             WHERE token_hash = NEW."betaInviteClaim"
               AND intended_email = lower(NEW.email)
               AND redeemed_at IS NULL
               AND revoked_at IS NULL
               AND julianday(expires_at) > julianday('now')
           ) THEN RAISE(ABORT, 'registration unavailable') END;

           UPDATE beta_invites
           SET redeemed_at = datetime('now'), redeemed_auth_subject = NEW.id
           WHERE token_hash = NEW."betaInviteClaim"
             AND intended_email = lower(NEW.email)
             AND redeemed_at IS NULL
             AND revoked_at IS NULL
             AND julianday(expires_at) > julianday('now');

           UPDATE "user" SET "betaInviteClaim" = NULL WHERE id = NEW.id;
         END`,
    ],
  },
  {
    // D-020: the Review boundary belongs to one Strava connection lifecycle,
    // not to personal gear-baseline policy. Existing retained connections get
    // a conservative cutoff at their own creation time.
    version: 28,
    statementsFor: async (target) => {
      const columns = await target.execute(
        "SELECT name FROM pragma_table_info('strava_connections')"
      );
      const names = new Set(columns.rows.map((row) => String(row.name)));
      return [
        ...(names.has("review_after")
          ? []
          : [{ sql: "ALTER TABLE strava_connections ADD COLUMN review_after TEXT", args: [] }]),
        ...(names.has("initial_sync_completed_at")
          ? []
          : [
              {
                sql: "ALTER TABLE strava_connections ADD COLUMN initial_sync_completed_at TEXT",
                args: [],
              },
            ]),
      ];
    },
    statements: [
      "UPDATE strava_connections SET review_after = created_at WHERE review_after IS NULL",
      `UPDATE strava_connections
       SET initial_sync_completed_at = (
         SELECT value FROM user_meta
         WHERE user_meta.user_id = strava_connections.user_id AND key = 'last_sync_at'
       )
       WHERE initial_sync_completed_at IS NULL
         AND EXISTS (
           SELECT 1 FROM user_meta
           WHERE user_meta.user_id = strava_connections.user_id AND key = 'last_sync_at'
         )`,
    ],
  },
  {
    // R14: one durable, owner-and-connection-scoped initial-import lifecycle.
    // Outcome rows, rather than fetch attempts, are the cumulative counters.
    version: 29,
    statements: [
      `CREATE TABLE IF NOT EXISTS strava_import_jobs (
         id TEXT PRIMARY KEY,
         user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         connection_id TEXT NOT NULL UNIQUE REFERENCES strava_connections(id) ON DELETE CASCADE,
         status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'partial', 'completed', 'failed')),
         stage TEXT NOT NULL CHECK (stage IN ('fetching_activities', 'classifying_history', 'materializing_gear', 'aggregating_summary', 'completed')),
         next_page INTEGER NOT NULL DEFAULT 1 CHECK (next_page > 0),
         started_at TEXT NOT NULL,
         updated_at TEXT NOT NULL,
         completed_at TEXT,
         retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
         error_category TEXT,
         lease_token TEXT,
         lease_expires_at TEXT,
         CHECK ((status = 'completed') = (completed_at IS NOT NULL))
       )`,
      `CREATE TABLE IF NOT EXISTS strava_import_job_outcomes (
         job_id TEXT NOT NULL REFERENCES strava_import_jobs(id) ON DELETE CASCADE,
         provider_activity_id INTEGER NOT NULL,
         outcome TEXT NOT NULL CHECK (outcome IN ('historical_confirmed_created', 'new_pending_created', 'already_present', 'skipped_invalid')),
         sport_family TEXT NOT NULL CHECK (sport_family IN ('run', 'ride', 'other', 'unknown')),
         created_at TEXT NOT NULL,
         PRIMARY KEY (job_id, provider_activity_id)
       )`,
      `CREATE TABLE IF NOT EXISTS strava_import_job_pages (
         job_id TEXT NOT NULL REFERENCES strava_import_jobs(id) ON DELETE CASCADE,
         provider_page INTEGER NOT NULL CHECK (provider_page > 0),
         committed_at TEXT NOT NULL,
         PRIMARY KEY (job_id, provider_page)
       )`,
      "CREATE INDEX IF NOT EXISTS idx_strava_import_jobs_owner_updated ON strava_import_jobs(user_id, updated_at DESC)",
      "CREATE INDEX IF NOT EXISTS idx_strava_import_outcomes_job_family ON strava_import_job_outcomes(job_id, sport_family)",
    ],
  },
  {
    // D-025: a provider lifetime odometer is a source snapshot, never a
    // baseline or a delta to combine with locally confirmed assignments.
    version: 30,
    statements: [],
    statementsFor: async (target) => {
      const gearColumns = async (table: "shoes" | "bikes") => {
        const result = await target.execute(`SELECT name FROM pragma_table_info('${table}')`);
        return new Set(result.rows.map((row) => String(row.name)));
      };
      const [shoeColumns, bikeColumns, jobColumns] = await Promise.all([
        gearColumns("shoes"),
        gearColumns("bikes"),
        target.execute("SELECT name FROM pragma_table_info('strava_import_jobs')"),
      ]);
      const statements: InStatement[] = [];
      for (const [table, columns] of [
        ["shoes", shoeColumns],
        ["bikes", bikeColumns],
      ] as const) {
        if (!columns.has("origin"))
          statements.push({
            sql: `ALTER TABLE ${table} ADD COLUMN origin TEXT NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual', 'strava'))`,
            args: [],
          });
        if (!columns.has("provider_distance_m"))
          statements.push({
            sql: `ALTER TABLE ${table} ADD COLUMN provider_distance_m REAL`,
            args: [],
          });
        if (!columns.has("provider_observed_at"))
          statements.push({
            sql: `ALTER TABLE ${table} ADD COLUMN provider_observed_at TEXT`,
            args: [],
          });
        if (!columns.has("provider_last_seen_at"))
          statements.push({
            sql: `ALTER TABLE ${table} ADD COLUMN provider_last_seen_at TEXT`,
            args: [],
          });
      }
      const jobNames = new Set(jobColumns.rows.map((row) => String(row.name)));
      for (const column of ["gear_created", "gear_updated", "gear_placeholders"] as const) {
        if (!jobNames.has(column))
          statements.push({
            sql: `ALTER TABLE strava_import_jobs ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0 CHECK (${column} >= 0)`,
            args: [],
          });
      }
      return statements;
    },
  },
  {
    // R18: presentation is deliberately separate from the durable import job.
    // One row belongs to one retained connection lifecycle; deleting that
    // connection cascades the presentation record so a genuinely new connection
    // receives a new eligible activation without replaying a reauthorization.
    version: 31,
    statements: [
      `CREATE TABLE IF NOT EXISTS strava_connection_activations (
         connection_id TEXT PRIMARY KEY REFERENCES strava_connections(id) ON DELETE CASCADE,
         user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         presentation_state TEXT NOT NULL CHECK (presentation_state IN ('pending', 'dismissed', 'summary_ready', 'completed')),
         created_at TEXT NOT NULL,
         updated_at TEXT NOT NULL,
         dismissed_at TEXT,
         summary_ready_at TEXT,
         completed_at TEXT
       )`,
      "CREATE INDEX IF NOT EXISTS idx_strava_connection_activations_owner_updated ON strava_connection_activations(user_id, updated_at DESC)",
    ],
  },
  {
    // R19/D-022/D-027: profile values are observations, never founder defaults.
    // `athlete_parameter_effective` deliberately records suppression separately
    // from the historical observations: clearing a confirmed value must not make
    // an older provider/calculated candidate silently effective again.
    version: 32,
    statements: [
      `CREATE TABLE IF NOT EXISTS athlete_parameter_observations (
         id TEXT PRIMARY KEY,
         user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         parameter_key TEXT NOT NULL CHECK (parameter_key IN (
           'resting_hr_bpm', 'max_hr_bpm', 'lthr_bpm',
           'threshold_pace_sec_per_km', 'cycling_ftp_watts',
           'measured_vo2max_ml_kg_min'
         )),
         numeric_value REAL NOT NULL,
         unit TEXT NOT NULL,
         provenance TEXT NOT NULL CHECK (provenance IN (
           'athlete_entered', 'provider', 'calculated', 'analyst_hypothesis'
         )),
         observed_at TEXT,
         calculation_version TEXT,
         evidence_ref TEXT,
         created_at TEXT NOT NULL,
         updated_at TEXT NOT NULL,
         CHECK ((provenance NOT IN ('calculated', 'analyst_hypothesis'))
                OR (calculation_version IS NOT NULL AND evidence_ref IS NOT NULL))
       )`,
      `CREATE TABLE IF NOT EXISTS athlete_parameter_effective (
         user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         parameter_key TEXT NOT NULL CHECK (parameter_key IN (
           'resting_hr_bpm', 'max_hr_bpm', 'lthr_bpm',
           'threshold_pace_sec_per_km', 'cycling_ftp_watts',
           'measured_vo2max_ml_kg_min'
         )),
         observation_id TEXT REFERENCES athlete_parameter_observations(id) ON DELETE SET NULL,
         state TEXT NOT NULL CHECK (state IN ('active', 'suppressed')),
         updated_at TEXT NOT NULL,
         PRIMARY KEY (user_id, parameter_key),
         CHECK ((state = 'active' AND observation_id IS NOT NULL)
                OR (state = 'suppressed' AND observation_id IS NULL))
       )`,
      `CREATE TABLE IF NOT EXISTS athlete_timezones (
         user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         provenance TEXT NOT NULL CHECK (provenance IN ('athlete_entered', 'provider')),
         timezone TEXT NOT NULL,
         observed_at TEXT,
         updated_at TEXT NOT NULL,
         PRIMARY KEY (user_id, provenance)
       )`,
      "CREATE INDEX IF NOT EXISTS idx_athlete_parameter_observations_owner_key_created ON athlete_parameter_observations(user_id, parameter_key, created_at DESC)",
      // Pre-R19 rows are the only durable threshold writes in the old schema.
      // The former in-memory fallback never created a row, so it is not migrated.
      `INSERT OR IGNORE INTO athlete_parameter_observations
         (id, user_id, parameter_key, numeric_value, unit, provenance, observed_at, created_at, updated_at)
       SELECT 'legacy:' || user_id || ':max_hr_bpm', user_id, 'max_hr_bpm', max_hr, 'bpm',
              'athlete_entered', updated_at, COALESCE(updated_at, datetime('now')), COALESCE(updated_at, datetime('now'))
       FROM athlete_profiles WHERE max_hr IS NOT NULL`,
      `INSERT OR IGNORE INTO athlete_parameter_observations
         (id, user_id, parameter_key, numeric_value, unit, provenance, observed_at, created_at, updated_at)
       SELECT 'legacy:' || user_id || ':resting_hr_bpm', user_id, 'resting_hr_bpm', resting_hr, 'bpm',
              'athlete_entered', updated_at, COALESCE(updated_at, datetime('now')), COALESCE(updated_at, datetime('now'))
       FROM athlete_profiles WHERE resting_hr IS NOT NULL`,
      `INSERT OR IGNORE INTO athlete_parameter_observations
         (id, user_id, parameter_key, numeric_value, unit, provenance, observed_at, created_at, updated_at)
       SELECT 'legacy:' || user_id || ':lthr_bpm', user_id, 'lthr_bpm', lthr, 'bpm',
              'athlete_entered', updated_at, COALESCE(updated_at, datetime('now')), COALESCE(updated_at, datetime('now'))
       FROM athlete_profiles WHERE lthr IS NOT NULL`,
      `INSERT OR IGNORE INTO athlete_parameter_observations
         (id, user_id, parameter_key, numeric_value, unit, provenance, observed_at, created_at, updated_at)
       SELECT 'legacy:' || user_id || ':threshold_pace_sec_per_km', user_id, 'threshold_pace_sec_per_km', threshold_pace_s_per_km, 's/km',
              'athlete_entered', updated_at, COALESCE(updated_at, datetime('now')), COALESCE(updated_at, datetime('now'))
       FROM athlete_profiles WHERE threshold_pace_s_per_km IS NOT NULL`,
      `INSERT OR IGNORE INTO athlete_parameter_observations
         (id, user_id, parameter_key, numeric_value, unit, provenance, observed_at, created_at, updated_at)
       SELECT 'legacy:' || user_id || ':cycling_ftp_watts', user_id, 'cycling_ftp_watts', ftp_w, 'W',
              'athlete_entered', updated_at, COALESCE(updated_at, datetime('now')), COALESCE(updated_at, datetime('now'))
       FROM athlete_profiles WHERE ftp_w IS NOT NULL`,
      `INSERT OR REPLACE INTO athlete_parameter_effective (user_id, parameter_key, observation_id, state, updated_at)
       SELECT user_id, parameter_key, id, 'active', updated_at
       FROM athlete_parameter_observations
       WHERE id LIKE 'legacy:%'`,
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
      const conditionalStatements = migration.statementsFor
        ? await migration.statementsFor(target)
        : [];
      await target.batch(
        [
          ...conditionalStatements,
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
      // SQLite can surface a just-committed competing ALTER as a duplicate
      // column before this client observes the winner's schema-version write.
      // It is the same harmless migration race as SQLITE_BUSY; re-read on the
      // next bounded attempt rather than treating it as a schema failure.
      const concurrentConflict =
        String(error).includes("SQLITE_BUSY") || String(error).includes("duplicate column name");
      if (!concurrentConflict || attempt === 19) throw error;
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
  // A concurrent runner can observe one individual migration as complete while
  // its winner is still applying later entries. Re-read and finish the ordered
  // list until the whole target is visible, rather than falsely rejecting that
  // harmless race after the first observed version.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    current = await currentSchemaVersion(target);
    for (const migration of migrations) {
      if (migration.version <= current) continue;
      await applyMigration(target, migration);
    }
    if ((await currentSchemaVersion(target)) >= OWNER_SCHEMA_VERSION) return;
    await wait(10 * (attempt + 1));
  }
  throw new BehindSchemaError();
}

async function migrate(): Promise<void> {
  await runMigrations(client, { autoApply: IS_LOCAL_FILE });
}

let migrated: Promise<void> | null = null;
export function ensureMigrated(): Promise<void> {
  if (!migrated) migrated = migrate();
  return migrated;
}
