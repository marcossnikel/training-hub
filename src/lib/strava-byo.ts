/**
 * The first BYO step deliberately knows nothing about process-level Strava
 * credentials. The submitted app belongs to the current owner; the complete
 * callback, sync, reconnect, and deletion lifecycle stays owner-bound.
 */
export const STRAVA_BYO_SCOPE = "read,activity:read_all,profile:read_all";
const REQUIRED_STRAVA_BYO_SCOPES = new Set(STRAVA_BYO_SCOPE.split(","));
export const STRAVA_BYO_HANDOFF_PATH = "/api/strava/byo-connect";
export const STRAVA_CALLBACK_PATH = "/api/strava/callback";
export const TRAINING_HUB_PUBLIC_ORIGIN_ENV = "TRAINING_HUB_PUBLIC_ORIGIN";

/** The browser may name only a fixed internal continuation, never a URL. */
export function byoHandoffPath(returnKey: "settings" | "onboarding"): string {
  return returnKey === "settings"
    ? STRAVA_BYO_HANDOFF_PATH
    : `${STRAVA_BYO_HANDOFF_PATH}?return=onboarding`;
}

const STRAVA_AUTHORIZE_URL = "https://www.strava.com/oauth/authorize";
const CLIENT_ID_MAX_LENGTH = 128;
const CLIENT_SECRET_MAX_LENGTH = 512;
const DNS_HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/i;

export interface ByoCredentialInput {
  clientId: string;
  clientSecret: string;
}

export interface ByoCredentialValidation {
  clientId: string;
  clientSecret: string;
  errors: { clientId?: string; clientSecret?: string };
}

function hasAsciiControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}

function isValidCredential(value: string, maxLength: number): boolean {
  return value.length > 0 && value.length <= maxLength && !hasAsciiControlCharacter(value);
}

/**
 * The client ID is a displayable identifier, so it is trimmed before storage.
 * The secret is never normalized: changing even harmless-looking whitespace
 * would change its value. It is only checked for an all-whitespace submission.
 */
export function validateByoCredentials(input: ByoCredentialInput): ByoCredentialValidation {
  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret;
  const errors: ByoCredentialValidation["errors"] = {};
  if (!isValidCredential(clientId, CLIENT_ID_MAX_LENGTH)) {
    errors.clientId = "Enter a valid Strava Client ID.";
  }
  if (
    !isValidCredential(clientSecret, CLIENT_SECRET_MAX_LENGTH) ||
    clientSecret.trim().length === 0
  ) {
    errors.clientSecret = "Enter a valid Strava Client Secret.";
  }
  return { clientId, clientSecret, errors };
}

function isLoopbackHost(hostname: string): boolean {
  return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname.toLowerCase());
}

/**
 * The deployed callback origin is a non-secret server configuration value, not
 * a proxy/browser header. Only a canonical HTTPS DNS origin is accepted.
 */
export function parseConfiguredPublicOrigin(value: string | undefined): string | null {
  if (!value || value !== value.trim()) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      isLoopbackHost(url.hostname) ||
      url.hostname.endsWith(".localhost") ||
      !DNS_HOST.test(url.hostname)
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function loopbackOrigin(url: URL): string | null {
  if ((url.protocol !== "http:" && url.protocol !== "https:") || !isLoopbackHost(url.hostname)) {
    return null;
  }
  return url.origin;
}

/**
 * Settings has headers rather than a Route Handler request. It may use only
 * the direct Host header for local loopback development and deliberately
 * ignores forwarded/origin headers. Any deployed host requires the canonical
 * server-configured origin above.
 */
export function resolveSettingsByoOrigin(
  requestHeaders: Headers,
  configuredOrigin = parseConfiguredPublicOrigin(process.env[TRAINING_HUB_PUBLIC_ORIGIN_ENV])
): string | null {
  if (configuredOrigin) return configuredOrigin;
  const host = requestHeaders.get("host");
  if (!host || host.includes(",") || hasAsciiControlCharacter(host) || /[/\\@?#]/.test(host)) {
    return null;
  }
  try {
    const url = new URL(`http://${host}`);
    if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) return null;
    return loopbackOrigin(url);
  } catch {
    return null;
  }
}

/**
 * Route Handlers can inspect the direct request URL. Without a canonical
 * deployed origin they may authorize only localhost/loopback requests, never
 * a forwarded host/proto value supplied by a client or intermediary.
 */
export function resolveAuthorizationByoOrigin(
  requestUrl: URL,
  configuredOrigin = parseConfiguredPublicOrigin(process.env[TRAINING_HUB_PUBLIC_ORIGIN_ENV])
): string | null {
  return configuredOrigin ?? loopbackOrigin(requestUrl);
}

export function callbackUrlForOrigin(origin: string): string {
  const url = new URL(origin);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Invalid callback origin.");
  }
  return new URL(STRAVA_CALLBACK_PATH, url).toString();
}

/** Only the non-secret client ID and opaque browser state leave the server. */
export function buildByoAuthorizeUrl(input: {
  clientId: string;
  origin: string;
  state: string;
}): string {
  const url = new URL(STRAVA_AUTHORIZE_URL);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", callbackUrlForOrigin(input.origin));
  url.searchParams.set("approval_prompt", "auto");
  url.searchParams.set("scope", STRAVA_BYO_SCOPE);
  url.searchParams.set("state", input.state);
  return url.toString();
}

/**
 * Strava may delimit granted scopes with commas, spaces, or both. Persist a
 * single canonical value only when the normalized set is exactly the two
 * approved scopes: missing scopes and expansions both fail closed.
 */
export function normalizeExactByoGrantedScope(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return null;
  const scopes = value.split(/[\s,]+/).filter(Boolean);
  const normalized = new Set(scopes);
  if (
    normalized.size !== REQUIRED_STRAVA_BYO_SCOPES.size ||
    [...normalized].some((scope) => !REQUIRED_STRAVA_BYO_SCOPES.has(scope))
  ) {
    return null;
  }
  return STRAVA_BYO_SCOPE;
}
