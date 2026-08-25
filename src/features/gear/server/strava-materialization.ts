import { client, ensureMigrated } from "@/lib/db";
import { one } from "@/lib/db/helpers";
import type { OwnerContext } from "@/lib/owner-context";
import type { StravaGear } from "@/lib/types";

type GearKind = "shoe" | "bike";
type GearTable = "shoes" | "bikes";

export interface GearMaterializationCounts {
  created: number;
  updated: number;
  placeholders: number;
}

interface StoredGear {
  id: number;
  name: string;
  origin: "manual" | "strava";
  retired_at: string | null;
  provider_distance_m: number | null;
  provider_observed_at: string | null;
}

const emptyCounts = (): GearMaterializationCounts => ({ created: 0, updated: 0, placeholders: 0 });

function tableFor(kind: GearKind): GearTable {
  return kind === "shoe" ? "shoes" : "bikes";
}

function validDistance(distance: number | null): distance is number {
  return distance !== null && Number.isFinite(distance) && distance >= 0;
}

function placeholderName(kind: GearKind, id: string): string {
  return `Strava ${kind} (${id})`;
}

function mergeCounts(
  current: GearMaterializationCounts,
  next: GearMaterializationCounts
): GearMaterializationCounts {
  return {
    created: current.created + next.created,
    updated: current.updated + next.updated,
    placeholders: current.placeholders + next.placeholders,
  };
}

/**
 * Materializes one provider gear record without ever converting or overwriting
 * a manual row. `provider_distance_m` stays in Strava's metre unit; read
 * models are responsible for presenting it in kilometres.
 */
export async function materializeStravaGear(
  owner: OwnerContext,
  kind: GearKind,
  gear: Pick<StravaGear, "id" | "name" | "distance" | "retired">,
  {
    placeholder = false,
    now = new Date().toISOString(),
  }: { placeholder?: boolean; now?: string } = {}
): Promise<GearMaterializationCounts> {
  await ensureMigrated();
  const table = tableFor(kind);
  const existing = await one<StoredGear>(
    `SELECT id, name, origin, retired_at, provider_distance_m, provider_observed_at
     FROM ${table} WHERE user_id = ? AND strava_gear_id = ?`,
    [owner.userId, gear.id]
  );
  const hasDistance = validDistance(gear.distance);

  if (!existing) {
    const name = placeholder ? placeholderName(kind, gear.id) : gear.name;
    const retiredAt = !placeholder && gear.retired === true ? now : null;
    const args =
      kind === "shoe"
        ? [
            owner.userId,
            name,
            gear.id,
            "strava",
            hasDistance ? gear.distance : null,
            hasDistance ? now : null,
            now,
            retiredAt,
          ]
        : [
            owner.userId,
            name,
            gear.id,
            "strava",
            hasDistance ? gear.distance : null,
            hasDistance ? now : null,
            now,
            retiredAt,
          ];
    await client.execute({
      sql:
        kind === "shoe"
          ? `INSERT INTO shoes
             (user_id, name, strava_gear_id, origin, provider_distance_m, provider_observed_at,
              provider_last_seen_at, retired_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          : `INSERT INTO bikes
             (user_id, name, strava_gear_id, origin, provider_distance_m, provider_observed_at,
              provider_last_seen_at, retired_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args,
    });
    return { created: 1, updated: 0, placeholders: placeholder ? 1 : 0 };
  }

  // A manual row may have an existing voluntary mapping. It remains manual:
  // provider data can update only its separately labelled reference snapshot.
  const shouldRefreshName =
    existing.origin === "strava" && !placeholder && existing.name !== gear.name;
  const shouldRefreshRetirement =
    existing.origin === "strava" &&
    !placeholder &&
    gear.retired !== null &&
    (gear.retired ? existing.retired_at === null : existing.retired_at !== null);
  const shouldRefreshDistance = hasDistance && existing.provider_distance_m !== gear.distance;
  const updated = shouldRefreshName || shouldRefreshRetirement || shouldRefreshDistance;
  const nextRetiredAt =
    existing.origin === "strava" && !placeholder && gear.retired !== null
      ? gear.retired
        ? (existing.retired_at ?? now)
        : null
      : existing.retired_at;

  await client.execute({
    sql: `UPDATE ${table}
          SET name = CASE WHEN origin = 'strava' AND ? THEN ? ELSE name END,
              retired_at = CASE WHEN origin = 'strava' AND ? THEN ? ELSE retired_at END,
              provider_distance_m = CASE WHEN ? THEN ? ELSE provider_distance_m END,
              provider_observed_at = CASE WHEN ? THEN ? ELSE provider_observed_at END,
              provider_last_seen_at = ?
          WHERE id = ? AND user_id = ?`,
    args: [
      shouldRefreshName ? 1 : 0,
      gear.name,
      existing.origin === "strava" && !placeholder && gear.retired !== null ? 1 : 0,
      nextRetiredAt,
      hasDistance ? 1 : 0,
      hasDistance ? gear.distance : null,
      hasDistance ? 1 : 0,
      hasDistance ? now : null,
      now,
      existing.id,
      owner.userId,
    ],
  });
  return { created: 0, updated: updated ? 1 : 0, placeholders: 0 };
}

/** Materializes the full athlete endpoint response, scoped to one owner. */
export async function materializeStravaGearSnapshot(
  owner: OwnerContext,
  snapshot: { shoes: StravaGear[]; bikes: StravaGear[] },
  now = new Date().toISOString()
): Promise<GearMaterializationCounts> {
  let counts = emptyCounts();
  for (const gear of snapshot.shoes)
    counts = mergeCounts(counts, await materializeStravaGear(owner, "shoe", gear, { now }));
  for (const gear of snapshot.bikes)
    counts = mergeCounts(counts, await materializeStravaGear(owner, "bike", gear, { now }));
  return counts;
}

/** Creates a clearly labelled row when an activity references unknown provider gear. */
export async function materializeStravaActivityGearReference(
  owner: OwnerContext,
  kind: GearKind,
  gearId: string,
  now = new Date().toISOString()
): Promise<GearMaterializationCounts> {
  return materializeStravaGear(
    owner,
    kind,
    { id: gearId, name: placeholderName(kind, gearId), distance: null, retired: null },
    { placeholder: true, now }
  );
}
