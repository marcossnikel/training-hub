import crypto from "node:crypto";
import { client } from "@/lib/db/client";

export async function persistInvitation(input: {
  tokenHash: string;
  intendedEmail: string;
  expiresAt: string;
  issuedByUserId?: string;
}): Promise<string> {
  const id = crypto.randomUUID();
  await client.execute({
    sql: `INSERT INTO beta_invites
            (id, token_hash, intended_email, issued_by_user_id, created_at, expires_at)
          VALUES (?, ?, ?, ?, datetime('now'), ?)`,
    args: [id, input.tokenHash, input.intendedEmail, input.issuedByUserId ?? null, input.expiresAt],
  });
  return id;
}

export async function revokePersistedInvitation(id: string): Promise<void> {
  await client.execute({
    sql: `UPDATE beta_invites SET revoked_at = datetime('now')
          WHERE id = ? AND redeemed_at IS NULL AND revoked_at IS NULL`,
    args: [id],
  });
}
