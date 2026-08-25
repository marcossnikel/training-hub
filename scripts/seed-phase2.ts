/**
 * One-off: light up /performance with the data it was always able to render.
 *
 *   npx tsx scripts/seed-phase2.ts
 *
 * Three local steps, no Strava calls:
 *  1. run the pending migrations (the app does this lazily; doing it here makes
 *     the state explicit before the writes below)
 *  2. mark the seven real races, which is what unlocks estimateCriticalSpeed
 *     (it fits over races only, and needs two distinct distances)
 *  3. seed the training zones and the measured resting HR
 *
 * Idempotent: re-running marks the same races and rewrites the same zones.
 */
import { client, ensureMigrated, setTrainingZones, saveAthleteThresholds } from "../src/lib/db";
import type { DerivedZones } from "../src/lib/zones";

// Confirmed by the athlete. The Butinada Trail is included because it IS a race;
// `raceCategory` already buckets it as "trail" on its name, so `distanceOf`
// returns null for it and the critical-speed fit never sees its 1081 m of climb.
const RACES: { name: string; label: string }[] = [
  {
    name: "Athena's Run Longer Meia Maratona",
    label: "Athena's Run Longer Meia Maratona (19/10/2025)",
  },
  { name: "Butinada Trail", label: "Butinada Trail (22/02/2026)" },
  { name: "Treino de Luxo New Balance 15k", label: "Treino de Luxo New Balance 15k (29/03/2026)" },
  { name: "Meia Maratona Jundiaí Shopping", label: "Meia Maratona Jundiaí Shopping (12/04/2026)" },
  { name: "Prova Lupo 12k", label: "Prova Lupo 12k (03/05/2026)" },
  { name: "ASICS Golden Run 2026", label: "ASICS Golden Run 2026 (17/05/2026)" },
  { name: "Hoka 30k", label: "Hoka 30k (05/07/2026)" },
];

/** m:ss per km as seconds. */
const pace = (m: number, s: number) => m * 60 + s;

/**
 * From the 28/07/2026 analysis, written up in ~/personal/marcos-hr-zones-2026-07-28.md.
 * Max HR is the only directly measured value (CPET, chest strap, to exhaustion);
 * LT2 comes from three races, LT1 from Karvonen and a bias-corrected VT1 that agree
 * on 157–158. Confidence is "medium" because LT1 is inferred, never measured.
 */
const ZONES: DerivedZones = {
  maxHr: 199,
  restingHr: 52,
  lt1Hr: 157,
  lt2Hr: 178,
  lt1PaceSPerKm: pace(5, 31),
  lt2PaceSPerKm: pace(4, 34),
  vo2maxEstimate: 46.2,
  confidence: "medium",
  summary:
    "Max HR 199 measured on the 23/07 CPET (chest strap, to exhaustion, 104% of predicted). " +
    "LT2 178 from three races: 10K in 54 min at 179, 15K in 69 min at 176, half in 99 min at 176. " +
    "LT1 157 is inferred, not measured: Karvonen gives 158, the CPET's VT1 corrected for its " +
    "51-second stages gives 157, and the 26 runs you yourself labelled easy top out at 155. " +
    "VDOT 46.2 from the 1:38:33 half; the 3K, 15K and 10K all land within a point of it.",
  missingInfo: [
    "LT1 is the least certain number here. Only a submaximal lactate profile, or a CPET with " +
      "3-minute stages, measures it directly. The planned 3K test will refine threshold pace " +
      "and confirm max HR, but says nothing about the aerobic threshold.",
    "The CPET under-read gas by ~25% (mask leak plus 51-second stages), so its VO2 peak of 43.7 " +
      "is discarded here in favour of the field-derived VDOT.",
    "Power curve and eFTP stay dark until more rides carry a power meter.",
  ],
  zones: [
    { zone: 1, hrMin: null, hrMax: 140, paceMinSPerKm: pace(6, 58), paceMaxSPerKm: null },
    { zone: 2, hrMin: 141, hrMax: 157, paceMinSPerKm: pace(5, 31), paceMaxSPerKm: pace(6, 51) },
    { zone: 3, hrMin: 158, hrMax: 173, paceMinSPerKm: pace(4, 37), paceMaxSPerKm: pace(5, 27) },
    { zone: 4, hrMin: 174, hrMax: 187, paceMinSPerKm: pace(4, 2), paceMaxSPerKm: pace(4, 34) },
    { zone: 5, hrMin: 188, hrMax: 199, paceMinSPerKm: null, paceMaxSPerKm: pace(4, 0) },
  ],
  generatedAt: new Date().toISOString(),
};

async function main() {
  const url = process.env.TURSO_DATABASE_URL ?? "";
  if (url && !url.startsWith("file:")) {
    throw new Error(`Refusing to write to a remote database (${url}). Unset TURSO_DATABASE_URL.`);
  }

  await ensureMigrated();
  const ownerId = process.env.TRAINING_HUB_OWNER_ID;
  if (!ownerId)
    throw new Error("TRAINING_HUB_OWNER_ID is required; scripts never select a default owner.");
  const owner = { userId: ownerId };
  const version = await client.execute("SELECT version FROM schema_version WHERE id = 1");
  console.log(`schema_version: ${version.rows[0]?.version}`);

  console.log("\nMarking races:");
  for (const race of RACES) {
    const res = await client.execute({
      sql: "UPDATE activities SET is_race = 1 WHERE user_id = ? AND name = ?",
      args: [owner.userId, race.name],
    });
    console.log(`  ${res.rowsAffected ? "ok " : "MISS"} ${race.label}`);
  }
  const count = await client.execute({
    sql: "SELECT COUNT(*) AS n FROM activities WHERE user_id = ? AND is_race = 1",
    args: [owner.userId],
  });
  console.log(`  total marked: ${count.rows[0]?.n}`);

  console.log("\nSeeding training zones...");
  await setTrainingZones(owner, ZONES);

  console.log("Updating measured resting HR (50 estimated -> 52 measured)...");
  await saveAthleteThresholds(owner, {
    maxHr: 199,
    restingHr: 52,
    lthr: 178,
    thresholdPaceSPerKm: pace(4, 34),
    ftpW: 150,
    restingHrEstimated: false,
    ftpProvisional: true,
  });

  console.log("\nDone.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
