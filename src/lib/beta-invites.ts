import crypto from "node:crypto";
import { client } from "./db/client";
import { resolveDatabaseUrl, resolveTursoAuthToken, resolveTursoDatabaseUrl } from "./db/config";
import { ensureMigrated } from "./db/migrations";
import { persistInvitation, revokePersistedInvitation } from "@/features/invites/persistence";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_REGISTRATION_ERROR = "Registration is unavailable.";

export type BetaInvite = {
  email: string;
  token: string;
  expiresAt: string;
};

type InviteEnvironment = Record<string, string | undefined>;

const registrationLocks = new Map<string, Promise<void>>();

/**
 * SQLite's local driver has a single writer. Serializing same-token attempts in
 * one process turns a double-click into the normal generic replay result rather
 * than a transient SQLITE_BUSY error. The database trigger remains the source
 * of truth across processes and instances.
 */
export async function acquireInviteRegistrationLock(tokenHash: string): Promise<() => void> {
  const previous = registrationLocks.get(tokenHash);
  let resolveCurrent: (() => void) | undefined;
  const current = new Promise<void>((resolve) => {
    resolveCurrent = resolve;
  });
  registrationLocks.set(tokenHash, current);
  await previous;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    resolveCurrent?.();
    if (registrationLocks.get(tokenHash) === current) registrationLocks.delete(tokenHash);
  };
}

/**
 * Beta registration is deliberately off until a separately reviewed, isolated
 * environment enables it. When it is off, server-side sign-up is denied rather
 * than falling back to developer self-registration.
 */
export function betaInviteRegistrationEnabled(env: InviteEnvironment = process.env): boolean {
  return env.BETA_INVITE_REGISTRATION_ENABLED === "1";
}

export function genericRegistrationError(): string {
  return GENERIC_REGISTRATION_ERROR;
}

export function normalizeInviteEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return EMAIL_PATTERN.test(normalized) ? normalized : null;
}

export function isOpaqueInviteToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

export function digestInviteToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function remoteDatabaseHost(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "libsql:" || url.protocol === "https:" ? url.hostname : null;
  } catch {
    return null;
  }
}

export function assertBetaInviteSchemaTarget(env: InviteEnvironment = process.env): void {
  const mode = env.TRAINING_HUB_ENV || "local";
  const vercelEnvironment = env.VERCEL_ENV || "";
  const remoteUrl = resolveTursoDatabaseUrl(env);
  const remoteAuthToken = resolveTursoAuthToken(env);
  const resolvedDatabaseUrl = resolveDatabaseUrl(env);
  const remoteHost = remoteDatabaseHost(remoteUrl);

  if (mode === "local" || mode === "e2e") {
    if (!resolvedDatabaseUrl.startsWith("file:") || remoteUrl || remoteAuthToken) {
      throw new Error("Beta invitation schema requires an isolated local/E2E file database.");
    }
    return;
  }

  if (
    mode === "preview" &&
    vercelEnvironment === "preview" &&
    env.TRAINING_HUB_DISPOSABLE_DATA === "1" &&
    remoteHost &&
    /preview|staging/i.test(remoteHost) &&
    !resolvedDatabaseUrl.startsWith("file:")
  ) {
    return;
  }

  if (
    mode === "production" &&
    vercelEnvironment === "production" &&
    env.TRAINING_HUB_PRODUCTION_APPROVED === "1" &&
    env.TRAINING_HUB_PRODUCTION_INVITES_ENABLED === "1" &&
    env.TRAINING_HUB_DISPOSABLE_DATA !== "1" &&
    remoteHost &&
    /^libsql:\/\//i.test(remoteUrl) &&
    !/preview|staging/i.test(remoteHost) &&
    remoteAuthToken &&
    !resolvedDatabaseUrl.startsWith("file:")
  ) {
    return;
  }

  throw new Error(
    "Beta invitation schema requires an explicitly approved local, preview, or production data target."
  );
}

/**
 * The trigger is part of the Better Auth user-insert transaction. It verifies
 * the server-injected digest, consumes the matching invitation, binds it to the
 * new auth subject, and removes the transient digest from the user row. A later
 * account/session failure rolls the whole transaction back, leaving the invite
 * redeemable.
 */
export async function ensureBetaInviteSchema(): Promise<void> {
  // Kept as a compatibility export for the auth hook and temporary CLI.
  // Schema ownership is now the ordered additive migration registry, whether
  // registration is enabled or not.
  assertBetaInviteSchemaTarget();
  await ensureMigrated();
}

export async function validateBetaInviteForRegistration(input: {
  token: unknown;
  email: unknown;
}): Promise<string | null> {
  if (!betaInviteRegistrationEnabled()) return null;
  const email = normalizeInviteEmail(input.email);
  if (!email || !isOpaqueInviteToken(input.token)) return null;

  await ensureBetaInviteSchema();
  const tokenHash = digestInviteToken(input.token);
  const result = await client.execute({
    sql: `SELECT 1 FROM beta_invites
          WHERE token_hash = ?
            AND intended_email = ?
            AND redeemed_at IS NULL
            AND revoked_at IS NULL
            AND julianday(expires_at) > julianday('now')`,
    args: [tokenHash, email],
  });
  return result.rows.length === 1 ? tokenHash : null;
}

export async function issueBetaInvite(input: {
  email: unknown;
  issuedBy: unknown;
  expiresAt?: Date;
}): Promise<BetaInvite> {
  const email = normalizeInviteEmail(input.email);
  const issuedBy = typeof input.issuedBy === "string" ? input.issuedBy.trim() : "";
  if (!email || !issuedBy || issuedBy.length > 120) {
    throw new Error("A valid email and concise operator identifier are required.");
  }
  await ensureBetaInviteSchema();
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = input.expiresAt ?? new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
  if (
    !(expiresAt instanceof Date) ||
    Number.isNaN(expiresAt.getTime()) ||
    expiresAt <= new Date()
  ) {
    throw new Error("Invitation expiry must be a future date.");
  }
  await persistInvitation({
    tokenHash: digestInviteToken(token),
    intendedEmail: email,
    issuedBy,
    expiresAt: expiresAt.toISOString(),
  });
  return { email, token, expiresAt: expiresAt.toISOString() };
}

/** Operator lifecycle action; it never reveals whether a token existed. */
export async function revokeBetaInvite(token: unknown): Promise<void> {
  if (!isOpaqueInviteToken(token)) throw new Error("A valid opaque invitation token is required.");
  await ensureBetaInviteSchema();
  await client.execute({
    sql: `UPDATE beta_invites
          SET revoked_at = datetime('now')
          WHERE token_hash = ? AND redeemed_at IS NULL AND revoked_at IS NULL`,
    args: [digestInviteToken(token)],
  });
}

/** Temporary CLI adapter until R13 removes legacy operator support. */
export async function revokeBetaInviteById(id: unknown): Promise<void> {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))
    throw new Error("A valid invitation identifier is required.");
  await ensureBetaInviteSchema();
  await revokePersistedInvitation(id);
}

function parseCanonicalInviteOrigin(value: string | undefined, name: string): URL {
  if (!value) throw new Error(`${name} must name the approved isolated target.`);
  let origin: URL;
  try {
    origin = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute origin.`);
  }
  if (
    origin.origin === "null" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  ) {
    throw new Error(`${name} must be a bare origin without credentials, path, query, or fragment.`);
  }
  return origin;
}

function isDirectLoopbackOrigin(origin: URL): boolean {
  return ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname.toLowerCase());
}

/**
 * Refuses both unsafe data targets and unapproved invite-link destinations.
 * Returning the canonical origin means the CLI cannot accidentally build a
 * link from an arbitrary environment value after the target check passes.
 */
export function assertBetaInviteIssuanceTarget(env: InviteEnvironment = process.env): string {
  const target = env.TRAINING_HUB_INVITE_TARGET;
  const mode = env.TRAINING_HUB_ENV || "local";
  const remoteUrl = resolveTursoDatabaseUrl(env);
  const remoteAuthToken = resolveTursoAuthToken(env);
  const resolvedDatabaseUrl = resolveDatabaseUrl(env);

  if (!betaInviteRegistrationEnabled(env)) {
    throw new Error("BETA_INVITE_REGISTRATION_ENABLED=1 is required before issuing an invitation.");
  }
  if (target !== "local" && target !== "preview" && target !== "production") {
    throw new Error("TRAINING_HUB_INVITE_TARGET must explicitly be local, preview, or production.");
  }
  if (mode !== target) {
    throw new Error("Invitation issuance target must match TRAINING_HUB_ENV.");
  }
  if (target !== "production" && env.TRAINING_HUB_DISPOSABLE_DATA !== "1") {
    throw new Error("TRAINING_HUB_DISPOSABLE_DATA=1 is required for local/preview issuance.");
  }
  const publicOrigin = parseCanonicalInviteOrigin(
    env.TRAINING_HUB_PUBLIC_ORIGIN,
    "TRAINING_HUB_PUBLIC_ORIGIN"
  );
  if (target === "local") {
    if (remoteUrl || remoteAuthToken || !resolvedDatabaseUrl.startsWith("file:")) {
      throw new Error(
        "Local invitation issuance requires an isolated file: database with no Turso credentials."
      );
    }
    if (!isDirectLoopbackOrigin(publicOrigin)) {
      throw new Error(
        "Local invitation issuance requires a direct loopback TRAINING_HUB_PUBLIC_ORIGIN."
      );
    }
    return publicOrigin.origin;
  }
  if (target === "preview") {
    if (
      env.VERCEL_ENV !== "preview" ||
      !remoteUrl ||
      !/preview|staging/i.test(remoteDatabaseHost(remoteUrl) || "") ||
      resolvedDatabaseUrl.startsWith("file:")
    ) {
      throw new Error(
        "Preview invitation issuance requires an explicitly labelled disposable preview database."
      );
    }

    const approvedPreviewOrigin = parseCanonicalInviteOrigin(
      env.TRAINING_HUB_INVITE_PREVIEW_ORIGIN,
      "TRAINING_HUB_INVITE_PREVIEW_ORIGIN"
    );
    if (approvedPreviewOrigin.protocol !== "https:") {
      throw new Error("Preview invitation issuance requires an HTTPS approved preview origin.");
    }
    if (approvedPreviewOrigin.hostname === "training-hub-psi-one.vercel.app") {
      throw new Error("Preview invitation issuance must not use the production canonical origin.");
    }
    if (publicOrigin.origin !== approvedPreviewOrigin.origin) {
      throw new Error(
        "TRAINING_HUB_PUBLIC_ORIGIN must exactly match TRAINING_HUB_INVITE_PREVIEW_ORIGIN for preview issuance."
      );
    }
    return publicOrigin.origin;
  }

  if (env.TRAINING_HUB_DISPOSABLE_DATA === "1") {
    throw new Error("Production invitation issuance must not mark production data as disposable.");
  }
  if (
    env.VERCEL_ENV !== "production" ||
    env.TRAINING_HUB_PRODUCTION_APPROVED !== "1" ||
    env.TRAINING_HUB_PRODUCTION_INVITES_ENABLED !== "1"
  ) {
    throw new Error(
      "Production invitation issuance requires Vercel production, production approval, and production invites enabled."
    );
  }
  const productionHost = remoteDatabaseHost(remoteUrl);
  if (
    !productionHost ||
    !/^libsql:\/\//i.test(remoteUrl) ||
    /preview|staging/i.test(productionHost) ||
    !remoteAuthToken ||
    resolvedDatabaseUrl.startsWith("file:")
  ) {
    throw new Error(
      "Production invitation issuance requires a dedicated production Turso database and auth token."
    );
  }
  const approvedProductionOrigin = parseCanonicalInviteOrigin(
    env.TRAINING_HUB_INVITE_PRODUCTION_ORIGIN,
    "TRAINING_HUB_INVITE_PRODUCTION_ORIGIN"
  );
  if (approvedProductionOrigin.protocol !== "https:") {
    throw new Error("Production invitation issuance requires an HTTPS approved production origin.");
  }
  if (publicOrigin.origin !== approvedProductionOrigin.origin) {
    throw new Error(
      "TRAINING_HUB_PUBLIC_ORIGIN must exactly match TRAINING_HUB_INVITE_PRODUCTION_ORIGIN for production issuance."
    );
  }
  return publicOrigin.origin;
}

export function buildPrivateInviteUrl(origin: string, token: string): string {
  const url = new URL("/sign-up", origin);
  url.searchParams.set("invite", token);
  return url.toString();
}
