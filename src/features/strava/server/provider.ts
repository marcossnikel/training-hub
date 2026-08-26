import { logger } from "@/lib/telemetry";
import type { StravaGear } from "@/lib/types";

const TOKEN_URL = "https://www.strava.com/oauth/token";
const API_BASE = "https://www.strava.com/api/v3";
const DEAUTHORIZE_URL = "https://www.strava.com/oauth/deauthorize";
const TEST_PROVIDER_ORIGIN_ENV = "TRAINING_HUB_STRAVA_TEST_PROVIDER_ORIGIN";
const E2E_TEST_ENV = "TRAINING_HUB_E2E";
const REQUEST_TIMEOUT_MS = 15_000;
const RATE_LIMIT_MAX_RETRIES = 2;
const RATE_LIMIT_DEFAULT_BACKOFF_S = 5;
const RATE_LIMIT_MAX_BACKOFF_S = 30;

export interface ProviderCredentials {
  clientId: string;
  clientSecret: string;
}

export interface ProviderTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  grantedScope: string | null;
  athleteId: number | null;
  athleteName: string | null;
  /** Untrusted provider text; persistence validates/canonicalizes it server-side. */
  athleteTimezone: string | null;
}

export interface ProviderActivity {
  id: number | null;
  name: string | null;
  sportType: string | null;
  startedAt: string | null;
  startedAtLocal: string | null;
  distanceM: number | null;
  movingTimeS: number | null;
  averageHeartRate: number | null;
  elevationGainM: number | null;
  gearId: string | null;
}

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
  average_cadence?: number;
  start_date?: string;
}

export interface StravaSplit {
  split?: number;
  distance?: number;
  moving_time?: number;
  elapsed_time?: number;
  average_speed?: number;
  average_grade_adjusted_speed?: number;
  average_heartrate?: number;
  elevation_difference?: number;
}

export interface StravaActivityDetail {
  id?: number;
  description?: string | null;
  calories?: number;
  device_name?: string;
  max_heartrate?: number;
  laps?: StravaLap[];
  splits_metric?: StravaSplit[];
  best_efforts?: import("@/lib/best-efforts").StravaBestEffort[];
}

export type ProviderStreams = Record<string, { data: number[] }>;

export interface StravaRequestEvent {
  kind: "token" | "api";
  path: string;
  status: number | null;
}

export interface StravaProvider {
  exchangeAuthorizationCode(input: {
    credentials: ProviderCredentials;
    code: string;
  }): Promise<ProviderTokens>;
  refreshAccessToken(input: {
    credentials: ProviderCredentials;
    refreshToken: string;
  }): Promise<ProviderTokens>;
  deauthorize(input: { accessToken: string }): Promise<boolean>;
  listActivities(input: {
    accessToken: string;
    page: number;
    perPage: number;
    afterEpoch?: number;
  }): Promise<ProviderActivity[]>;
  getActivityDetail(input: {
    accessToken: string;
    activityId: number;
  }): Promise<StravaActivityDetail>;
  getActivityStreams(input: { accessToken: string; activityId: number }): Promise<ProviderStreams>;
  getAthleteGear(input: {
    accessToken: string;
  }): Promise<{ shoes: StravaGear[]; bikes: StravaGear[] }>;
}

interface ProviderDependencies {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  onRequest?: (event: StravaRequestEvent) => void;
}

function hasAsciiControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}

function isTokenString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 4096 &&
    !hasAsciiControlCharacter(value)
  );
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function testProviderOrigin(): string | null {
  if (process.env.NODE_ENV === "production" || process.env[E2E_TEST_ENV] !== "1") return null;
  const value = process.env[TEST_PROVIDER_ORIGIN_ENV];
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

function parseRetryAfterMs(header: string | null): number {
  const seconds = header !== null ? Number(header) : Number.NaN;
  return (
    Math.min(
      Number.isFinite(seconds) && seconds > 0 ? seconds : RATE_LIMIT_DEFAULT_BACKOFF_S,
      RATE_LIMIT_MAX_BACKOFF_S
    ) * 1000
  );
}

function mapTokens(value: unknown): ProviderTokens {
  if (!value || typeof value !== "object") throw new Error("Invalid Strava token response.");
  const token = value as Record<string, unknown>;
  if (
    !isTokenString(token.access_token) ||
    !isTokenString(token.refresh_token) ||
    !Number.isSafeInteger(token.expires_at) ||
    Number(token.expires_at) <= 0
  ) {
    throw new Error("Invalid Strava token response.");
  }
  const athlete = token.athlete;
  const athleteId =
    athlete &&
    typeof athlete === "object" &&
    Number.isSafeInteger((athlete as Record<string, unknown>).id) &&
    Number((athlete as Record<string, unknown>).id) > 0
      ? Number((athlete as Record<string, unknown>).id)
      : null;
  const athleteName =
    athlete && typeof athlete === "object"
      ? [
          stringOrNull((athlete as Record<string, unknown>).firstname),
          stringOrNull((athlete as Record<string, unknown>).lastname),
        ]
          .filter(Boolean)
          .join(" ") || null
      : null;
  const athleteTimezone =
    athlete && typeof athlete === "object"
      ? stringOrNull((athlete as Record<string, unknown>).timezone)
      : null;
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Number(token.expires_at),
    grantedScope: isTokenString(token.scope) ? token.scope : null,
    athleteId,
    athleteName,
    athleteTimezone,
  };
}

function mapActivity(value: unknown): ProviderActivity {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    id: Number.isSafeInteger(raw.id) && Number(raw.id) > 0 ? Number(raw.id) : null,
    name: stringOrNull(raw.name),
    sportType: stringOrNull(raw.sport_type) ?? stringOrNull(raw.type),
    startedAt: stringOrNull(raw.start_date),
    startedAtLocal: stringOrNull(raw.start_date_local),
    distanceM: numberOrNull(raw.distance),
    movingTimeS: numberOrNull(raw.moving_time),
    averageHeartRate: numberOrNull(raw.average_heartrate),
    elevationGainM: numberOrNull(raw.total_elevation_gain),
    gearId: stringOrNull(raw.gear_id),
  };
}

function mapGear(value: unknown): StravaGear[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Record<string, unknown>;
    return typeof raw.id === "string" && typeof raw.name === "string"
      ? [
          {
            id: raw.id,
            name: raw.name,
            distance: numberOrNull(raw.distance),
            retired: typeof raw.retired === "boolean" ? raw.retired : null,
          },
        ]
      : [];
  });
}

export function createStravaProvider(dependencies: ProviderDependencies = {}): StravaProvider {
  const fetcher =
    dependencies.fetch ??
    ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
      fetch(input, init));
  const sleep =
    dependencies.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const notify = (event: StravaRequestEvent) => {
    try {
      dependencies.onRequest?.(event);
    } catch (error) {
      logger.error("strava.provider.requestObserver", { error });
    }
  };
  const origin = () => testProviderOrigin();
  const apiUrl = (path: string) => `${origin() ? `${origin()}/api/v3` : API_BASE}${path}`;
  const tokenUrl = () => `${origin() ?? "https://www.strava.com"}/oauth/token`;
  const deauthorizeUrl = () => `${origin() ?? "https://www.strava.com"}/oauth/deauthorize`;

  async function token(
    credentials: ProviderCredentials,
    params: Record<string, string>
  ): Promise<ProviderTokens> {
    let response: Response;
    try {
      response = await fetcher(tokenUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: credentials.clientId,
          client_secret: credentials.clientSecret,
          ...params,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      notify({ kind: "token", path: "/oauth/token", status: null });
      throw error;
    }
    notify({ kind: "token", path: "/oauth/token", status: response.status });
    if (!response.ok) throw new Error(`Strava token request failed (${response.status}).`);
    try {
      return mapTokens(await response.json());
    } catch {
      throw new Error("Invalid Strava token response.");
    }
  }

  async function get<T>(
    accessToken: string,
    path: string,
    params?: Record<string, string>
  ): Promise<T> {
    const url = new URL(apiUrl(path));
    for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await fetcher(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (error) {
        notify({ kind: "api", path, status: null });
        throw error;
      }
      notify({ kind: "api", path, status: response.status });
      if (response.ok) return (await response.json()) as T;
      if (response.status === 401)
        throw new Error("Strava rejected the token. Reconnect from Settings.");
      if (response.status === 429 && attempt < RATE_LIMIT_MAX_RETRIES) {
        const waitMs = parseRetryAfterMs(response.headers.get("Retry-After"));
        logger.warn("strava.provider.rateLimited", { path, attempt: attempt + 1, waitMs });
        await sleep(waitMs);
        continue;
      }
      if (response.status === 429)
        throw new Error("Strava rate limit reached. Try again in a few minutes.");
      throw new Error(`Strava API error (${response.status}).`);
    }
  }

  return {
    exchangeAuthorizationCode: ({ credentials, code }) =>
      token(credentials, { grant_type: "authorization_code", code }),
    refreshAccessToken: ({ credentials, refreshToken }) =>
      token(credentials, { grant_type: "refresh_token", refresh_token: refreshToken }),
    async deauthorize({ accessToken }) {
      try {
        const response = await fetcher(deauthorizeUrl(), {
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
    },
    async listActivities({ accessToken, page, perPage, afterEpoch }) {
      const raw = await get<unknown>(accessToken, "/athlete/activities", {
        per_page: String(perPage),
        page: String(page),
        ...(afterEpoch ? { after: String(afterEpoch) } : {}),
      });
      if (!Array.isArray(raw)) throw new Error("Strava API returned an invalid activity page.");
      return raw.map(mapActivity);
    },
    getActivityDetail: ({ accessToken, activityId }) =>
      get<StravaActivityDetail>(accessToken, `/activities/${activityId}`),
    async getActivityStreams({ accessToken, activityId }) {
      const raw = await get<unknown>(accessToken, `/activities/${activityId}/streams`, {
        keys: "time,distance,heartrate,velocity_smooth,watts,cadence,altitude,grade_smooth",
        key_by_type: "true",
      });
      if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw new Error("Strava API returned invalid activity streams.");
      return raw as ProviderStreams;
    },
    async getAthleteGear({ accessToken }) {
      const raw = await get<unknown>(accessToken, "/athlete");
      const athlete = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
      return { shoes: mapGear(athlete.shoes), bikes: mapGear(athlete.bikes) };
    },
  };
}

export const stravaProvider = createStravaProvider();
