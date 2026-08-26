import crypto from "node:crypto";
import { persistInvitation } from "@/features/invites/persistence";
import { ensureMigrated } from "@/lib/db/migrations";
import { digestInviteToken, normalizeInviteEmail } from "@/lib/beta-invites";

/** Creates a digest-only invitation for auth fixtures without exercising creator UI authorization. */
export async function createInviteFixture(
  email: string,
  expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
): Promise<{ email: string; token: string; expiresAt: string }> {
  const normalizedEmail = normalizeInviteEmail(email);
  if (!normalizedEmail) throw new Error("Invalid invitation fixture email.");
  if (expiresAt <= new Date()) throw new Error("Invitation fixture expiry must be in the future.");
  await ensureMigrated();
  const token = crypto.randomBytes(32).toString("base64url");
  const persistedExpiry = expiresAt.toISOString();
  await persistInvitation({
    tokenHash: digestInviteToken(token),
    intendedEmail: normalizedEmail,
    expiresAt: persistedExpiry,
  });
  return { email: normalizedEmail, token, expiresAt: persistedExpiry };
}
