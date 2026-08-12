import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Migration 13 and the `activity_curve_points` reads, exercised against the REAL
// migrations and SQL on an ISOLATED local sqlite file (never Turso). Everything
// pinned here is a decision SQL makes and no pure function can: which direction
// counts as "best", which activities are eligible, and where the window's edge
// falls. db/client.ts builds its client singleton from env at import time, so
// DATABASE_URL is set (and TURSO_* cleared) before the dynamic import.

const dbFile = path.join(os.tmpdir(), `training-hub-curves-${process.pid}-${Date.now()}.db`);

let db: typeof import("./db");
const TEST_OWNER = "curves-test-owner";

/** Every stored activity, so each test can read the ones it inserted by name. */
const ids: Record<string, number> = {};

async function insertActivity(
  name: string,
  startedAt: string,
  status = "confirmed"
): Promise<number> {
  const row = await db.client.execute({
    sql: `INSERT INTO activities (user_id, name, sport_type, started_at, started_at_local, distance_km, status)
          VALUES (?, ?, 'Run', ?, ?, 10, ?)`,
    args: [TEST_OWNER, name, startedAt, startedAt, status],
  });
  return Number(row.lastInsertRowid);
}

beforeAll(async () => {
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  process.env.DATABASE_URL = `file:${dbFile}`;
  db = await import("./db");
  await db.ensureMigrated();
  const now = new Date().toISOString();
  await db.client.batch(
    [
      {
        sql: 'INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
        args: ["curves-test-auth", "Curves Test", "curves@example.test", 0, now, now],
      },
      {
        sql: "INSERT INTO users (id, auth_subject) VALUES (?, ?)",
        args: [TEST_OWNER, "curves-test-auth"],
      },
    ],
    "write"
  );
});

afterAll(() => {
  db.client.close();
  for (const suffix of ["", "-shm", "-wal", "-journal"]) {
    fs.rmSync(`${dbFile}${suffix}`, { force: true });
  }
});

describe("listCurveBests", () => {
  beforeAll(async () => {
    ids.fast = await insertActivity("Track day", "2026-07-01T08:00:00Z");
    ids.slow = await insertActivity("Easy jog", "2026-07-02T08:00:00Z");
    ids.pending = await insertActivity("Unreviewed", "2026-07-03T08:00:00Z", "pending_review");

    // The FASTEST pace and the HIGHEST wattage are both on "Track day", and the
    // other two rows would win a curve sorted the wrong way round.
    await db.saveActivityCurvePoints(
      ids.fast,
      [
        { kind: "pace", bucket: "1k", value: 215 },
        { kind: "power", bucket: "5m", value: 320 },
      ],
      { overwrite: true }
    );
    await db.saveActivityCurvePoints(
      ids.slow,
      [
        { kind: "pace", bucket: "1k", value: 400 },
        { kind: "power", bucket: "5m", value: 180 },
      ],
      { overwrite: true }
    );
    await db.saveActivityCurvePoints(
      ids.pending,
      [
        { kind: "pace", bucket: "1k", value: 150 },
        { kind: "power", bucket: "5m", value: 600 },
      ],
      { overwrite: true }
    );
  });

  it("takes the lowest pace and the highest wattage, with the activity that set it", async () => {
    // The direction is the whole meaning of the query: reversed, the panel
    // would show the athlete's slowest effort in every pace bucket and their
    // weakest in every power bucket, and still look like a curve.
    expect(await db.listCurveBests("pace", null)).toEqual([
      {
        bucket: "1k",
        value: 215,
        activityName: "Track day",
        date: "2026-07-01T08:00:00Z",
      },
    ]);
    expect(await db.listCurveBests("power", null)).toEqual([
      {
        bucket: "5m",
        value: 320,
        activityName: "Track day",
        date: "2026-07-01T08:00:00Z",
      },
    ]);
  });

  it("never shows a pending activity, which the ladder above it excludes too", async () => {
    // 150 s/km and 600 W are the best values in the table and both sit on an
    // unreviewed activity. /performance draws the curve inches under the
    // distance ladder, and the two must read the same population.
    const paces = await db.listCurveBests("pace", null);
    expect(paces.map((row) => row.value)).not.toContain(150);
    const powers = await db.listCurveBests("power", null);
    expect(powers.map((row) => row.value)).not.toContain(600);
  });

  it("includes an activity dated exactly on the window's edge", async () => {
    // `curveWindowStart` returns an instant, and the cutoff is inclusive to
    // match `computeInsights`. Both sides are Z-suffixed ISO, so the string
    // compare SQL does is chronological.
    for (const edge of ["2026-07-01T08:00:00Z", "2026-07-01T08:00:00.000Z"]) {
      // Both spellings of the same instant: Strava stores whole seconds and
      // `curveWindowStart` emits milliseconds, and ".000Z" sorts BEFORE "Z", so
      // the activity is on the inside of the window either way.
      expect((await db.listCurveBests("pace", edge)).map((row) => row.activityName)).toEqual([
        "Track day",
      ]);
    }
    // A second later and the same activity is outside it, which is what makes
    // the assertion above about the boundary and not about the date.
    expect(await db.listCurveBests("pace", "2026-07-01T08:00:01Z")).toEqual([
      { bucket: "1k", value: 400, activityName: "Easy jog", date: "2026-07-02T08:00:00Z" },
    ]);
  });
});

describe("the two writers of one bucket", () => {
  it("lets the stream scan overwrite a seeded value in either order", async () => {
    const seedFirst = await insertActivity("Seed first", "2026-06-01T08:00:00Z");
    const streamFirst = await insertActivity("Stream first", "2026-06-02T08:00:00Z");
    const seed = (id: number, value: number) =>
      db.saveActivityCurvePoints(id, [{ kind: "pace", bucket: "400m", value }], {
        overwrite: false,
      });
    const scan = (id: number, value: number) =>
      db.saveActivityCurvePoints(id, [{ kind: "pace", bucket: "400m", value }], {
        overwrite: true,
      });

    await seed(seedFirst, 100);
    await scan(seedFirst, 101);
    await scan(streamFirst, 101);
    await seed(streamFirst, 100);

    // Both hold the scan's value, including the one where the seed ran last and
    // carried the better number: insert-only is what makes the order irrelevant.
    const bests = await db.listCurveBests("pace", "2026-06-01T00:00:00Z");
    expect(bests.filter((row) => row.bucket === "400m")).toEqual([
      { bucket: "400m", value: 101, activityName: "Seed first", date: "2026-06-01T08:00:00Z" },
    ]);
    const stored = await db.client.execute(
      "SELECT activity_id, value FROM activity_curve_points WHERE bucket = '400m' ORDER BY activity_id"
    );
    expect(stored.rows.map((row) => Number(row.value))).toEqual([101, 101]);
  });
});

describe("listSeedEfforts", () => {
  it("reads confirmed runs only, so the seed cannot fill a bucket the curve hides", async () => {
    const run = await insertActivity("Seedable run", "2026-05-01T08:00:00Z");
    const pending = await insertActivity("Pending run", "2026-05-02T08:00:00Z", "pending_review");
    for (const id of [run, pending]) {
      await db.upsertActivityBestEfforts(id, [
        { name: "1K", distance_m: 1000, elapsed_time_s: 280, moving_time_s: 280, pr_rank: null },
      ]);
    }
    const efforts = await db.listSeedEfforts();
    expect(efforts.map((row) => row.activity_id)).toContain(run);
    expect(efforts.map((row) => row.activity_id)).not.toContain(pending);
  });
});

describe("listCurvePointBuckets", () => {
  it("reports each stored bucket, so the seed resumes per bucket and not per run", async () => {
    const partial = await insertActivity("Partly scanned", "2026-04-01T08:00:00Z");
    await db.saveActivityCurvePoints(
      partial,
      [
        { kind: "pace", bucket: "400m", value: 210 },
        { kind: "pace", bucket: "1k", value: 240 },
      ],
      { overwrite: true }
    );
    const stored = (await db.listCurvePointBuckets("pace"))
      .filter((row) => row.activity_id === partial)
      .map((row) => row.bucket);
    expect(stored.sort()).toEqual(["1k", "400m"]);
    // The kind is a filter, not a decoration: a pace seed must not be told a
    // power bucket is already covered.
    expect(await db.listCurvePointBuckets("power")).not.toContainEqual({
      activity_id: partial,
      bucket: "400m",
    });
  });
});
