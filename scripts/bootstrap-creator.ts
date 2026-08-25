import { validateCreatorBootstrapCommand } from "../src/features/access/creator-bootstrap";

async function main(): Promise<void> {
  // Validation happens before importing a database client, so an unsafe target
  // cannot create a connection or issue a write.
  const command = validateCreatorBootstrapCommand(process.argv.slice(2), process.env);
  const [{ createDatabaseClient }, { runMigrations }] = await Promise.all([
    import("../src/lib/db/client"),
    import("../src/lib/db/migrations"),
  ]);
  const database = createDatabaseClient({
    url: process.env.DATABASE_URL || "file:data/app.db",
    authToken: undefined,
    kind: "file",
    host: null,
  });
  try {
    await runMigrations(database, { autoApply: true });
    const result = await (
      await import("../src/features/access/creator-bootstrap")
    ).bootstrapCreator(database, command);
    console.log(JSON.stringify(result));
  } finally {
    database.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Creator bootstrap refused.";
  console.error(`Creator bootstrap refused: ${message}`);
  process.exitCode = 1;
});
