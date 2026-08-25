export type DatabaseEnvironment = Record<string, string | undefined>;

const LOCAL_DATABASE_URL = "file:data/app.db";

/**
 * Vercel Marketplace integrations may override their conventional TURSO_*
 * variables for a deployment. Training Hub's explicit variables let an
 * operator pin production to one stable Turso database when required.
 */
export function resolveTursoDatabaseUrl(env: DatabaseEnvironment = process.env): string {
  return env.TRAINING_HUB_TURSO_DATABASE_URL || env.TURSO_DATABASE_URL || "";
}

export function resolveTursoAuthToken(env: DatabaseEnvironment = process.env): string | undefined {
  return env.TRAINING_HUB_TURSO_AUTH_TOKEN || env.TURSO_AUTH_TOKEN || undefined;
}

export function resolveDatabaseUrl(env: DatabaseEnvironment = process.env): string {
  return resolveTursoDatabaseUrl(env) || env.DATABASE_URL || LOCAL_DATABASE_URL;
}
