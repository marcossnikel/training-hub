import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  consistencyHeatmap,
  heatmapFrom,
  minutesByDay,
  sessionCountsByDay,
} from "@/lib/consistency";
import { firstValueSummary } from "@/lib/performance-first-value";
import { performanceHref, performanceQueryState } from "@/lib/performance-query-state";
import { periodTotals, totalsFrom } from "@/lib/totals";

const dbFile = path.join(
  os.tmpdir(),
  `training-hub-performance-first-value-${process.pid}-${Date.now()}.db`
);
const owner = { userId: "performance-owner" };
const otherOwner = { userId: "performance-other-owner" };
let db: typeof import("@/lib/db");
let strava: typeof import("@/features/strava/server/sync");
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
  process.env.STRAVA_CONNECTION_ENCRYPTION_KEY = Buffer.alloc(32, 71).toString("base64url");
  db = await import("@/lib/db");
  strava = await import("@/features/strava/server/sync");
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

describe("summary-only performance first value", () => {
  it("imports confirmed local-day summaries, exposes partial coverage, and excludes pending rows", async () => {
    const history = Array.from({ length: 100 }, (_, index) => ({
      id: 70_000 + index,
      name: `History ${index}`,
      sport_type: index === 1 ? "Ride" : index === 2 ? "WeightTraining" : "Run",
      start_date:
        index === 0
          ? "2026-07-27T00:30:00Z"
          : `2026-07-${String((index % 20) + 1).padStart(2, "0")}T12:00:00Z`,
      start_date_local:
        index === 0
          ? "2026-07-26T21:30:00Z"
          : `2026-07-${String((index % 20) + 1).padStart(2, "0")}T09:00:00Z`,
      distance: index === 2 ? 0 : 5_000,
      moving_time: index === 2 ? 3_600 : 1_500,
      total_elevation_gain: 40,
    }));
    global.fetch = vi.fn(async (url: string) => {
      const pathname = new URL(url).pathname;
      if (pathname.endsWith("/athlete")) return response({ shoes: [], bikes: [] });
      const page = new URL(url).searchParams.get("page");
      return response(page === "1" ? history : []);
    }) as typeof fetch;

    await strava.syncStravaActivities(owner);
    const partial = await db.getInitialStravaImportStatus(owner);
    expect(partial).toMatchObject({
      job: { status: "partial" },
      snapshot: { confirmed: 100, pending: 0 },
    });
    expect(partial?.snapshot.coverage).toEqual({
      oldest: "2026-07-01T12:00:00Z",
      newest: "2026-07-27T00:30:00Z",
    });

    await strava.syncStravaActivities(owner);
    const from = heatmapFrom(new Date("2026-07-27T12:00:00Z"));
    const [totalsRows, sessions] = await Promise.all([
      db.listTotalsActivities(owner, totalsFrom("weeks", 12, new Date("2026-07-27T12:00:00Z"))),
      db.listSessionStarts(owner, from),
    ]);
    const daily = minutesByDay(totalsRows, from, new Date("2026-07-27T12:00:00Z"));
    const heatmap = consistencyHeatmap(
      daily,
      sessionCountsByDay(sessions),
      new Date("2026-07-27T12:00:00Z")
    );
    expect(heatmap.cells.find((cell) => cell.date === "2026-07-26")).toMatchObject({
      minutes: 25,
      sessions: 1,
    });
    expect(
      periodTotals(totalsRows, "weeks", 12, new Date("2026-07-27T12:00:00Z"))[1].values.sessions
    ).toBeGreaterThan(0);

    const summary = firstValueSummary(totalsRows);
    expect(summary).toMatchObject({
      fromDay: "2026-07-01",
      throughDay: "2026-07-26",
      calendarLabelEligible: false,
      activityCount: 100,
    });
    expect(firstValueSummary(totalsRows, "America/Sao_Paulo").calendarLabelEligible).toBe(true);
    expect(await db.listConfirmedActivities(otherOwner)).toHaveLength(0);

    const pending = await db.client.execute({
      sql: "INSERT INTO activities (user_id, strava_id, name, started_at, started_at_local, moving_time_s, distance_km, status, raw_json) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_review', '{}')",
      args: [
        owner.userId,
        80_000,
        "Pending",
        "2026-07-27T01:00:00Z",
        "2026-07-26T22:00:00Z",
        1_800,
        5,
      ],
    });
    const afterPending = await db.listSessionStarts(owner, from);
    expect(sessionCountsByDay(afterPending).get("2026-07-26")).toBe(1);
    await db.confirmActivity(
      owner,
      Number(pending.lastInsertRowid),
      { rpe: null, feeling: null, workout_notes: null, health_notes: null },
      [],
      null
    );
    const afterConfirmation = await db.listSessionStarts(owner, from);
    expect(sessionCountsByDay(afterConfirmation).get("2026-07-26")).toBe(2);
  });

  it("maps controls without resetting the other selection", () => {
    expect(performanceQueryState({ period: "months", window: "1y" })).toEqual({
      period: "months",
      window: "1y",
    });
    expect(performanceHref({ period: "months", window: "1y" })).toBe(
      "/performance?period=months&window=1y"
    );
  });
});
