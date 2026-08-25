import type { Client } from "@libsql/client";
import { resolveRuntimeConfiguration, type Environment } from "@/server/config/runtime";
import type { ApplicationRole } from "./server";

export class CreatorBootstrapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreatorBootstrapError";
  }
}

export type CreatorBootstrapCommand = {
  email: string;
  apply: boolean;
};

export type CreatorBootstrapResult = {
  userId: string;
  redactedEmail: string;
  previousRole: ApplicationRole;
  role: ApplicationRole;
  changed: boolean;
};

function redactedEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "[redacted]";
  return `${local.slice(0, 1)}***@${domain}`;
}

function roleFromDatabase(value: unknown): ApplicationRole {
  if (value === "member" || value === "creator") return value;
  throw new CreatorBootstrapError("Resolved application account has an invalid role.");
}

/**
 * Rejects remote, preview, production, malformed, and ambiguous operator
 * inputs before a client-backed module can touch the database.
 */
export function validateCreatorBootstrapCommand(
  args: readonly string[],
  env: Environment
): CreatorBootstrapCommand {
  const emailArgs = args.filter((arg) => arg.startsWith("--email="));
  const allowed = new Set(["--apply", ...emailArgs]);
  if (emailArgs.length !== 1 || args.some((arg) => !allowed.has(arg)))
    throw new CreatorBootstrapError(
      "Usage: npm run access:bootstrap-creator -- --email=existing@example.test [--apply]"
    );

  const email = emailArgs[0].slice("--email=".length).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new CreatorBootstrapError("A valid existing account email is required.");

  const configuration = resolveRuntimeConfiguration(env);
  if (configuration.issues.length > 0)
    throw new CreatorBootstrapError("Creator bootstrap target configuration is invalid.");
  if (configuration.identity !== "local" || configuration.database.kind !== "file")
    throw new CreatorBootstrapError(
      "Creator bootstrap is permitted only for a local file database."
    );

  return { email, apply: args.includes("--apply") };
}

/**
 * Locates exactly one existing Better Auth account and its one local user
 * bridge. It never creates accounts, accepts a local user ID, or writes until
 * an explicit apply command reaches this programmatic boundary.
 */
export async function bootstrapCreator(
  database: Client,
  command: CreatorBootstrapCommand
): Promise<CreatorBootstrapResult> {
  const accounts = await database.execute({
    sql: 'SELECT id, email FROM "user" WHERE email = ? COLLATE NOCASE',
    args: [command.email],
  });
  if (accounts.rows.length !== 1)
    throw new CreatorBootstrapError(
      "Creator bootstrap requires exactly one existing auth account."
    );

  const account = accounts.rows[0];
  const authSubject = account.id;
  const email = account.email;
  if (typeof authSubject !== "string" || typeof email !== "string")
    throw new CreatorBootstrapError("Resolved auth account is incomplete.");

  const users = await database.execute({
    sql: "SELECT id, role FROM users WHERE auth_subject = ?",
    args: [authSubject],
  });
  if (users.rows.length !== 1)
    throw new CreatorBootstrapError("Creator bootstrap requires exactly one resolved local user.");

  const userId = users.rows[0].id;
  if (typeof userId !== "string")
    throw new CreatorBootstrapError("Resolved local user is incomplete.");
  const previousRole = roleFromDatabase(users.rows[0].role);
  const changed = command.apply && previousRole !== "creator";

  if (changed) {
    await database.execute({
      sql: "UPDATE users SET role = 'creator' WHERE id = ? AND auth_subject = ? AND role = 'member'",
      args: [userId, authSubject],
    });
  }

  const readback = await database.execute({
    sql: "SELECT role FROM users WHERE id = ? AND auth_subject = ?",
    args: [userId, authSubject],
  });
  if (readback.rows.length !== 1 || (command.apply && readback.rows[0].role !== "creator"))
    throw new CreatorBootstrapError(
      "Creator bootstrap readback did not resolve the selected local user."
    );

  return {
    userId,
    redactedEmail: redactedEmail(email),
    previousRole,
    role: command.apply ? "creator" : previousRole,
    changed,
  };
}
