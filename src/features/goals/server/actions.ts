"use server";

import { fail, type ActionResult } from "@/lib/action-result";
import { dict, refreshAll } from "@/lib/action-helpers";
import { requireCurrentUser } from "@/lib/auth";
import { createGoal, deleteGoal } from "@/lib/db";
import { parseFiniteNumber, parseId } from "@/lib/validate";

function parseDurationToSeconds(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  const parts = s.split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts.length === 1 ? parts[0] : null;
}

export async function createGoalAction(input: {
  name: string;
  raceDate: string;
  distanceKm: string;
  goalTime: string;
  notes: string;
  primary: boolean;
}): Promise<ActionResult> {
  const t = await dict();
  const owner = await requireCurrentUser();
  if (!owner) return { ok: false, error: t.errors.unauthorized };
  const name = input.name.trim();
  if (!name) return { ok: false, error: t.errors.goalNeedsName };
  try {
    const distance = input.distanceKm.trim() ? parseFiniteNumber(input.distanceKm) : null;
    if (input.distanceKm.trim() && distance === null)
      return { ok: false, error: t.errors.invalidGoal };
    const raceDate = /^\\d{4}-\\d{2}-\\d{2}$/.test(input.raceDate.trim())
      ? input.raceDate.trim()
      : null;
    await createGoal(owner, {
      name,
      race_date: raceDate,
      distance_km: distance,
      goal_time_s: parseDurationToSeconds(input.goalTime),
      notes: input.notes.trim() || null,
      priority: input.primary ? 1 : 0,
    });
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

export async function deleteGoalAction(id: number): Promise<ActionResult> {
  const t = await dict();
  const owner = await requireCurrentUser();
  if (!owner) return { ok: false, error: t.errors.unauthorized };
  const goalId = parseId(id);
  if (goalId === null) return { ok: false, error: t.errors.invalidId };
  try {
    await deleteGoal(owner, goalId);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}
