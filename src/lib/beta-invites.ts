import crypto from "node:crypto";
import { client, IS_LOCAL_FILE } from "./db/client";
import { ensureMigrated } from "./db/migrations";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_REGISTRATION_ERROR = "Registration is unavailable.";

export type BetaInvite = {
  email: string;
  token: string;
  expiresAt: string;
};

type InviteEnvironment = Record<string, string | undefined>;

let schemaReady: Promise<void> | undefined;
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

function assertIsolatedInviteMigrationTarget(env: InviteEnvironment = process.env): void {
  const mode = env.TRAINING_HUB_ENV || "local";
  const vercelEnvironment = env.VERCEL_ENV || "";
  const remoteUrl = env.TURSO_DATABASE_URL || "";
  const resolvedDatabaseUrl = remoteUrl || env.DATABASE_URL || "file:data/app.db";

  if (mode === "local" || mode === "e2e") {
    if (!IS_LOCAL_FILE || remoteUrl || env.TURSO_AUTH_TOKEN) {
      throw new Error("Beta invitation schema requires an isolated local/E2E file database.");
    }
    return;
  }

  if (
    mode === "preview" &&
    vercelEnvironment === "preview" &&
    env.TRAINING_HUB_DISPOSABLE_DATA === "1" &&
    remoteUrl &&
    /preview|staging/i.test(new URL(remoteUrl).hostname) &&
    !resolvedDatabaseUrl.startsWith("file:")
  ) {
    return;
  }

  throw new Error(
    "Beta invitation schema is allowed only for explicitly labelled isolated local/E2E data or disposable preview data."
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
  if (!betaInviteRegistrationEnabled()) {
    throw new Error("Beta invitation registration is not enabled for this environment.");
  }
  if (!schemaReady) {
    schemaReady = (async () => {
      assertIsolatedInviteMigrationTarget();
      await ensureMigrated();
      const columns = await client.execute('PRAGMA table_info("user")');
      if (!columns.rows.some((column) => column.name === "betaInviteClaim")) {
        await client.execute('ALTER TABLE "user" ADD COLUMN "betaInviteClaim" TEXT');
      }
      await client.batch(
        [
          `CREATE TABLE IF NOT EXISTS beta_invites (
             id TEXT PRIMARY KEY,
             token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
             intended_email TEXT NOT NULL,
             issued_by TEXT NOT NULL,
             created_at TEXT NOT NULL,
             expires_at TEXT NOT NULL,
             redeemed_at TEXT,
             redeemed_auth_subject TEXT UNIQUE,
             revoked_at TEXT
           )`,
          "CREATE INDEX IF NOT EXISTS idx_beta_invites_lookup ON beta_invites(token_hash, intended_email)",
          "CREATE INDEX IF NOT EXISTS idx_beta_invites_email ON beta_invites(intended_email)",
          `CREATE TRIGGER IF NOT EXISTS beta_invites_redeem_on_user_insert
             AFTER INSERT ON "user"
             WHEN NEW."betaInviteClaim" IS NOT NULL
             BEGIN
               SELECT CASE WHEN NOT EXISTS (
                 SELECT 1 FROM beta_invites
                 WHERE token_hash = NEW."betaInviteClaim"
                   AND intended_email = lower(NEW.email)
                   AND redeemed_at IS NULL
                   AND revoked_at IS NULL
                   AND expires_at > datetime('now')
               ) THEN RAISE(ABORT, 'registration unavailable') END;

               UPDATE beta_invites
               SET redeemed_at = datetime('now'), redeemed_auth_subject = NEW.id
               WHERE token_hash = NEW."betaInviteClaim"
                 AND intended_email = lower(NEW.email)
                 AND redeemed_at IS NULL
                 AND revoked_at IS NULL
                 AND expires_at > datetime('now');

               UPDATE "user" SET "betaInviteClaim" = NULL WHERE id = NEW.id;
             END`,
        ],
        "write"
      );
    })().catch((error) => {
      schemaReady = undefined;
      throw error;
    });
  }
  return schemaReady;
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
            AND expires_at > datetime('now')`,
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
  await client.execute({
    sql: `INSERT INTO beta_invites (id, token_hash, intended_email, issued_by, created_at, expires_at)
          VALUES (?, ?, ?, ?, datetime('now'), ?)`,
    args: [crypto.randomUUID(), digestInviteToken(token), email, issuedBy, expiresAt.toISOString()],
  });
  return { email, token, expiresAt: expiresAt.toISOString() };
}

/** Local operator lifecycle action; it never reveals whether a token existed. */
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

export function assertBetaInviteIssuanceTarget(env: InviteEnvironment = process.env): void {
  const target = env.TRAINING_HUB_INVITE_TARGET;
  const mode = env.TRAINING_HUB_ENV || "local";
  const remoteUrl = env.TURSO_DATABASE_URL || "";
  const resolvedDatabaseUrl = remoteUrl || env.DATABASE_URL || "file:data/app.db";

  if (!betaInviteRegistrationEnabled(env)) {
    throw new Error("BETA_INVITE_REGISTRATION_ENABLED=1 is required before issuing an invitation.");
  }
  if (env.TRAINING_HUB_DISPOSABLE_DATA !== "1") {
    throw new Error("TRAINING_HUB_DISPOSABLE_DATA=1 is required for invitation issuance.");
  }
  if (target !== "local" && target !== "preview") {
    throw new Error("TRAINING_HUB_INVITE_TARGET must explicitly be local or preview.");
  }
  if (mode !== target || env.VERCEL_ENV === "production") {
    throw new Error("Invitation issuance target must match a non-production TRAINING_HUB_ENV.");
  }
  if (target === "local") {
    if (remoteUrl || env.TURSO_AUTH_TOKEN || !resolvedDatabaseUrl.startsWith("file:")) {
      throw new Error(
        "Local invitation issuance requires an isolated file: database with no Turso credentials."
      );
    }
    return;
  }
  if (
    env.VERCEL_ENV !== "preview" ||
    !remoteUrl ||
    !/preview|staging/i.test(new URL(remoteUrl).hostname) ||
    resolvedDatabaseUrl.startsWith("file:")
  ) {
    throw new Error(
      "Preview invitation issuance requires an explicitly labelled disposable preview database."
    );
  }
}

export function buildPrivateInviteUrl(origin: string, token: string): string {
  const url = new URL("/sign-up", origin);
  url.searchParams.set("invite", token);
  return url.toString();
}
