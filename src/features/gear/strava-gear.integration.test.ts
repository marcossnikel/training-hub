import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProviderActivity, StravaProvider } from "@/features/strava/server/provider";
import type { StravaGear } from "@/lib/types";

const dbFile = path.join(os.tmpdir(), `training-hub-strava-gear-${process.pid}-${Date.now()}.db`);
const owner = { userId: "gear-owner" };
const otherOwner = { userId: "gear-other-owner" };
let db: typeof import("@/lib/db");
let sync: typeof import("@/features/strava/server/sync");
let gear: typeof import("@/features/gear/server/strava-materialization");

let athleteGear: { shoes: StravaGear[]; bikes: StravaGear[] } = {
  shoes: [{ id: "shoe-1", name: "Nimbus", distance: 120_000, retired: false }],
  bikes: [{ id: "bike-1", name: "Road bike", distance: 2_400_000, retired: false }],
};
let activityPages: ProviderActivity[][] = [
  [
    {
      id: 1,
      name: "Historical run",
      sportType: "Run",
      startedAt: "2025-01-01T12:00:00Z",
      startedAtLocal: null,
      distanceM: 5_000,
      movingTimeS: 1_500,
      averageHeartRate: null,
      elevationGainM: null,
      gearId: "shoe-1",
    },
  ],
];

const provider: StravaProvider = {
  exchangeAuthorizationCode: async () => {
    throw new Error("not used");
  },
  refreshAccessToken: async () => {
    throw new Error("not used");
  },
  deauthorize: async () => true,
  listActivities: async ({ page }) => activityPages[page - 1] ?? [],
  getActivityDetail: async () => ({}),
  getActivityStreams: async () => ({}),
  getAthleteGear: async () => athleteGear,
};

async function addOwner(userId: string): Promise<void> {
  const now = new Date().toISOString();
  await db.client.batch(
    [
      {
        sql: 'INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 0, ?, ?)',
        args: [`auth-${userId}`, userId, `${userId}@example.test`, now, now],
      },
      {
        sql: "INSERT INTO users (id, auth_subject) VALUES (?, ?)",
        args: [userId, `auth-${userId}`],
      },
    ],
    "write"
  );
}

async function connect(currentOwner = owner): Promise<void> {
  await db.saveStravaConnection(currentOwner, {
    client_id: `client-${currentOwner.userId}`,
    client_secret: "secret",
    access_token: "access",
    refresh_token: "refresh",
    expires_at: 4_000_000_000,
  });
}

beforeAll(async () => {
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.STRAVA_CONNECTION_ENCRYPTION_KEY = Buffer.alloc(32, 78).toString("base64url");
  db = await import("@/lib/db");
  sync = await import("@/features/strava/server/sync");
  gear = await import("@/features/gear/server/strava-materialization");
  await db.ensureMigrated();
  await addOwner(owner.userId);
  await addOwner(otherOwner.userId);
  await connect();
});

afterAll(() => {
  db.client.close();
  for (const suffix of ["", "-shm", "-wal", "-journal"])
    fs.rmSync(`${dbFile}${suffix}`, { force: true });
});

describe("Strava gear materialization", () => {
  it("materializes owner-scoped gear, separates provider odometers, and keeps review matching automatic", async () => {
    const initial = await sync.syncStravaActivities(owner, provider);
    expect(initial).toMatchObject({
      imported: 1,
      historicalConfirmed: 1,
      gear: { created: 2, updated: 0, placeholders: 0 },
    });
    expect((await db.getInitialStravaImportStatus(owner))?.job).toMatchObject({
      gearCreated: 2,
      gearUpdated: 0,
      gearPlaceholders: 0,
    });

    const [initialShoe] = await db.listShoes(owner);
    const [initialBike] = await db.listBikes(owner);
    expect(initialShoe).toMatchObject({
      name: "Nimbus",
      origin: "strava",
      provider_distance_m: 120_000,
      current_km: 120,
    });
    expect(initialBike).toMatchObject({
      name: "Road bike",
      origin: "strava",
      provider_distance_m: 2_400_000,
      current_km: 2_400,
    });
    // History stays confirmed without a Review split, and therefore cannot
    // double-count the provider's lifetime odometer.
    expect((await db.getActivity(owner, 1))?.splits).toEqual([]);

    athleteGear = {
      shoes: [{ id: "shoe-1", name: "Nimbus renamed", distance: 90_000, retired: true }],
      bikes: [{ id: "bike-1", name: "Road bike", distance: null, retired: false }],
    };
    activityPages = [
      [
        {
          id: 2,
          name: "New run",
          sportType: "Run",
          startedAt: "2099-01-01T12:00:00Z",
          startedAtLocal: null,
          distanceM: 5_000,
          movingTimeS: 1_500,
          averageHeartRate: null,
          elevationGainM: null,
          gearId: "shoe-1",
        },
        {
          id: 3,
          name: "New ride",
          sportType: "Ride",
          startedAt: "2099-01-02T12:00:00Z",
          startedAtLocal: null,
          distanceM: 20_000,
          movingTimeS: 3_600,
          averageHeartRate: null,
          elevationGainM: null,
          gearId: "bike-1",
        },
        {
          id: 4,
          name: "Unlisted gear run",
          sportType: "Run",
          startedAt: "2099-01-03T12:00:00Z",
          startedAtLocal: null,
          distanceM: 3_000,
          movingTimeS: 900,
          averageHeartRate: null,
          elevationGainM: null,
          gearId: "shoe-missing",
        },
      ],
    ];
    const incremental = await sync.syncStravaActivities(owner, provider);
    expect(incremental).toMatchObject({
      imported: 3,
      pendingNew: 3,
      gear: { updated: 1, placeholders: 1 },
    });

    const shoes = await db.listShoes(owner);
    const refreshed = shoes.find((shoe) => shoe.strava_gear_id === "shoe-1")!;
    const placeholder = shoes.find((shoe) => shoe.strava_gear_id === "shoe-missing")!;
    expect(refreshed).toMatchObject({
      name: "Nimbus renamed",
      retired_at: expect.any(String),
      provider_distance_m: 90_000,
      current_km: 90,
    });
    expect(placeholder).toMatchObject({
      origin: "strava",
      name: "Strava shoe (shoe-missing)",
      provider_distance_m: null,
      current_km: null,
    });
    const pendingRun = await db.getActivity(owner, 2);
    const pendingRide = await db.getActivity(owner, 3);
    expect(pendingRun?.splits).toMatchObject([{ shoe_id: refreshed.id, km: 5 }]);
    expect(pendingRide?.bike_id).toBe(initialBike.id);

    // Confirmation remains evidence only: it must not add a second five km
    // to the Strava-owned snapshot.
    await db.client.execute({
      sql: "UPDATE activities SET status = 'confirmed' WHERE id = ?",
      args: [2],
    });
    expect((await db.listShoes(owner)).find((shoe) => shoe.id === refreshed.id)?.current_km).toBe(
      90
    );

    const manualId = await db.createShoe(
      owner,
      {
        name: "Manual pair",
        role: "easy",
        initial_km: 10,
        retirement_km: 700,
        strava_gear_id: "manual-link",
      },
      null
    );
    const manualActivity = await db.client.execute({
      sql: "INSERT INTO activities (user_id, name, status, distance_km) VALUES (?, ?, 'confirmed', ?)",
      args: [owner.userId, "Manual mileage", 2],
    });
    await db.client.execute({
      sql: "INSERT INTO activity_splits (activity_id, shoe_id, km) VALUES (?, ?, ?)",
      args: [Number(manualActivity.lastInsertRowid), manualId, 2],
    });
    await gear.materializeStravaGear(
      owner,
      "shoe",
      { id: "manual-link", name: "Provider must not rename this", distance: 7_000, retired: true },
      { now: "2099-02-01T00:00:00Z" }
    );
    const manual = await db.getShoe(owner, manualId);
    expect(manual).toMatchObject({
      name: "Manual pair",
      origin: "manual",
      retired_at: null,
      provider_distance_m: 7_000,
      current_km: 12,
    });

    await gear.materializeStravaGear(
      owner,
      "bike",
      { id: "bike-unknown", name: "Unknown odometer", distance: null, retired: false },
      { now: "2099-03-01T00:00:00Z" }
    );
    await gear.materializeStravaGear(
      owner,
      "bike",
      { id: "bike-unknown", name: "Unknown odometer", distance: 1_000, retired: false },
      { now: "2099-03-02T00:00:00Z" }
    );
    await gear.materializeStravaGear(
      owner,
      "bike",
      { id: "bike-unknown", name: "Unknown odometer", distance: null, retired: false },
      { now: "2099-03-03T00:00:00Z" }
    );
    expect(
      (await db.listBikes(owner)).find((bike) => bike.strava_gear_id === "bike-unknown")
    ).toMatchObject({
      provider_distance_m: 1_000,
      provider_observed_at: "2099-03-02T00:00:00Z",
      provider_last_seen_at: "2099-03-03T00:00:00Z",
      current_km: 1,
    });
  });

  it("isolates duplicate provider IDs and deletes only the Strava-origin graph on disconnect", async () => {
    await gear.materializeStravaGearSnapshot(otherOwner, athleteGear, "2099-04-01T00:00:00Z");
    expect(
      (await db.listShoes(otherOwner)).find((shoe) => shoe.strava_gear_id === "shoe-1")
    ).toMatchObject({
      origin: "strava",
      provider_distance_m: 90_000,
    });

    const beforeDisconnect = await db.listShoes(owner);
    const originalProviderRow = beforeDisconnect.find((shoe) => shoe.strava_gear_id === "shoe-1")!;
    await db.deleteOwnerStravaData(owner);
    const afterDisconnect = await db.listShoes(owner);
    expect(afterDisconnect).toHaveLength(1);
    expect(afterDisconnect[0]).toMatchObject({
      name: "Manual pair",
      origin: "manual",
      strava_gear_id: null,
      provider_distance_m: null,
      current_km: 12,
    });
    expect((await db.listShoes(otherOwner)).some((shoe) => shoe.strava_gear_id === "shoe-1")).toBe(
      true
    );

    await connect();
    await gear.materializeStravaGear(owner, "shoe", athleteGear.shoes[0], {
      now: "2099-05-01T00:00:00Z",
    });
    const reconnected = (await db.listShoes(owner)).find(
      (shoe) => shoe.strava_gear_id === "shoe-1"
    )!;
    expect(reconnected).toMatchObject({ origin: "strava", provider_distance_m: 90_000 });
    expect(reconnected.id).not.toBe(originalProviderRow.id);
  });
});
