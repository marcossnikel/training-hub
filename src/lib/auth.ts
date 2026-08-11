import { betterAuth } from "better-auth";
import { headers } from "next/headers";
import { Kysely } from "kysely";
import { LibsqlDialect } from "@libsql/kysely-libsql";
import { client } from "./db/client";

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
  /** Better Auth's server-validated local subject. Domain ownership follows in #23. */
  userId: string;
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
  return {
    userId: session.user.id,
    sessionId: session.session.id,
    email: session.user.email,
  };
}

/** Temporary compatibility boundary for existing actions until #24 consumes CurrentUser. */
export async function requireAuth(): Promise<boolean> {
  return (await requireCurrentUser()) !== null;
}
