import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const dbFile = path.join(
  os.tmpdir(),
  `training-hub-import-progress-${process.pid}-${Date.now()}.db`
);
const owner = { userId: "import-progress-owner" };
const otherOwner = { userId: "import-progress-other" };
let db: typeof import("../../lib/db");
let strava: typeof import("./server/sync");
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
      client_secret: "client-secret-canary",
      access_token: "access-token-canary",
      refresh_token: "refresh-token-canary",
      expires_at: 4_000_000_000,
    }
  );
}

beforeAll(async () => {
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.STRAVA_CONNECTION_ENCRYPTION_KEY = Buffer.alloc(32, 71).toString("base64url");
  db = await import("../../lib/db");
  strava = await import("./server/sync");
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

describe("persisted initial Strava import progress", () => {
  it("leases one page, resumes after failure, preserves unique outcomes, and exposes only committed owner facts", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      name: `payload-name-${index + 1}-canary`,
      sport_type: index % 2 === 0 ? "Run" : "Ride",
      start_date: "2024-01-01T12:00:00Z",
      distance: 5_000,
      moving_time: 1_500,
    }));
    let pageTwoFails = true;
    global.fetch = vi.fn(async (url: string) => {
      const page = new URL(url).searchParams.get("page");
      if (page === "1") return response(firstPage);
      if (page === "2" && pageTwoFails) {
        pageTwoFails = false;
        throw new Error("provider response body refresh-token-canary");
      }
      if (page === "2")
        return response([
          {
            id: 101,
            name: "later-payload-name-canary",
            sport_type: "Run",
            start_date: "2027-01-01T12:00:00Z",
            distance: 5_000,
            moving_time: 1_500,
          },
        ]);
      return response([]);
    }) as typeof fetch;

    // Two tabs race before the first page. Exactly one gets the persisted lease.
    const [one, two] = await Promise.all([
      strava.advanceInitialStravaImport(owner),
      strava.advanceInitialStravaImport(owner),
    ]);
    expect([one.advanced, two.advanced].filter(Boolean)).toHaveLength(1);
    let status = await db.getInitialStravaImportStatus(owner);
    expect(status).toMatchObject({
      job: { status: "partial", stage: "fetching_activities", nextPage: 2 },
      counters: { historical_confirmed_created: 100, new_pending_created: 0 },
      outcomeSportMix: { run: 50, ride: 50 },
      pagesCommitted: 1,
      percent: null,
      snapshot: { confirmed: 100, pending: 0, sportMix: { run: 50, ride: 50 } },
    });

    await strava.advanceInitialStravaImport(owner);
    status = await db.getInitialStravaImportStatus(owner);
    expect(status?.job).toMatchObject({
      status: "failed",
      nextPage: 2,
      errorCategory: "unexpected",
    });
    expect(status?.counters.historical_confirmed_created).toBe(100);

    await strava.advanceInitialStravaImport(owner);
    status = await db.getInitialStravaImportStatus(owner);
    expect(status).toMatchObject({
      job: { status: "completed", stage: "completed", retryCount: 1 },
      counters: { historical_confirmed_created: 100, new_pending_created: 1 },
      pagesCommitted: 2,
      snapshot: {
        confirmed: 100,
        pending: 1,
        coverage: { oldest: "2024-01-01T12:00:00Z", newest: "2027-01-01T12:00:00Z" },
      },
    });
    expect(JSON.stringify(status)).not.toContain("canary");
    expect(JSON.stringify(status)).not.toContain("payload-name");
    expect(await db.getStravaSyncState(owner)).toMatchObject({
      initialSyncCompletedAt: expect.any(String),
    });

    // A foreign owner cannot observe or lease this lifecycle.
    expect(await db.getInitialStravaImportStatus(otherOwner)).toBeNull();
    expect(await db.leaseInitialStravaImportJob(otherOwner, status!.job.id)).toBeNull();
  });

  it("records each stable provider identity only once when a committed page is replayed", async () => {
    const job = await db.getInitialStravaImportJob(owner);
    await db.client.execute({
      sql: "UPDATE strava_import_jobs SET status = 'partial', completed_at = NULL, lease_expires_at = NULL WHERE id = ?",
      args: [job!.id],
    });
    const leased = await db.leaseInitialStravaImportJob(owner, job!.id);
    expect(leased).not.toBeNull();
    expect(
      await db.recordInitialStravaImportOutcome(
        owner,
        job!.id,
        leased!.leaseToken,
        1,
        "already_present",
        "run"
      )
    ).toBe(false);
    expect((await db.getInitialStravaImportStatus(owner))?.counters).toMatchObject({
      historical_confirmed_created: 100,
      already_present: 0,
    });
  });
});
