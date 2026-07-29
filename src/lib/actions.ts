"use server";

import { after } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NONE } from "./constants";
import { splitErrorText, isLang } from "./i18n";
import { LANG_COOKIE } from "./lang";
import { storePhoto, deletePhoto, sniffImageType, InvalidImageError } from "./storage";
import {
  addActivityChatMessage,
  clearActivityChat,
  clearStravaAuth,
  createBike,
  createManualActivity,
  createShoe,
  getActivity,
  getAthleteThresholds,
  getBike,
  getShoe,
  listActivityChat,
  replaceActivitySplits,
  saveAthleteThresholds,
  setActivityBike,
  setActivityRace,
  setBikeGear,
  setBikeRetired,
  setShoeGear,
  setShoeRetired,
  updateActivityJournal,
  updateBike,
  updateShoe,
  confirmActivity,
  listGoals,
  createGoal,
  deleteGoal,
  getRunningFieldSignals,
  setTrainingZones,
  getTrainingZones,
  listRecentSessionsWithDetail,
  setActivityInsight,
  type BikeFields,
  type ShoeFields,
} from "./db";
import {
  buildActivityContext,
  buildInsightContext,
  buildZonesContext,
  deriveZones,
  isCoachConfigured,
  runActivityInsight,
  runCoachChat,
  summarizeStreams,
  type CoachImage,
  type CoachStreamSummary,
  type LapSummary,
  type RecentSessionSummary,
} from "./coach";
import { FTP_RANGE, THRESHOLD_PACE_RANGE } from "./fitness";
import {
  ensureActivityStreams,
  ensureActivityDetail,
  parseActivityDetail,
  stravaConfigured,
  isStravaConnected,
  syncActivities,
  type StravaActivityDetail,
  type SyncResult,
} from "./strava";
import { parseFiniteNumber, parseId, validateSplits } from "./validate";
import { fail, type ActionResult } from "./action-result";
import { logger } from "./telemetry";
import { authConfigured, createSession, destroySession, requireAuth, verifyPassword } from "./auth";
import { dict, inRange, normalizeJournal, normalizeSplits, refreshAll } from "./action-helpers";
import type { DerivedZones } from "./zones";
import type { ActivityWithSplits, Feeling, SplitInput } from "./types";

// ---------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------

export async function setLangAction(lang: string): Promise<void> {
  if (!isLang(lang)) return;
  (await cookies()).set(LANG_COOKIE, lang, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  refreshAll();
}

// ---------------------------------------------------------------------------
// Auth (T1.6) — single-owner password login. The mutating actions below each
// call requireAuth(); these two manage the session itself and so are NOT gated.
// ---------------------------------------------------------------------------

export async function loginAction(formData: FormData): Promise<ActionResult> {
  const t = await dict();
  const password = String(formData.get("password") ?? "");
  // Refuse to authenticate when auth is unconfigured (empty password/secret) —
  // there is no session to create against an empty secret.
  if (!authConfigured() || !verifyPassword(password)) {
    return { ok: false, error: t.login.invalid };
  }
  await createSession();
  // redirect() throws NEXT_REDIRECT, so it must sit outside any try/catch.
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

export type SyncActionResult = ({ ok: true } & SyncResult) | { ok: false; error: string };

export async function syncNowAction(): Promise<SyncActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  if (!stravaConfigured()) return { ok: false, error: t.errors.envMissing };
  if (!(await isStravaConnected())) return { ok: false, error: t.errors.notConnected };
  try {
    const result = await syncActivities();
    refreshAll();
    return { ok: true, ...result };
  } catch (error) {
    return fail(error, t.errors.syncFailed);
  }
}

// ---------------------------------------------------------------------------
// Review + journal
// ---------------------------------------------------------------------------

export async function confirmActivityAction(input: {
  activityId: number;
  splits: SplitInput[];
  bikeId: number | null;
  rpe: number | null;
  feeling: Feeling | null;
  workoutNotes: string;
  healthNotes: string;
}): Promise<ActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  try {
    const activity = await getActivity(input.activityId);
    if (!activity) return { ok: false, error: t.errors.activityNotFound };
    if (activity.status === "confirmed") return { ok: false, error: t.errors.alreadyConfirmed };

    const splits = normalizeSplits(input.splits);
    const splitError = validateSplits(activity, splits);
    if (splitError) return { ok: false, error: splitErrorText(splitError, t) };

    const journal = normalizeJournal(input, t);
    if ("error" in journal) return { ok: false, error: journal.error };

    const bikeId = input.bikeId != null && (await getBike(input.bikeId)) ? input.bikeId : null;

    await confirmActivity(input.activityId, journal, splits, bikeId);
    // Cache this ONE activity's heart-rate trace before its load is computed.
    // The review page never fetched one, so this is the only chance to cache it.
    // page never fetched one, so every confirm stored the average-HR reading and
    // nothing upgraded it afterwards: the bulk recompute keeps each row's
    // existing measurement by design, and the activity page only computes live
    // when there is no stored load at all. The cost is one Strava call for the
    // single activity being confirmed, and only ever once — `ensureActivityStreams`
    // returns the cache (or its negative marker) on every later view, so the
    // activity page's own fetch is now a cache hit instead of a second call.
    // Never fatal: a failed fetch just means the average reading, as before.
    try {
      await ensureActivityStreams(activity);
    } catch (error) {
      logger.error("confirmActivityAction.streams", { error, activityId: input.activityId });
    }
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

export async function updateJournalAction(input: {
  activityId: number;
  rpe: number | null;
  feeling: Feeling | null;
  workoutNotes: string;
  healthNotes: string;
}): Promise<ActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  try {
    const activity = await getActivity(input.activityId);
    if (!activity) return { ok: false, error: t.errors.activityNotFound };
    const journal = normalizeJournal(input, t);
    if ("error" in journal) return { ok: false, error: journal.error };
    await updateActivityJournal(input.activityId, journal);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

export async function updateSplitsAction(input: {
  activityId: number;
  splits: SplitInput[];
}): Promise<ActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  try {
    const activity = await getActivity(input.activityId);
    if (!activity) return { ok: false, error: t.errors.activityNotFound };
    const splits = normalizeSplits(input.splits);
    const splitError = validateSplits(activity, splits);
    if (splitError) return { ok: false, error: splitErrorText(splitError, t) };
    await replaceActivitySplits(input.activityId, splits);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

export async function setActivityBikeAction(
  activityId: number,
  bikeId: number | null
): Promise<ActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  try {
    const activity = await getActivity(activityId);
    if (!activity) return { ok: false, error: t.errors.activityNotFound };
    const resolved = bikeId != null && (await getBike(bikeId)) ? bikeId : null;
    await setActivityBike(activityId, resolved);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

export async function setActivityRaceAction(input: {
  activityId: number;
  isRace: boolean;
  goalPace: number | null;
}): Promise<ActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  try {
    const activity = await getActivity(input.activityId);
    if (!activity) return { ok: false, error: t.errors.activityNotFound };
    const goal =
      input.goalPace != null && Number.isFinite(input.goalPace) && input.goalPace > 0
        ? Math.round(input.goalPace)
        : null;
    await setActivityRace(input.activityId, input.isRace, goal);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

// ---------------------------------------------------------------------------
// Fitness (thresholds + per-activity load)
// ---------------------------------------------------------------------------

export interface ThresholdsInput {
  maxHr: number;
  restingHr: number;
  lthr: number;
  thresholdPaceSPerKm: number;
  ftpW: number;
  restingHrEstimated: boolean;
  ftpProvisional: boolean;
}

export async function saveThresholdsAction(input: ThresholdsInput): Promise<ActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  try {
    const maxHr = Math.round(input.maxHr);
    const restingHr = Math.round(input.restingHr);
    const lthr = Math.round(input.lthr);
    const thresholdPace = Math.round(input.thresholdPaceSPerKm);
    const ftpW = Math.round(input.ftpW);
    if (
      !inRange(maxHr, 120, 230) ||
      !inRange(restingHr, 25, 90) ||
      !inRange(lthr, 90, 220) ||
      !inRange(thresholdPace, THRESHOLD_PACE_RANGE.min, THRESHOLD_PACE_RANGE.max) ||
      !inRange(ftpW, FTP_RANGE.min, FTP_RANGE.max) ||
      restingHr >= lthr ||
      lthr > maxHr
    ) {
      return { ok: false, error: t.errors.invalidThresholds };
    }
    await saveAthleteThresholds({
      maxHr,
      restingHr,
      lthr,
      thresholdPaceSPerKm: thresholdPace,
      ftpW,
      restingHrEstimated: input.restingHrEstimated,
      ftpProvisional: input.ftpProvisional,
    });
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

/**
 * Applies ONLY the suggested threshold pace, leaving every other threshold as it
 * currently stands. It reads the stored thresholds server-side and writes them
 * back with just `thresholdPaceSPerKm` changed, so it never reverts unrelated
 * edits made after the Performance page loaded (unlike resubmitting a stale
 * page-load snapshot). Like the full save it re-validates the pace range and
 * defers the history recompute to after the response.
 */
export async function applyThresholdPaceAction(paceSPerKm: number): Promise<ActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  try {
    const thresholdPace = Math.round(paceSPerKm);
    if (!inRange(thresholdPace, THRESHOLD_PACE_RANGE.min, THRESHOLD_PACE_RANGE.max)) {
      return { ok: false, error: t.errors.invalidThresholds };
    }
    const current = await getAthleteThresholds();
    await saveAthleteThresholds({
      maxHr: current.maxHr,
      restingHr: current.restingHr,
      lthr: current.lthr,
      thresholdPaceSPerKm: thresholdPace,
      ftpW: current.ftpW,
      restingHrEstimated: current.restingHrEstimated,
      ftpProvisional: current.ftpProvisional,
    });
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

/**
 * Applies ONLY the eFTP estimate, the cycling twin of `applyThresholdPaceAction`
 * and built the same way: it re-reads the stored thresholds server-side and
 * writes them back with just the FTP changed, so it cannot revert an unrelated
 * edit made after the Performance page loaded.
 *
 * It also clears `ftpProvisional`. That flag means "a placeholder nobody
 * measured"; an FTP fitted to the athlete's own maximal efforts is measured, and
 * leaving the flag set would keep the coach prompt calling a real number
 * provisional forever.
 */
export async function applyFtpAction(ftpW: number): Promise<ActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  try {
    const ftp = Math.round(ftpW);
    if (!inRange(ftp, FTP_RANGE.min, FTP_RANGE.max)) {
      return { ok: false, error: t.errors.invalidThresholds };
    }
    const current = await getAthleteThresholds();
    await saveAthleteThresholds({
      maxHr: current.maxHr,
      restingHr: current.restingHr,
      lthr: current.lthr,
      thresholdPaceSPerKm: current.thresholdPaceSPerKm,
      ftpW: ftp,
      restingHrEstimated: current.restingHrEstimated,
      ftpProvisional: false,
    });
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

// ---------------------------------------------------------------------------
// Shoes
// ---------------------------------------------------------------------------

export async function saveShoeAction(formData: FormData): Promise<ActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  try {
    // An absent/blank id means "create"; a present-but-invalid id must NOT
    // silently fall through to create a stray row (G6.4).
    const idRaw = formData.get("id");
    let id: number | null = null;
    if (typeof idRaw === "string" && idRaw.trim() !== "") {
      id = parseId(idRaw);
      if (id === null) return { ok: false, error: t.errors.invalidId };
    }

    const name = String(formData.get("name") ?? "").trim();
    if (!name) return { ok: false, error: t.errors.shoeNeedsName };

    const role = String(formData.get("role") ?? "").trim() || null;
    const initialKm = Number(formData.get("initial_km") ?? 0);
    const retirementKm = Number(formData.get("retirement_km") ?? 700);
    if (!Number.isFinite(initialKm) || initialKm < 0) {
      return { ok: false, error: t.errors.invalidBaseline };
    }
    if (!Number.isFinite(retirementKm) || retirementKm <= 0) {
      return { ok: false, error: t.errors.invalidRetirement };
    }

    const gearRaw = String(formData.get("strava_gear_id") ?? NONE);
    const gearId = gearRaw && gearRaw !== NONE ? gearRaw : null;

    let photoPath: string | null = null;
    const photo = formData.get("photo");
    if (photo instanceof File && photo.size > 0) {
      photoPath = await storePhoto(photo);
    }

    const fields: ShoeFields = {
      name,
      role,
      initial_km: Math.round(initialKm * 10) / 10,
      retirement_km: Math.round(retirementKm),
      strava_gear_id: gearId,
    };

    if (id) {
      const existing = await getShoe(id);
      if (!existing) return { ok: false, error: t.errors.shoeNotFound };
      await updateShoe(id, fields, photoPath);
      // A replaced photo orphans the previous asset; clean it up after the
      // response so it never blocks or fails the save (best-effort, logs).
      if (photoPath && existing.photo_path && existing.photo_path !== photoPath) {
        const orphan = existing.photo_path;
        after(() => deletePhoto(orphan));
      }
    } else {
      await createShoe(fields, photoPath);
    }
    refreshAll();
    return { ok: true };
  } catch (error) {
    if (error instanceof InvalidImageError) return { ok: false, error: t.errors.invalidImage };
    return fail(error, t.errors.generic);
  }
}

export async function setShoeRetiredAction(id: number, retired: boolean): Promise<ActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  try {
    if (!(await getShoe(id))) return { ok: false, error: t.errors.shoeNotFound };
    await setShoeRetired(id, retired);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

export async function setShoeGearAction(
  shoeId: number,
  gearId: string | null
): Promise<ActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  try {
    if (!(await getShoe(shoeId))) return { ok: false, error: t.errors.shoeNotFound };
    await setShoeGear(shoeId, gearId);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

// ---------------------------------------------------------------------------
// Bikes
// ---------------------------------------------------------------------------

export async function saveBikeAction(formData: FormData): Promise<ActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  try {
    // An absent/blank id means "create"; a present-but-invalid id must NOT
    // silently fall through to create a stray row (G6.4).
    const idRaw = formData.get("id");
    let id: number | null = null;
    if (typeof idRaw === "string" && idRaw.trim() !== "") {
      id = parseId(idRaw);
      if (id === null) return { ok: false, error: t.errors.invalidId };
    }

    const name = String(formData.get("name") ?? "").trim();
    if (!name) return { ok: false, error: t.errors.bikeNeedsName };

    const role = String(formData.get("role") ?? "").trim() || null;
    const initialKm = Number(formData.get("initial_km") ?? 0);
    if (!Number.isFinite(initialKm) || initialKm < 0) {
      return { ok: false, error: t.errors.invalidBaseline };
    }

    const gearRaw = String(formData.get("strava_gear_id") ?? NONE);
    const gearId = gearRaw && gearRaw !== NONE ? gearRaw : null;

    let photoPath: string | null = null;
    const photo = formData.get("photo");
    if (photo instanceof File && photo.size > 0) {
      photoPath = await storePhoto(photo);
    }

    const fields: BikeFields = {
      name,
      role,
      initial_km: Math.round(initialKm * 10) / 10,
      strava_gear_id: gearId,
    };

    if (id) {
      const existing = await getBike(id);
      if (!existing) return { ok: false, error: t.errors.bikeNotFound };
      await updateBike(id, fields, photoPath);
      // A replaced photo orphans the previous asset; clean it up after the
      // response so it never blocks or fails the save (best-effort, logs).
      if (photoPath && existing.photo_path && existing.photo_path !== photoPath) {
        const orphan = existing.photo_path;
        after(() => deletePhoto(orphan));
      }
    } else {
      await createBike(fields, photoPath);
    }
    refreshAll();
    return { ok: true };
  } catch (error) {
    if (error instanceof InvalidImageError) return { ok: false, error: t.errors.invalidImage };
    return fail(error, t.errors.generic);
  }
}

export async function setBikeRetiredAction(id: number, retired: boolean): Promise<ActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  try {
    if (!(await getBike(id))) return { ok: false, error: t.errors.bikeNotFound };
    await setBikeRetired(id, retired);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

export async function setBikeGearAction(
  bikeId: number,
  gearId: string | null
): Promise<ActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  try {
    if (!(await getBike(bikeId))) return { ok: false, error: t.errors.bikeNotFound };
    await setBikeGear(bikeId, gearId);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function disconnectStravaAction(): Promise<ActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  try {
    await clearStravaAuth();
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

export async function createManualActivityAction(input: {
  date: string;
  km: number;
  shoeId: number;
}): Promise<ActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
      return { ok: false, error: t.errors.invalidDate };
    }
    const km = Math.round((Number(input.km) || 0) * 100) / 100;
    if (km === 0) return { ok: false, error: t.errors.zeroDistance };
    if (!(await getShoe(input.shoeId))) return { ok: false, error: t.errors.pickShoe };
    await createManualActivity({ date: input.date, km, shoe_id: input.shoeId });
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

// ---------------------------------------------------------------------------
// AI coach (Claude API)
// ---------------------------------------------------------------------------

export type CoachMessageResult = { ok: true; reply: string } | { ok: false; error: string };

// Max decoded size of an attached coach image (the client downscales first, so
// this is generous headroom, not the expected size).
const COACH_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Map Strava lap detail to the coach's compact lap summaries. `cap` guards
 * against a pathological auto-lap-every-100m file, but is high enough to keep
 * every rep of a real interval session (warmup + reps + recoveries + cooldown).
 */
function mapLaps(detail: StravaActivityDetail | null, cap = 60): LapSummary[] {
  const laps = detail?.laps ?? [];
  return laps.slice(0, cap).map((l) => ({
    km: l.distance != null ? l.distance / 1000 : null,
    timeS: l.moving_time ?? null,
    paceSPerKm: l.average_speed
      ? 1000 / l.average_speed
      : l.distance && l.moving_time
        ? l.moving_time / (l.distance / 1000)
        : null,
    avgHr: l.average_heartrate ?? null,
    maxHr: l.max_heartrate ?? null,
  }));
}

/**
 * Full coach context for one activity: its metrics + load + PMC + streams +
 * journal + goals + zones, PLUS this session's laps and the recent same-sport
 * sessions (with their laps) so the chat can compare across days and per-lap.
 * Shared by the chat and the insight so both see the same picture.
 */
async function assembleActivityContext(activity: ActivityWithSplits): Promise<string> {
  const thresholds = await getAthleteThresholds();

  // Streams are cached after the first view; only a cold activity fetches here.
  let streams: CoachStreamSummary | null = null;
  try {
    const raw = await ensureActivityStreams(activity);
    if (raw) streams = summarizeStreams(raw);
  } catch {
    streams = null;
  }

  const [goals, zones, recentRows] = await Promise.all([
    listGoals(),
    getTrainingZones(),
    listRecentSessionsWithDetail({
      excludeId: activity.id,
      sportType: activity.sport_type,
      before: activity.started_at,
      days: 21,
      limit: 4,
    }),
  ]);

  // Fetch each recent session's lap detail (cached after the first fetch), so
  // per-lap comparison works even for sessions never opened in the app.
  const recent: RecentSessionSummary[] = await Promise.all(
    recentRows.map(async (r) => {
      let detail: StravaActivityDetail | null = null;
      try {
        detail = await ensureActivityDetail({
          id: r.id,
          strava_id: r.strava_id,
          detail_json: r.detail_json,
        });
      } catch {
        detail = parseActivityDetail(r.detail_json);
      }
      return {
        date: r.started_at,
        name: r.name,
        distanceKm: r.distance_km,
        paceSPerKm: r.avg_pace_s_per_km,
        avgHr: r.avg_hr,
        maxHr: detail?.max_heartrate ?? null,
        laps: mapLaps(detail, 40),
      };
    })
  );

  return buildActivityContext({
    activity,
    thresholds,
    streams,
    journal: {
      rpe: activity.rpe,
      feeling: activity.feeling,
      workoutNotes: activity.workout_notes,
      healthNotes: activity.health_notes,
    },
    goals,
    zones,
    laps: mapLaps(parseActivityDetail(activity.detail_json)),
    recent,
  });
}

export async function sendCoachMessageAction(input: {
  activityId: number;
  message: string;
  /** Optional attached image as raw base64 (no data: prefix). */
  imageBase64?: string | null;
}): Promise<CoachMessageResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  if (!isCoachConfigured()) return { ok: false, error: t.errors.coachNotConfigured };
  const message = input.message.trim();
  const imageBase64 = input.imageBase64?.trim() || null;
  if (!message && !imageBase64) return { ok: false, error: t.errors.generic };

  // Validate the image by MAGIC NUMBER (never the client's word), and only allow
  // the types Anthropic vision accepts. Reject anything else or oversized.
  let image: CoachImage | null = null;
  if (imageBase64) {
    const bytes = Buffer.from(imageBase64, "base64");
    if (bytes.length === 0 || bytes.length > COACH_IMAGE_MAX_BYTES) {
      return { ok: false, error: t.errors.invalidImage };
    }
    const mime = sniffImageType(bytes);
    if (
      mime !== "image/jpeg" &&
      mime !== "image/png" &&
      mime !== "image/gif" &&
      mime !== "image/webp"
    ) {
      return { ok: false, error: t.errors.invalidImage };
    }
    image = { mediaType: mime, dataBase64: imageBase64 };
  }

  try {
    const activity = await getActivity(input.activityId);
    if (!activity) return { ok: false, error: t.errors.activityNotFound };

    const context = await assembleActivityContext(activity);

    const history = (await listActivityChat(activity.id)).map((row) => ({
      role: row.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: row.content,
    }));

    // The image is used for this turn but not persisted in the text history; the
    // stored user line notes an image when there is no accompanying text.
    const userLine = message || t.coach.imageSent;
    const prompt =
      message ||
      "Interpret this attached screenshot and relate it to this workout and my training.";
    await addActivityChatMessage(activity.id, "user", userLine);
    const reply = await runCoachChat(context, history, prompt, image);
    await addActivityChatMessage(activity.id, "assistant", reply);
    refreshAll();
    return { ok: true, reply };
  } catch (error) {
    return fail(error, t.errors.coachFailed);
  }
}

export async function clearCoachAction(activityId: number): Promise<ActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  try {
    await clearActivityChat(activityId);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

// ---------------------------------------------------------------------------
// Goals — races/targets the athlete is training for (context for the coach +
// the zones agent).
// ---------------------------------------------------------------------------

/** Parse "h:mm:ss" or "mm:ss" to seconds; null for blank/invalid. */
function parseDurationToSeconds(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  const parts = s.split(":").map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return null;
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
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  const name = input.name.trim();
  if (!name) return { ok: false, error: t.errors.goalNeedsName };
  try {
    const distance = input.distanceKm.trim() ? parseFiniteNumber(input.distanceKm) : null;
    if (input.distanceKm.trim() && distance === null) {
      return { ok: false, error: t.errors.invalidGoal };
    }
    const raceDate = /^\d{4}-\d{2}-\d{2}$/.test(input.raceDate.trim())
      ? input.raceDate.trim()
      : null;
    await createGoal({
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
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  const goalId = parseId(id);
  if (goalId === null) return { ok: false, error: t.errors.invalidId };
  try {
    await deleteGoal(goalId);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

// ---------------------------------------------------------------------------
// Training zones — the AI agent that derives HR + pace zones from field data.
// ---------------------------------------------------------------------------

export type ZonesResult = { ok: true; zones: DerivedZones } | { ok: false; error: string };

export async function computeZonesAction(extraContext = ""): Promise<ZonesResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  if (!isCoachConfigured()) return { ok: false, error: t.errors.coachNotConfigured };
  try {
    const [signals, goals] = await Promise.all([getRunningFieldSignals(), listGoals()]);
    const context = buildZonesContext({
      signals,
      goals,
      extraContext: extraContext.slice(0, 4000),
    });
    const ai = await deriveZones(context);
    const zones: DerivedZones = {
      ...ai,
      restingHr: ai.restingHr ?? signals.restingHr,
      generatedAt: new Date().toISOString(),
    };
    await setTrainingZones(zones);
    refreshAll();
    return { ok: true, zones };
  } catch (error) {
    return fail(error, t.errors.coachFailed);
  }
}

// ---------------------------------------------------------------------------
// Per-activity coach insight — an upfront read generated on demand, stored on
// the activity and shown above the chat.
// ---------------------------------------------------------------------------

export type InsightResult =
  { ok: true; text: string; generatedAt: string } | { ok: false; error: string };

export async function generateActivityInsightAction(activityId: number): Promise<InsightResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  if (!isCoachConfigured()) return { ok: false, error: t.errors.coachNotConfigured };
  try {
    const activity = await getActivity(activityId);
    if (!activity) return { ok: false, error: t.errors.activityNotFound };

    const activityContext = await assembleActivityContext(activity);

    const context = buildInsightContext({ activityContext, healthNote: null });
    const text = await runActivityInsight(context);
    await setActivityInsight(activity.id, text);
    refreshAll();
    return { ok: true, text, generatedAt: new Date().toISOString() };
  } catch (error) {
    return fail(error, t.errors.coachFailed);
  }
}
