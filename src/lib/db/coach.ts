import { exec, many } from "./helpers";
import { getMeta, setMeta } from "./meta";

export interface ActivityChatRow {
  id: number;
  activity_id: number;
  role: string;
  content: string;
  created_at: string;
}

export async function listActivityChat(activityId: number): Promise<ActivityChatRow[]> {
  return many<ActivityChatRow>(
    `SELECT id, activity_id, role, content, created_at
     FROM activity_chat WHERE activity_id = ? ORDER BY id ASC`,
    [activityId]
  );
}

export async function addActivityChatMessage(
  activityId: number,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  await exec("INSERT INTO activity_chat (activity_id, role, content) VALUES (?, ?, ?)", [
    activityId,
    role,
    content,
  ]);
}

export async function clearActivityChat(activityId: number): Promise<void> {
  await exec("DELETE FROM activity_chat WHERE activity_id = ?", [activityId]);
}

export interface WeeklyDigest {
  generatedAt: string;
  text: string;
}

const WEEKLY_DIGEST_KEY = "weekly_digest";

export async function getWeeklyDigest(): Promise<WeeklyDigest | null> {
  const raw = await getMeta(WEEKLY_DIGEST_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<WeeklyDigest>;
    if (typeof parsed.text === "string" && typeof parsed.generatedAt === "string") {
      return { generatedAt: parsed.generatedAt, text: parsed.text };
    }
    return null;
  } catch {
    return null;
  }
}

export async function setWeeklyDigest(text: string): Promise<WeeklyDigest> {
  const value: WeeklyDigest = { generatedAt: new Date().toISOString(), text };
  await setMeta(WEEKLY_DIGEST_KEY, JSON.stringify(value));
  return value;
}

/** Minimal fields for the weekly digest context, confirmed activities only. */
export interface DigestActivity {
  name: string | null;
  sport_type: string | null;
  started_at: string | null;
  started_at_local: string | null;
  distance_km: number | null;
  moving_time_s: number | null;
  avg_hr: number | null;
  avg_pace_s_per_km: number | null;
}

export async function listActivitiesSince(iso: string): Promise<DigestActivity[]> {
  return many<DigestActivity>(
    `SELECT name, sport_type, started_at, started_at_local, distance_km, moving_time_s, avg_hr, avg_pace_s_per_km
     FROM activities
     WHERE status = 'confirmed' AND started_at IS NOT NULL AND started_at >= ?
     ORDER BY started_at ASC`,
    [iso]
  );
}
