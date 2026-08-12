import { betterAuth } from "better-auth";
import { headers } from "next/headers";
import { Kysely } from "kysely";
import { LibsqlDialect } from "@libsql/kysely-libsql";
import { client } from "./db/client";
import { ensureMigrated } from "./db/migrations";

// `@libsql/kysely-libsql` 0.4.x predates the current client type declaration,
// though both use the same stable Client runtime API. The compatibility spike
// executes sign-up, server session lookup, and revocation using this exact client.
const authDatabase = new Kysely({
  dialect: new LibsqlDialect({ client: client as never }),
});

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: { db: authDatabase, type: "sqlite", casing: "snake", transaction: true },
  emailAndPassword: { enabled: true },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    // Every server authorization check must hit the session row so logout and
    // revocation take effect immediately rather than trusting cached cookie data.
    cookieCache: { enabled: false },
  },
});

export interface CurrentUser {
  /** Application owner id, resolved from the server-validated Better Auth subject. */
  userId: string;
  authSubject: string;
  sessionId: string;
  email: string;
}

/** Resolve identity from the database-backed session, never from client input. */
export async function requireCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true },
  });
  if (!session) return null;
  // The application owner is a separate, local key.  Never use a submitted
  // owner id (or the provider subject) to authorize domain records.
  await ensureMigrated();
  const existing = await client.execute({
    sql: "SELECT id FROM users WHERE auth_subject = ?",
    args: [session.user.id],
  });
  let userId = existing.rows[0]?.id;
  if (typeof userId !== "string") {
    const id = crypto.randomUUID();
    await client.execute({
      sql: "INSERT OR IGNORE INTO users (id, auth_subject) VALUES (?, ?)",
      args: [id, session.user.id],
    });
    const resolved = await client.execute({
      sql: "SELECT id FROM users WHERE auth_subject = ?",
      args: [session.user.id],
    });
    userId = resolved.rows[0]?.id;
  }
  if (typeof userId !== "string") return null;
  return {
    userId,
    authSubject: session.user.id,
    sessionId: session.session.id,
    email: session.user.email,
  };
}
