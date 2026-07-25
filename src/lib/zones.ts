// Shared types for the AI-derived training zones, plus the presentation the five
// zones share app-wide (palette and Z1–Z5 labels). Pure (no IO): the coach layer
// produces a DerivedZones, the db layer stores it, and the UI renders it.

import type { Dict } from "@/lib/i18n";

export type ZoneConfidence = "low" | "medium" | "high";

export interface TrainingZone {
  zone: 1 | 2 | 3 | 4 | 5;
  /** Heart-rate bounds (bpm); null = open-ended. */
  hrMin: number | null;
  hrMax: number | null;
  /** Pace bounds (s/km); paceMin is the FASTER (smaller) number. null = open. */
  paceMinSPerKm: number | null;
  paceMaxSPerKm: number | null;
}

export interface DerivedZones {
  maxHr: number | null;
  restingHr: number | null;
  /** Aerobic threshold (LT1) and lactate/anaerobic threshold (LT2). */
  lt1Hr: number | null;
  lt2Hr: number | null;
  lt1PaceSPerKm: number | null;
  lt2PaceSPerKm: number | null;
  /** VO2max estimated from field race performances (VDOT-style). */
  vo2maxEstimate: number | null;
  confidence: ZoneConfidence;
  /** 2-4 sentence insight tying the zones to the athlete's goals. */
  summary: string;
  /** Specific questions whose answers would sharpen the estimate. */
  missingInfo: string[];
  zones: TrainingZone[];
  generatedAt: string;
}

/** The five zones in display order, labeled by i18n key. */
export const ZONE_KEYS = ["z1", "z2", "z3", "z4", "z5"] as const;
export type ZoneKey = (typeof ZONE_KEYS)[number];

/**
 * The app's only five-colour chart palette, in zone order. The single home for
 * it: the zone bar, the laps table's zone dot and the stream chart's zone bands
 * all tint Z1–Z5 from here, so a colour never means two different zones.
 */
export const ZONE_COLORS = [
  "var(--primary)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

/** Z1–Z5 in display order, from the dict tokens every zone surface labels with. */
export function zoneLabels(t: Dict): string[] {
  return ZONE_KEYS.map((key) => t.compare.zones[key]);
}
