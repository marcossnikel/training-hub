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
  JOIN bikes owner_bike ON owner_bike.id = a.bike_id AND owner_bike.user_id = a.user_id
  WHERE a.status = 'confirmed' AND a.bike_id IS NOT NULL
  GROUP BY a.bike_id
) m ON m.bike_id = b.id
`;

export async function listBikes(owner: OwnerContext): Promise<BikeWithMileage[]> {
  return many<BikeWithMileage>(
    `${BIKE_SELECT} WHERE b.user_id = ? ORDER BY (b.retired_at IS NOT NULL), b.name COLLATE NOCASE`,
    [owner.userId]
  );
}

export async function getBike(owner: OwnerContext, id: number): Promise<BikeWithMileage | null> {
  return one<BikeWithMileage>(`${BIKE_SELECT} WHERE b.id = ? AND b.user_id = ?`, [
    id,
    owner.userId,
  ]);
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
    statements.push(clearGearFromOthers("bikes", owner.userId, fields.strava_gear_id));
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
  owner: OwnerContext,
  id: number,
  fields: BikeFields,
  photoPath: string | null
): Promise<void> {
  const statements: InStatement[] = [];
  if (fields.strava_gear_id) {
    statements.push(clearGearFromOthers("bikes", owner.userId, fields.strava_gear_id, id));
  }
  statements.push({
    sql: `UPDATE bikes SET name = ?, role = ?, initial_km = ?, strava_gear_id = ?,
          photo_path = COALESCE(?, photo_path) WHERE id = ? AND user_id = ?`,
    args: [
      fields.name,
      fields.role,
      fields.initial_km,
      fields.strava_gear_id,
      photoPath,
      id,
      owner.userId,
    ],
  });
  await batchWrite(statements);
}

export async function setBikeRetired(
  owner: OwnerContext,
  id: number,
  retired: boolean
): Promise<void> {
  await exec("UPDATE bikes SET retired_at = ? WHERE id = ? AND user_id = ?", [
    retired ? new Date().toISOString() : null,
    id,
    owner.userId,
  ]);
}

export async function setBikeGear(
  owner: OwnerContext,
  id: number,
  gearId: string | null
): Promise<void> {
  const statements: InStatement[] = [];
  if (gearId) {
    statements.push(clearGearFromOthers("bikes", owner.userId, gearId, id));
  }
  statements.push({
    sql: "UPDATE bikes SET strava_gear_id = ? WHERE id = ? AND user_id = ?",
    args: [gearId, id, owner.userId],
  });
  await batchWrite(statements);
}

export async function findBikeIdByGear(
  owner: OwnerContext,
  gearId: string
): Promise<number | null> {
  const row = await one<{ id: number }>(
    "SELECT id FROM bikes WHERE user_id = ? AND strava_gear_id = ?",
    [owner.userId, gearId]
  );
  return row?.id ?? null;
}

export async function setActivityBike(
  owner: OwnerContext,
  activityId: number,
  bikeId: number | null
): Promise<void> {
  await exec(
    `UPDATE activities SET bike_id = ? WHERE id = ? AND user_id = ?
       AND (? IS NULL OR EXISTS (SELECT 1 FROM bikes WHERE id = ? AND user_id = ?))`,
    [bikeId, activityId, owner.userId, bikeId, bikeId, owner.userId]
  );
}

export async function setActivityRace(
  owner: OwnerContext,
  activityId: number,
  isRace: boolean,
  goalPace: number | null
): Promise<void> {
  await exec(
    "UPDATE activities SET is_race = ?, goal_pace_s_per_km = ? WHERE id = ? AND user_id = ?",
    [isRace ? 1 : 0, isRace ? goalPace : null, activityId, owner.userId]
  );
}

/** Returns this owner's exact private photo key, never a caller-supplied key. */
export async function findOwnedGearPhoto(
  owner: OwnerContext,
  photoPath: string
): Promise<string | null> {
  const row = await one<{ photo_path: string }>(
    `SELECT photo_path FROM shoes WHERE user_id = ? AND photo_path = ?
     UNION ALL
     SELECT photo_path FROM bikes WHERE user_id = ? AND photo_path = ?
     LIMIT 1`,
    [owner.userId, photoPath, owner.userId, photoPath]
  );
  return row?.photo_path ?? null;
}
