export type Environment = Record<string, string | undefined>;

export const LOCAL_DATABASE_URL = "file:data/app.db";
export const RUNTIME_IDENTITIES = ["local", "e2e", "preview", "production"] as const;
export type RuntimeIdentity = (typeof RUNTIME_IDENTITIES)[number];

export type ConfigurationIssue =
  | "invalid-runtime-identity"
  | "local-remote-database"
  | "e2e-non-file-database"
  | "preview-vercel-environment"
  | "preview-local-database"
  | "preview-database-host"
  | "preview-remote-write-override"
  | "production-vercel-environment"
  | "production-approval"
  | "production-local-database"
  | "stripe-live-outside-production"
  | "invalid-stripe-mode"
  | "stripe-live-key-outside-production";

export type DatabaseConfiguration = {
  url: string;
  authToken: string | undefined;
  kind: "file" | "remote";
  host: string | null;
};

export type RuntimeConfiguration = {
  identity: RuntimeIdentity;
  database: DatabaseConfiguration;
  registrationEnabled: boolean;
  issues: ConfigurationIssue[];
};

export class RuntimeConfigurationError extends Error {
  readonly issues: readonly ConfigurationIssue[];

  constructor(issues: readonly ConfigurationIssue[]) {
    super(`Runtime configuration is invalid: ${issues.join(", ")}`);
    this.name = "RuntimeConfigurationError";
    this.issues = issues;
  }
}

function firstSet(env: Environment, ...names: string[]): string | undefined {
  return names.map((name) => env[name]).find((value) => Boolean(value));
}

export function resolveTursoDatabaseUrl(env: Environment): string {
  return firstSet(env, "TRAINING_HUB_TURSO_DATABASE_URL", "TURSO_DATABASE_URL") ?? "";
}

export function resolveTursoAuthToken(env: Environment): string | undefined {
  return firstSet(env, "TRAINING_HUB_TURSO_AUTH_TOKEN", "TURSO_AUTH_TOKEN");
}

export function resolveDatabaseUrl(env: Environment): string {
  return resolveTursoDatabaseUrl(env) || env.DATABASE_URL || LOCAL_DATABASE_URL;
}

export function safeDatabaseHost(value: string): string | null {
  try {
    return new URL(value).hostname || null;
  } catch {
    return null;
  }
}

function isRuntimeIdentity(value: string): value is RuntimeIdentity {
  return (RUNTIME_IDENTITIES as readonly string[]).includes(value);
}

/** Resolves only non-secret runtime facts and boundary failures. */
export function resolveRuntimeConfiguration(env: Environment): RuntimeConfiguration {
  const requestedIdentity = env.TRAINING_HUB_ENV || "local";
  const identity = isRuntimeIdentity(requestedIdentity) ? requestedIdentity : "local";
  const tursoUrl = resolveTursoDatabaseUrl(env);
  const databaseUrl = resolveDatabaseUrl(env);
  const database: DatabaseConfiguration = {
    url: databaseUrl,
    authToken: resolveTursoAuthToken(env),
    kind: databaseUrl.startsWith("file:") ? "file" : "remote",
    host: safeDatabaseHost(databaseUrl),
  };
  const issues: ConfigurationIssue[] = [];
  const fail = (issue: ConfigurationIssue) => issues.push(issue);

  if (!isRuntimeIdentity(requestedIdentity)) fail("invalid-runtime-identity");
  if (identity === "local" || identity === "e2e") {
    if (tursoUrl || database.authToken) fail("local-remote-database");
    if (database.kind !== "file")
      fail(identity === "e2e" ? "e2e-non-file-database" : "local-remote-database");
  }
  if (identity === "e2e" && env.DATABASE_URL && !env.DATABASE_URL.startsWith("file:")) {
    fail("e2e-non-file-database");
  }
  if (identity === "preview") {
    if (env.VERCEL_ENV !== "preview") fail("preview-vercel-environment");
    if (database.kind === "file") fail("preview-local-database");
    if (!/preview|staging/i.test(database.host ?? "")) fail("preview-database-host");
    if (env.ALLOW_REMOTE_DB === "1") fail("preview-remote-write-override");
  }
  if (identity === "production") {
    if (env.VERCEL_ENV !== "production") fail("production-vercel-environment");
    if (env.TRAINING_HUB_PRODUCTION_APPROVED !== "1") fail("production-approval");
    if (database.kind === "file") fail("production-local-database");
  }

  const stripeMode = env.STRIPE_MODE || "";
  if (stripeMode && stripeMode !== "test" && stripeMode !== "live") fail("invalid-stripe-mode");
  if (identity !== "production" && stripeMode === "live") fail("stripe-live-outside-production");
  if (
    identity !== "production" &&
    Object.entries(env).some(
      ([name, value]) =>
        name.startsWith("STRIPE_") && Boolean(value) && /^sk_live_|^pk_live_/i.test(value!)
    )
  ) {
    fail("stripe-live-key-outside-production");
  }

  return {
    identity,
    database,
    registrationEnabled: env.BETA_INVITE_REGISTRATION_ENABLED === "1",
    issues: [...new Set(issues)],
  };
}

/** Application composition must not open a database after a boundary refusal. */
export function requireValidRuntimeConfiguration(env: Environment): RuntimeConfiguration {
  const configuration = resolveRuntimeConfiguration(env);
  if (configuration.issues.length > 0) throw new RuntimeConfigurationError(configuration.issues);
  return configuration;
}

const ISSUE_MESSAGES: Record<ConfigurationIssue, string> = {
  "invalid-runtime-identity": "TRAINING_HUB_ENV must be local, e2e, preview, or production.",
  "local-remote-database": "local must use a file database with no Turso credentials.",
  "e2e-non-file-database": "e2e DATABASE_URL must be a file URL with no Turso credentials.",
  "preview-vercel-environment": "preview requires VERCEL_ENV=preview.",
  "preview-local-database": "preview must use a dedicated remote preview/staging database.",
  "preview-database-host": "preview database host must contain preview or staging.",
  "preview-remote-write-override": "preview must not set ALLOW_REMOTE_DB=1.",
  "production-vercel-environment": "production requires VERCEL_ENV=production.",
  "production-approval": "production requires TRAINING_HUB_PRODUCTION_APPROVED=1.",
  "production-local-database": "production must use a dedicated remote production database.",
  "stripe-live-outside-production": "only production may set STRIPE_MODE=live.",
  "invalid-stripe-mode": "STRIPE_MODE must be test or live.",
  "stripe-live-key-outside-production": "only production may expose a live Stripe key.",
};

export function describeConfigurationIssue(issue: ConfigurationIssue): string {
  return ISSUE_MESSAGES[issue];
}
