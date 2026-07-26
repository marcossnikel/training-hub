import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeLoad, type LoadActivity } from "@/lib/fitness";

// Migration 14 (`activity_load.variant`) and the manual-override guard that
// protects a hand-entered TSS from every bulk recompute. Drives the REAL
// migrations + upsert SQL against an ISOLATED local sqlite file (never Turso),
// the same pattern as db.local-start.test.ts: DATABASE_URL is set BEFORE the
// dynamic import (the client singleton is built from env at import time) and
// TURSO_* is cleared first because makeClient() prefers it.
//
// The guard is SQL, not JavaScript — `ON CONFLICT ... WHERE source != 'manual'`
// — so the only way to know it holds is to run it.

const dbFile = path.join(os.tmpdir(), `training-hub-load-variant-${process.pid}-${Date.now()}.db`);

let db: typeof import("./db");

/** The stored columns of the swim rows below, with no stream attached. */
const FLAT: LoadActivity = {
  sport_type: "Swim",
  moving_time_s: null,
  distance_km: null,
  avg_hr: null,
  avg_pace_s_per_km: null,
  rpe: null,
  raw_json: null,
};

/**
 * An hour-long trace that averages the activities' stored 150 bpm but spends
 * half of it at threshold, so its stream reading is strictly above its average
 * reading and the two are trivially told apart.
 */
async function cacheIntervalStream(id: number): Promise<void> {
  const timeS = Array.from({ length: 121 }, (_, i) => i * 30);
  await db.saveActivityStreams(
    id,
    JSON.stringify({
      n: timeS.length,
      timeS,
      distanceKm: timeS.map(() => null),
      heartrate: timeS.map((_, i) => (Math.floor(i / 10) % 2 === 0 ? 176 : 124)),
      paceSPerKm: null,
      watts: null,
      cadence: null,
      altitudeM: null,
      gradePct: null,
    })
  );
}

/** The two readings of one of these activities, as computeLoad produces them. */
async function readings(): Promise<{ avg: number; stream: number }> {
  const thresholds = await db.getAthleteThresholds();
  const base = { ...FLAT, moving_time_s: 3600, avg_hr: 150 };
  const timeS = Array.from({ length: 121 }, (_, i) => i * 30);
  const hr = timeS.map((_, i) => (Math.floor(i / 10) % 2 === 0 ? 176 : 124));
  const avg = computeLoad(base, thresholds);
  const stream = computeLoad({ ...base, hrStream: { hr, timeS } }, thresholds);
  return { avg: avg?.tss ?? 0, stream: stream?.tss ?? 0 };
}

async function insertActivity(name: string): Promise<number> {
  const inserted = await db.client.execute({
    sql: `INSERT INTO activities (name, sport_type, started_at, moving_time_s, avg_hr, status)
          VALUES (?, 'Swim', '2026-07-20T12:00:00Z', 3600, 150, 'confirmed')`,
    args: [name],
  });
  return Number(inserted.lastInsertRowid);
}

beforeAll(async () => {
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  process.env.DATABASE_URL = `file:${dbFile}`;
  db = await import("./db");
  await db.ensureMigrated();
});

afterAll(() => {
  db.client.close();
  for (const suffix of ["", "-shm", "-wal", "-journal"]) {
    fs.rmSync(`${dbFile}${suffix}`, { force: true });
  }
});

describe("migration 14: activity_load.variant", () => {
  it("adds the nullable column and records version 14", async () => {
    const info = await db.client.execute("SELECT name FROM pragma_table_info('activity_load')");
    const columns = new Set(info.rows.map((row) => String(row.name)));
    expect(columns.has("variant")).toBe(true);

    const version = await db.client.execute("SELECT version FROM schema_version WHERE id = 1");
    expect(Number(version.rows[0].version)).toBeGreaterThanOrEqual(14);
  });

  it("round-trips the variant through the auto upsert", async () => {
    const id = await insertActivity("stream-measured");
    await db.upsertActivityLoads([
      { activityId: id, tss: 68.2, method: "hr", intensityFactor: 0.826, variant: "stream" },
    ]);
    expect(await db.getActivityLoad(id)).toMatchObject({
      tss: 68.2,
      method: "hr",
      variant: "stream",
      source: "auto",
    });
  });

  it("leaves the variant null for a method that has only one reading", async () => {
    const id = await insertActivity("paced");
    await db.upsertActivityLoads([
      { activityId: id, tss: 100, method: "pace", intensityFactor: 1, variant: null },
    ]);
    expect((await db.getActivityLoad(id))?.variant).toBeNull();
  });
});

describe("manual overrides survive a bulk recompute", () => {
  it("does not rewrite a hand-entered TSS, its source or its variant", async () => {
    const id = await insertActivity("hand-edited");
    // The row starts as a computed stream load, then the athlete types over it.
    await db.upsertActivityLoads([
      { activityId: id, tss: 68.2, method: "hr", intensityFactor: 0.826, variant: "stream" },
    ]);
    await db.setActivityLoadManual(id, 42);
    // A manual override was measured from nothing, so the variant is cleared.
    expect(await db.getActivityLoad(id)).toMatchObject({
      tss: 42,
      source: "manual",
      variant: null,
    });

    // What every bulk path (including the explicit recompute action) writes.
    await db.upsertActivityLoads([
      { activityId: id, tss: 95.5, method: "hr", intensityFactor: 1.1, variant: "stream" },
    ]);

    expect(await db.getActivityLoad(id)).toMatchObject({
      tss: 42,
      source: "manual",
      variant: null,
    });
  });

  it("still overrides a manual row on an explicit single-activity recompute", async () => {
    const id = await insertActivity("reset-me");
    await db.setActivityLoadManual(id, 42);
    await db.recomputeActivityLoad(id);
    const load = await db.getActivityLoad(id);
    expect(load?.source).toBe("auto");
    expect(load?.method).toBe("hr");
    // No stream is cached for this activity, so the average-HR reading stands.
    expect(load?.variant).toBe("avg");
    expect(load?.tss).not.toBe(42);
  });

  it("adopts the stream reading for a single activity that has one cached", async () => {
    const id = await insertActivity("streamed");
    await cacheIntervalStream(id);
    await db.recomputeActivityLoad(id);
    const load = await db.getActivityLoad(id);
    expect(load?.variant).toBe("stream");
    // Strictly above the flat reading of the same session (Jensen's inequality:
    // TSS squares the intensity, so the spread cannot lower it).
    const flat = computeLoad(
      { ...FLAT, moving_time_s: 3600, avg_hr: 150 },
      await db.getAthleteThresholds()
    );
    expect(flat?.variant).toBe("avg");
    expect(load?.tss).toBeGreaterThan(flat?.tss ?? Infinity);
  });
});

// The one safety property this whole feature rests on: the routine bulk
// recompute (a sync, a threshold save — all of them inside a fire-and-forget
// `after()`) refreshes the numbers without ever switching an activity between
// the two hrTSS readings. Adopting the stream across history is the explicit
// two-click action's job and nothing else's, and reverting what that action
// adopted would silently undo it. Both directions have to be pinned, because
// each is a one-word edit away.
describe("recomputeAllLoads keeps each row's existing measurement", () => {
  it("does not adopt the stream for a row stored as an average", async () => {
    const id = await insertActivity("keep-avg");
    await cacheIntervalStream(id);
    const { avg, stream } = await readings();
    await db.upsertActivityLoads([
      { activityId: id, tss: avg, method: "hr", intensityFactor: 0.794, variant: "avg" },
    ]);

    await db.recomputeAllLoads();

    const load = await db.getActivityLoad(id);
    expect(load?.variant).toBe("avg");
    expect(load?.tss).toBeCloseTo(avg, 1);
    expect(load?.tss).not.toBeCloseTo(stream, 1);
  });

  it("does not revert a row already stored as a stream reading", async () => {
    const id = await insertActivity("keep-stream");
    await cacheIntervalStream(id);
    const { avg, stream } = await readings();
    await db.upsertActivityLoads([
      { activityId: id, tss: stream, method: "hr", intensityFactor: 0.82, variant: "stream" },
    ]);

    await db.recomputeAllLoads();

    const load = await db.getActivityLoad(id);
    expect(load?.variant).toBe("stream");
    expect(load?.tss).toBeCloseTo(stream, 1);
    expect(load?.tss).not.toBeCloseTo(avg, 1);
  });
});

// The two-click contract of the explicit action. Runs against the isolated
// sqlite file above, never the shared database.
describe("the explicit recompute previews before it writes", () => {
  it("writes nothing on a preview", async () => {
    const id = await insertActivity("previewed");
    await cacheIntervalStream(id);
    const { avg, stream } = await readings();
    await db.upsertActivityLoads([
      { activityId: id, tss: avg, method: "hr", intensityFactor: 0.794, variant: "avg" },
    ]);

    const preview = await db.recomputeLoadsWithStreams({ write: false });

    expect(preview.applied).toBe(false);
    expect(preview.changed).toBeGreaterThan(0);
    expect(preview.streamCount).toBeGreaterThan(0);
    // The whole safety design: the first click reports and touches nothing.
    const load = await db.getActivityLoad(id);
    expect(load?.variant).toBe("avg");
    expect(load?.tss).toBeCloseTo(avg, 1);
    expect(load?.tss).not.toBeCloseTo(stream, 1);
  });

  it("refuses to apply a plan that no longer matches the preview", async () => {
    const id = await insertActivity("drifted");
    await cacheIntervalStream(id);
    const { avg } = await readings();
    await db.upsertActivityLoads([
      { activityId: id, tss: avg, method: "hr", intensityFactor: 0.794, variant: "avg" },
    ]);

    const preview = await db.recomputeLoadsWithStreams({ write: false });
    // What a stream cached (or an activity confirmed) between the two clicks
    // does to the plan the athlete read.
    const outcome = await db.recomputeLoadsWithStreams({
      write: true,
      expect: { changed: preview.changed + 1, ctlAfter: preview.ctlAfter },
    });

    expect(outcome.applied).toBe(false);
    expect(await db.getActivityLoad(id)).toMatchObject({ variant: "avg" });
  });

  it("applies the plan it previewed", async () => {
    const id = await insertActivity("applied");
    await cacheIntervalStream(id);
    const { stream } = await readings();

    const preview = await db.recomputeLoadsWithStreams({ write: false });
    const outcome = await db.recomputeLoadsWithStreams({
      write: true,
      expect: { changed: preview.changed, ctlAfter: preview.ctlAfter },
    });

    expect(outcome.applied).toBe(true);
    expect(outcome.changed).toBe(preview.changed);
    expect(outcome.ctlAfter).toBeCloseTo(preview.ctlAfter, 5);
    const load = await db.getActivityLoad(id);
    expect(load?.variant).toBe("stream");
    expect(load?.tss).toBeCloseTo(stream, 1);
  });
});
