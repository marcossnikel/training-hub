import { exec, many } from "./helpers";
import type { Goal, GoalInput } from "../types";
import type { OwnerContext } from "../owner-context";

// Athlete goals (races/targets). Small CRUD through the plain-object seam;
// primary goals first, then soonest race date.
export async function listGoals(owner: OwnerContext): Promise<Goal[]> {
  return many<Goal>(
    `SELECT id, name, race_date, distance_km, goal_time_s, notes, priority, created_at
     FROM athlete_goals WHERE user_id = ?
     ORDER BY priority DESC, (race_date IS NULL) ASC, race_date ASC, id DESC`,
    [owner.userId]
  );
}

export async function createGoal(owner: OwnerContext, input: GoalInput): Promise<void> {
  await exec(
    `INSERT INTO athlete_goals (user_id, name, race_date, distance_km, goal_time_s, notes, priority)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      owner.userId,
      input.name,
      input.race_date,
      input.distance_km,
      input.goal_time_s,
      input.notes,
      input.priority,
    ]
  );
}

export async function deleteGoal(owner: OwnerContext, id: number): Promise<void> {
  await exec("DELETE FROM athlete_goals WHERE id = ? AND user_id = ?", [id, owner.userId]);
}
