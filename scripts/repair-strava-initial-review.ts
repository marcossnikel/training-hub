import { repairHistoricalReviewImports } from "../src/lib/db/strava-auth";

function usage(): never {
  throw new Error(
    "Usage: npx tsx scripts/repair-strava-initial-review.ts --owner <owner-id> [--apply]"
  );
}

const args = process.argv.slice(2);
const ownerIndex = args.indexOf("--owner");
const ownerId = ownerIndex >= 0 ? args[ownerIndex + 1] : undefined;
if (!ownerId || !/^[A-Za-z0-9_-]{1,256}$/.test(ownerId)) usage();
const apply = args.includes("--apply");

const result = await repairHistoricalReviewImports({ userId: ownerId }, { dryRun: !apply });
// This intentionally emits owner-safe aggregates only. --apply is a local
// operator action; remote/production use still requires separate approval.
console.log(JSON.stringify({ ownerId, dryRun: !apply, ...result }));
