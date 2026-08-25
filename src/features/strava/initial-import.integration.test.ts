import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const dbFile = path.join(
  os.tmpdir(),
  `training-hub-initial-import-${process.pid}-${Date.now()}.db`
);
const owner = { userId: "initial-import-owner" };
const otherOwner = { userId: "initial-import-other-owner" };
let db: typeof import("../../lib/db");
let strava: typeof import("../../lib/strava");
const realFetch = global.fetch;

function response(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => body,
  } as unknown as Response;
}

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
  await db.saveStravaConnection(
    { userId },
    {
      client_id: `client-${userId}`,
      client_secret: "secret",
      access_token: "access",
      refresh_token: "refresh",
      expires_at: 4_000_000_000,
    }
  );
}

beforeAll(async () => {
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.STRAVA_CONNECTION_ENCRYPTION_KEY = Buffer.alloc(32, 19).toString("base64url");
  db = await import("../../lib/db");
  strava = await import("../../lib/strava");
  await db.ensureMigrated();
  await addOwner(owner.userId);
  await addOwner(otherOwner.userId);
});

afterAll(() => {
  db.client.close();
  global.fetch = realFetch;
  for (const suffix of ["", "-shm", "-wal", "-journal"])
    fs.rmSync(`${dbFile}${suffix}`, { force: true });
});

describe("initial Strava import", () => {
  it("retries full history without duplicates, then reviews only a post-cutoff activity", async () => {
    const historical = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      name: `Historical ${index + 1}`,
      sport_type: "Run",
      start_date: `2025-01-${String((index % 28) + 1).padStart(2, "0")}T12:00:00Z`,
      distance: 5000,
      moving_time: 1500,
    }));
    const older = [
      {
        id: 101,
        name: "Older A",
        sport_type: "Run",
        start_date: "2024-01-02T12:00:00Z",
        distance: 5000,
        moving_time: 1500,
      },
      {
        id: 102,
        name: "Older B",
        sport_type: "Run",
        start_date: "2024-01-01T12:00:00Z",
        distance: 5000,
        moving_time: 1500,
      },
    ];
    let failSecondPage = true;
    global.fetch = vi.fn(async (url: string) => {
      const parsed = new URL(url);
      const page = parsed.searchParams.get("page");
      if (page === "1") return response(historical);
      if (page === "2" && failSecondPage) {
        failSecondPage = false;
        throw new Error("loopback page two failure");
      }
      if (page === "2") return response(older);
      return response([]);
    }) as unknown as typeof fetch;

    // R14 makes each sync invocation one durable page/terminal step. The
    // failure below therefore leaves the first committed page visible and the
    // same persisted job resumable instead of asking a browser request to walk
    // all history again.
    await expect(strava.syncActivities(owner)).resolves.toMatchObject({
      imported: 100,
      historicalConfirmed: 100,
    });
    await expect(strava.syncActivities(owner)).resolves.toMatchObject({
      imported: 100,
      historicalConfirmed: 100,
    });
    expect(await db.countPending(owner)).toBe(0);
    const stateAfterFailure = await db.getStravaSyncState(owner);
    expect(stateAfterFailure?.initialSyncCompletedAt).toBeNull();

    const complete = await strava.syncActivities(owner);
    expect(complete).toMatchObject({
      imported: 102,
      historicalConfirmed: 102,
      pendingNew: 0,
      pendingTotal: 0,
    });
    expect(
      (await db.listConfirmedActivities(owner)).filter((row) => row.strava_id !== null)
    ).toHaveLength(102);
    expect((await db.getStravaSyncState(owner))?.initialSyncCompletedAt).toBeTruthy();

    global.fetch = vi.fn(async () =>
      response([
        {
          id: 103,
          name: "Later",
          sport_type: "Run",
          start_date: "2027-01-01T12:00:00Z",
          distance: 5000,
          moving_time: 1500,
        },
      ])
    ) as unknown as typeof fetch;
    const incremental = await strava.syncActivities(owner);
    expect(incremental).toMatchObject({
      imported: 1,
      historicalConfirmed: 0,
      pendingNew: 1,
      pendingTotal: 1,
    });
    expect(await db.countPending(owner)).toBe(1);
  });

  it("repairs only exact historical pending rows, dry-run first and owner-scoped", async () => {
    const state = await db.getStravaSyncState(owner);
    const cutoff = state!.reviewAfter;
    const own = await db.client.execute({
      sql: "INSERT INTO activities (user_id, strava_id, name, started_at, distance_km, status) VALUES (?, ?, 'repair', ?, 5, 'pending_review')",
      args: [owner.userId, 5001, cutoff],
    });
    await db.client.execute({
      sql: "INSERT INTO activity_splits (activity_id, km) VALUES (?, 5)",
      args: [Number(own.lastInsertRowid)],
    });
    await db.client.execute({
      sql: "INSERT INTO activities (user_id, strava_id, name, started_at, distance_km, status) VALUES (?, ?, 'other', ?, 5, 'pending_review')",
      args: [otherOwner.userId, 5001, cutoff],
    });
    expect(await db.repairHistoricalReviewImports(owner)).toMatchObject({
      candidates: 1,
      changed: 0,
    });
    expect(await db.repairHistoricalReviewImports(owner, { dryRun: false })).toMatchObject({
      candidates: 1,
      changed: 1,
    });
    expect(await db.getActivity(owner, Number(own.lastInsertRowid))).toMatchObject({
      status: "confirmed",
      splits: [],
    });
    expect(await db.repairHistoricalReviewImports(owner, { dryRun: false })).toMatchObject({
      candidates: 0,
      changed: 0,
    });
    expect(await db.countPending(otherOwner)).toBe(1);
  });
});
