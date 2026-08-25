import { validateMigrationCommand } from "../src/server/config/migration-command";

async function main(): Promise<void> {
  // This validation is deliberately before importing a client-backed module or
  // starting a write transaction.
  const { command, configuration } = validateMigrationCommand(process.argv.slice(2), process.env);
  const [{ createDatabaseClient }, { runMigrations }] = await Promise.all([
    import("../src/lib/db/client"),
    import("../src/lib/db/migrations"),
  ]);
  const database = createDatabaseClient(configuration.database);
  try {
    await runMigrations(database, { autoApply: true });
    console.log(`Applied additive migrations to ${command.target}.`);
  } finally {
    database.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Migration command failed.";
  console.error(`Migration refused: ${message}`);
  process.exitCode = 1;
});
