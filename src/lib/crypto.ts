import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const ENCRYPTION_KEY_ENV = "STRAVA_CONNECTION_ENCRYPTION_KEY";
const ENVELOPE_VERSION = "v1";
const KEY_VERSION = 1;
const IV_BYTES = 12;
const KEY_BYTES = 32;

export type StravaSecretPurpose = "client_secret" | "access_token" | "refresh_token";

/** Deliberately generic so a caller never reflects a token, envelope, or key. */
export class StravaSecretStorageError extends Error {
  constructor() {
    super("Strava connection material is unavailable.");
    this.name = "StravaSecretStorageError";
  }
}

function keyMaterial(): Buffer {
  const encoded = process.env[ENCRYPTION_KEY_ENV];
  if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw new StravaSecretStorageError();
  let key: Buffer;
  try {
    key = Buffer.from(encoded, "base64url");
  } catch {
    throw new StravaSecretStorageError();
  }
  if (key.length !== KEY_BYTES || key.toString("base64url") !== encoded) {
    throw new StravaSecretStorageError();
  }
  return key;
}

function aad(userId: string, purpose: StravaSecretPurpose): Buffer {
  return Buffer.from(
    `training-hub:strava-connection:${ENVELOPE_VERSION}:${KEY_VERSION}:${userId}:${purpose}`
  );
}

/**
 * Encrypts one server-only Strava value with AES-256-GCM. The purpose and
 * owner are authenticated, which rejects a copied field or another owner's
 * envelope before plaintext is returned.
 */
export function encryptStravaSecret(
  userId: string,
  purpose: StravaSecretPurpose,
  plaintext: string
): string {
  try {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", keyMaterial(), iv);
    cipher.setAAD(aad(userId, purpose));
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      ENVELOPE_VERSION,
      iv.toString("base64url"),
      ciphertext.toString("base64url"),
      tag.toString("base64url"),
    ].join(".");
  } catch (error) {
    if (error instanceof StravaSecretStorageError) throw error;
    throw new StravaSecretStorageError();
  }
}

/** Decrypts only a well-formed owner/purpose-bound envelope, otherwise fails closed. */
export function decryptStravaSecret(
  userId: string,
  purpose: StravaSecretPurpose,
  envelope: string
): string {
  try {
    const parts = envelope.split(".");
    if (parts.length !== 4 || parts[0] !== ENVELOPE_VERSION) throw new StravaSecretStorageError();
    const [, ivText, ciphertextText, tagText] = parts;
    if (!ivText || !ciphertextText || !tagText) throw new StravaSecretStorageError();
    const iv = Buffer.from(ivText, "base64url");
    const ciphertext = Buffer.from(ciphertextText, "base64url");
    const tag = Buffer.from(tagText, "base64url");
    if (iv.length !== IV_BYTES || tag.length !== 16 || ciphertext.length === 0) {
      throw new StravaSecretStorageError();
    }
    const decipher = createDecipheriv("aes-256-gcm", keyMaterial(), iv);
    decipher.setAAD(aad(userId, purpose));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch (error) {
    if (error instanceof StravaSecretStorageError) throw error;
    throw new StravaSecretStorageError();
  }
}

/** A keyed, non-reversible lookup value for opaque browser OAuth state. */
export function digestOAuthState(state: string): string {
  try {
    return createHmac("sha256", keyMaterial()).update(state, "utf8").digest("base64url");
  } catch (error) {
    if (error instanceof StravaSecretStorageError) throw error;
    throw new StravaSecretStorageError();
  }
}

export function issueOpaqueOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Constant-time string equality for secrets/tokens (e.g. the OAuth `state`).
 *
 * G11.4 (T3.9): a plain `a === b` on a CSRF token is a minor timing side-channel
 * because it bails at the first differing character. This routes the comparison
 * through node:crypto `timingSafeEqual`, which does not short-circuit.
 *
 * `timingSafeEqual` throws when the two buffers differ in byte length, so the
 * length is guarded up front and a mismatch returns false instead of throwing.
 * (The length check itself is not constant-time, but the OAuth state is a
 * fixed-length token, and revealing only "wrong length" leaks nothing useful.)
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
