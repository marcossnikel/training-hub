/**
 * The first BYO step deliberately knows nothing about process-level Strava
 * credentials. The submitted app belongs to the current owner and the legacy
 * singleton adapter remains isolated until #31 replaces its callback/sync path.
 */
export const STRAVA_BYO_SCOPE = "activity:read_all,profile:read_all";
export const STRAVA_BYO_HANDOFF_PATH = "/api/strava/byo-connect";
export const STRAVA_CALLBACK_PATH = "/api/strava/callback";

const STRAVA_AUTHORIZE_URL = "https://www.strava.com/oauth/authorize";
const CLIENT_ID_MAX_LENGTH = 128;
const CLIENT_SECRET_MAX_LENGTH = 512;
const CONTROL_CHARACTER = /[\u0000-\u001F\u007F]/;
const SAFE_HOST = /^(?:[a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+(?::[0-9]{1,5})?$/;

export interface ByoCredentialInput {
  clientId: string;
  clientSecret: string;
}

export interface ByoCredentialValidation {
  clientId: string;
  clientSecret: string;
  errors: { clientId?: string; clientSecret?: string };
}

function isValidCredential(value: string, maxLength: number): boolean {
  return value.length > 0 && value.length <= maxLength && !CONTROL_CHARACTER.test(value);
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

/**
 * Builds the callback only from the server-observed host/protocol. There is no
 * browser supplied redirect field, query parameter, or state payload to trust.
 */
export function deriveCurrentRequestOrigin(requestHeaders: Headers): string | null {
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const host = forwardedHost ?? requestHeaders.get("host");
  const forwardedProto = requestHeaders.get("x-forwarded-proto");
  const protocol = forwardedProto ?? "http";
  if (!host || !SAFE_HOST.test(host) || (protocol !== "http" && protocol !== "https")) {
    return null;
  }
  return `${protocol}://${host}`;
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
