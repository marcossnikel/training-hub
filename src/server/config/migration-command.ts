import {
  resolveRuntimeConfiguration,
  type Environment,
  type RuntimeConfiguration,
  type RuntimeIdentity,
} from "./runtime";

export type MigrationCommand = { target: Extract<RuntimeIdentity, "preview" | "production"> };

export class MigrationCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationCommandError";
  }
}

/** Validates every operator input before the migration script imports a DB client. */
export function validateMigrationCommand(
  args: readonly string[],
  env: Environment
): { command: MigrationCommand; configuration: RuntimeConfiguration } {
  const target = args.find((arg) => arg.startsWith("--target="))?.slice("--target=".length);
  if (target !== "preview" && target !== "production")
    throw new MigrationCommandError("Migration target must be exactly preview or production.");
  if (!args.includes("--approve-remote-migration"))
    throw new MigrationCommandError("Migration requires --approve-remote-migration.");

  const configuration = resolveRuntimeConfiguration(env);
  if (configuration.issues.length > 0)
    throw new MigrationCommandError(
      `Migration target configuration is invalid: ${configuration.issues.join(", ")}.`
    );
  if (configuration.identity !== target)
    throw new MigrationCommandError("Migration target must match TRAINING_HUB_ENV.");
  if (configuration.database.kind !== "remote")
    throw new MigrationCommandError("Migration target must use its dedicated remote database.");
  return { command: { target }, configuration };
}
