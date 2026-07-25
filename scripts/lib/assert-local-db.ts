/**
 * The remote-database guard every backfill script runs before it touches the DB.
 * Shared so tightening it tightens all of them at once.
 */

/**
 * Refuses to run against a remote (shared/prod Turso) database. Resolves the DB URL
 * exactly like src/lib/db/client.ts (TURSO_DATABASE_URL → DATABASE_URL → local file):
 * a `file:` URL (local dev) returns normally, anything else exits 1 unless the writer
 * explicitly opted in.
 *
 * `ALLOW_REMOTE_DB=1` is the opt-in everywhere. `allowForceFlag` additionally accepts
 * a `--force` argv flag, which only scripts that already documented `--force` as
 * "allow the remote DB" may pass: in a script whose `--force` means something else
 * (or which uses `--write` for the real run) honouring it here would be a footgun.
 *
 * Called BEFORE ensureMigrated so a refusal causes zero DB traffic.
 */
export function assertLocalDb({ allowForceFlag = false }: { allowForceFlag?: boolean } = {}): void {
  const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || "file:data/app.db";
  if (url.startsWith("file:")) return;
  if (process.env.ALLOW_REMOTE_DB === "1") return;
  if (allowForceFlag && process.argv.includes("--force")) return;
  let host = url;
  try {
    host = new URL(url).host || url;
  } catch {
    // Not a parseable URL; fall back to showing the raw value.
  }
  console.error(
    `Refusing to backfill a remote database (${host}). This protects the shared/prod DB. ` +
      `Re-run with ALLOW_REMOTE_DB=1 to override.`
  );
  process.exit(1);
}
