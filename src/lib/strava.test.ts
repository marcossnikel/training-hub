import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { hrZones, zoneIndexOf, zoneSeconds } from "./fitness";

// T3.6 — Strava resilience (G7.2, G7.4). Node-env unit tests that drive the REAL
// strava.ts + db.ts against an ISOLATED temp sqlite file (never Turso) with a
// mocked global.fetch. The backoff sleep is stubbed so the 429 retry path is
// exercised with zero wall-clock delay. No real network call is ever made.
//
// db.ts builds its client singleton from env at import time, so DATABASE_URL is
// set (and TURSO_* cleared) before the dynamic import below.

const dbFile = path.join(os.tmpdir(), `training-hub-strava-${process.pid}-${Date.now()}.db`);

type StravaModule = typeof import("./strava");
type StravaTestApi = Pick<StravaModule, "backoff"> & {
  apiGet<T>(pathname: string, params?: Record<string, string>): Promise<T>;
  exchangeByoCode(
    credentials: { client_id: string; client_secret: string },
    code: string
  ): ReturnType<StravaModule["exchangeByoCode"]>;
  ensureActivityStreams(
    activity: Parameters<StravaModule["ensureActivityStreams"]>[1]
  ): ReturnType<StravaModule["ensureActivityStreams"]>;
  ensureActivityDetail(
    activity: Parameters<StravaModule["ensureActivityDetail"]>[1]
  ): ReturnType<StravaModule["ensureActivityDetail"]>;
};

let strava: StravaTestApi;
let db: typeof import("./db");
const TEST_OWNER = { userId: "strava-test-owner" };

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
  await db.saveStravaConnection(TEST_OWNER, {
    client_id: "athlete-test-client",
    client_secret: "athlete-test-secret",
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
  process.env.STRAVA_CONNECTION_ENCRYPTION_KEY = Buffer.alloc(32, 37).toString("base64url");
  db = await import("./db");
  const stravaModule = await import("./strava");
  strava = {
    backoff: stravaModule.backoff,
    apiGet: <T>(pathname: string, params?: Record<string, string>) =>
      stravaModule.apiGet<T>(TEST_OWNER, pathname, params),
    exchangeByoCode: (credentials, code) => stravaModule.exchangeByoCode(credentials, code),
    ensureActivityStreams: (activity) => stravaModule.ensureActivityStreams(TEST_OWNER, activity),
    ensureActivityDetail: (activity) => stravaModule.ensureActivityDetail(TEST_OWNER, activity),
  };
  await db.ensureMigrated();
  const now = new Date().toISOString();
  await db.client.execute({
    sql: 'INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
    args: ["strava-test-auth", "Strava test", "strava@example.test", 0, now, now],
  });
  await db.client.execute({
    sql: "INSERT INTO users (id, auth_subject) VALUES (?, ?)",
    args: [TEST_OWNER.userId, "strava-test-auth"],
  });
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

    await strava.exchangeByoCode(
      { client_id: "athlete-owned-client", client_secret: "athlete-owned-secret" },
      "auth-code"
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [tokenUrl, options] = fetchMock.mock.calls[0];
    expect(String(tokenUrl)).toContain("/oauth/token");
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    const body = new URLSearchParams(String(options?.body));
    expect(body.get("client_id")).toBe("athlete-owned-client");
    expect(body.get("client_secret")).toBe("athlete-owned-secret");
    expect(body.toString()).not.toContain("test-client");
  });

  it("refreshes only with the encrypted current owner's client credentials, never process globals", async () => {
    await db.saveStravaConnection(TEST_OWNER, {
      client_id: "owner-refresh-client",
      client_secret: "owner-refresh-secret",
      access_token: "expired-access",
      refresh_token: "owner-refresh-token",
      expires_at: 1,
    });
    process.env.STRAVA_CLIENT_ID = "founder-client-must-not-be-used";
    process.env.STRAVA_CLIENT_SECRET = "founder-secret-must-not-be-used";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "refreshed-owner-access",
          refresh_token: "refreshed-owner-token",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        })
      )
      .mockResolvedValueOnce(jsonResponse({ athlete: "owner only" }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await strava.apiGet("/athlete");

    const [, tokenOptions] = fetchMock.mock.calls[0];
    const tokenBody = new URLSearchParams(String(tokenOptions?.body));
    expect(tokenBody.get("client_id")).toBe("owner-refresh-client");
    expect(tokenBody.get("client_secret")).toBe("owner-refresh-secret");
    expect(tokenBody.toString()).not.toContain("founder-client-must-not-be-used");
    expect(tokenBody.toString()).not.toContain("founder-secret-must-not-be-used");
    expect(fetchMock.mock.calls[1][1]?.headers).toEqual({
      Authorization: "Bearer refreshed-owner-access",
    });
    expect(await db.getStravaConnection(TEST_OWNER)).toMatchObject({
      client_id: "owner-refresh-client",
      access_token: "refreshed-owner-access",
      refresh_token: "refreshed-owner-token",
    });
  });
});

describe("streamless activities cache a negative marker (G7.4)", () => {
  it("does not re-hit the API on a second view of a streamless activity", async () => {
    await connectWithFreshToken();
    const inserted = await db.client.execute({
      sql: `INSERT INTO activities (user_id, name, sport_type, started_at, distance_km, status, strava_id)
            VALUES (?, 'No streams', 'Run', '2026-01-01T12:00:00Z', 5, 'confirmed', 99999)`,
      args: [TEST_OWNER.userId],
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
      sql: `INSERT INTO activities (user_id, name, sport_type, started_at, distance_km, status, strava_id)
            VALUES (?, 'With streams', 'Run', '2026-01-02T12:00:00Z', 5, 'confirmed', 88888)`,
      args: [TEST_OWNER.userId],
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

  it("asks Strava for every channel the app reads, grade included", async () => {
    // The one request an activity ever gets. `ensureActivityStreams` returns the
    // cache before re-fetching, so a channel dropped from this list is dropped
    // FOREVER for every activity fetched meanwhile — `grade_smooth` in
    // particular would strand them all on the altitude fallback with no way back
    // short of deleting their cached streams.
    await connectWithFreshToken();
    const inserted = await db.client.execute({
      sql: `INSERT INTO activities (user_id, name, sport_type, started_at, distance_km, status, strava_id)
            VALUES (?, 'Key list', 'Run', '2026-01-03T12:00:00Z', 5, 'confirmed', 88801)`,
      args: [TEST_OWNER.userId],
    });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ time: { data: [0, 1, 2] } }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await strava.ensureActivityStreams({
      id: Number(inserted.lastInsertRowid),
      strava_id: 88801,
    });

    const url = fetchMock.mock.calls[0][0] as URL;
    expect(url.pathname).toBe("/api/v3/activities/88801/streams");
    expect(url.searchParams.get("key_by_type")).toBe("true");
    expect(url.searchParams.get("keys")?.split(",").sort()).toEqual([
      "altitude",
      "cadence",
      "distance",
      "grade_smooth",
      "heartrate",
      "time",
      "velocity_smooth",
      "watts",
    ]);
  });
});

describe("derived metrics are written from the fetched stream", () => {
  it("stores a full-resolution row on the fetch and nothing on a cached view", async () => {
    await connectWithFreshToken();
    const inserted = await db.client.execute({
      sql: `INSERT INTO activities (user_id, name, sport_type, started_at, distance_km, moving_time_s,
                                    avg_hr, status, strava_id)
            VALUES (?, 'Metrics run', 'Run', '2026-01-04T12:00:00Z', 10, 3000, 150, 'confirmed', 77777)`,
      args: [TEST_OWNER.userId],
    });
    const activityId = Number(inserted.lastInsertRowid);

    // An hour of running at 1 Hz — what full resolution actually looks like —
    // carrying one-second spikes to 190 bpm that ONLY full resolution can see.
    // The 400-point downsample keeps the samples at round(i/399 * 3599); every
    // spike below is placed on a second that grid never lands on, so a row
    // computed from the downsample reads zero seconds in the spike's zone while
    // the full-resolution row reads one second per spike. Without this, a
    // constant trace would integrate to the same 3599 seconds either way and the
    // test would prove nothing about the resolution it was computed from.
    const seconds = Array.from({ length: 3600 }, (_, i) => i);
    const sampledByDownsample = new Set(
      Array.from({ length: 400 }, (_, i) => Math.round((i / 399) * 3599))
    );
    const isSpike = (s: number) => s % 9 === 4 && !sampledByDownsample.has(s);
    const spikeCount = seconds.filter(isSpike).length;
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        time: { data: seconds },
        heartrate: { data: seconds.map((s) => (isSpike(s) ? 190 : 150)) },
        velocity_smooth: { data: seconds.map(() => 3.2) },
      })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const downsampled = await strava.ensureActivityStreams({ id: activityId, strava_id: 77777 });

    const zones = hrZones(await db.getAthleteThresholds(TEST_OWNER));
    const spikeZone = zoneIndexOf(190, zones);
    expect(spikeZone).toBeGreaterThan(zoneIndexOf(150, zones));
    expect(spikeCount).toBe(350);

    const stored = await db.getActivityMetrics(TEST_OWNER, activityId);
    // 2, not 3: this payload carries no altitude and no `grade_smooth`, so the
    // row is full resolution WITHOUT grade. The stamp reports what the payload
    // held, never what the request asked for — a future re-fetch reads the
    // ladder to decide what is worth upgrading, and a 3 here would hide this
    // activity from it forever.
    expect(stored?.metricsVersion).toBe(2);
    expect(stored?.avgGapSPerKm).toBeNull();
    // Integrated across the whole hour: every spike second is there.
    expect(stored?.hrZoneSecs?.reduce((sum, s) => sum + s, 0)).toBe(3599);
    expect(stored?.hrZoneSecs?.[spikeZone]).toBe(spikeCount);
    // The same integration over the cached 400-point stream misses all of them,
    // which is what makes the assertion above resolution-sensitive.
    const fromDownsample = zoneSeconds(downsampled!.timeS, downsampled!.heartrate!, zones);
    expect(fromDownsample?.reduce((sum, s) => sum + s, 0)).toBe(3599);
    expect(fromDownsample?.[spikeZone]).toBe(0);
    expect(stored?.paceZoneSecs).not.toBeNull();
    expect(stored?.ef).toBeCloseTo(200 / 150, 6);

    // A second view reads the cache: no fetch, and no write of any kind.
    const executeSpy = vi.spyOn(db.client, "execute");
    await strava.ensureActivityStreams({ id: activityId, strava_id: 77777 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const statements: (string | { sql: string })[] = executeSpy.mock.calls.map((call) => call[0]);
    for (const statement of statements) {
      const sql = typeof statement === "string" ? statement : statement.sql;
      expect(sql.trimStart().slice(0, 6).toUpperCase()).toBe("SELECT");
    }
    executeSpy.mockRestore();
  });

  it("stamps version 3 and stores a grade-adjusted pace when the payload carries grade", async () => {
    await connectWithFreshToken();
    const inserted = await db.client.execute({
      sql: `INSERT INTO activities (user_id, name, sport_type, started_at, distance_km, moving_time_s,
                                    avg_pace_s_per_km, avg_hr, status, strava_id)
            VALUES (?, 'Hill run', 'Run', '2026-01-06T12:00:00Z', 6, 1800, 300, 150, 'confirmed', 77701)`,
      args: [TEST_OWNER.userId],
    });
    const activityId = Number(inserted.lastInsertRowid);

    // Half an hour at 300 s/km up a steady 6% grade.
    const seconds = Array.from({ length: 1800 }, (_, i) => i);
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        time: { data: seconds },
        distance: { data: seconds.map((s) => (s * 1000) / 300) },
        heartrate: { data: seconds.map(() => 150) },
        velocity_smooth: { data: seconds.map(() => 1000 / 300) },
        grade_smooth: { data: seconds.map(() => 6) },
      })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    await strava.ensureActivityStreams({ id: activityId, strava_id: 77701 });

    const stored = await db.getActivityMetrics(TEST_OWNER, activityId);
    expect(stored?.metricsVersion).toBe(3);
    // Climbing, so the flat-ground equivalent is quicker than the stored pace,
    // and it is the STORED pace it scales.
    const gap = stored?.avgGapSPerKm;
    expect(gap).not.toBeNull();
    expect(gap!).toBeLessThan(300);
    // Minetti prices a 6% climb at 1.36863 flat metres per metre.
    expect(gap!).toBeCloseTo(300 / 1.36863, 2);
  });

  it("overwrites a seeded curve bucket with the value it measures", async () => {
    // The precedence between the table's two writers, at the call site that
    // decides it. `backfill-curve-points.ts` is insert-only so the two converge
    // whichever runs first; flipped to insert-only here, a seeded wall-clock
    // pace would silently outlive the stream measurement of the same bucket,
    // and nothing would ever correct it — this fetch is the only moment full
    // resolution exists.
    await connectWithFreshToken();
    const inserted = await db.client.execute({
      sql: `INSERT INTO activities (user_id, name, sport_type, started_at, distance_km, moving_time_s,
                                    avg_pace_s_per_km, status, strava_id)
            VALUES (?, 'Seeded run', 'Run', '2026-01-07T12:00:00Z', 0.8, 240, 300, 'confirmed', 77702)`,
      args: [TEST_OWNER.userId],
    });
    const activityId = Number(inserted.lastInsertRowid);
    await db.saveActivityCurvePoints(
      TEST_OWNER,
      activityId,
      [{ kind: "pace", bucket: "400m", value: 999 }],
      {
        overwrite: false,
      }
    );

    // 800 m at 300 s/km, 1 Hz: one reachable bucket, at a pace nothing else has.
    const seconds = Array.from({ length: 241 }, (_, i) => i);
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        time: { data: seconds },
        distance: { data: seconds.map((s) => (s * 1000) / 300) },
      })
    ) as unknown as typeof fetch;

    await strava.ensureActivityStreams({ id: activityId, strava_id: 77702 });

    const stored = await db.client.execute({
      sql: "SELECT bucket, value FROM activity_curve_points WHERE activity_id = ?",
      args: [activityId],
    });
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0].bucket).toBe("400m");
    expect(Number(stored.rows[0].value)).toBeCloseTo(300, 6);
  });

  it("caches the stream even when the metrics cannot be derived", async () => {
    await connectWithFreshToken();
    const inserted = await db.client.execute({
      sql: `INSERT INTO activities (user_id, name, sport_type, started_at, distance_km, status, strava_id)
            VALUES (?, 'Cadence only', 'Workout', '2026-01-05T12:00:00Z', 0, 'confirmed', 66666)`,
      args: [TEST_OWNER.userId],
    });
    const activityId = Number(inserted.lastInsertRowid);

    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ time: { data: [0, 1, 2] }, cadence: { data: [80, 81, 82] } })
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    const streams = await strava.ensureActivityStreams({ id: activityId, strava_id: 66666 });

    expect(streams?.cadence).toEqual([80, 81, 82]);
    // Nothing computable from a cadence trace, so no row is invented for it.
    expect(await db.getActivityMetrics(TEST_OWNER, activityId)).toBeNull();
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
      sql: `INSERT INTO activities (user_id, name, sport_type, started_at, distance_km, status, detail_json)
            VALUES (?, 'Cached detail', 'Run', '2026-01-03T12:00:00Z', 10, 'confirmed', ?)`,
      args: [TEST_OWNER.userId, detailJson],
    });
    const activityId = Number(inserted.lastInsertRowid);
    const activity = { id: activityId, strava_id: null, detail_json: detailJson };

    // A view is a read path: any write it issues goes through client.batch, so
    // counting batches counts write transactions.
    const batchSpy = vi.spyOn(db.client, "batch");

    await strava.ensureActivityDetail(activity);
    expect(batchSpy).toHaveBeenCalledTimes(1);
    expect(await db.listBestEffortCounts(TEST_OWNER, activityId)).toEqual([
      { activity_id: activityId, n: 2 },
    ]);

    await strava.ensureActivityDetail(activity);
    await strava.ensureActivityDetail(activity);

    // Still one write across three views: the stored rows were detected and left alone.
    expect(batchSpy).toHaveBeenCalledTimes(1);
    expect(await db.listBestEffortCounts(TEST_OWNER, activityId)).toEqual([
      { activity_id: activityId, n: 2 },
    ]);
  });
});
