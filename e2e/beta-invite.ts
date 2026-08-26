import crypto from "node:crypto";
import path from "node:path";
import { createClient } from "@libsql/client";

const DATABASE_URL = `file:${path.join(process.cwd(), "data", "e2e.db")}`;

/** Disposable test-only fixture setup. It writes only the isolated E2E database. */
export async function betaSignUpPath(email: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const database = createClient({ url: DATABASE_URL, intMode: "number" });
  try {
    await database.execute({
      sql: `INSERT INTO beta_invites (id, token_hash, intended_email, created_at, expires_at)
            VALUES (?, ?, ?, datetime('now'), datetime('now', '+1 hour'))`,
      args: [crypto.randomUUID(), tokenHash, email.toLowerCase()],
    });
  } finally {
    database.close();
  }
  return `/sign-up?invite=${encodeURIComponent(token)}`;
}
