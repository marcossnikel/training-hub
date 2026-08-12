import { batchWrite, clearGearFromOthers, exec, many, one } from "./helpers";
import type { InStatement } from "./client";
import type { ShoeWithMileage } from "../types";
import type { OwnerContext } from "../owner-context";

const SHOE_SELECT = `
SELECT s.*, s.initial_km + COALESCE((
  SELECT SUM(sp.km)
  FROM activity_splits sp
  JOIN activities a ON a.id = sp.activity_id
  WHERE sp.shoe_id = s.id AND a.status = 'confirmed'
), 0) AS current_km
FROM shoes s
`;

export async function listShoes(): Promise<ShoeWithMileage[]> {
  return many<ShoeWithMileage>(
    `${SHOE_SELECT} ORDER BY (s.retired_at IS NOT NULL), s.name COLLATE NOCASE`
  );
}

export async function getShoe(id: number): Promise<ShoeWithMileage | null> {
  return one<ShoeWithMileage>(`${SHOE_SELECT} WHERE s.id = ?`, [id]);
}

export interface ShoeFields {
  name: string;
  role: string | null;
  initial_km: number;
  retirement_km: number | null;
  strava_gear_id: string | null;
}

export async function createShoe(
  owner: OwnerContext,
  fields: ShoeFields,
  photoPath: string | null
): Promise<number> {
  const statements: InStatement[] = [];
  if (fields.strava_gear_id) {
    statements.push(clearGearFromOthers("shoes", fields.strava_gear_id));
  }
  statements.push({
    sql: `INSERT INTO shoes (user_id, name, role, initial_km, retirement_km, strava_gear_id, photo_path)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      owner.userId,
      fields.name,
      fields.role,
      fields.initial_km,
      fields.retirement_km,
      fields.strava_gear_id,
      photoPath,
    ],
  });
  const results = await batchWrite(statements);
  return Number(results[results.length - 1].lastInsertRowid);
}

export async function updateShoe(
  id: number,
  fields: ShoeFields,
  photoPath: string | null
): Promise<void> {
  const statements: InStatement[] = [];
  if (fields.strava_gear_id) {
    statements.push(clearGearFromOthers("shoes", fields.strava_gear_id, id));
  }
  statements.push({
    sql: `UPDATE shoes SET name = ?, role = ?, initial_km = ?, retirement_km = ?,
          strava_gear_id = ?, photo_path = COALESCE(?, photo_path) WHERE id = ?`,
    args: [
      fields.name,
      fields.role,
      fields.initial_km,
      fields.retirement_km,
      fields.strava_gear_id,
      photoPath,
      id,
    ],
  });
  await batchWrite(statements);
}

export async function setShoeRetired(id: number, retired: boolean): Promise<void> {
  await exec("UPDATE shoes SET retired_at = ? WHERE id = ?", [
    retired ? new Date().toISOString() : null,
    id,
  ]);
}

export async function setShoeGear(id: number, gearId: string | null): Promise<void> {
  const statements: InStatement[] = [];
  if (gearId) {
    statements.push(clearGearFromOthers("shoes", gearId, id));
  }
  statements.push({
    sql: "UPDATE shoes SET strava_gear_id = ? WHERE id = ?",
    args: [gearId, id],
  });
  await batchWrite(statements);
}

export async function findShoeIdByGear(gearId: string): Promise<number | null> {
  const row = await one<{ id: number }>("SELECT id FROM shoes WHERE strava_gear_id = ?", [gearId]);
  return row?.id ?? null;
}
