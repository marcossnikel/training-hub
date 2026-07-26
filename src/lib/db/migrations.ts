import { BASELINE_BIKES, BASELINE_SHOES, THRESHOLD_DEFAULTS } from "../baseline";
import { currentAthlete } from "../identity";
import { client, IS_LOCAL_FILE } from "./client";

// An ordered registry driven by `schema_version`: each step carries a sequential
// integer version (1, 2, 3, …) that IS its execution order. ensureMigrated() reads
// the highest applied version from the single-row `schema_version` table and runs
// only the steps above it, ascending, recording each version as its step lands.
//
// Every step is idempotent — CREATE TABLE IF NOT EXISTS, ADD COLUMN only when the
// column is absent, seed only when the target is empty. That is the safety
// guarantee for databases that predate `schema_version`: on first run their version
// reads as 0, so all steps re-run, yet each is a no-op against already-present
// schema/data and converges to the same result without corruption or duplicate
// rows. Applied state is tracked SOLELY by `schema_version`, never inferred from
// which columns happen to exist.

// Default distance at which a shoe is flagged for retirement (km). Doubles as
// the SQL column default below and the fallback the UI applies when unset.
const DEFAULT_RETIREMENT_KM = 700;

// Migration 1: the base schema — every table + index present at first release.
const BASE_SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS shoes (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT,
    strava_gear_id TEXT UNIQUE,
    photo_path TEXT,
    initial_km REAL NOT NULL DEFAULT 0,
    retirement_km REAL DEFAULT ${DEFAULT_RETIREMENT_KM},
    retired_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY,
    strava_id INTEGER UNIQUE,
    name TEXT,
    sport_type TEXT,
    started_at TEXT,
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
    created_at TEXT DEFAULT (datetime('now'))
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
  `CREATE TABLE IF NOT EXISTS bikes (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT,
    strava_gear_id TEXT UNIQUE,
    photo_path TEXT,
    initial_km REAL NOT NULL DEFAULT 0,
    retired_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS strava_auth (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    access_token TEXT,
    refresh_token TEXT,
    expires_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS athlete_thresholds (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    max_hr INTEGER,
    resting_hr INTEGER,
    lthr INTEGER,
    threshold_pace_s_per_km REAL,
    ftp_w INTEGER,
    resting_hr_estimated INTEGER NOT NULL DEFAULT 1,
    ftp_provisional INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS activity_load (
    activity_id INTEGER PRIMARY KEY REFERENCES activities(id) ON DELETE CASCADE,
    tss REAL,
    method TEXT,
    intensity_factor REAL,
    source TEXT NOT NULL DEFAULT 'auto',
    computed_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS activity_chat (
    id INTEGER PRIMARY KEY,
    activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  "CREATE INDEX IF NOT EXISTS idx_activities_started_at ON activities(started_at)",
  "CREATE INDEX IF NOT EXISTS idx_activities_status ON activities(status)",
  "CREATE INDEX IF NOT EXISTS idx_splits_activity_id ON activity_splits(activity_id)",
  "CREATE INDEX IF NOT EXISTS idx_splits_shoe_id ON activity_splits(shoe_id)",
  "CREATE INDEX IF NOT EXISTS idx_activity_chat_activity_id ON activity_chat(activity_id)",
];

/**
 * Idempotency guard for an ADD COLUMN step: emits the ALTER only when the column
 * is absent, so re-running on an already-migrated database never throws "duplicate
 * column". Column presence here is a per-step safety check, NOT applied-state
 * tracking — which step to run is decided solely by `schema_version`.
 */
async function addColumnIfMissing(
  table: string,
  column: string,
  definition: string
): Promise<void> {
  const info = await client.execute(`SELECT name FROM pragma_table_info('${table}')`);
  const existing = new Set(info.rows.map((row) => String(row.name)));
  if (!existing.has(column)) {
    await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/**
 * Migration 5: baseline shoes/bikes, athlete thresholds, and the baseline date,
 * each inserted only when its target is empty. The write transaction serializes
 * concurrent cold starts, and the emptiness guards keep it a no-op on any database
 * that already carries this data, so re-running never duplicates rows.
 */
async function seedBaseline(): Promise<void> {
  const tx = await client.transaction("write");
  try {
    const shoes = await tx.execute("SELECT COUNT(*) AS c FROM shoes");
    if (Number(shoes.rows[0].c) === 0) {
      for (const shoe of BASELINE_SHOES) {
        await tx.execute({
          sql: "INSERT INTO shoes (name, role, initial_km) VALUES (?, ?, ?)",
          args: [shoe.name, shoe.role, shoe.initial_km],
        });
      }
    }
    const bikes = await tx.execute("SELECT COUNT(*) AS c FROM bikes");
    if (Number(bikes.rows[0].c) === 0) {
      for (const bike of BASELINE_BIKES) {
        await tx.execute({
          sql: "INSERT INTO bikes (name, role, photo_path, initial_km) VALUES (?, ?, ?, ?)",
          args: [bike.name, bike.role, bike.photo, bike.initial_km],
        });
      }
    }
    const thresholds = await tx.execute("SELECT COUNT(*) AS c FROM athlete_thresholds");
    if (Number(thresholds.rows[0].c) === 0) {
      await tx.execute({
        sql: `INSERT INTO athlete_thresholds
              (id, max_hr, resting_hr, lthr, threshold_pace_s_per_km, ftp_w,
               resting_hr_estimated, ftp_provisional, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          currentAthlete().id,
          THRESHOLD_DEFAULTS.maxHr,
          THRESHOLD_DEFAULTS.restingHr,
          THRESHOLD_DEFAULTS.lthr,
          THRESHOLD_DEFAULTS.thresholdPaceSPerKm,
          THRESHOLD_DEFAULTS.ftpW,
          THRESHOLD_DEFAULTS.restingHrEstimated ? 1 : 0,
          THRESHOLD_DEFAULTS.ftpProvisional ? 1 : 0,
          new Date().toISOString(),
        ],
      });
    }
    const baseline = await tx.execute("SELECT value FROM app_meta WHERE key = 'baseline_date'");
    if (baseline.rows.length === 0) {
      await tx.execute({
        sql: "INSERT INTO app_meta (key, value) VALUES ('baseline_date', ?)",
        args: [new Date().toISOString()],
      });
    }
    await tx.commit();
  } finally {
    tx.close();
  }
}

// Ordered migration registry: the version number is the execution order. Steps
// run in ascending version; renumbering here also renumbers execution.
interface Migration {
  version: number;
  up: () => Promise<void>;
}

const MIGRATIONS: Migration[] = [
  // 1: base schema — all tables + indexes.
  {
    version: 1,
    up: async () => {
      await client.batch(BASE_SCHEMA, "write");
    },
  },
  // 2: per-activity Strava detail cache (laps, km splits).
  {
    version: 2,
    up: async () => {
      await addColumnIfMissing("activities", "detail_json", "TEXT");
      await addColumnIfMissing("activities", "detail_synced_at", "TEXT");
    },
  },
  // 3: bikes as gear, one bike per activity (no splits). The index is created
  // after the column exists (the activities table predates it).
  {
    version: 3,
    up: async () => {
      await addColumnIfMissing("activities", "bike_id", "INTEGER REFERENCES bikes(id)");
      await client.execute(
        "CREATE INDEX IF NOT EXISTS idx_activities_bike_id ON activities(bike_id)"
      );
    },
  },
  // 4: race marking for block comparison.
  {
    version: 4,
    up: async () => {
      await addColumnIfMissing("activities", "is_race", "INTEGER NOT NULL DEFAULT 0");
      await addColumnIfMissing("activities", "goal_pace_s_per_km", "REAL");
    },
  },
  // 5: baseline gear + thresholds + baseline date (empty database only).
  { version: 5, up: seedBaseline },
  // 6: capture Strava's start_date_local — the activity's naive local wall-clock
  // (Z-suffixed) — so date/time display and day bucketing reflect the athlete's
  // true local day. Nullable: rows synced before this column existed stay null
  // and fall back to the UTC `started_at` until a re-sync backfills them.
  {
    version: 6,
    up: async () => {
      await addColumnIfMissing("activities", "started_at_local", "TEXT");
    },
  },
  // 7: source-agnostic daily health metrics. One row per (date, metric, source):
  // multiple sources may coexist for the same day+metric (device + manual), and a
  // resolver picks the preferred one. Exactly one of value / value_text carries
  // the reading. The UNIQUE(date, metric, source) constraint is what makes ingest
  // upserts idempotent, so re-running a day's sync overwrites in place.
  {
    version: 7,
    up: async () => {
      await client.batch(
        [
          `CREATE TABLE IF NOT EXISTS health_metrics (
             id INTEGER PRIMARY KEY,
             date TEXT NOT NULL,
             metric TEXT NOT NULL,
             value REAL,
             value_text TEXT,
             unit TEXT,
             source TEXT NOT NULL,
             recorded_at TEXT,
             UNIQUE(date, metric, source)
           )`,
          "CREATE INDEX IF NOT EXISTS idx_health_metrics_date ON health_metrics(date)",
          "CREATE INDEX IF NOT EXISTS idx_health_metrics_metric_date ON health_metrics(metric, date)",
        ],
        "write"
      );
    },
  },
  // 8: athlete goals (races/targets) — feed the zones agent and the coach so its
  // advice is anchored to what the athlete is training for.
  {
    version: 8,
    up: async () => {
      await client.execute(
        `CREATE TABLE IF NOT EXISTS athlete_goals (
           id INTEGER PRIMARY KEY,
           name TEXT NOT NULL,
           race_date TEXT,
           distance_km REAL,
           goal_time_s INTEGER,
           notes TEXT,
           priority INTEGER NOT NULL DEFAULT 0,
           created_at TEXT DEFAULT (datetime('now'))
         )`
      );
    },
  },
  // 9: per-activity AI coach insight (generated on demand, shown above the chat).
  {
    version: 9,
    up: async () => {
      await addColumnIfMissing("activities", "coach_insight", "TEXT");
      await addColumnIfMissing("activities", "coach_insight_at", "TEXT");
    },
  },
  // 10: per-activity best efforts — the fastest sub-segments Strava finds inside a
  // run ("400m", "1K", "5K", …), lifted out of the cached detail payload into rows
  // so they can be queried across activities. One row per (activity, effort name);
  // that UNIQUE key is what makes both the lazy detail path and the local backfill
  // upsert in place instead of duplicating. No separate activity_id index: the
  // UNIQUE constraint's index already leads with that column.
  {
    version: 10,
    up: async () => {
      await client.execute(
        `CREATE TABLE IF NOT EXISTS activity_best_efforts (
           id INTEGER PRIMARY KEY,
           activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
           name TEXT NOT NULL,
           distance_m REAL,
           elapsed_time_s INTEGER,
           moving_time_s INTEGER,
           pr_rank INTEGER,
           UNIQUE(activity_id, name)
         )`
      );
    },
  },
  // 11: per-activity derived stream metrics — efficiency factor, aerobic
  // decoupling, normalized power and time-in-zone, computed once when the streams
  // are fetched instead of on every render. One row per activity, so the PRIMARY
  // KEY doubles as the upsert key. `metrics_version` records what the numbers were
  // computed FROM: 1 = the 400-point downsample (no normalized power, which needs
  // full resolution), 2 = the full-resolution stream at fetch time. Zone seconds
  // are JSON arrays of five numbers, Z1 to Z5.
  {
    version: 11,
    up: async () => {
      await client.execute(
        `CREATE TABLE IF NOT EXISTS activity_metrics (
           activity_id INTEGER PRIMARY KEY REFERENCES activities(id) ON DELETE CASCADE,
           ef REAL,
           decoupling_pct REAL,
           np_w REAL,
           hr_zone_secs TEXT,
           pace_zone_secs TEXT,
           metrics_version INTEGER NOT NULL,
           computed_at TEXT
         )`
      );
    },
  },

  // Migration 12: the whole-activity grade-adjusted pace, seconds per km, on
  // `activity_metrics`. Runs only, integrated per sample from the stream's grade
  // (`grade_smooth` where the fetch requested it, differentiated from the
  // altitude trace on streams cached before that). Nullable: every activity
  // stored before this column existed keeps a NULL until its row is recomputed.
  {
    version: 12,
    up: async () => {
      await addColumnIfMissing("activity_metrics", "avg_gap_s_per_km", "REAL");
    },
  },

  // Migration 13: mean-max curve points — one activity's best pace over each
  // standard distance ('pace', seconds per km) and best average power over each
  // standard duration ('power', watts). The bucket set lives in
  // src/lib/curves.ts; `bucket` is plain TEXT rather than a CHECK-constrained
  // enum so adding a bucket stays a code change, not a table rebuild. The
  // composite PRIMARY KEY is the upsert key: a full-resolution stream scan
  // rewrites a bucket in place, while the best-effort seed only fills absent ones.
  //
  // No secondary index. Reads filter by `kind` and the PK leads with
  // activity_id, so they scan — but the whole table is at most six rows per
  // activity (~7 400 once every activity is covered), which SQLite scans in far
  // less than the Turso round trip carrying the query.
  {
    version: 13,
    up: async () => {
      await client.execute(
        `CREATE TABLE IF NOT EXISTS activity_curve_points (
           activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
           kind TEXT NOT NULL,
           bucket TEXT NOT NULL,
           value REAL NOT NULL,
           PRIMARY KEY (activity_id, kind, bucket)
         )`
      );
    },
  },
];

async function currentSchemaVersion(): Promise<number> {
  const result = await client.execute("SELECT version FROM schema_version WHERE id = 1");
  return result.rows.length > 0 ? Number(result.rows[0].version) : 0;
}

async function migrate(): Promise<void> {
  // Enforce foreign keys so ON DELETE CASCADE fires. The local @libsql/client build
  // already defaults PRAGMA foreign_keys=ON per connection; issuing it here makes
  // that guarantee explicit (G5.5) instead of relying on the driver default. Remote
  // Turso is stateless per request, so the pragma does not persist there — FK
  // enforcement on Turso must be handled server-side.
  if (IS_LOCAL_FILE) await client.execute("PRAGMA foreign_keys = ON");

  // `schema_version` holds the highest applied migration in its single row. Its
  // own creation is idempotent, so it is safe on brand-new and legacy databases
  // alike; a database created before versioning existed reads as version 0.
  await client.execute(
    `CREATE TABLE IF NOT EXISTS schema_version (
       id INTEGER PRIMARY KEY CHECK (id = 1),
       version INTEGER NOT NULL
     )`
  );
  const current = await currentSchemaVersion();
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    await migration.up();
    await client.execute({
      sql: `INSERT INTO schema_version (id, version) VALUES (1, ?)
            ON CONFLICT(id) DO UPDATE SET version = excluded.version`,
      args: [migration.version],
    });
  }
}

let migrated: Promise<void> | null = null;
export function ensureMigrated(): Promise<void> {
  if (!migrated) migrated = migrate();
  return migrated;
}
