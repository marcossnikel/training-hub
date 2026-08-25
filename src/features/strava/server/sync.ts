import {
  activityExistsByStravaId,
  commitInitialStravaImportPage,
  completeInitialStravaImport,
  countPending,
  ensureInitialStravaImportJob,
  failInitialStravaImport,
  findBikeIdByGear,
  findShoeIdByGear,
  getInitialStravaImportStatus,
  getMeta,
  getStravaSyncState,
  insertSyncedActivity,
  latestSyncedStartEpoch,
  leaseInitialStravaImportJob,
  recordInitialStravaImportOutcome,
  setMeta,
} from "@/lib/db";
import { isRideSport } from "@/lib/cycling";
import { round2 } from "@/lib/format";
import type { OwnerContext } from "@/lib/owner-context";
import { logger } from "@/lib/telemetry";
import type { SplitInput } from "@/lib/types";
import { isRunSport } from "@/lib/validate";
import { classifyInitialImportStart } from "../initial-import";
import { classifyImportError, sportFamily } from "../import-progress";
import { getStravaAccessToken } from "./connection";
import { stravaProvider, type ProviderActivity, type StravaProvider } from "./provider";

export interface SyncResult {
  imported: number;
  historicalConfirmed: number;
  pendingNew: number;
  pendingTotal: number;
}

export interface InitialImportStepResult {
  advanced: boolean;
  status: Awaited<ReturnType<typeof getInitialStravaImportStatus>>;
}

function activityRow(
  activity: ProviderActivity,
  status: "confirmed" | "pending_review",
  bikeId: number | null
) {
  const distanceKm =
    activity.distanceM && activity.distanceM > 0 ? round2(activity.distanceM / 1000) : 0;
  const pace =
    activity.distanceM && activity.distanceM > 0 && activity.movingTimeS
      ? Math.round(activity.movingTimeS / (activity.distanceM / 1000))
      : null;
  return {
    row: {
      strava_id: activity.id!,
      name: activity.name,
      sport_type: activity.sportType,
      started_at: activity.startedAt!,
      started_at_local: activity.startedAtLocal,
      distance_km: distanceKm,
      moving_time_s: activity.movingTimeS,
      avg_pace_s_per_km: pace,
      avg_hr: activity.averageHeartRate,
      elevation_gain_m: activity.elevationGainM,
      status,
      raw_json: JSON.stringify(activity),
      bike_id: bikeId,
    },
    distanceKm,
  };
}

async function classifyNewActivity(
  owner: OwnerContext,
  activity: ProviderActivity,
  reviewAfter: string
): Promise<{
  status: "confirmed" | "pending_review";
  splits: SplitInput[];
  bikeId: number | null;
  outcome: "historical_confirmed_created" | "new_pending_created";
} | null> {
  const classification = classifyInitialImportStart(activity.startedAt ?? undefined, reviewAfter);
  if (classification === "invalid") return null;
  if (classification === "confirmed")
    return {
      status: "confirmed",
      splits: [],
      bikeId: null,
      outcome: "historical_confirmed_created",
    };
  const sport = activity.sportType;
  const { distanceKm } = activityRow(activity, "pending_review", null);
  if (isRideSport(sport ?? undefined)) {
    return {
      status: "pending_review",
      splits: [],
      bikeId: activity.gearId ? await findBikeIdByGear(owner, activity.gearId) : null,
      outcome: "new_pending_created",
    };
  }
  const shoeId = activity.gearId ? await findShoeIdByGear(owner, activity.gearId) : null;
  return {
    status: "pending_review",
    splits:
      (isRunSport(sport ?? undefined) || shoeId) && distanceKm > 0
        ? [{ shoe_id: shoeId, km: distanceKm }]
        : [],
    bikeId: null,
    outcome: "new_pending_created",
  };
}

async function importOneInitialActivity(
  owner: OwnerContext,
  job: { id: string },
  leaseToken: string,
  reviewAfter: string,
  activity: ProviderActivity
): Promise<void> {
  if (activity.id === null) {
    logger.warn("strava.sync.invalidActivity", { reason: "missing_provider_identity" });
    return;
  }
  const classified = await classifyNewActivity(owner, activity, reviewAfter);
  if (!classified) {
    await recordInitialStravaImportOutcome(
      owner,
      job.id,
      leaseToken,
      activity.id,
      "skipped_invalid",
      sportFamily(activity.sportType)
    );
    return;
  }
  if (await activityExistsByStravaId(owner, activity.id)) {
    await recordInitialStravaImportOutcome(
      owner,
      job.id,
      leaseToken,
      activity.id,
      "already_present",
      sportFamily(activity.sportType)
    );
    return;
  }
  const { row } = activityRow(activity, classified.status, classified.bikeId);
  await insertSyncedActivity(owner, row, classified.splits, {
    jobId: job.id,
    leaseToken,
    outcome: classified.outcome,
    sportFamily: sportFamily(activity.sportType),
  });
}

/** Does one persisted initial-import page or completes the existing job. */
export async function advanceInitialStravaImport(
  owner: OwnerContext,
  provider: StravaProvider = stravaProvider
): Promise<InitialImportStepResult> {
  const job = await ensureInitialStravaImportJob(owner);
  if (!job) return { advanced: false, status: await getInitialStravaImportStatus(owner) };
  const leased = await leaseInitialStravaImportJob(owner, job.id);
  if (!leased) return { advanced: false, status: await getInitialStravaImportStatus(owner) };
  try {
    const state = await getStravaSyncState(owner);
    if (!state || state.initialSyncCompletedAt !== null)
      throw new Error("Strava initial import is unavailable.");
    const batch = await provider.listActivities({
      accessToken: await getStravaAccessToken(owner, provider),
      page: leased.job.nextPage,
      perPage: 100,
    });
    for (const activity of batch)
      await importOneInitialActivity(
        owner,
        leased.job,
        leased.leaseToken,
        state.reviewAfter,
        activity
      );
    const terminal = batch.length < 100;
    if (
      !(await commitInitialStravaImportPage(
        owner,
        leased.job.id,
        leased.leaseToken,
        leased.job.nextPage,
        terminal
      ))
    ) {
      return { advanced: false, status: await getInitialStravaImportStatus(owner) };
    }
    if (terminal)
      await completeInitialStravaImport(
        owner,
        leased.job.id,
        leased.leaseToken,
        new Date().toISOString()
      );
    return { advanced: true, status: await getInitialStravaImportStatus(owner) };
  } catch (error) {
    const category = classifyImportError(error);
    await failInitialStravaImport(owner, leased.job.id, leased.leaseToken, category);
    logger.warn("strava.initialImport.failed", { category });
    return { advanced: true, status: await getInitialStravaImportStatus(owner) };
  }
}

/** Subsequent syncs begin after the newest committed provider activity. */
export async function syncStravaActivities(
  owner: OwnerContext,
  provider: StravaProvider = stravaProvider
): Promise<SyncResult> {
  const state = await getStravaSyncState(owner);
  if (!state) throw new Error("Strava connection sync state is unavailable.");
  if (state.initialSyncCompletedAt === null) {
    const stepped = await advanceInitialStravaImport(owner, provider);
    const counters = stepped.status?.counters;
    return {
      imported:
        (counters?.historical_confirmed_created ?? 0) + (counters?.new_pending_created ?? 0),
      historicalConfirmed: counters?.historical_confirmed_created ?? 0,
      pendingNew: counters?.new_pending_created ?? 0,
      pendingTotal: stepped.status?.snapshot.pending ?? (await countPending(owner)),
    };
  }
  const afterEpoch = await latestSyncedStartEpoch(owner);
  let imported = 0;
  let historicalConfirmed = 0;
  let pendingNew = 0;
  const accessToken = await getStravaAccessToken(owner, provider);
  for (let page = 1; page <= 1_000; page++) {
    const batch = await provider.listActivities({
      accessToken,
      page,
      perPage: 100,
      ...(afterEpoch ? { afterEpoch } : {}),
    });
    if (batch.length === 0) break;
    for (const activity of batch) {
      if (activity.id === null) {
        logger.warn("strava.sync.skipInvalidActivity", { reason: "missing_id" });
        continue;
      }
      const classified = await classifyNewActivity(owner, activity, state.reviewAfter);
      if (!classified) {
        logger.warn("strava.sync.skipInvalidActivity", { reason: "invalid_start" });
        continue;
      }
      if (await activityExistsByStravaId(owner, activity.id)) continue;
      const { row } = activityRow(activity, classified.status, classified.bikeId);
      await insertSyncedActivity(owner, row, classified.splits);
      imported++;
      if (classified.outcome === "historical_confirmed_created") historicalConfirmed++;
      else pendingNew++;
    }
    if (batch.length < 100) break;
  }
  await setMeta(owner, "last_sync_at", new Date().toISOString());
  return { imported, historicalConfirmed, pendingNew, pendingTotal: await countPending(owner) };
}

export async function shouldAutoSync(owner: OwnerContext): Promise<boolean> {
  if (!(await getStravaSyncState(owner))) return false;
  const lastSync = await getMeta(owner, "last_sync_at");
  return !lastSync || Date.now() - Date.parse(lastSync) > 60 * 60 * 1000;
}
