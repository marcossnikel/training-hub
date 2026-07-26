"use server";

import { after } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NONE } from "./constants";
import { fillStr, splitErrorText, isLang } from "./i18n";
import { LANG_COOKIE, getLang } from "./lang";
import { storePhoto, deletePhoto, sniffImageType, InvalidImageError } from "./storage";
import {
  addActivityChatMessage,
  clearActivityChat,
  clearStravaAuth,
  createBike,
  createManualActivity,
  createShoe,
  getActivity,
  getActivityLoad,
  getAthleteThresholds,
  getBike,
  getShoe,
  listActivitiesSince,
  listActivityChat,
  recomputeActivityLoad,
  recomputeAllLoads,
  recomputeLoadsWithStreams,
  replaceActivitySplits,
  saveAthleteThresholds,
  setActivityBike,
  setActivityLoadManual,
  setActivityRace,
  setBikeGear,
  setBikeRetired,
  setShoeGear,
  setShoeRetired,
  setWeeklyDigest,
  updateActivityJournal,
  updateBike,
  updateShoe,
  replaceHealthMetricsForDaySource,
  confirmActivity,
  getReadinessSnapshot,
  getRecoveryState,
  getResolvedMetricsForDate,
  getLatestHealthDate,
  setReadinessNarrative,
  listGoals,
  createGoal,
  deleteGoal,
  getRunningFieldSignals,
  setTrainingZones,
  getTrainingZones,
  listRecentSessionsWithDetail,
  setActivityInsight,
  type BikeFields,
  type LoadRecomputePlan,
  type ShoeFields,
} from "./db";
import { METRIC_META, SUBJECTIVE_SCALE, snapshotToMetrics } from "./health";
import { dictionaries } from "./i18n";
import { fmtHoursMin, localDateInputValue } from "./format";
import {
  buildActivityContext,
  buildDigestContext,
  buildInsightContext,
  buildReadinessContext,
  buildZonesContext,
  deriveZones,
  isCoachConfigured,
  runActivityInsight,
  runCoachChat,
  runReadinessSummary,
  runWeeklyDigest,
  summarizeStreams,
  type CoachImage,
  type CoachLoad,
  type CoachReadiness,
  type CoachStreamSummary,
  type LapSummary,
  type RecentSessionSummary,
} from "./coach";
import {
  computeLoad,
  THRESHOLD_PACE_RANGE,
  weeklyMonotony,
  type LoadRecomputeExpectation,
} from "./fitness";
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
import {
  buildPmc,
  dict,
  inRange,
  normalizeJournal,
  normalizeSplits,
  pmcPoint,
  refreshAll,
} from "./action-helpers";
import type { DerivedZones } from "./zones";
import type {
  ActivityWithSplits,
  Feeling,
  HealthMetric,
  HealthMetricRow,
  SplitInput,
} from "./types";

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
    // A sync that pulled anything can have added confirmed history (pre-baseline
    // rows land confirmed) whose training load is not yet computed. Recompute
    // after the response (G7.3) so the fitness PMC, the recovery fold and recent
    // sessions reflect the new data without blocking the sync. Errors are logged,
    // not swallowed; the sync result stands regardless.
    if (result.imported > 0) {
      after(async () => {
        try {
          await recomputeAllLoads();
        } catch (error) {
          logger.error("actions.syncNow.recompute", { error });
        }
      });
    }
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
    // `recomputeActivityLoad` reads whatever stream is cached, and the review
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
    // Compute this activity's training load on confirm so it immediately counts
    // toward the fitness PMC, the recovery fold and the "recent sessions" list.
    // Without this, a newly confirmed activity had no activity_load row until the
    // next threshold save or backfill, so it was silently missing from all three.
    await recomputeActivityLoad(input.activityId);
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
      !inRange(ftpW, 50, 600) ||
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
    // Thresholds drive every TSS value, so the curves must refresh with them.
    // But that recompute scales with confirmed-activity history (1200+ rows) and
    // must not block the save response (G7.3, T3.7): the edit above is already
    // durably persisted, so schedule the recompute to run AFTER the response with
    // `after()` (Next 16, `next/server`) instead of awaiting it in-request. A
    // post-response failure is logged (not swallowed) so it stays observable; the
    // thresholds remain saved regardless of the deferred recompute's outcome.
    after(async () => {
      try {
        await recomputeAllLoads();
      } catch (error) {
        logger.error("actions.saveThresholds.recompute", { error });
      }
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
    // Pace drives pace-method TSS, so the curves must refresh — deferred past the
    // response like saveThresholdsAction (the edit above is already persisted).
    after(async () => {
      try {
        await recomputeAllLoads();
      } catch (error) {
        logger.error("actions.applyThresholdPace.recompute", { error });
      }
    });
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

export async function setActivityLoadManualAction(
  activityId: number,
  tss: number
): Promise<ActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  try {
    if (!(await getActivity(activityId))) return { ok: false, error: t.errors.activityNotFound };
    const value = Math.round((Number(tss) || 0) * 10) / 10;
    if (!Number.isFinite(value) || value < 0) return { ok: false, error: t.errors.invalidLoad };
    await setActivityLoadManual(activityId, value);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

export async function resetActivityLoadAction(activityId: number): Promise<ActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  try {
    if (!(await getActivity(activityId))) return { ok: false, error: t.errors.activityNotFound };
    await recomputeActivityLoad(activityId);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

/**
 * The two halves of the explicit load recompute, the only path that adopts the
 * stream-integrated hrTSS across training history.
 *
 * Split into a preview and an apply on purpose. Every stored TSS feeds a 42-day
 * EWMA, so re-measuring a thousand past sessions moves today's CTL and with it
 * every form reading the athlete plans against — that is a decision, not a
 * refresh. The preview computes the whole thing in memory and writes nothing;
 * the apply repeats the identical computation and stores it. Rows the athlete
 * entered by hand are excluded from both.
 */
export type LoadRecomputeResult =
  | ({ ok: true } & LoadRecomputePlan)
  /** `drifted` marks the one failure that invalidates the figures on screen. */
  | { ok: false; error: string; drifted?: boolean };

async function runLoadRecompute(
  opts: { write: false } | { write: true; expect: LoadRecomputeExpectation }
): Promise<LoadRecomputeResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  try {
    const { applied, ...plan } = await recomputeLoadsWithStreams(opts);
    // An apply that did not apply was refused: the history moved since the
    // preview. Report the fresh figures so the next preview is not a surprise.
    if (opts.write && !applied) {
      return {
        ok: false,
        drifted: true,
        error: fillStr(t.settingsPage.recompute.drifted, {
          changed: plan.changed,
          ctl: plan.ctlAfter.toFixed(1),
        }),
      };
    }
    if (applied) refreshAll();
    return { ok: true, ...plan };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

export async function previewLoadRecomputeAction(): Promise<LoadRecomputeResult> {
  return runLoadRecompute({ write: false });
}

/**
 * Applies the previewed recompute. `expect` is the preview's own `changed` /
 * `ctlAfter`, handed back so the server can refuse to write a plan the athlete
 * never saw; it is a check, never data to write.
 */
export async function applyLoadRecomputeAction(
  expect: LoadRecomputeExpectation
): Promise<LoadRecomputeResult> {
  return runLoadRecompute({ write: true, expect });
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
export type WeeklyDigestResult =
  { ok: true; text: string; generatedAt: string } | { ok: false; error: string };

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
  const stored = await getActivityLoad(activity.id);
  let load: CoachLoad | null = null;
  if (stored) {
    load = { tss: stored.tss, method: stored.method, intensityFactor: stored.intensity_factor };
  } else {
    const computed = computeLoad(activity, thresholds);
    if (computed) {
      load = {
        tss: computed.tss,
        method: computed.method,
        intensityFactor: computed.intensityFactor,
      };
    }
  }

  // Streams are cached after the first view; only a cold activity fetches here.
  let streams: CoachStreamSummary | null = null;
  try {
    const raw = await ensureActivityStreams(activity);
    if (raw) streams = summarizeStreams(raw);
  } catch {
    streams = null;
  }

  const [pmc, goals, zones, recentRows] = await Promise.all([
    buildPmc(),
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
        tss: r.tss,
        laps: mapLaps(detail, 40),
      };
    })
  );

  return buildActivityContext({
    activity,
    load,
    thresholds,
    pmc: pmcPoint(pmc[pmc.length - 1]),
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

export async function generateWeeklyDigestAction(): Promise<WeeklyDigestResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  if (!isCoachConfigured()) return { ok: false, error: t.errors.coachNotConfigured };
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [activities, thresholds, pmc] = await Promise.all([
      listActivitiesSince(since),
      getAthleteThresholds(),
      buildPmc(),
    ]);
    const context = buildDigestContext({
      activities,
      thresholds,
      now: pmcPoint(pmc[pmc.length - 1]),
      weekAgo: pmcPoint(pmc.length >= 8 ? pmc[pmc.length - 8] : pmc[0]),
      // PMC points are gap-filled to today, so their trailing 7 entries are the
      // trailing 7 calendar days the monotony/strain pair expects.
      week: weeklyMonotony(pmc),
    });
    const text = await runWeeklyDigest(context);
    const saved = await setWeeklyDigest(text);
    refreshAll();
    return { ok: true, text: saved.text, generatedAt: saved.generatedAt };
  } catch (error) {
    return fail(error, t.errors.coachFailed);
  }
}

// ---------------------------------------------------------------------------
// Health — manual morning check-in (the in-app HealthSource adapter). Writes
// `source: 'manual'` rows; device syncs write their own source and win by
// default in the resolver, so a later device value never clobbers these.
// ---------------------------------------------------------------------------

export interface HealthEntryInput {
  date: string;
  fatigue: number | null;
  soreness: number | null;
  stress: number | null;
  mood: number | null;
  weight: number | null;
  sickness: boolean;
  injury: boolean;
}

export async function saveHealthEntryAction(input: HealthEntryInput): Promise<ActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  try {
    // Range-check the ratings the trust boundary owns (the pure normalizer only
    // NaN-guards). Blank fields arrive as null and are simply not recorded.
    const ratings = [input.fatigue, input.soreness, input.stress, input.mood];
    for (const rating of ratings) {
      if (rating !== null && !inRange(rating, SUBJECTIVE_SCALE.min, SUBJECTIVE_SCALE.max)) {
        return { ok: false, error: t.errors.invalidHealthEntry };
      }
    }
    if (input.weight !== null && !inRange(input.weight, 20, 400)) {
      return { ok: false, error: t.errors.invalidHealthEntry };
    }
    // Reject a future check-in (and, via the normalizer below, an impossible
    // calendar date) so a malformed entry can't become the latest readiness day.
    if (input.date > localDateInputValue(new Date())) {
      return { ok: false, error: t.errors.invalidDate };
    }

    // Reuse the ingest normalizer so manual and device paths share one shape +
    // validation. sickness/injury are recorded every save (0 or 1) so a cleared
    // flag is captured, not just a set one.
    const normalized = snapshotToMetrics(
      {
        date: input.date,
        source: "manual",
        weight: input.weight,
        subjective: {
          fatigue: input.fatigue,
          soreness: input.soreness,
          stress: input.stress,
          mood: input.mood,
          sickness: input.sickness ? 1 : 0,
          injury: input.injury ? 1 : 0,
        },
      },
      new Date().toISOString()
    );
    if ("error" in normalized) return { ok: false, error: t.errors.invalidDate };

    // Replace this day's MANUAL rows (not a per-field upsert) so a field the
    // athlete cleared in the form is actually removed, not left stale. Device
    // rows for the day are a different source and stay untouched.
    await replaceHealthMetricsForDaySource(input.date, "manual", normalized.rows);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

// ---------------------------------------------------------------------------
// Coach — morning readiness narrative from the generic health model. Reads only
// the resolved metrics + app-owned readiness/recovery, never source specifics.
// ---------------------------------------------------------------------------

export type ReadinessNarrativeResult =
  { ok: true; text: string; generatedAt: string } | { ok: false; error: string };

// The resolved signals surfaced to the coach, formatted as English "label: value".
const COACH_SIGNAL_METRICS: HealthMetric[] = [
  "sleep_total",
  "sleep_quality",
  "hrv_overnight",
  "hrv_status",
  "resting_hr",
  "stress_avg",
  "body_battery_high",
  "spo2",
];

function formatSignal(row: HealthMetricRow): string | null {
  const meta = METRIC_META[row.metric];
  const label = dictionaries.en.health.metrics[row.metric];
  if (meta.kind === "text") return row.value_text ? `${label}: ${row.value_text}` : null;
  if (row.value === null) return null;
  if (meta.unit === "min") return `${label}: ${fmtHoursMin(row.value * 60)}`;
  const value = Math.round(row.value * 10) / 10;
  return `${label}: ${value}${meta.unit ? ` ${meta.unit}` : ""}`;
}

export async function generateReadinessNarrativeAction(): Promise<ReadinessNarrativeResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  if (!isCoachConfigured()) return { ok: false, error: t.errors.coachNotConfigured };
  try {
    const [snapshot, recovery, latestDate] = await Promise.all([
      getReadinessSnapshot(),
      getRecoveryState(),
      getLatestHealthDate(),
    ]);
    if (!snapshot) return { ok: false, error: t.health.readiness.emptyBody };

    const rows = latestDate ? await getResolvedMetricsForDate(latestDate) : [];
    const signals = COACH_SIGNAL_METRICS.map((metric) => {
      const row = rows.find((r) => r.metric === metric);
      return row ? formatSignal(row) : null;
    }).filter((line): line is string => line !== null);

    const readiness: CoachReadiness = {
      score: snapshot.readiness.score,
      band: snapshot.readiness.band,
      components: snapshot.readiness.components.map((c) => ({ key: c.key, sub: c.sub })),
      topNegative: snapshot.readiness.topNegative,
      lowConfidence: snapshot.readiness.lowConfidence,
      redFlag: snapshot.readiness.redFlag
        ? t.health.readiness.redFlags[snapshot.readiness.redFlag.reason]
        : null,
    };

    const context = buildReadinessContext({
      readiness,
      recoveryHours: recovery.remainingHours,
      signals,
    });
    const language = (await getLang()) === "pt" ? "Portuguese" : "English";
    const text = await runReadinessSummary(context, language);
    const saved = await setReadinessNarrative(text);
    refreshAll();
    return { ok: true, text: saved.text, generatedAt: saved.generatedAt };
  } catch (error) {
    return fail(error, t.errors.coachFailed);
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

    // Health around the day of the workout, when we have it.
    const day = (activity.started_at_local ?? activity.started_at)?.slice(0, 10) ?? null;
    let healthNote: string | null = null;
    if (day) {
      const rows = await getResolvedMetricsForDate(day);
      const pick = (metric: string) => rows.find((r) => r.metric === metric)?.value ?? null;
      const parts = [
        pick("hrv_overnight") != null ? `HRV ${pick("hrv_overnight")} ms` : null,
        pick("resting_hr") != null ? `resting HR ${pick("resting_hr")} bpm` : null,
        pick("sleep_total") != null
          ? `sleep ${fmtHoursMin((pick("sleep_total") as number) * 60)}`
          : null,
        pick("stress_avg") != null ? `stress ${pick("stress_avg")}` : null,
      ].filter(Boolean);
      if (parts.length > 0) healthNote = parts.join(", ");
    }

    const context = buildInsightContext({ activityContext, healthNote });
    const text = await runActivityInsight(context);
    await setActivityInsight(activity.id, text);
    refreshAll();
    return { ok: true, text, generatedAt: new Date().toISOString() };
  } catch (error) {
    return fail(error, t.errors.coachFailed);
  }
}
