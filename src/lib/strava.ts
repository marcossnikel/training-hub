import {
  activityExistsByStravaId,
  countPending,
  findBikeIdByGear,
  findShoeIdByGear,
  getActivityStreamsJson,
  getMeta,
  getAthleteThresholds,
  getMetricsActivity,
  getStravaAuth,
  getStravaConnection,
  getStravaSyncState,
  insertSyncedActivity,
  latestSyncedStartEpoch,
  listBestEffortCounts,
  saveActivityCurvePoints,
  saveActivityDetail,
  saveActivityStreams,
  saveStravaAuth,
  markStravaConnectionRecoverable,
  setMeta,
  markInitialStravaSyncComplete,
  upsertActivityBestEfforts,
  upsertActivityMetrics,
} from "./db";
import { bestEffortRows, type StravaBestEffort } from "./best-efforts";
import { isRideSport } from "./cycling";
import { logger } from "./telemetry";
import {
  computeStreamMetrics,
  curvePoints,
  fullResMetricsVersion,
  hasAnyMetric,
} from "./stream-metrics";
import { FULL_RESOLUTION, normalizeStreams, type ActivityStreams } from "./streams";
import type { Activity } from "./types";
import { round2 } from "./format";
import { isRunSport } from "./validate";
import type { SplitInput, StravaGear } from "./types";
import type { OwnerContext } from "./owner-context";
import { classifyInitialImportStart } from "../features/strava/initial-import";

const TOKEN_URL = "https://www.strava.com/oauth/token";
const API_BASE = "https://www.strava.com/api/v3";
const DEAUTHORIZE_URL = "https://www.strava.com/oauth/deauthorize";
const TEST_PROVIDER_ORIGIN_ENV = "TRAINING_HUB_STRAVA_TEST_PROVIDER_ORIGIN";
const E2E_TEST_ENV = "TRAINING_HUB_E2E";

// Every outbound Strava request is bounded by this timeout so a hung socket can
// never stall a sync (or a token refresh) indefinitely.
const REQUEST_TIMEOUT_MS = 15_000;

// 429 backoff (G7.2): a single rate-limit response used to abort the whole sync.
// Instead, honor Retry-After and retry a small, bounded number of times.
const RATE_LIMIT_MAX_RETRIES = 2; // initial attempt + 2 retries = 3 tries max
const RATE_LIMIT_DEFAULT_BACKOFF_S = 5; // used when Retry-After is absent/unparseable
const RATE_LIMIT_MAX_BACKOFF_S = 30; // cap so we never sleep unreasonably long

function hasAsciiControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}

/**
 * E2E may use a disposable loopback Strava double. The explicit test switch
 * and origin are both ignored in production; the origin must also be loopback,
 * so a deployed server cannot redirect to an arbitrary provider.
 */
function testProviderOrigin(): string | null {
  if (process.env.NODE_ENV === "production" || process.env[E2E_TEST_ENV] !== "1") return null;
  const value = process.env[TEST_PROVIDER_ORIGIN_ENV];
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function tokenUrl(): string {
  return testProviderOrigin() ? `${testProviderOrigin()}/oauth/token` : TOKEN_URL;
}

function apiBase(): string {
  return testProviderOrigin() ? `${testProviderOrigin()}/api/v3` : API_BASE;
}

function deauthorizeUrl(): string {
  return testProviderOrigin() ? `${testProviderOrigin()}/oauth/deauthorize` : DEAUTHORIZE_URL;
}

/**
 * Backoff sleep seam. Kept behind an object so tests can replace it with an
 * instant stub (`vi.spyOn(backoff, "sleep")`) and exercise the retry path with
 * zero wall-clock delay. Production always uses the real setTimeout wait.
 */
export const backoff = {
  sleep: (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** One HTTP request this module actually sent to Strava. */
export interface StravaRequestEvent {
  /** "token" is the OAuth POST (code exchange or refresh); "api" is an API read. */
  kind: "token" | "api";
  /** Path requested, for logs. */
  path: string;
  /** HTTP status, or null when no response came back at all (network, timeout). */
  status: number | null;
}

let requestObserver: ((event: StravaRequestEvent) => void) | null = null;

/**
 * Registers an observer notified of EVERY request that leaves this module: the
 * token refresh POST and each 429 retry included, which is exactly what a caller
 * counting its own `apiGet` calls cannot see. `scripts/fetch-history.ts` needs
 * both — it books its rate budget against what actually went out, and it reads
 * the statuses to tell a transport failure (no response, 401, 429, 5xx) from an
 * activity that simply has nothing to fetch (404, or a 200 carrying nothing).
 *
 * Pass null to stop observing. Off by default, so the app pays nothing for it.
 */
export function observeStravaRequests(
  observer: ((event: StravaRequestEvent) => void) | null
): void {
  requestObserver = observer;
}

/** Never let an observer's failure break the request path it is watching. */
function notifyRequest(event: StravaRequestEvent): void {
  if (!requestObserver) return;
  try {
    requestObserver(event);
  } catch (error) {
    logger.error("strava.requestObserver", { error });
  }
}

/**
 * Retry-After is delta-seconds. Fall back to a sensible default when it is
 * missing or unparseable, and cap it so a hostile/huge value can't wedge us.
 */
function parseRetryAfterMs(header: string | null): number {
  const seconds = header !== null ? Number(header) : NaN;
  const capped = Math.min(
    Number.isFinite(seconds) && seconds > 0 ? seconds : RATE_LIMIT_DEFAULT_BACKOFF_S,
    RATE_LIMIT_MAX_BACKOFF_S
  );
  return capped * 1000;
}

export async function isStravaConnected(owner: OwnerContext): Promise<boolean> {
  return (await getStravaAuth(owner)) !== null;
}

/**
 * Makes the provider-side deauthorization request with a server-only current
 * owner token. It intentionally reads neither a response body nor any provider
 * detail: the lifecycle caller only needs a boolean and must still perform its
 * mandatory local deletion if this request fails or times out.
 */
export async function deauthorizeStravaAccessToken(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch(deauthorizeUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ access_token: accessToken }),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** True when connected and the last sync is more than an hour old (or never ran). */
export async function shouldAutoSync(owner: OwnerContext): Promise<boolean> {
  if (!(await isStravaConnected(owner))) return false;
  const lastSync = await getMeta(owner, "last_sync_at");
  return !lastSync || Date.now() - Date.parse(lastSync) > 60 * 60 * 1000;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope?: string;
  athlete?: { id: number; firstname?: string; lastname?: string };
}

interface TokenCredentials {
  client_id: string;
  client_secret: string;
}

function isTokenString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 4096 &&
    !hasAsciiControlCharacter(value)
  );
}

function parseTokenResponse(value: unknown): TokenResponse {
  if (!value || typeof value !== "object") throw new Error("Invalid Strava token response.");
  const token = value as Record<string, unknown>;
  const athlete = token.athlete;
  const expiresAt = token.expires_at;
  if (
    !isTokenString(token.access_token) ||
    !isTokenString(token.refresh_token) ||
    typeof expiresAt !== "number" ||
    !Number.isInteger(expiresAt) ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= 0
  ) {
    throw new Error("Invalid Strava token response.");
  }
  const parsed: TokenResponse = {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: expiresAt,
  };
  if (isTokenString(token.scope)) parsed.scope = token.scope;
  if (
    athlete &&
    typeof athlete === "object" &&
    Number.isSafeInteger((athlete as Record<string, unknown>).id) &&
    Number((athlete as Record<string, unknown>).id) > 0
  ) {
    parsed.athlete = {
      id: Number((athlete as Record<string, unknown>).id),
      ...(typeof (athlete as Record<string, unknown>).firstname === "string"
        ? { firstname: (athlete as Record<string, unknown>).firstname as string }
        : {}),
      ...(typeof (athlete as Record<string, unknown>).lastname === "string"
        ? { lastname: (athlete as Record<string, unknown>).lastname as string }
        : {}),
    };
  }
  return parsed;
}

async function requestToken(
  credentials: TokenCredentials,
  params: Record<string, string>
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: credentials.client_id,
    client_secret: credentials.client_secret,
    ...params,
  });
  let res: Response;
  try {
    res = await fetch(tokenUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
      // Mirror apiGet: bound the token refresh so a hung request surfaces as an
      // error/log instead of hanging the caller indefinitely.
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    notifyRequest({ kind: "token", path: "/oauth/token", status: null });
    throw error;
  }
  notifyRequest({ kind: "token", path: "/oauth/token", status: res.status });
  if (!res.ok) {
    // Provider bodies can contain arbitrary detail. Do not read, log, or expose
    // them; the status is enough for bounded diagnostics and the caller returns
    // one generic recovery outcome.
    throw new Error(`Strava token request failed (${res.status}).`);
  }
  try {
    return parseTokenResponse(await res.json());
  } catch {
    throw new Error("Invalid Strava token response.");
  }
}

/** Exchanges only caller-supplied encrypted BYO credentials; no global fallback exists. */
export async function exchangeByoCode(
  credentials: TokenCredentials,
  code: string
): Promise<TokenResponse> {
  return requestToken(credentials, { grant_type: "authorization_code", code });
}

/** Returns a valid access token, refreshing it first when close to expiry. */
async function getAccessToken(owner: OwnerContext): Promise<string> {
  const connection = await getStravaConnection(owner);
  if (!connection) throw new Error("Strava is not connected.");
  const now = Math.floor(Date.now() / 1000);
  if (connection.expires_at > now + 120) return connection.access_token;
  try {
    const token = await requestToken(connection, {
      grant_type: "refresh_token",
      refresh_token: connection.refresh_token,
    });
    if (!(await saveStravaAuth(owner, token))) throw new Error("Strava connection changed.");
    return token.access_token;
  } catch (error) {
    await markStravaConnectionRecoverable(owner);
    throw error;
  }
}

export async function apiGet<T>(
  owner: OwnerContext,
  pathname: string,
  params?: Record<string, string>
): Promise<T> {
  const token = await getAccessToken(owner);
  const url = new URL(`${apiBase()}${pathname}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }

  // Bounded retry on 429: honor Retry-After, sleep (capped), and try again a
  // small number of times so one rate-limit response no longer aborts a whole
  // (up to ~50-page) sync. Never loops unbounded.
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      notifyRequest({ kind: "api", path: pathname, status: null });
      throw error;
    }
    notifyRequest({ kind: "api", path: pathname, status: res.status });
    if (res.ok) return (await res.json()) as T;
    if (res.status === 401) throw new Error("Strava rejected the token. Reconnect from Settings.");
    if (res.status === 429 && attempt < RATE_LIMIT_MAX_RETRIES) {
      const waitMs = parseRetryAfterMs(res.headers.get("Retry-After"));
      logger.warn("strava.apiGet.rateLimited", {
        pathname,
        attempt: attempt + 1,
        waitMs,
      });
      await backoff.sleep(waitMs);
      continue;
    }
    if (res.status === 429)
      throw new Error("Strava rate limit reached. Try again in a few minutes.");
    throw new Error(`Strava API error (${res.status}).`);
  }
}

// ---------------------------------------------------------------------------
// Gear (shoes + bikes)
// ---------------------------------------------------------------------------

type RawGear = { id: string; name: string; distance?: number; retired?: boolean };
interface StravaAthlete {
  shoes?: RawGear[];
  bikes?: RawGear[];
}

function mapGear(list: RawGear[] | undefined): StravaGear[] {
  return (list ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    distance: g.distance ?? null,
    retired: g.retired ?? null,
  }));
}

export async function fetchAthleteGear(
  owner: OwnerContext
): Promise<{ shoes: StravaGear[]; bikes: StravaGear[] }> {
  const athlete = await apiGet<StravaAthlete>(owner, "/athlete");
  return { shoes: mapGear(athlete.shoes), bikes: mapGear(athlete.bikes) };
}

/** Shoe gear list for dropdowns; null when not connected or the request fails. */
export async function tryFetchGear(owner: OwnerContext): Promise<StravaGear[] | null> {
  if (!(await isStravaConnected(owner))) return null;
  try {
    return (await fetchAthleteGear(owner)).shoes;
  } catch (error) {
    logger.error("strava.tryFetchGear", { error });
    return null;
  }
}

/** Bike gear list for dropdowns; null when not connected or the request fails. */
export async function tryFetchBikes(owner: OwnerContext): Promise<StravaGear[] | null> {
  if (!(await isStravaConnected(owner))) return null;
  try {
    return (await fetchAthleteGear(owner)).bikes;
  } catch (error) {
    logger.error("strava.tryFetchBikes", { error });
    return null;
  }
}

/** Both gear lists in one athlete call; null when not connected or it fails. */
export async function tryFetchAllGear(owner: OwnerContext): Promise<{
  shoes: StravaGear[];
  bikes: StravaGear[];
} | null> {
  if (!(await isStravaConnected(owner))) return null;
  try {
    return await fetchAthleteGear(owner);
  } catch (error) {
    logger.error("strava.tryFetchAllGear", { error });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Activity detail (laps + km splits), fetched lazily and cached forever
// ---------------------------------------------------------------------------

export interface StravaLap {
  lap_index?: number;
  name?: string;
  distance?: number;
  moving_time?: number;
  elapsed_time?: number;
  average_speed?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  total_elevation_gain?: number;
  average_watts?: number;
  /** One-leg rpm for runs, crank rpm for rides. */
  average_cadence?: number;
  /** UTC ISO instant the lap started, used to place laps on a stream's clock. */
  start_date?: string;
}

export interface StravaSplit {
  split?: number;
  distance?: number;
  moving_time?: number;
  elapsed_time?: number;
  average_speed?: number;
  /** Strava's own grade-adjusted speed, m/s. Present on outdoor-run splits only. */
  average_grade_adjusted_speed?: number;
  average_heartrate?: number;
  elevation_difference?: number;
}

// The best-effort payload shape is defined beside the pure transform that stores
// it (src/lib/best-efforts.ts) and re-exported here, so it stays part of the Strava
// payload surface for callers while this module keeps its one-way dependency on the
// pure layer.
export type { StravaBestEffort };

export interface StravaActivityDetail {
  id?: number;
  description?: string | null;
  calories?: number;
  device_name?: string;
  max_heartrate?: number;
  laps?: StravaLap[];
  splits_metric?: StravaSplit[];
  /** Runs only; absent for rides and manual activities. */
  best_efforts?: StravaBestEffort[];
}

export function parseActivityDetail(json: string | null): StravaActivityDetail | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as StravaActivityDetail;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    logger.error("strava.parseActivityDetail", { error });
    return null;
  }
}

/**
 * Mirrors a detail payload's best efforts into `activity_best_efforts` so the rows
 * accumulate organically as activities are viewed, without waiting for a backfill.
 * A no-op for anything Strava reports no efforts for (every non-run). Persisting is
 * a side effect of viewing, so a failure is logged and swallowed rather than taking
 * the activity page down with it.
 *
 * Already-stored activities are skipped on a single indexed count read, so the
 * common case (every re-view of an already-mirrored activity) costs one cheap SELECT
 * instead of a multi-statement write transaction the render would block on. Same
 * heuristic the backfill resumes on: `detail_json` is an immutable cache, so a
 * matching stored count means this activity is done.
 */
async function cacheBestEfforts(
  owner: OwnerContext,
  activityId: number,
  detail: StravaActivityDetail | null
): Promise<void> {
  const rows = bestEffortRows(detail?.best_efforts);
  if (rows.length === 0) return;
  try {
    const [stored] = await listBestEffortCounts(owner, activityId);
    if ((stored?.n ?? 0) >= rows.length) return;
    await upsertActivityBestEfforts(owner, activityId, rows);
  } catch (error) {
    logger.error("strava.cacheBestEfforts", { error, activityId });
  }
}

/**
 * Returns the cached Strava detail for an activity, fetching and caching it on
 * first view. One API call per activity ever, so the read rate limit is never
 * an issue. Returns null for manual activities, when disconnected, or when the
 * fetch fails (the page then simply omits the detail sections).
 *
 * Either way — freshly fetched or already cached — the payload's best efforts are
 * mirrored into `activity_best_efforts` on the way out, once per activity.
 */
export async function ensureActivityDetail(
  owner: OwnerContext,
  activity: Pick<Activity, "id" | "strava_id" | "detail_json">
): Promise<StravaActivityDetail | null> {
  if (activity.detail_json) {
    const cached = parseActivityDetail(activity.detail_json);
    await cacheBestEfforts(owner, activity.id, cached);
    return cached;
  }
  if (!activity.strava_id) return null;
  if (!(await isStravaConnected(owner))) return null;
  try {
    const detail = await apiGet<StravaActivityDetail>(owner, `/activities/${activity.strava_id}`);
    await saveActivityDetail(owner, activity.id, JSON.stringify(detail));
    await cacheBestEfforts(owner, activity.id, detail);
    return detail;
  } catch (error) {
    logger.error("strava.ensureActivityDetail", { error, activityId: activity.id });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Per-second streams (heartrate, pace, power, etc.), fetched lazily and cached
// ---------------------------------------------------------------------------

/**
 * Derives and stores everything an activity's stream is worth keeping, from the
 * payload Strava just returned at the resolution it was recorded at: the derived
 * metrics (stamped with the version the payload earned — `fullResMetricsVersion`:
 * 3 with real grade, 2 without) and the mean-max curve points.
 *
 * This is the ONLY moment full resolution exists — the fetch stores a 400-point
 * downsample and `ensureActivityStreams` never re-fetches over its own cache — so
 * both are computed here or not at all. Called from the FETCH branch only: a
 * cached read returns before it, so viewing an activity whose stream is already
 * stored still issues no write.
 *
 * The two writes are independent: an activity with nothing computable (no heart
 * rate, no pace, no power) still gets its curve points, and a failed metrics
 * write must not swallow them. Nothing here may take the stream cache down with
 * it — a failed metric is a missing tile, a failed cache write is another API
 * call — so every error is logged and swallowed.
 */
async function cacheStreamMetrics(
  owner: OwnerContext,
  activityId: number,
  raw: Record<string, { data: number[] }>
): Promise<void> {
  try {
    const streams = normalizeStreams(raw, FULL_RESOLUTION);
    if (!streams) return;
    const activity = await getMetricsActivity(owner, activityId);
    if (!activity) return;
    const metrics = computeStreamMetrics({ streams, activity }, await getAthleteThresholds(owner));
    if (hasAnyMetric(metrics)) {
      await upsertActivityMetrics(owner, activityId, metrics, fullResMetricsVersion(streams));
    }
    // Overwriting: the stream scan takes precedence over anything the
    // best-effort seed may already have put in these buckets, whichever ran
    // first (see `saveActivityCurvePoints`). Pinned in strava.test.ts — flipped,
    // a seeded bucket would silently outlive the measurement of it.
    await saveActivityCurvePoints(owner, activityId, curvePoints(streams, activity), {
      overwrite: true,
    });
  } catch (error) {
    logger.error("strava.cacheStreamMetrics", { error, activityId });
  }
}

/**
 * Returns the cached, normalized streams for an activity, fetching and caching
 * them on first view. Mirrors ensureActivityDetail: one API call per activity
 * ever. Returns null for manual activities, when disconnected, or when the fetch
 * fails.
 *
 * When a successful fetch yields no usable stream, a negative marker (the JSON
 * literal `null`) is cached so the activity is not re-fetched on every view
 * (G7.4). That marker parses straight back to `null`, so the return contract is
 * unchanged: callers that got `null` before still get `null`. A fetch *failure*
 * is never cached — only a confirmed "checked, none" result is.
 */
export async function ensureActivityStreams(
  owner: OwnerContext,
  activity: Pick<Activity, "id" | "strava_id">
): Promise<ActivityStreams | null> {
  const cached = await getActivityStreamsJson(owner, activity.id);
  if (cached) return JSON.parse(cached) as ActivityStreams | null;
  if (!activity.strava_id) return null;
  if (!(await isStravaConnected(owner))) return null;
  try {
    const raw = await apiGet<Record<string, { data: number[] }>>(
      owner,
      `/activities/${activity.strava_id}/streams`,
      {
        keys: "time,distance,heartrate,velocity_smooth,watts,cadence,altitude,grade_smooth",
        key_by_type: "true",
      }
    );
    // The payload is worth more than the chart's 400 points, so it is measured
    // before it is downsampled — this is the only moment full resolution exists.
    await cacheStreamMetrics(owner, activity.id, raw);
    const streams = normalizeStreams(raw);
    // Persist even when null: JSON.stringify(null) === "null", a non-empty
    // marker that getActivityStreamsJson returns and the read above parses back
    // to null — so a streamless activity is checked once, not on every view.
    await saveActivityStreams(owner, activity.id, JSON.stringify(streams));
    return streams;
  } catch (error) {
    logger.error("strava.ensureActivityStreams", { error, activityId: activity.id });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Activity sync
// ---------------------------------------------------------------------------

interface StravaActivity {
  id: number;
  name?: string;
  sport_type?: string;
  type?: string;
  start_date?: string;
  // The athlete's local wall-clock, formatted with a trailing Z (a Strava quirk):
  // reading it with UTC getters yields the correct local day/time.
  start_date_local?: string;
  distance?: number;
  moving_time?: number;
  average_heartrate?: number;
  total_elevation_gain?: number;
  gear_id?: string | null;
}

export interface SyncResult {
  imported: number;
  historicalConfirmed: number;
  pendingNew: number;
  pendingTotal: number;
}

/**
 * The first sync deliberately walks all history on every retry. Existing
 * owner+provider IDs make that safe and prevent a page-two failure from
 * permanently skipping older pages. Later syncs use the newest stored epoch.
 */
export async function syncActivities(owner: OwnerContext): Promise<SyncResult> {
  const syncState = await getStravaSyncState(owner);
  if (!syncState) throw new Error("Strava connection sync state is unavailable.");
  const initialSync = syncState.initialSyncCompletedAt === null;
  const afterEpoch = initialSync ? null : await latestSyncedStartEpoch(owner);

  let imported = 0;
  let historicalConfirmed = 0;
  let pendingNew = 0;
  const perPage = 100;

  // A terminal short/empty page is the completion fact. If a broken provider
  // repeats full pages forever, leave the lifecycle incomplete rather than
  // falsely enabling incremental cursors and skipping old history.
  for (let page = 1; page <= 1_000; page++) {
    const params: Record<string, string> = {
      per_page: String(perPage),
      page: String(page),
    };
    if (afterEpoch) params.after = String(afterEpoch);

    const batch = await apiGet<StravaActivity[]>(owner, "/athlete/activities", params);
    if (batch.length === 0) break;

    for (const activity of batch) {
      if (!activity.id) {
        logger.warn("strava.sync.skipInvalidActivity", {
          ownerId: owner.userId,
          reason: "missing_id",
        });
        continue;
      }
      const classification = classifyInitialImportStart(activity.start_date, syncState.reviewAfter);
      if (classification === "invalid") {
        logger.warn("strava.sync.skipInvalidActivity", {
          ownerId: owner.userId,
          reason: "invalid_start",
        });
        continue;
      }
      if (await activityExistsByStravaId(owner, activity.id)) continue;

      const distanceKm = activity.distance ? round2(activity.distance / 1000) : 0;
      const movingS = activity.moving_time ?? null;
      const pace =
        activity.distance && activity.distance > 0 && movingS
          ? Math.round(movingS / (activity.distance / 1000))
          : null;
      const sport = activity.sport_type ?? activity.type ?? null;
      let status: "confirmed" | "pending_review";
      let splits: SplitInput[] = [];
      let bikeId: number | null = null;
      if (classification === "confirmed") {
        // History only: visible in the log, zero gear mileage.
        status = "confirmed";
        historicalConfirmed++;
      } else {
        status = "pending_review";
        const matchedGearId = activity.gear_id ?? null;
        if (isRideSport(sport)) {
          bikeId = matchedGearId ? await findBikeIdByGear(owner, matchedGearId) : null;
        } else {
          const matchedShoeId = matchedGearId ? await findShoeIdByGear(owner, matchedGearId) : null;
          if ((isRunSport(sport) || matchedShoeId) && distanceKm > 0) {
            splits = [{ shoe_id: matchedShoeId, km: distanceKm }];
          }
        }
        pendingNew++;
      }

      await insertSyncedActivity(
        owner,
        {
          strava_id: activity.id,
          name: activity.name ?? null,
          sport_type: sport,
          started_at: activity.start_date!,
          started_at_local: activity.start_date_local ?? null,
          distance_km: distanceKm,
          moving_time_s: movingS,
          avg_pace_s_per_km: pace,
          avg_hr: activity.average_heartrate ?? null,
          elevation_gain_m: activity.total_elevation_gain ?? null,
          status,
          raw_json: JSON.stringify(activity),
          bike_id: bikeId,
        },
        splits
      );
      imported++;
    }

    if (batch.length < perPage) break;
    if (page === 1_000) throw new Error("Strava initial history pagination did not terminate.");
  }

  const completedAt = new Date().toISOString();
  if (initialSync) await markInitialStravaSyncComplete(owner, completedAt);
  await setMeta(owner, "last_sync_at", completedAt);
  return { imported, historicalConfirmed, pendingNew, pendingTotal: await countPending(owner) };
}
