/**
 * Seed script: inserts fake activities in mixed statuses so the UI can be
 * evaluated without a Strava connection. Uses the real shoes created by
 * migration 5 (baseline seed) and never touches them or their baselines.
 *
 *   npm run seed        insert (re-runs replace previous seed data)
 *   npm run seed:clear  remove only seeded activities
 */
import { client, ensureMigrated } from "../src/lib/db";
import { BASELINE_BIKES, BASELINE_SHOES } from "../src/lib/baseline";
import type { Feeling } from "../src/lib/types";

const SEED_MARKER = '{"seed":true}';
const SEED_FILTER = "json_extract(raw_json, '$.seed') = 1";
const FIXTURE_OWNER = "e2e-fixture-owner";

/**
 * Guard against seeding a remote (shared/prod Turso) database. Resolves the DB URL
 * exactly like src/lib/db.ts (TURSO_DATABASE_URL → DATABASE_URL → local file). A
 * file: URL (local dev, or the isolated e2e DB) runs normally; a remote URL refuses
 * unless the writer explicitly opts in with ALLOW_REMOTE_DB=1 or --force.
 */
function assertLocalDb(): void {
  const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || "file:data/app.db";
  if (url.startsWith("file:")) return;
  if (process.env.ALLOW_REMOTE_DB === "1" || process.argv.includes("--force")) return;
  let host = url;
  try {
    host = new URL(url).host || url;
  } catch {
    // Not a parseable URL; fall back to showing the raw value.
  }
  console.error(
    `Refusing to seed a remote database (${host}). This protects the shared/prod DB. ` +
      `Re-run with ALLOW_REMOTE_DB=1 to override.`
  );
  process.exit(1);
}

async function clearSeeds(): Promise<number> {
  const results = await client.batch(
    [
      {
        sql: `DELETE FROM activity_splits WHERE activity_id IN (SELECT id FROM activities WHERE user_id = ? AND ${SEED_FILTER})`,
        args: [FIXTURE_OWNER],
      },
      { sql: `DELETE FROM activities WHERE user_id = ? AND ${SEED_FILTER}`, args: [FIXTURE_OWNER] },
    ],
    "write"
  );
  return results[1].rowsAffected;
}

async function main() {
  assertLocalDb();
  await ensureMigrated();

  // Fixture data is intentionally seeded only by this explicit disposable-data
  // script, never by schema bootstrap. Its owner exists in both sides of the
  // auth bridge so every root domain write satisfies the #23 foreign key.
  const fixtureOwner = FIXTURE_OWNER;
  const fixtureAuthSubject = "seed-fixture-auth-subject";
  const now = new Date().toISOString();
  await client.batch(
    [
      {
        sql: 'INSERT OR IGNORE INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
        args: [fixtureAuthSubject, "Seed Fixture", "seed@example.test", 0, now, now],
      },
      {
        sql: "INSERT OR IGNORE INTO users (id, auth_subject) VALUES (?, ?)",
        args: [fixtureOwner, fixtureAuthSubject],
      },
    ],
    "write"
  );
  const existingShoes = await client.execute({
    sql: "SELECT COUNT(*) AS count FROM shoes WHERE user_id = ?",
    args: [fixtureOwner],
  });
  if (Number(existingShoes.rows[0].count) === 0) {
    await client.batch(
      [
        ...BASELINE_SHOES.map((shoe) => ({
          sql: "INSERT INTO shoes (user_id, name, role, initial_km) VALUES (?, ?, ?, ?)",
          args: [fixtureOwner, shoe.name, shoe.role, shoe.initial_km],
        })),
        ...BASELINE_BIKES.map((bike) => ({
          sql: "INSERT INTO bikes (user_id, name, role, photo_path, initial_km) VALUES (?, ?, ?, ?, ?)",
          args: [fixtureOwner, bike.name, bike.role, bike.photo, bike.initial_km],
        })),
      ],
      "write"
    );
  }

  if (process.argv.includes("--clear")) {
    const removed = await clearSeeds();
    console.log(`Removed ${removed} seeded activities. Shoes and baselines untouched.`);
    return;
  }

  const shoeRows = (
    await client.execute({
      sql: "SELECT id, name FROM shoes WHERE user_id = ?",
      args: [fixtureOwner],
    })
  ).rows as unknown as Array<{
    id: number;
    name: string;
  }>;
  const shoeId = (name: string): number => {
    const row = shoeRows.find((s) => s.name === name);
    if (!row) throw new Error(`Shoe not found: ${name}. Run the app once to migrate.`);
    return Number(row.id);
  };

  const EVO_BRANCO = shoeId("Adidas Evo SL Preto e Branco");
  const EVO_CINZA = shoeId("Adidas Evo SL Preto e Cinza");
  const SUPERBLAST = shoeId("ASICS Superblast 3");
  const ADIOS = shoeId("Adidas Adios Pro 4");
  const DRIVE = shoeId("Adidas Drive RC");
  const SALOMON = shoeId("Salomon S/Lab Ultra 3 V2");

  // The local wall-clock Date for a fixture's declared daysAgo/hour.
  function seedDate(daysAgo: number, hour: number, minute = 12): Date {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour, minute, 0, 0);
    return d;
  }

  // Strava-style naive-local wall-clock stamp: the LOCAL time with a trailing
  // "Z", matching start_date_local. Built from the Date's local components so the
  // declared hour renders at the same wall-clock time on any host timezone (the
  // date formatters read it with UTC getters). Distinct from the UTC instant.
  function localWallClock(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
      `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}Z`
    );
  }

  interface SeedActivity {
    name: string;
    sport: string;
    daysAgo: number;
    hour: number;
    km: number;
    movingS: number;
    hr: number | null;
    elev: number | null;
    status: "pending_review" | "confirmed";
    splits: Array<{ shoe: number | null; km: number }>;
    rpe?: number;
    feeling?: Feeling;
    workout?: string;
    health?: string;
  }

  const ACTIVITIES: SeedActivity[] = [
    // Pending review: what the queue looks like after a sync.
    {
      name: "Morning Easy Run",
      sport: "Run",
      daysAgo: 0,
      hour: 7,
      km: 12.21,
      movingS: 3745,
      hr: 148,
      elev: 62,
      status: "pending_review",
      splits: [{ shoe: EVO_BRANCO, km: 12.21 }],
    },
    {
      name: "Track 6x800 @ 3K effort",
      sport: "Run",
      daysAgo: 1,
      hour: 18,
      km: 10.44,
      movingS: 2860,
      hr: 164,
      elev: 8,
      status: "pending_review",
      splits: [{ shoe: null, km: 10.44 }], // no gear matched on Strava
    },
    {
      name: "Evening Spin",
      sport: "Ride",
      daysAgo: 2,
      hour: 17,
      km: 24.5,
      movingS: 3480,
      hr: 132,
      elev: 210,
      status: "pending_review",
      splits: [],
    },

    // Confirmed history across three weeks.
    {
      name: "Long Run 28k with 10k @ MP",
      sport: "Run",
      daysAgo: 3,
      hour: 6,
      km: 28.06,
      movingS: 8630,
      hr: 152,
      elev: 240,
      status: "confirmed",
      splits: [
        { shoe: SUPERBLAST, km: 18.06 },
        { shoe: ADIOS, km: 10 },
      ],
      rpe: 8,
      feeling: "good",
      workout:
        "Negative split. Swapped shoes before the MP block, 10k at 4:15 felt controlled. Gel every 35 minutes worked.",
      health: "Left calf tight afterwards, foam rolled in the evening.",
    },
    {
      name: "Recovery Jog",
      sport: "Run",
      daysAgo: 4,
      hour: 7,
      km: 6.02,
      movingS: 2230,
      hr: 128,
      elev: 20,
      status: "confirmed",
      splits: [{ shoe: SUPERBLAST, km: 6.02 }],
      rpe: 2,
      feeling: "ok",
      workout: "Legs heavy from the long run, kept it truly easy.",
      health: "Slept six hours, need more.",
    },
    {
      name: "Easy + 6 Strides",
      sport: "Run",
      daysAgo: 6,
      hour: 7,
      km: 10.12,
      movingS: 3208,
      hr: 141,
      elev: 55,
      status: "confirmed",
      splits: [{ shoe: EVO_CINZA, km: 10.12 }],
      rpe: 3,
      feeling: "good",
      workout: "Strides on the grass at the end, felt springy.",
    },
    {
      name: "Threshold 3x10min",
      sport: "Run",
      daysAgo: 8,
      hour: 18,
      km: 13.3,
      movingS: 3617,
      hr: 158,
      elev: 30,
      status: "confirmed",
      splits: [{ shoe: DRIVE, km: 13.3 }],
      rpe: 7,
      feeling: "great",
      workout: "3x10 minutes at 4:05 with 2 minute floats. Last rep was the best one.",
    },
    {
      name: "Trail Adventure Serra",
      sport: "TrailRun",
      daysAgo: 9,
      hour: 8,
      km: 16.8,
      movingS: 7020,
      hr: 149,
      elev: 890,
      status: "confirmed",
      splits: [{ shoe: SALOMON, km: 16.8 }],
      rpe: 6,
      feeling: "great",
      workout: "Technical descents, hiked the steep climbs. Views paid for everything.",
      health: "Rolled the right ankle slightly on a rock, fine after a minute.",
    },
    {
      name: "Easy Run",
      sport: "Run",
      daysAgo: 11,
      hour: 7,
      km: 8.15,
      movingS: 2510,
      hr: 138,
      elev: 40,
      status: "confirmed",
      splits: [{ shoe: EVO_BRANCO, km: 8.15 }],
      rpe: 3,
      feeling: "ok",
    },
    {
      name: "Gym Strength",
      sport: "WeightTraining",
      daysAgo: 13,
      hour: 19,
      km: 0,
      movingS: 3600,
      hr: 118,
      elev: null,
      status: "confirmed",
      splits: [],
      rpe: 5,
      feeling: "good",
      health: "Hips feeling stronger week over week.",
    },
    {
      name: "Sunday Long Easy",
      sport: "Run",
      daysAgo: 16,
      hour: 7,
      km: 22.3,
      movingS: 7024,
      hr: 145,
      elev: 180,
      status: "confirmed",
      splits: [{ shoe: SUPERBLAST, km: 22.3 }],
      rpe: 5,
      feeling: "rough",
      workout: "Bonked at 18k, clearly underfueled. Shuffled home.",
      health: "Stomach was off in the morning, should not have skipped breakfast.",
    },
  ];

  const replaced = await clearSeeds();

  for (const a of ACTIVITIES) {
    // started_at is the UTC instant; started_at_local is the naive local
    // wall-clock (Strava-style trailing "Z"). Keeping them distinct means seeded
    // rows display/bucket at the declared local time on a non-UTC host, exactly
    // like synced rows that carry a real start_date_local.
    const started = seedDate(a.daysAgo, a.hour);
    const startedAtUtc = started.toISOString();
    const startedAtLocal = localWallClock(started);
    const result = await client.execute({
      sql: `INSERT INTO activities
            (user_id, strava_id, name, sport_type, started_at, started_at_local, distance_km, moving_time_s,
             avg_pace_s_per_km, avg_hr, elevation_gain_m, status, rpe, feeling,
             workout_notes, health_notes, raw_json)
            VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        fixtureOwner,
        a.name,
        a.sport,
        startedAtUtc,
        startedAtLocal,
        a.km,
        a.movingS,
        a.km > 0 ? Math.round(a.movingS / a.km) : null,
        a.hr,
        a.elev,
        a.status,
        a.rpe ?? null,
        a.feeling ?? null,
        a.workout ?? null,
        a.health ?? null,
        SEED_MARKER,
      ],
    });
    const activityId = Number(result.lastInsertRowid);
    for (const split of a.splits) {
      await client.execute({
        sql: "INSERT INTO activity_splits (activity_id, shoe_id, km) VALUES (?, ?, ?)",
        args: [activityId, split.shoe, split.km],
      });
    }
  }

  // A compact, deterministic five-week run for the weekly-brief route. It is
  // based on the host's app-calendar Monday so the route's fixed "last complete
  // week" selector always has four baseline weeks and a visible evidence-linked
  // observation. This is disposable local/E2E data only.
  const currentMonday = new Date();
  currentMonday.setHours(12, 0, 0, 0);
  currentMonday.setDate(currentMonday.getDate() - ((currentMonday.getDay() + 6) % 7));
  const completedMonday = new Date(currentMonday);
  completedMonday.setDate(completedMonday.getDate() - 7);
  for (let week = -4; week <= 0; week += 1) {
    const day = new Date(completedMonday);
    day.setDate(day.getDate() + week * 7 + 1);
    const movingTimeS = week === 0 ? 7200 : 3600;
    await client.execute({
      sql: `INSERT INTO activities
            (user_id, strava_id, name, sport_type, started_at, started_at_local, distance_km, moving_time_s, status, raw_json)
            VALUES (?, NULL, ?, 'Run', ?, ?, ?, ?, 'confirmed', ?)`,
      args: [
        fixtureOwner,
        week === 0 ? "Weekly brief current evidence" : "Weekly brief baseline evidence",
        day.toISOString(),
        localWallClock(day),
        movingTimeS / 600,
        movingTimeS,
        SEED_MARKER,
      ],
    });
  }

  const pending = ACTIVITIES.filter((a) => a.status === "pending_review").length;
  console.log(
    `Seeded ${ACTIVITIES.length} activities (${pending} pending review, ${
      ACTIVITIES.length - pending
    } confirmed)${replaced > 0 ? `, replacing ${replaced} previous seeds` : ""}.`
  );
  console.log("Remove them any time with: npm run seed:clear");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
