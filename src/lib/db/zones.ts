import { getMeta, setMeta } from "./meta";
import type { DerivedZones } from "../zones";

// --- Stored training zones (single latest, in app_meta) -----------------------

const ZONES_KEY = "training_zones";

export async function getTrainingZones(): Promise<DerivedZones | null> {
  const raw = await getMeta(ZONES_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DerivedZones;
  } catch {
    return null;
  }
}

/** Saves field-derived or manually verified zones; no provider generation occurs here. */
export async function setTrainingZones(zones: DerivedZones): Promise<void> {
  await setMeta(ZONES_KEY, JSON.stringify(zones));
}
