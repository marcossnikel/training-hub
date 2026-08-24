import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { InsightReference } from "./insight-feedback";

const dbFile = path.join(
  os.tmpdir(),
  `training-hub-insight-feedback-${process.pid}-${Date.now()}.db`
);
const ownerA = { userId: "feedback-owner-a" };
const ownerB = { userId: "feedback-owner-b" };
const reference: InsightReference = {
  kind: "weekly_brief",
  key: "weekly:v1:training_time_change:2026-08-03:2026-07-06:1,2",
  version: "v1",
  evaluatedAt: "2026-08-10T00:00:00.000Z",
};
let db: typeof import("./db");

beforeAll(async () => {
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.TRAINING_HUB_ENV = "e2e";
  process.env.TRAINING_HUB_INSIGHT_FEEDBACK_ENABLED = "1";
  db = await import("./db");
  await db.ensureMigrated();
  await db.ensureInsightFeedbackSchema();
  const now = new Date().toISOString();
  await db.client.batch(
    [
      {
        sql: 'INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
        args: ["feedback-auth-a", "Feedback A", "feedback-a@example.test", 0, now, now],
      },
      {
        sql: 'INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
        args: ["feedback-auth-b", "Feedback B", "feedback-b@example.test", 0, now, now],
      },
      {
        sql: "INSERT INTO users (id, auth_subject) VALUES (?, ?)",
        args: [ownerA.userId, "feedback-auth-a"],
      },
      {
        sql: "INSERT INTO users (id, auth_subject) VALUES (?, ?)",
        args: [ownerB.userId, "feedback-auth-b"],
      },
    ],
    "write"
  );
});

afterAll(() => {
  db.client.close();
  for (const suffix of ["", "-shm", "-wal", "-journal"])
    fs.rmSync(`${dbFile}${suffix}`, { force: true });
});

describe("owner-scoped insight feedback persistence", () => {
  it("creates, updates, clears, and redacts feedback without crossing owners", async () => {
    await Promise.all([
      db.saveInsightFeedback(ownerA, {
        reference,
        usefulness: "useful",
        note: "Evidence was clear.",
      }),
      db.saveInsightFeedback(ownerA, { reference, usefulness: "not_useful" }),
    ]);
    expect(await db.getInsightFeedback(ownerA, reference)).toEqual({
      usefulness: "not_useful",
      note: "Evidence was clear.",
    });
    expect(await db.getInsightFeedback(ownerB, reference)).toBeNull();

    expect(
      await db.saveInsightFeedbackNote(ownerA, { reference, note: "Needed the date range." })
    ).toBe(true);
    expect(await db.saveInsightFeedbackNote(ownerB, { reference, note: "forged" })).toBe(false);
    const records = await db.listRedactedInsightFeedbackForProductAnalysis(ownerA);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ kind: "weekly_brief", usefulness: "not_useful" });
    expect(Object.keys(records[0])).not.toContain("userId");
    expect(JSON.stringify(records[0])).not.toContain(ownerA.userId);

    await db.removeInsightFeedback(ownerA, reference);
    expect(await db.getInsightFeedback(ownerA, reference)).toBeNull();
  });

  it("cascades feedback only when its owning account is deleted", async () => {
    await db.saveInsightFeedback(ownerA, { reference, usefulness: "useful" });
    await db.saveInsightFeedback(ownerB, { reference, usefulness: "not_useful" });
    await db.client.execute({ sql: "DELETE FROM users WHERE id = ?", args: [ownerA.userId] });
    expect(await db.listRedactedInsightFeedbackForProductAnalysis(ownerA)).toEqual([]);
    expect(await db.getInsightFeedback(ownerB, reference)).toEqual({
      usefulness: "not_useful",
      note: null,
    });
  });
});
