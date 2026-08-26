import {
  getAthleteThresholds,
  getMetricsActivity,
  saveActivityCurvePoints,
  upsertActivityMetrics,
} from "@/lib/db";
import {
  getActivityStreamsJson,
  listBestEffortCounts,
  saveActivityDetail,
  saveActivityStreams,
  upsertActivityBestEfforts,
} from "@/features/activities/server/enrichment-store";
import { bestEffortRows, type StravaBestEffort } from "@/lib/best-efforts";
import {
  computeStreamMetrics,
  curvePoints,
  fullResMetricsVersion,
  hasAnyMetric,
} from "@/lib/stream-metrics";
import { FULL_RESOLUTION, normalizeStreams, type ActivityStreams } from "@/lib/streams";
import { logger } from "@/lib/telemetry";
import type { Activity, StravaGear } from "@/lib/types";
import type { OwnerContext } from "@/lib/owner-context";
import { getStravaAccessToken, isStravaConnected } from "./connection";
import {
  stravaProvider,
  type ProviderStreams,
  type StravaActivityDetail,
  type StravaProvider,
} from "./provider";

export type { StravaActivityDetail, StravaBestEffort };
export type { StravaLap, StravaSplit } from "./provider";

export function parseActivityDetail(json: string | null): StravaActivityDetail | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as StravaActivityDetail) : null;
  } catch (error) {
    logger.error("strava.enrichment.parseActivityDetail", { error });
    return null;
  }
}

async function cacheBestEfforts(
  owner: OwnerContext,
  activityId: number,
  detail: StravaActivityDetail | null
): Promise<void> {
  const rows = bestEffortRows(detail?.best_efforts);
  if (rows.length === 0) return;
  try {
    const [stored] = await listBestEffortCounts(owner, activityId);
    if ((stored?.n ?? 0) < rows.length) await upsertActivityBestEfforts(owner, activityId, rows);
  } catch (error) {
    logger.error("strava.enrichment.cacheBestEfforts", { error, activityId });
  }
}

export async function loadActivityDetail(
  owner: OwnerContext,
  activity: Pick<Activity, "id" | "strava_id" | "detail_json">,
  provider: StravaProvider = stravaProvider
): Promise<StravaActivityDetail | null> {
  if (activity.detail_json) {
    const cached = parseActivityDetail(activity.detail_json);
    await cacheBestEfforts(owner, activity.id, cached);
    return cached;
  }
  if (!activity.strava_id || !(await isStravaConnected(owner))) return null;
  try {
    const detail = await provider.getActivityDetail({
      accessToken: await getStravaAccessToken(owner, provider),
      activityId: activity.strava_id,
    });
    await saveActivityDetail(owner, activity.id, JSON.stringify(detail));
    await cacheBestEfforts(owner, activity.id, detail);
    return detail;
  } catch (error) {
    logger.error("strava.enrichment.detail", { error, activityId: activity.id });
    return null;
  }
}

async function cacheStreamMetrics(
  owner: OwnerContext,
  activityId: number,
  raw: ProviderStreams
): Promise<void> {
  try {
    const streams = normalizeStreams(raw, FULL_RESOLUTION);
    if (!streams) return;
    const activity = await getMetricsActivity(owner, activityId);
    if (!activity) return;
    const metrics = computeStreamMetrics({ streams, activity }, await getAthleteThresholds(owner));
    if (hasAnyMetric(metrics))
      await upsertActivityMetrics(owner, activityId, metrics, fullResMetricsVersion(streams));
    await saveActivityCurvePoints(owner, activityId, curvePoints(streams, activity), {
      overwrite: true,
    });
  } catch (error) {
    logger.error("strava.enrichment.cacheStreamMetrics", { error, activityId });
  }
}

export async function loadActivityStreams(
  owner: OwnerContext,
  activity: Pick<Activity, "id" | "strava_id">,
  provider: StravaProvider = stravaProvider
): Promise<ActivityStreams | null> {
  const cached = await getActivityStreamsJson(owner, activity.id);
  if (cached) return JSON.parse(cached) as ActivityStreams | null;
  if (!activity.strava_id || !(await isStravaConnected(owner))) return null;
  try {
    const raw = await provider.getActivityStreams({
      accessToken: await getStravaAccessToken(owner, provider),
      activityId: activity.strava_id,
    });
    await cacheStreamMetrics(owner, activity.id, raw);
    const streams = normalizeStreams(raw);
    await saveActivityStreams(owner, activity.id, JSON.stringify(streams));
    return streams;
  } catch (error) {
    logger.error("strava.enrichment.streams", { error, activityId: activity.id });
    return null;
  }
}

export async function loadStravaGear(
  owner: OwnerContext,
  provider: StravaProvider = stravaProvider
): Promise<{ shoes: StravaGear[]; bikes: StravaGear[] } | null> {
  if (!(await isStravaConnected(owner))) return null;
  try {
    return await provider.getAthleteGear({
      accessToken: await getStravaAccessToken(owner, provider),
    });
  } catch (error) {
    logger.error("strava.enrichment.gear", { error });
    return null;
  }
}

export async function loadStravaShoes(owner: OwnerContext): Promise<StravaGear[] | null> {
  return (await loadStravaGear(owner))?.shoes ?? null;
}

export async function loadStravaBikes(owner: OwnerContext): Promise<StravaGear[] | null> {
  return (await loadStravaGear(owner))?.bikes ?? null;
}
