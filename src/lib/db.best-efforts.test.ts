import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Migration 10 + the best-effort upsert, exercised against the REAL migrations and
// SQL on an ISOLATED local sqlite file (never Turso) — the shared database is where
// these statements ultimately run, so the UNIQUE key, the upsert and the cascade are
// proven here first. db/client.ts builds its client singleton from env at import
// time, so DATABASE_URL is set (and TURSO_* cleared) before the dynamic import.

const dbFile = path.join(os.tmpdir(), `training-hub-best-efforts-${process.pid}-${Date.now()}.db`);

let db: typeof import("./db");
let activityId: number;

beforeAll(async () => {
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  process.env.DATABASE_URL = `file:${dbFile}`;
  db = await import("./db");
  await db.ensureMigrated();
  const inserted = await db.client.execute({
    sql: `INSERT INTO activities (name, sport_type, started_at, distance_km, status)
          VALUES (?, 'Run', ?, ?, 'confirmed')`,
    args: ["Best efforts test", "2026-01-01T12:00:00Z", 10],
  });
  activityId = Number(inserted.lastInsertRowid);
});

afterAll(() => {
  db.client.close();
  for (const suffix of ["", "-shm", "-wal", "-journal"]) {
    fs.rmSync(`${dbFile}${suffix}`, { force: true });
  }
});

async function storedRows() {
  const result = await db.client.execute({
    sql: `SELECT name, distance_m, elapsed_time_s, moving_time_s, pr_rank
          FROM activity_best_efforts WHERE activity_id = ? ORDER BY name`,
    args: [activityId],
  });
  return result.rows.map((row) => ({ ...row }));
}

describe("activity_best_efforts", () => {
  // Elapsed and moving are deliberately DIFFERENT in every fixture row: equal values
  // would let the two columns be transposed in the upsert without a test noticing.
  it("upserts on (activity_id, name): re-running rewrites in place", async () => {
    await db.upsertActivityBestEfforts(activityId, [
      { name: "1K", distance_m: 1000, elapsed_time_s: 293, moving_time_s: 291, pr_rank: null },
      { name: "5K", distance_m: 5000, elapsed_time_s: 1207, moving_time_s: 1200, pr_rank: 2 },
    ]);
    expect(await storedRows()).toEqual([
      { name: "1K", distance_m: 1000, elapsed_time_s: 293, moving_time_s: 291, pr_rank: null },
      { name: "5K", distance_m: 5000, elapsed_time_s: 1207, moving_time_s: 1200, pr_rank: 2 },
    ]);

    // Same names, one changed rank: two rows, not four.
    await db.upsertActivityBestEfforts(activityId, [
      { name: "1K", distance_m: 1000, elapsed_time_s: 293, moving_time_s: 291, pr_rank: null },
      { name: "5K", distance_m: 5000, elapsed_time_s: 1207, moving_time_s: 1200, pr_rank: 1 },
    ]);
    const rows = await storedRows();
    expect(rows).toHaveLength(2);
    // The rewritten row keeps both durations in their own columns, unswapped.
    expect(rows[1]).toEqual({
      name: "5K",
      distance_m: 5000,
      elapsed_time_s: 1207,
      moving_time_s: 1200,
      pr_rank: 1,
    });

    expect(await db.listBestEffortCounts()).toEqual([{ activity_id: activityId, n: 2 }]);
  });

  it("deleting the activity cascades its effort rows away", async () => {
    await db.client.execute({ sql: "DELETE FROM activities WHERE id = ?", args: [activityId] });
    expect(await storedRows()).toEqual([]);
  });
});

describe("listFastestBestEfforts", () => {
  async function insertActivity(
    name: string,
    startedAt: string,
    status: string,
    isRace: number,
    sportType = "Run"
  ): Promise<number> {
    const inserted = await db.client.execute({
      sql: `INSERT INTO activities (name, sport_type, started_at, started_at_local, distance_km, status, is_race)
            VALUES (?, ?, ?, ?, 21, ?, ?)`,
      args: [name, sportType, startedAt, startedAt, status, isRace],
    });
    return Number(inserted.lastInsertRowid);
  }

  it("returns the fastest confirmed row per name, shortest distance first", async () => {
    const race = await insertActivity("Half marathon", "2026-04-12T08:30:00Z", "confirmed", 1);
    const easy = await insertActivity("Easy run", "2026-07-18T11:22:00Z", "confirmed", 0);
    const pending = await insertActivity("Unreviewed", "2026-07-20T11:00:00Z", "pending_review", 0);
    await db.upsertActivityBestEfforts(race, [
      { name: "5K", distance_m: 5000, elapsed_time_s: 1351, moving_time_s: 1351, pr_rank: null },
      { name: "10K", distance_m: 10000, elapsed_time_s: 2740, moving_time_s: 2735, pr_rank: 1 },
    ]);
    await db.upsertActivityBestEfforts(easy, [
      { name: "5K", distance_m: 5000, elapsed_time_s: 1680, moving_time_s: 1675, pr_rank: null },
    ]);
    // A faster row on an unconfirmed activity must not win — /performance only counts
    // confirmed activities, so both of its sources must read the same population.
    await db.upsertActivityBestEfforts(pending, [
      { name: "5K", distance_m: 5000, elapsed_time_s: 1200, moving_time_s: 1200, pr_rank: null },
    ]);

    expect(await db.listFastestBestEfforts()).toEqual([
      {
        name: "5K",
        distance_m: 5000,
        elapsed_time_s: 1351,
        moving_time_s: 1351,
        pr_rank: null,
        activity_name: "Half marathon",
        is_race: true,
        date: "2026-04-12T08:30:00Z",
      },
      {
        name: "10K",
        distance_m: 10000,
        elapsed_time_s: 2740,
        moving_time_s: 2735,
        pr_rank: 1,
        activity_name: "Half marathon",
        is_race: true,
        date: "2026-04-12T08:30:00Z",
      },
    ]);
  });

  it("breaks an exact tie on the lower activity id", async () => {
    const first = await insertActivity("First", "2026-01-01T10:00:00Z", "confirmed", 0);
    const second = await insertActivity("Second", "2026-02-01T10:00:00Z", "confirmed", 0);
    await db.upsertActivityBestEfforts(second, [
      { name: "1 mile", distance_m: 1609, elapsed_time_s: 412, moving_time_s: 412, pr_rank: null },
    ]);
    await db.upsertActivityBestEfforts(first, [
      { name: "1 mile", distance_m: 1609, elapsed_time_s: 412, moving_time_s: 412, pr_rank: null },
    ]);
    expect(first).toBeLessThan(second);

    const mile = (await db.listFastestBestEfforts()).find((row) => row.name === "1 mile");
    expect(mile?.activity_name).toBe("First");
  });

  it("excludes rides and trail runs, which the road ladder rejects on the other side", async () => {
    // cacheBestEfforts writes whatever a payload carries, so a ride and a trail run can
    // both hold a "5K" row. raceCategory keeps those activities out of the whole-activity
    // ladder, so this query must reject them too or the two halves of the /performance
    // merge would draw from different populations.
    const ride = await insertActivity("Fast ride", "2026-07-21T10:00:00Z", "confirmed", 0, "Ride");
    const trailSport = await insertActivity(
      "Serra longo",
      "2026-07-22T10:00:00Z",
      "confirmed",
      0,
      "TrailRun"
    );
    const trailName = await insertActivity(
      "Butinada Trail",
      "2026-07-23T10:00:00Z",
      "confirmed",
      0
    );
    for (const id of [ride, trailSport, trailName]) {
      await db.upsertActivityBestEfforts(id, [
        { name: "5K", distance_m: 5000, elapsed_time_s: 1002, moving_time_s: 1000, pr_rank: 1 },
      ]);
    }

    // All three are faster than 1351 s and none of them wins.
    const fiveK = (await db.listFastestBestEfforts()).find((row) => row.name === "5K");
    expect(fiveK).toMatchObject({ moving_time_s: 1351, activity_name: "Half marathon" });
  });

  it("admits one named activity's own rows whatever its review status", async () => {
    // A freshly synced run is pending_review — exactly when a new record wants its PR
    // badge. Its own rows are visible when the activity page names it, and invisible to
    // the /performance ladder, which passes no id.
    const fresh = await insertActivity("Just synced", "2026-07-24T10:00:00Z", "pending_review", 0);
    await db.upsertActivityBestEfforts(fresh, [
      { name: "5K", distance_m: 5000, elapsed_time_s: 1105, moving_time_s: 1100, pr_rank: 1 },
    ]);

    const ladder = (await db.listFastestBestEfforts()).find((row) => row.name === "5K");
    expect(ladder).toMatchObject({ moving_time_s: 1351, activity_name: "Half marathon" });

    const own = (await db.listFastestBestEfforts({ includeActivityId: fresh })).find(
      (row) => row.name === "5K"
    );
    expect(own).toMatchObject({ moving_time_s: 1100, activity_name: "Just synced" });
  });
});
