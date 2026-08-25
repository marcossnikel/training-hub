import { getMeta, setMeta } from "./meta";
import type { DerivedZones } from "../zones";
import type { OwnerContext } from "../owner-context";

// --- Stored training zones (single latest, in app_meta) -----------------------

const ZONES_KEY = "training_zones";

export async function getTrainingZones(owner: OwnerContext): Promise<DerivedZones | null> {
  const raw = await getMeta(owner, ZONES_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DerivedZones;
  } catch {
    return null;
  }
}

/** Saves field-derived or manually verified zones; no provider generation occurs here. */
export async function setTrainingZones(owner: OwnerContext, zones: DerivedZones): Promise<void> {
  await setMeta(owner, ZONES_KEY, JSON.stringify(zones));
}
