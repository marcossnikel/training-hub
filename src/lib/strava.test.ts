import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// T3.6 — Strava resilience (G7.2, G7.4). Node-env unit tests that drive the REAL
// strava.ts + db.ts against an ISOLATED temp sqlite file (never Turso) with a
// mocked global.fetch. The backoff sleep is stubbed so the 429 retry path is
// exercised with zero wall-clock delay. No real network call is ever made.
//
// db.ts builds its client singleton from env at import time, so DATABASE_URL is
// set (and TURSO_* cleared) before the dynamic import below.

const dbFile = path.join(os.tmpdir(), `training-hub-strava-${process.pid}-${Date.now()}.db`);

let strava: typeof import("./strava");
let db: typeof import("./db");

const realFetch = global.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function rateLimitResponse(retryAfter: string | null): Response {
  return {
    ok: false,
    status: 429,
    headers: {
      get: (name: string) => (name.toLowerCase() === "retry-after" ? retryAfter : null),
    },
    json: async () => ({}),
    text: async () => "",
  } as unknown as Response;
}

// A valid, far-from-expiry token so apiGet never triggers a refresh fetch — the
// only fetches a test sees are the ones it mocks for the endpoint under test.
async function connectWithFreshToken(): Promise<void> {
  await db.saveStravaAuth({
    access_token: "access-abc",
    refresh_token: "refresh-abc",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  });
}

beforeAll(async () => {
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.STRAVA_CLIENT_ID = "test-client";
  process.env.STRAVA_CLIENT_SECRET = "test-secret";
  db = await import("./db");
  strava = await import("./strava");
  await db.ensureMigrated();
});

afterAll(() => {
  db.client.close();
  global.fetch = realFetch;
  for (const suffix of ["", "-shm", "-wal", "-journal"]) {
    fs.rmSync(`${dbFile}${suffix}`, { force: true });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  global.fetch = realFetch;
});

describe("apiGet honors Retry-After on 429 and retries (G7.2)", () => {
  it("retries after a single 429 and returns the 200 body", async () => {
    await connectWithFreshToken();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(rateLimitResponse("2"))
      .mockResolvedValueOnce(jsonResponse({ hello: "world" }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const sleepSpy = vi.spyOn(strava.backoff, "sleep").mockResolvedValue(undefined);

    const result = await strava.apiGet<{ hello: string }>("/athlete");

    expect(result).toEqual({ hello: "world" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleepSpy).toHaveBeenCalledTimes(1);
    // Retry-After: 2 seconds -> a 2000 ms sleep, honored before the retry.
    expect(sleepSpy).toHaveBeenCalledWith(2000);
  });

  it("gives up after a bounded number of retries, with a capped default backoff", async () => {
    await connectWithFreshToken();
    // Always rate-limited, no Retry-After header -> default backoff each time.
    const fetchMock = vi.fn().mockResolvedValue(rateLimitResponse(null));
    global.fetch = fetchMock as unknown as typeof fetch;
    const sleepSpy = vi.spyOn(strava.backoff, "sleep").mockResolvedValue(undefined);

    await expect(strava.apiGet("/athlete")).rejects.toThrow(/rate limit/i);

    // Bounded: initial attempt + 2 retries = 3 fetches, 2 sleeps. Never unbounded.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleepSpy).toHaveBeenCalledTimes(2);
    for (const call of sleepSpy.mock.calls) {
      expect(call[0]).toBeGreaterThan(0);
      expect(call[0]).toBeLessThanOrEqual(30_000);
    }
  });
});

describe("token refresh fetch carries a timeout signal (G7.4)", () => {
  it("issues the token request with an AbortSignal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        access_token: "a",
        refresh_token: "r",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    await strava.exchangeCode("auth-code");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [tokenUrl, options] = fetchMock.mock.calls[0];
    expect(String(tokenUrl)).toContain("/oauth/token");
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("streamless activities cache a negative marker (G7.4)", () => {
  it("does not re-hit the API on a second view of a streamless activity", async () => {
    await connectWithFreshToken();
    const inserted = await db.client.execute({
      sql: `INSERT INTO activities (name, sport_type, started_at, distance_km, status, strava_id)
            VALUES ('No streams', 'Run', '2026-01-01T12:00:00Z', 5, 'confirmed', 99999)`,
      args: [],
    });
    const activityId = Number(inserted.lastInsertRowid);

    // Strava returns an empty payload -> normalizeStreams yields null (no usable stream).
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    global.fetch = fetchMock as unknown as typeof fetch;

    const first = await strava.ensureActivityStreams({ id: activityId, strava_id: 99999 });
    const second = await strava.ensureActivityStreams({ id: activityId, strava_id: 99999 });

    expect(first).toBeNull();
    expect(second).toBeNull();
    // Fetched exactly once across both calls: the empty result was cached.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still caches and returns non-empty streams unchanged", async () => {
    await connectWithFreshToken();
    const inserted = await db.client.execute({
      sql: `INSERT INTO activities (name, sport_type, started_at, distance_km, status, strava_id)
            VALUES ('With streams', 'Run', '2026-01-02T12:00:00Z', 5, 'confirmed', 88888)`,
      args: [],
    });
    const activityId = Number(inserted.lastInsertRowid);

    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ heartrate: { data: [120, 130, 140] }, time: { data: [0, 1, 2] } })
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    const first = await strava.ensureActivityStreams({ id: activityId, strava_id: 88888 });
    const second = await strava.ensureActivityStreams({ id: activityId, strava_id: 88888 });

    expect(first).not.toBeNull();
    expect(first?.heartrate).toBeTruthy();
    expect(second).toEqual(first);
    // Non-empty streams stay a fetch-once/cache-forever result.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("best efforts are mirrored once, not on every view", () => {
  it("writes on the first cached-path view and skips the write on the next one", async () => {
    const detailJson = JSON.stringify({
      best_efforts: [
        { name: "400m", distance: 400, moving_time: 105, elapsed_time: 106, pr_rank: null },
        { name: "1K", distance: 1000, moving_time: 291, elapsed_time: 293, pr_rank: 2 },
      ],
    });
    const inserted = await db.client.execute({
      sql: `INSERT INTO activities (name, sport_type, started_at, distance_km, status, detail_json)
            VALUES ('Cached detail', 'Run', '2026-01-03T12:00:00Z', 10, 'confirmed', ?)`,
      args: [detailJson],
    });
    const activityId = Number(inserted.lastInsertRowid);
    const activity = { id: activityId, strava_id: null, detail_json: detailJson };

    // A view is a read path: any write it issues goes through client.batch, so
    // counting batches counts write transactions.
    const batchSpy = vi.spyOn(db.client, "batch");

    await strava.ensureActivityDetail(activity);
    expect(batchSpy).toHaveBeenCalledTimes(1);
    expect(await db.listBestEffortCounts(activityId)).toEqual([{ activity_id: activityId, n: 2 }]);

    await strava.ensureActivityDetail(activity);
    await strava.ensureActivityDetail(activity);

    // Still one write across three views: the stored rows were detected and left alone.
    expect(batchSpy).toHaveBeenCalledTimes(1);
    expect(await db.listBestEffortCounts(activityId)).toEqual([{ activity_id: activityId, n: 2 }]);
  });
});
