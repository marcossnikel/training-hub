import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Two deliberately similar accounts prove that every domain helper uses its
// server-derived owner argument, not an overlapping name, external ID, or a
// guessed numeric primary key.
const dbFile = path.join(os.tmpdir(), `training-hub-owner-scope-${process.pid}-${Date.now()}.db`);
const ownerA = { userId: "owner-scope-a" };
const ownerB = { userId: "owner-scope-b" };

let db: typeof import("./db");
let activityA: number;
let activityB: number;
let shoeA: number;
let shoeB: number;
let bikeA: number;
let goalA: number;

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
        args: ["owner-scope-auth-a", "Owner A", "owner-a@example.test", 0, now, now],
      },
      {
        sql: 'INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
        args: ["owner-scope-auth-b", "Owner B", "owner-b@example.test", 0, now, now],
      },
      {
        sql: "INSERT INTO users (id, auth_subject) VALUES (?, ?)",
        args: [ownerA.userId, "owner-scope-auth-a"],
      },
      {
        sql: "INSERT INTO users (id, auth_subject) VALUES (?, ?)",
        args: [ownerB.userId, "owner-scope-auth-b"],
      },
    ],
    "write"
  );
  shoeA = await db.createShoe(
    ownerA,
    {
      name: "Shared Shoe",
      role: null,
      initial_km: 0,
      retirement_km: 700,
      strava_gear_id: "same-gear",
    },
    "gear-a.jpg"
  );
  shoeB = await db.createShoe(
    ownerB,
    {
      name: "Shared Shoe",
      role: null,
      initial_km: 0,
      retirement_km: 700,
      strava_gear_id: "same-gear",
    },
    "gear-b.jpg"
  );
  bikeA = await db.createBike(
    ownerA,
    { name: "Shared Bike", role: null, initial_km: 0, strava_gear_id: "same-bike" },
    null
  );
  activityA = await db.createManualActivity(ownerA, {
    date: "2026-08-01",
    km: 10,
    shoe_id: shoeA,
    name: "Same activity",
  });
  activityB = await db.createManualActivity(ownerB, {
    date: "2026-08-01",
    km: 12,
    shoe_id: shoeB,
    name: "Same activity",
  });
  await db.setActivityRace(ownerA, activityA, true, 300);
  await db.createGoal(ownerA, {
    name: "Same goal",
    race_date: "2026-10-01",
    distance_km: 21.1,
    goal_time_s: null,
    notes: null,
    priority: 1,
  });
  const goal = await db.client.execute({
    sql: "SELECT id FROM athlete_goals WHERE user_id = ?",
    args: [ownerA.userId],
  });
  goalA = Number(goal.rows[0].id);
  await db.saveActivityStreams(ownerA, activityA, '{"time":[0]}');
  await db.saveActivityCurvePoints(
    ownerA,
    activityA,
    [{ kind: "pace", bucket: "1k", value: 300 }],
    { overwrite: true }
  );
});

afterAll(() => {
  db.client.close();
  for (const suffix of ["", "-shm", "-wal", "-journal"])
    fs.rmSync(`${dbFile}${suffix}`, { force: true });
});

describe("owner-scoped domain access", () => {
  it("isolates overlapping list, aggregate, comparison, child, and blob lookups", async () => {
    expect((await db.listConfirmedActivities(ownerA)).map((row) => row.id)).toEqual([activityA]);
    expect((await db.listConfirmedActivities(ownerB)).map((row) => row.id)).toEqual([activityB]);
    expect(await db.getActivity(ownerB, activityA)).toBeNull();
    expect(await db.getActivityStreamsJson(ownerB, activityA)).toBeNull();
    expect(await db.countPending(ownerA)).toBe(0);
    expect(
      (await db.listTotalsActivities(ownerA, "2026-01-01")).map((row) => row.distance_km)
    ).toEqual([10]);
    expect(
      (await db.listSessionStarts(ownerB, "2026-01-01")).map((row) => row.started_at)
    ).toHaveLength(1);
    expect((await db.listRaces(ownerB)).map((row) => row.id)).toEqual([]);
    expect((await db.listCurveBests(ownerB, "pace", null)).map((row) => row.value)).toEqual([]);
    expect(await db.findOwnedGearPhoto(ownerB, "gear-a.jpg")).toBeNull();
    expect(await db.findOwnedGearPhoto(ownerA, "gear-a.jpg")).toBe("gear-a.jpg");
  });

  it("turns cross-owner guessed IDs into safe no-ops while preserving the owner record", async () => {
    await db.updateActivityJournal(ownerB, activityA, {
      rpe: 10,
      feeling: null,
      workout_notes: "forged",
      health_notes: null,
    });
    await db.setShoeRetired(ownerB, shoeA, true);
    await db.setShoeRetired(ownerA, shoeB, true);
    await db.setActivityBike(ownerB, activityA, bikeA);
    await db.deleteGoal(ownerB, goalA);

    const activity = await db.getActivity(ownerA, activityA);
    expect(activity?.workout_notes).toBeNull();
    expect((await db.getShoe(ownerA, shoeA))?.retired_at).toBeNull();
    expect((await db.getShoe(ownerB, shoeB))?.retired_at).toBeNull();
    expect(activity?.bike_id).toBeNull();
    expect((await db.listGoals(ownerA)).map((goal) => goal.id)).toEqual([goalA]);
  });

  it("excludes a malformed cross-owner bike reference from mileage aggregates", async () => {
    await db.client.execute({
      sql: `INSERT INTO activities (user_id, name, sport_type, started_at, distance_km, status, bike_id)
            VALUES (?, ?, 'Ride', ?, ?, 'confirmed', ?)`,
      args: [ownerB.userId, "Forged bike ride", "2026-08-02T12:00:00Z", 42, bikeA],
    });

    const bike = await db.getBike(ownerA, bikeA);
    expect(bike).toMatchObject({ current_km: 0, ride_count: 0, indoor_km: 0, outdoor_km: 0 });
  });

  it("bounds the weekly brief projection by local stamp and keeps another owner out", async () => {
    await db.client.batch(
      [
        {
          sql: `INSERT INTO activities (user_id, name, sport_type, started_at, started_at_local, moving_time_s, distance_km, status)
                VALUES (?, ?, 'Run', ?, ?, ?, ?, 'confirmed')`,
          args: [
            ownerA.userId,
            "local boundary",
            "2026-02-02T02:00:00Z",
            "2026-02-01T23:00:00Z",
            3600,
            10,
          ],
        },
        {
          sql: `INSERT INTO activities (user_id, name, sport_type, started_at, started_at_local, moving_time_s, distance_km, status)
                VALUES (?, ?, 'Ride', ?, ?, ?, ?, 'confirmed')`,
          args: [ownerA.userId, "inside", "2026-02-02T10:00:00Z", "2026-02-02T08:00:00Z", 7200, 30],
        },
        {
          sql: `INSERT INTO activities (user_id, name, sport_type, started_at, moving_time_s, distance_km, status)
                VALUES (?, ?, 'Run', ?, ?, ?, 'confirmed')`,
          args: [ownerA.userId, "end boundary", "2026-03-09T00:00:00Z", 2400, 6],
        },
        {
          sql: `INSERT INTO activities (user_id, name, sport_type, started_at, moving_time_s, distance_km, status)
                VALUES (?, ?, 'Run', ?, ?, ?, 'confirmed')`,
          args: [ownerB.userId, "other owner", "2026-02-15T08:00:00Z", 3600, 11],
        },
      ],
      "write"
    );

    const rows = await db.listWeeklyBriefActivities(ownerA, "2026-02-02", "2026-03-09");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sport_type: "Ride", moving_time_s: 7200, distance_km: 30 });
    expect(Object.keys(rows[0]).sort()).toEqual([
      "distance_km",
      "id",
      "moving_time_s",
      "sport_type",
      "started_at",
      "started_at_local",
    ]);
  });
});
