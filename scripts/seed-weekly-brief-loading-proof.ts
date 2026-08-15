/**
 * Local-only visual-proof fixture for #35. It adds a dense, valid set of
 * confirmed activity summaries to the disposable E2E database so the real
 * `/weekly-brief` projection and evaluator have enough work to stream the
 * existing route-level loading boundary. It never accepts a remote database.
 *
 * Usage:
 *   DATABASE_URL=file:data/e2e.db tsx scripts/seed-weekly-brief-loading-proof.ts
 */
import { createClient } from "@libsql/client";
import path from "node:path";

const OWNER = "legacy-local-owner";
const MARKER = '{"seed":true,"weeklyBriefLoadingProof":true}';
const ROWS_PER_WEEK = 1_000;

function databaseUrl(): string {
  const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || "file:data/app.db";
  if (!url.startsWith("file:")) {
    throw new Error("Refusing weekly-brief visual fixture outside a local file database.");
  }
  return url.startsWith("file:") && !url.startsWith("file:/")
    ? `file:${path.resolve(url.slice("file:".length))}`
    : url;
}

function localWallClock(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}Z`;
}

async function main() {
  const db = createClient({ url: databaseUrl(), intMode: "number" });
  try {
    await db.execute({
      sql: "DELETE FROM activities WHERE user_id = ? AND raw_json = ?",
      args: [OWNER, MARKER],
    });

    const currentMonday = new Date();
    currentMonday.setHours(12, 0, 0, 0);
    currentMonday.setDate(currentMonday.getDate() - ((currentMonday.getDay() + 6) % 7));
    const completedMonday = new Date(currentMonday);
    completedMonday.setDate(completedMonday.getDate() - 7);

    const statements = [];
    for (let week = -4; week <= 0; week += 1) {
      const day = new Date(completedMonday);
      day.setDate(day.getDate() + week * 7 + 1);
      for (let index = 0; index < ROWS_PER_WEEK; index += 1) {
        const started = new Date(day);
        started.setMinutes(index % 60, Math.floor(index / 60) % 60);
        statements.push({
          sql: `INSERT INTO activities
                (user_id, strava_id, name, sport_type, started_at, started_at_local, distance_km, moving_time_s, status, raw_json)
                VALUES (?, NULL, ?, 'Run', ?, ?, ?, ?, 'confirmed', ?)`,
          args: [
            OWNER,
            `Weekly brief loading proof ${week}-${index}`,
            started.toISOString(),
            localWallClock(started),
            1,
            week === 0 ? 60 : 30,
            MARKER,
          ],
        });
      }
    }
    await db.batch(statements, "write");
    console.log(
      `Seeded ${statements.length} dense weekly-brief proof activities in ${databaseUrl()}.`
    );
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
