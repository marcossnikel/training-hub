import {
  resolveDatabaseUrl as resolveRuntimeDatabaseUrl,
  resolveTursoAuthToken as resolveRuntimeTursoAuthToken,
  resolveTursoDatabaseUrl as resolveRuntimeTursoDatabaseUrl,
  type Environment,
} from "@/server/config/runtime";

export type DatabaseEnvironment = Environment;

/** Compatibility surface for existing pure database callers. */
export function resolveTursoDatabaseUrl(env: DatabaseEnvironment = process.env): string {
  return resolveRuntimeTursoDatabaseUrl(env);
}

export function resolveTursoAuthToken(env: DatabaseEnvironment = process.env): string | undefined {
  return resolveRuntimeTursoAuthToken(env);
}

export function resolveDatabaseUrl(env: DatabaseEnvironment = process.env): string {
  return resolveRuntimeDatabaseUrl(env);
}
