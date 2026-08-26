import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseFile = path.join(
  os.tmpdir(),
  `training-hub-athlete-parameters-${process.pid}-${Date.now()}.db`
);
const OWNER = { userId: "athlete-owner" };
const OTHER_OWNER = { userId: "other-owner" };

let db: typeof import("./index");

async function createOwner(owner: typeof OWNER, authSubject: string): Promise<void> {
  const now = new Date().toISOString();
  await db.client.batch(
    [
      {
        sql: 'INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
        args: [authSubject, authSubject, `${authSubject}@example.test`, 0, now, now],
      },
      {
        sql: "INSERT INTO users (id, auth_subject) VALUES (?, ?)",
        args: [owner.userId, authSubject],
      },
    ],
    "write"
  );
}

beforeAll(async () => {
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  process.env.DATABASE_URL = `file:${databaseFile}`;
  db = await import("./index");
  await db.ensureMigrated();
  await createOwner(OWNER, "auth-athlete-owner");
  await createOwner(OTHER_OWNER, "auth-other-owner");
});

afterAll(() => {
  db.client.close();
  for (const suffix of ["", "-shm", "-wal", "-journal"])
    fs.rmSync(`${databaseFile}${suffix}`, { force: true });
});

describe("athlete parameter ownership and effective-value rules", () => {
  it("keeps an empty profile unknown", async () => {
    const profile = await db.getAthletePerformanceProfile(OWNER);
    expect(profile.parameters.lthr_bpm.value).toBeNull();
    expect(profile.parameters.lthr_bpm.suppressed).toBe(false);
    expect(profile.timezone.value).toBeNull();
  });

  it("requires explicit application, preserves overrides, and clears without fallback", async () => {
    const candidate = await db.recordParameterCandidate(OWNER, {
      key: "cycling_ftp_watts",
      value: 241,
      provenance: "provider",
      observedAt: "2026-08-01T00:00:00Z",
    });
    expect(candidate).toBeTruthy();
    if (!candidate) throw new Error("expected provider candidate");
    expect(
      (await db.getAthletePerformanceProfile(OWNER)).parameters.cycling_ftp_watts.value
    ).toBeNull();

    expect(await db.applyParameterCandidate(OWNER, candidate)).toBe(true);
    expect(
      (await db.getAthletePerformanceProfile(OWNER)).parameters.cycling_ftp_watts
    ).toMatchObject({
      value: 241,
      provenance: "athlete_entered",
    });

    await db.recordParameterCandidate(OWNER, {
      key: "cycling_ftp_watts",
      value: 260,
      provenance: "provider",
    });
    expect((await db.getAthletePerformanceProfile(OWNER)).parameters.cycling_ftp_watts.value).toBe(
      241
    );

    await db.clearAthleteParameter(OWNER, "cycling_ftp_watts");
    expect(
      (await db.getAthletePerformanceProfile(OWNER)).parameters.cycling_ftp_watts
    ).toMatchObject({
      value: null,
      suppressed: true,
    });
  });

  it("rejects cross-owner candidate application and uses athlete timezone before provider timezone", async () => {
    const otherCandidate = await db.recordParameterCandidate(OTHER_OWNER, {
      key: "lthr_bpm",
      value: 172,
      provenance: "provider",
    });
    expect(otherCandidate).toBeTruthy();
    if (!otherCandidate) throw new Error("expected other-owner candidate");
    expect(await db.applyParameterCandidate(OWNER, otherCandidate)).toBe(false);

    expect(await db.saveProviderTimezone(OWNER, "America/New_York")).toBe(true);
    expect(await db.saveAthleteTimezone(OWNER, "America/Sao_Paulo")).toBe(true);
    expect((await db.getAthletePerformanceProfile(OWNER)).timezone).toEqual({
      value: "America/Sao_Paulo",
      provenance: "athlete_entered",
    });
    await db.clearAthleteTimezone(OWNER);
    expect((await db.getAthletePerformanceProfile(OWNER)).timezone).toEqual({
      value: "America/New_York",
      provenance: "provider",
    });
    expect(await db.saveProviderTimezone(OWNER, "-03:00")).toBe(false);
  });
});
