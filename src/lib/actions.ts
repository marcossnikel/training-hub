"use server";

import { after } from "next/server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { NONE } from "./constants";
import { splitErrorText, isLang } from "./i18n";
import { LANG_COOKIE } from "./lang";
import { storePhoto, deletePhoto, InvalidImageError } from "./storage";
import {
  createBike,
  createManualActivity,
  createShoe,
  getActivity,
  getAthleteThresholds,
  getBike,
  getShoe,
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
  createGoal,
  deleteGoal,
  type BikeFields,
  type ShoeFields,
} from "./db";
import { FTP_RANGE, THRESHOLD_PACE_RANGE } from "./fitness";
import {
  ensureActivityStreams,
  isStravaConnected,
  syncActivities,
  type SyncResult,
} from "./strava";
import { parseFiniteNumber, parseId, validateSplits } from "./validate";
import { fail, type ActionResult } from "./action-result";
import { logger } from "./telemetry";
import { auth, requireCurrentUser } from "./auth";
import { dict, inRange, normalizeJournal, normalizeSplits, refreshAll } from "./action-helpers";
import type { Feeling, SplitInput } from "./types";
import { removeInsightFeedback, saveInsightFeedback, saveInsightFeedbackNote } from "./db";
import { insightFeedbackEnabled } from "./db/insight-feedback";
import {
  isInsightUsefulness,
  normalizeInsightNote,
  type InsightUsefulness,
} from "./insight-feedback";
import {
  resolveComparableActivityFeedbackTarget,
  resolveWeeklyBriefFeedbackTarget,
} from "./insight-feedback-targets";

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
// Authentication
// ---------------------------------------------------------------------------

/** Revoke the current database session, then return to the public sign-in page. */
export async function logoutAction(): Promise<never> {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}

// ---------------------------------------------------------------------------
// Private insight usefulness feedback
// ---------------------------------------------------------------------------

export type InsightFeedbackActionResult =
  | { ok: true; usefulness: InsightUsefulness | null; note: string | null }
  | { ok: false; error: string };

export type InsightFeedbackTargetInput =
  { kind: "weekly_brief" } | { kind: "comparable_prior_activity"; sourceActivityId: number };

async function resolveFeedbackTargetForAction(
  owner: Awaited<ReturnType<typeof requireCurrentUser>>,
  target: InsightFeedbackTargetInput
) {
  if (!owner) return null;
  if (target.kind === "weekly_brief") {
    return (await resolveWeeklyBriefFeedbackTarget(owner)).reference;
  }
  return resolveComparableActivityFeedbackTarget(owner, target.sourceActivityId);
}

function feedbackUnavailable(): InsightFeedbackActionResult {
  return { ok: false, error: "We couldn’t save your feedback. Try again." };
}

/**
 * The target is only a route discriminator. The server derives the owner and
 * recomputes the eligible insight reference before every mutation.
 */
export async function saveInsightUsefulnessAction(input: {
  target: InsightFeedbackTargetInput;
  usefulness: unknown;
}): Promise<InsightFeedbackActionResult> {
  const owner = await requireCurrentUser();
  if (!owner || !insightFeedbackEnabled() || !isInsightUsefulness(input.usefulness)) {
    return feedbackUnavailable();
  }
  try {
    const reference = await resolveFeedbackTargetForAction(owner, input.target);
    if (!reference) return feedbackUnavailable();
    await saveInsightFeedback(owner, { reference, usefulness: input.usefulness });
    return { ok: true, usefulness: input.usefulness, note: null };
  } catch (error) {
    return fail(error, "We couldn’t save your feedback. Try again.");
  }
}

export async function saveInsightFeedbackNoteAction(input: {
  target: InsightFeedbackTargetInput;
  note: unknown;
}): Promise<InsightFeedbackActionResult> {
  const owner = await requireCurrentUser();
  const note = normalizeInsightNote(input.note);
  if (!owner || !insightFeedbackEnabled()) return feedbackUnavailable();
  if (note === "invalid") {
    return { ok: false, error: "Keep the note to 500 characters or fewer." };
  }
  try {
    const reference = await resolveFeedbackTargetForAction(owner, input.target);
    if (!reference) return feedbackUnavailable();
    const updated = await saveInsightFeedbackNote(owner, { reference, note });
    if (!updated) return { ok: false, error: "Choose Useful or Not useful before adding a note." };
    return { ok: true, usefulness: null, note };
  } catch (error) {
    return fail(error, "We couldn’t save your feedback. Try again.");
  }
}

export async function removeInsightFeedbackAction(input: {
  target: InsightFeedbackTargetInput;
}): Promise<InsightFeedbackActionResult> {
  const owner = await requireCurrentUser();
  if (!owner || !insightFeedbackEnabled()) return feedbackUnavailable();
  try {
    const reference = await resolveFeedbackTargetForAction(owner, input.target);
    if (!reference) return feedbackUnavailable();
    await removeInsightFeedback(owner, reference);
    return { ok: true, usefulness: null, note: null };
  } catch (error) {
    return fail(error, "We couldn’t save your feedback. Try again.");
  }
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

export type SyncActionResult = ({ ok: true } & SyncResult) | { ok: false; error: string };

export async function syncNowAction(): Promise<SyncActionResult> {
  const t = await dict();
  const owner = await requireCurrentUser();
  if (!owner) return { ok: false, error: t.errors.unauthorized };
  if (!(await isStravaConnected(owner))) return { ok: false, error: t.errors.notConnected };
  try {
    const result = await syncActivities(owner);
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
  const owner = await requireCurrentUser();
  if (!owner) return { ok: false, error: t.errors.unauthorized };
  try {
    const activity = await getActivity(owner, input.activityId);
    if (!activity) return { ok: false, error: t.errors.activityNotFound };
    if (activity.status === "confirmed") return { ok: false, error: t.errors.alreadyConfirmed };

    const splits = normalizeSplits(input.splits);
    const splitError = validateSplits(activity, splits);
    if (splitError) return { ok: false, error: splitErrorText(splitError, t) };

    const journal = normalizeJournal(input, t);
    if ("error" in journal) return { ok: false, error: journal.error };

    const bikeId =
      input.bikeId != null && (await getBike(owner, input.bikeId)) ? input.bikeId : null;

    await confirmActivity(owner, input.activityId, journal, splits, bikeId);
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
      await ensureActivityStreams(owner, activity);
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
  const owner = await requireCurrentUser();
  if (!owner) return { ok: false, error: t.errors.unauthorized };
  try {
    const activity = await getActivity(owner, input.activityId);
    if (!activity) return { ok: false, error: t.errors.activityNotFound };
    const journal = normalizeJournal(input, t);
    if ("error" in journal) return { ok: false, error: journal.error };
    await updateActivityJournal(owner, input.activityId, journal);
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
  const owner = await requireCurrentUser();
  if (!owner) return { ok: false, error: t.errors.unauthorized };
  try {
    const activity = await getActivity(owner, input.activityId);
    if (!activity) return { ok: false, error: t.errors.activityNotFound };
    const splits = normalizeSplits(input.splits);
    const splitError = validateSplits(activity, splits);
    if (splitError) return { ok: false, error: splitErrorText(splitError, t) };
    await replaceActivitySplits(owner, input.activityId, splits);
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
  const owner = await requireCurrentUser();
  if (!owner) return { ok: false, error: t.errors.unauthorized };
  try {
    const activity = await getActivity(owner, activityId);
    if (!activity) return { ok: false, error: t.errors.activityNotFound };
    const resolved = bikeId != null && (await getBike(owner, bikeId)) ? bikeId : null;
    await setActivityBike(owner, activityId, resolved);
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
  const owner = await requireCurrentUser();
  if (!owner) return { ok: false, error: t.errors.unauthorized };
  try {
    const activity = await getActivity(owner, input.activityId);
    if (!activity) return { ok: false, error: t.errors.activityNotFound };
    const goal =
      input.goalPace != null && Number.isFinite(input.goalPace) && input.goalPace > 0
        ? Math.round(input.goalPace)
        : null;
    await setActivityRace(owner, input.activityId, input.isRace, goal);
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
  const owner = await requireCurrentUser();
  if (!owner) return { ok: false, error: t.errors.unauthorized };
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
    await saveAthleteThresholds(owner, {
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
  const owner = await requireCurrentUser();
  if (!owner) return { ok: false, error: t.errors.unauthorized };
  try {
    const thresholdPace = Math.round(paceSPerKm);
    if (!inRange(thresholdPace, THRESHOLD_PACE_RANGE.min, THRESHOLD_PACE_RANGE.max)) {
      return { ok: false, error: t.errors.invalidThresholds };
    }
    const current = await getAthleteThresholds(owner);
    await saveAthleteThresholds(owner, {
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
 * leaving the flag set would keep a measured value marked provisional.
 */
export async function applyFtpAction(ftpW: number): Promise<ActionResult> {
  const t = await dict();
  const owner = await requireCurrentUser();
  if (!owner) return { ok: false, error: t.errors.unauthorized };
  try {
    const ftp = Math.round(ftpW);
    if (!inRange(ftp, FTP_RANGE.min, FTP_RANGE.max)) {
      return { ok: false, error: t.errors.invalidThresholds };
    }
    const current = await getAthleteThresholds(owner);
    await saveAthleteThresholds(owner, {
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
  const owner = await requireCurrentUser();
  if (!owner) return { ok: false, error: t.errors.unauthorized };
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
      photoPath = await storePhoto(owner, photo);
    }

    const fields: ShoeFields = {
      name,
      role,
      initial_km: Math.round(initialKm * 10) / 10,
      retirement_km: Math.round(retirementKm),
      strava_gear_id: gearId,
    };

    if (id) {
      const existing = await getShoe(owner, id);
      if (!existing) return { ok: false, error: t.errors.shoeNotFound };
      await updateShoe(owner, id, fields, photoPath);
      // A replaced photo orphans the previous asset; clean it up after the
      // response so it never blocks or fails the save (best-effort, logs).
      if (photoPath && existing.photo_path && existing.photo_path !== photoPath) {
        const orphan = existing.photo_path;
        after(() => deletePhoto(owner, orphan));
      }
    } else {
      await createShoe(owner, fields, photoPath);
    }
    refreshAll();
    return { ok: true };
  } catch (error) {
    if (error instanceof InvalidImageError) return { ok: false, error: t.errors.invalidImage };
    return fail(error, t.errors.generic);
  }
}

export async function saveShoeFormAction(
  _previousState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  return saveShoeAction(formData);
}

export async function setShoeRetiredAction(id: number, retired: boolean): Promise<ActionResult> {
  const t = await dict();
  const owner = await requireCurrentUser();
  if (!owner) return { ok: false, error: t.errors.unauthorized };
  try {
    if (!(await getShoe(owner, id))) return { ok: false, error: t.errors.shoeNotFound };
    await setShoeRetired(owner, id, retired);
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
  const owner = await requireCurrentUser();
  if (!owner) return { ok: false, error: t.errors.unauthorized };
  try {
    if (!(await getShoe(owner, shoeId))) return { ok: false, error: t.errors.shoeNotFound };
    await setShoeGear(owner, shoeId, gearId);
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
  const owner = await requireCurrentUser();
  if (!owner) return { ok: false, error: t.errors.unauthorized };
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
      photoPath = await storePhoto(owner, photo);
    }

    const fields: BikeFields = {
      name,
      role,
      initial_km: Math.round(initialKm * 10) / 10,
      strava_gear_id: gearId,
    };

    if (id) {
      const existing = await getBike(owner, id);
      if (!existing) return { ok: false, error: t.errors.bikeNotFound };
      await updateBike(owner, id, fields, photoPath);
      // A replaced photo orphans the previous asset; clean it up after the
      // response so it never blocks or fails the save (best-effort, logs).
      if (photoPath && existing.photo_path && existing.photo_path !== photoPath) {
        const orphan = existing.photo_path;
        after(() => deletePhoto(owner, orphan));
      }
    } else {
      await createBike(owner, fields, photoPath);
    }
    refreshAll();
    return { ok: true };
  } catch (error) {
    if (error instanceof InvalidImageError) return { ok: false, error: t.errors.invalidImage };
    return fail(error, t.errors.generic);
  }
}

export async function saveBikeFormAction(
  _previousState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  return saveBikeAction(formData);
}

export async function setBikeRetiredAction(id: number, retired: boolean): Promise<ActionResult> {
  const t = await dict();
  const owner = await requireCurrentUser();
  if (!owner) return { ok: false, error: t.errors.unauthorized };
  try {
    if (!(await getBike(owner, id))) return { ok: false, error: t.errors.bikeNotFound };
    await setBikeRetired(owner, id, retired);
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
  const owner = await requireCurrentUser();
  if (!owner) return { ok: false, error: t.errors.unauthorized };
  try {
    if (!(await getBike(owner, bikeId))) return { ok: false, error: t.errors.bikeNotFound };
    await setBikeGear(owner, bikeId, gearId);
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
  const owner = await requireCurrentUser();
  if (!owner) return { ok: false, error: t.errors.unauthorized };
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
      return { ok: false, error: t.errors.invalidDate };
    }
    const km = Math.round((Number(input.km) || 0) * 100) / 100;
    if (km === 0) return { ok: false, error: t.errors.zeroDistance };
    if (!(await getShoe(owner, input.shoeId))) return { ok: false, error: t.errors.pickShoe };
    await createManualActivity(owner, { date: input.date, km, shoe_id: input.shoeId });
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

// ---------------------------------------------------------------------------
// Goals — races and targets.
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
  const owner = await requireCurrentUser();
  if (!owner) return { ok: false, error: t.errors.unauthorized };
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
