import "server-only";

import crypto from "node:crypto";
import { client } from "@/lib/db/client";
import {
  assertBetaInviteIssuanceTarget,
  buildPrivateInviteUrl,
  digestInviteToken,
  ensureBetaInviteSchema,
  normalizeInviteEmail,
} from "@/lib/beta-invites";
import { hasCapability, requireAccess } from "@/features/access/server";
import { persistInvitation, revokePersistedInvitation } from "./persistence";

export type InviteStatus = "active" | "expired" | "revoked" | "redeemed";

export type InvitationSummary = {
  id: string;
  intendedEmail: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  redeemedAt: string | null;
  status: InviteStatus;
};

export type IssuedInvitation = {
  inviteUrl: string;
  intendedEmail: string;
  expiresAt: string;
};

export class InviteAuthorizationError extends Error {
  constructor() {
    super("Creator invitation management is required.");
    this.name = "InviteAuthorizationError";
  }
}

async function requireInviteManager() {
  const access = await requireAccess();
  if (!access || !hasCapability(access, "manageBetaInvites")) throw new InviteAuthorizationError();
  return access;
}

function futureExpiry(value: Date | undefined): string {
  const expiry = value ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  if (!(expiry instanceof Date) || Number.isNaN(expiry.getTime()) || expiry <= new Date())
    throw new Error("Invitation expiry must be a future date.");
  return expiry.toISOString();
}

function summary(row: Record<string, unknown>): InvitationSummary {
  const expiresAt = String(row.expires_at);
  const revokedAt = typeof row.revoked_at === "string" ? row.revoked_at : null;
  const redeemedAt = typeof row.redeemed_at === "string" ? row.redeemed_at : null;
  const status: InviteStatus = redeemedAt
    ? "redeemed"
    : revokedAt
      ? "revoked"
      : new Date(expiresAt).getTime() <= Date.now()
        ? "expired"
        : "active";
  return {
    id: String(row.id),
    intendedEmail: String(row.intended_email),
    createdAt: String(row.created_at),
    expiresAt,
    revokedAt,
    redeemedAt,
    status,
  };
}

/** The sole authenticated creator operation that reveals a plaintext token. */
export async function issueInvitation(input: {
  email: unknown;
  expiresAt?: Date;
}): Promise<IssuedInvitation> {
  const creator = await requireInviteManager();
  const intendedEmail = normalizeInviteEmail(input.email);
  if (!intendedEmail) throw new Error("A valid invitation email is required.");
  const origin = assertBetaInviteIssuanceTarget();
  await ensureBetaInviteSchema();
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = futureExpiry(input.expiresAt);
  await persistInvitation({
    tokenHash: digestInviteToken(token),
    intendedEmail,
    issuedByUserId: creator.userId,
    expiresAt,
  });
  return { inviteUrl: buildPrivateInviteUrl(origin, token), intendedEmail, expiresAt };
}

/** Lists deployment-scoped operational summaries; secret and auth fields never leave persistence. */
export async function listInvitationSummaries(): Promise<InvitationSummary[]> {
  await requireInviteManager();
  await ensureBetaInviteSchema();
  const result = await client.execute(
    `SELECT id, intended_email, created_at, expires_at, revoked_at, redeemed_at
       FROM beta_invites ORDER BY created_at DESC, id DESC`
  );
  return result.rows.map((row) => summary(row as Record<string, unknown>));
}

/** Idempotently revokes an active invite by its opaque database identifier. */
export async function revokeInvitation(id: unknown): Promise<void> {
  await requireInviteManager();
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))
    throw new Error("A valid invitation identifier is required.");
  await ensureBetaInviteSchema();
  await revokePersistedInvitation(id);
}
