import { batchWrite, clearGearFromOthers, exec, many, one } from "./helpers";
import type { InStatement } from "./client";
import type { BikeWithMileage } from "../types";
import type { OwnerContext } from "../owner-context";

// Each bike's confirmed-ride mileage aggregated ONCE (grouped by bike_id), then
// LEFT JOINed so every derived column is read from a single computed row instead
// of re-evaluating a correlated subquery per column. Bikes with no confirmed
// rides get no match, so COALESCE(..., 0) reproduces the old empty-aggregate zeros
// exactly (SUM over zero rows was NULL → 0; COUNT(*) was 0).
const BIKE_SELECT = `
SELECT b.*,
  b.initial_km + COALESCE(m.total, 0) AS current_km,
  COALESCE(m.indoor, 0) AS indoor_km,
  COALESCE(m.outdoor, 0) AS outdoor_km,
  COALESCE(m.rides, 0) AS ride_count
FROM bikes b
LEFT JOIN (
  SELECT a.bike_id AS bike_id,
    SUM(a.distance_km) AS total,
    SUM(CASE WHEN a.sport_type = 'VirtualRide' THEN a.distance_km ELSE 0 END) AS indoor,
    SUM(CASE WHEN a.sport_type != 'VirtualRide' THEN a.distance_km ELSE 0 END) AS outdoor,
    COUNT(*) AS rides
  FROM activities a
  WHERE a.status = 'confirmed' AND a.bike_id IS NOT NULL
  GROUP BY a.bike_id
) m ON m.bike_id = b.id
`;

export async function listBikes(): Promise<BikeWithMileage[]> {
  return many<BikeWithMileage>(
    `${BIKE_SELECT} ORDER BY (b.retired_at IS NOT NULL), b.name COLLATE NOCASE`
  );
}

export async function getBike(id: number): Promise<BikeWithMileage | null> {
  return one<BikeWithMileage>(`${BIKE_SELECT} WHERE b.id = ?`, [id]);
}

export interface BikeFields {
  name: string;
  role: string | null;
  initial_km: number;
  strava_gear_id: string | null;
}

export async function createBike(
  owner: OwnerContext,
  fields: BikeFields,
  photoPath: string | null
): Promise<number> {
  const statements: InStatement[] = [];
  if (fields.strava_gear_id) {
    statements.push(clearGearFromOthers("bikes", fields.strava_gear_id));
  }
  statements.push({
    sql: `INSERT INTO bikes (user_id, name, role, initial_km, strava_gear_id, photo_path)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      owner.userId,
      fields.name,
      fields.role,
      fields.initial_km,
      fields.strava_gear_id,
      photoPath,
    ],
  });
  const results = await batchWrite(statements);
  return Number(results[results.length - 1].lastInsertRowid);
}

export async function updateBike(
  id: number,
  fields: BikeFields,
  photoPath: string | null
): Promise<void> {
  const statements: InStatement[] = [];
  if (fields.strava_gear_id) {
    statements.push(clearGearFromOthers("bikes", fields.strava_gear_id, id));
  }
  statements.push({
    sql: `UPDATE bikes SET name = ?, role = ?, initial_km = ?, strava_gear_id = ?,
          photo_path = COALESCE(?, photo_path) WHERE id = ?`,
    args: [fields.name, fields.role, fields.initial_km, fields.strava_gear_id, photoPath, id],
  });
  await batchWrite(statements);
}

export async function setBikeRetired(id: number, retired: boolean): Promise<void> {
  await exec("UPDATE bikes SET retired_at = ? WHERE id = ?", [
    retired ? new Date().toISOString() : null,
    id,
  ]);
}

export async function setBikeGear(id: number, gearId: string | null): Promise<void> {
  const statements: InStatement[] = [];
  if (gearId) {
    statements.push(clearGearFromOthers("bikes", gearId, id));
  }
  statements.push({
    sql: "UPDATE bikes SET strava_gear_id = ? WHERE id = ?",
    args: [gearId, id],
  });
  await batchWrite(statements);
}

export async function findBikeIdByGear(gearId: string): Promise<number | null> {
  const row = await one<{ id: number }>("SELECT id FROM bikes WHERE strava_gear_id = ?", [gearId]);
  return row?.id ?? null;
}

export async function setActivityBike(activityId: number, bikeId: number | null): Promise<void> {
  await exec("UPDATE activities SET bike_id = ? WHERE id = ?", [bikeId, activityId]);
}

export async function setActivityRace(
  activityId: number,
  isRace: boolean,
  goalPace: number | null
): Promise<void> {
  await exec("UPDATE activities SET is_race = ?, goal_pace_s_per_km = ? WHERE id = ?", [
    isRace ? 1 : 0,
    isRace ? goalPace : null,
    activityId,
  ]);
}
