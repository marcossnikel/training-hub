"use server";

import { fail, type ActionResult } from "@/lib/action-result";
import { dict, inRange, normalizeJournal, normalizeSplits, refreshAll } from "@/lib/action-helpers";
import { requireCurrentUser } from "@/lib/auth";
import {
  confirmActivity,
  createManualActivity,
  getActivity,
  getBike,
  getShoe,
  replaceActivitySplits,
  saveAthleteEnteredParameter,
  setActivityBike,
  setActivityRace,
  updateActivityJournal,
} from "@/lib/db";
import { FTP_RANGE, THRESHOLD_PACE_RANGE } from "@/lib/fitness";
import { splitErrorText } from "@/lib/i18n";
import { loadActivityStreams } from "@/features/strava/server/enrichment";
import { logger } from "@/lib/telemetry";
import type { Feeling, SplitInput } from "@/lib/types";
import { validateSplits } from "@/lib/validate";

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
    try {
      await loadActivityStreams(owner, activity);
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
    const maxHr = Math.round(input.maxHr),
      restingHr = Math.round(input.restingHr),
      lthr = Math.round(input.lthr),
      thresholdPace = Math.round(input.thresholdPaceSPerKm),
      ftpW = Math.round(input.ftpW);
    if (
      !inRange(maxHr, 120, 230) ||
      !inRange(restingHr, 25, 90) ||
      !inRange(lthr, 90, 220) ||
      !inRange(thresholdPace, THRESHOLD_PACE_RANGE.min, THRESHOLD_PACE_RANGE.max) ||
      !inRange(ftpW, FTP_RANGE.min, FTP_RANGE.max) ||
      restingHr >= lthr ||
      lthr > maxHr
    )
      return { ok: false, error: t.errors.invalidThresholds };
    await Promise.all([
      saveAthleteEnteredParameter(owner, "max_hr_bpm", maxHr),
      saveAthleteEnteredParameter(owner, "resting_hr_bpm", restingHr),
      saveAthleteEnteredParameter(owner, "lthr_bpm", lthr),
      saveAthleteEnteredParameter(owner, "threshold_pace_sec_per_km", thresholdPace),
      saveAthleteEnteredParameter(owner, "cycling_ftp_watts", ftpW),
    ]);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

export async function applyThresholdPaceAction(paceSPerKm: number): Promise<ActionResult> {
  const t = await dict();
  const owner = await requireCurrentUser();
  if (!owner) return { ok: false, error: t.errors.unauthorized };
  try {
    const thresholdPace = Math.round(paceSPerKm);
    if (!inRange(thresholdPace, THRESHOLD_PACE_RANGE.min, THRESHOLD_PACE_RANGE.max))
      return { ok: false, error: t.errors.invalidThresholds };
    await saveAthleteEnteredParameter(owner, "threshold_pace_sec_per_km", thresholdPace);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

export async function applyFtpAction(ftpW: number): Promise<ActionResult> {
  const t = await dict();
  const owner = await requireCurrentUser();
  if (!owner) return { ok: false, error: t.errors.unauthorized };
  try {
    const ftp = Math.round(ftpW);
    if (!inRange(ftp, FTP_RANGE.min, FTP_RANGE.max))
      return { ok: false, error: t.errors.invalidThresholds };
    await saveAthleteEnteredParameter(owner, "cycling_ftp_watts", ftp);
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
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(input.date))
      return { ok: false, error: t.errors.invalidDate };
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
