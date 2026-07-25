/**
 * Backfill script: computes training load (TSS) for every confirmed activity
 * from the current athlete thresholds and writes it to activity_load. Only auto
 * rows are touched — manual overrides stay put — so this is safe to re-run.
 *
 *   npm run backfill:load
 */
import { ensureMigrated, listActivityLoadsForPmc, recomputeAllLoads } from "../src/lib/db";
import { assertLocalDb } from "./lib/assert-local-db";

async function main() {
  // This script's --force has always meant "allow the remote DB", so it stays honoured.
  assertLocalDb({ allowForceFlag: true });
  await ensureMigrated();

  const { count } = await recomputeAllLoads();
  console.log(`Computed training load for ${count} confirmed activities.`);

  const sample = (await listActivityLoadsForPmc()).slice(0, 8);
  if (sample.length > 0) {
    console.log("Sample TSS values:");
    for (const row of sample) {
      console.log(`  ${row.started_at}  ${row.tss} TSS`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
