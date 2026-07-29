// Pure zone engine: Friel training zones derived from the athlete's thresholds.
// No IO and no imports — the data layer feeds these functions.
//
// The training-load half (TSS, the Performance Management Chart, form state)
// lived here too until it was removed: TrainingPeaks already owns those numbers
// and this app was computing a second, different answer for them.

export interface AthleteThresholds {
  maxHr: number;
  restingHr: number;
  lthr: number;
  thresholdPaceSPerKm: number;
  ftpW: number;
  restingHrEstimated: boolean;
  ftpProvisional: boolean;
  updatedAt: string | null;
}

/**
 * Accepted stored threshold-pace range in s/km — the bounds saveThresholdsAction
 * enforces. Shared so the Performance page's "apply suggested pace" control can
 * suppress an apply that the save would reject (a slow race can imply a pace
 * above the ceiling) instead of offering a button that always fails validation.
 */
export const THRESHOLD_PACE_RANGE = { min: 120, max: 600 } as const;

/**
 * Accepted stored FTP range in watts, the same bounds saveThresholdsAction
 * enforces. Shared for the same reason as the pace range above: the Performance
 * page's "apply estimated FTP" control suppresses an apply the save would
 * reject instead of offering a button that always fails validation.
 */
export const FTP_RANGE = { min: 50, max: 600 } as const;

/**
 * A single training zone. Bounds are inclusive of `min`, exclusive of `max`;
 * a null bound is open-ended. For HR the units are bpm (min < max). For pace
 * the units are seconds per km, where a smaller number is faster, so `min` is
 * the fastest pace in the zone and `max` the slowest.
 */
export interface Zone {
  zone: 1 | 2 | 3 | 4 | 5;
  min: number | null;
  max: number | null;
}

// Friel five-zone cut points, as fractions of the threshold value.
const ZONE_FRACTIONS = [0.81, 0.9, 0.94, 1.0] as const;

/**
 * Friel heart-rate zones as a percentage of LTHR: Z1 <81%, Z2 81–89%,
 * Z3 90–93%, Z4 94–99%, Z5 ≥100%. Bounds are bpm.
 */
export function hrZones(thresholds: AthleteThresholds): Zone[] {
  const [b1, b2, b3, b4] = ZONE_FRACTIONS.map((f) => Math.round(f * thresholds.lthr));
  return [
    { zone: 1, min: null, max: b1 },
    { zone: 2, min: b1, max: b2 },
    { zone: 3, min: b2, max: b3 },
    { zone: 4, min: b3, max: b4 },
    { zone: 5, min: b4, max: null },
  ];
}

/**
 * Running pace zones as multiples of threshold-pace speed, mirroring the HR
 * fractions. A speed fraction f maps to a pace of thresholdPace / f, so the
 * faster (higher) zones carry the smaller pace numbers. Bounds are s/km.
 */
export function paceZones(thresholds: AthleteThresholds): Zone[] {
  const [p1, p2, p3, p4] = ZONE_FRACTIONS.map((f) =>
    Math.round(thresholds.thresholdPaceSPerKm / f)
  );
  return [
    { zone: 1, min: p1, max: null },
    { zone: 2, min: p2, max: p1 },
    { zone: 3, min: p3, max: p2 },
    { zone: 4, min: p4, max: p3 },
    { zone: 5, min: null, max: p4 },
  ];
}

// Power cut points as fractions of FTP, collapsed to the same five-zone shape
// as the HR and pace zones: recovery, endurance, tempo, threshold, above.
const POWER_ZONE_FRACTIONS = [0.55, 0.75, 0.9, 1.05] as const;

/**
 * Cycling power zones as a percentage of FTP: Z1 <55%, Z2 55–74%, Z3 75–89%,
 * Z4 90–104%, Z5 ≥105%. Bounds are watts. Only meaningful for rides recorded
 * with a real power meter.
 */
export function powerZones(thresholds: AthleteThresholds): Zone[] {
  const [b1, b2, b3, b4] = POWER_ZONE_FRACTIONS.map((f) => Math.round(f * thresholds.ftpW));
  return [
    { zone: 1, min: null, max: b1 },
    { zone: 2, min: b1, max: b2 },
    { zone: 3, min: b2, max: b3 },
    { zone: 4, min: b3, max: b4 },
    { zone: 5, min: b4, max: null },
  ];
}

/**
 * Index (0–4) of the zone a value falls in, or -1 when it fits none. Bounds
 * follow `Zone`: min inclusive, max exclusive, a null bound open-ended. Works
 * for HR and power (min below max) as well as pace, where min is the fastest
 * bound of the zone.
 */
export function zoneIndexOf(value: number, zones: Zone[]): number {
  for (let i = 0; i < zones.length; i++) {
    const { min, max } = zones[i];
    if ((min == null || value >= min) && (max == null || value < max)) return i;
  }
  return -1;
}

/** The four inner boundaries of a five-zone set, in zone order. */
export type ZoneBounds = [number, number, number, number];

/**
 * The four inner boundaries of a five-zone set, in zone order: entry i is the
 * value where zone i+1 ends and zone i+2 begins. Read off the `Zone` bound that
 * faces the next higher zone, which is `max` where a bigger number is a higher
 * zone (heart rate, power) and `min` where a smaller one is (`descending`: pace
 * in s/km). So the list ascends for heart rate and descends for pace, and in
 * both cases a later entry always belongs to a higher zone. Classification
 * itself stays with `zoneIndexOf`; these are for drawing the boundaries.
 *
 * Null unless `zones` is a five-zone set whose four inner bounds are all set.
 * The tuple return is the point: a caller can never be handed a short list and
 * silently shade or label every zone one slot off.
 */
export function zoneBoundsOf(zones: Zone[], descending: boolean): ZoneBounds | null {
  if (zones.length !== 5) return null;
  const [b1, b2, b3, b4] = zones.slice(0, -1).map((z) => (descending ? z.min : z.max));
  if (b1 == null || b2 == null || b3 == null || b4 == null) return null;
  return [b1, b2, b3, b4];
}

/**
 * Seconds spent in each zone along a time-indexed sample series (a cached
 * activity stream, or a full-resolution one). Each interval's duration
 * (`timeS[i + 1] - timeS[i]`) is attributed to the zone of its leading sample;
 * samples with no value, no timestamp or no matching zone contribute nothing, so
 * gaps (a dropped HR strap, a stopped GPS pace) shrink the total rather than
 * landing in a wrong zone.
 *
 * Returns null when nothing could be attributed, which lets callers hide a bar
 * instead of drawing an all-zero one.
 */
export function zoneSeconds(
  timeS: readonly (number | null)[],
  values: readonly (number | null)[],
  zones: Zone[]
): number[] | null {
  const out = new Array<number>(zones.length).fill(0);
  const n = Math.min(timeS.length, values.length);
  let any = false;
  for (let i = 0; i < n - 1; i++) {
    const t0 = timeS[i];
    const t1 = timeS[i + 1];
    const value = values[i];
    if (t0 == null || t1 == null || value == null) continue;
    const dt = t1 - t0;
    if (dt <= 0) continue;
    const zi = zoneIndexOf(value, zones);
    if (zi < 0) continue;
    out[zi] += dt;
    any = true;
  }
  return any ? out.map((s) => Math.round(s)) : null;
}

/**
 * Easy (Z1-2) versus hard (Z3-5) share of a zone-seconds distribution, in whole
 * percent — the same split blocks.ts uses for polarization. The two always sum
 * to 100. Null when the distribution is empty.
 */
export function easyHardPct(zoneSec: number[]): { easyPct: number; hardPct: number } | null {
  const total = zoneSec.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  const easyPct = Math.round(((zoneSec[0] + zoneSec[1]) / total) * 100);
  return { easyPct, hardPct: 100 - easyPct };
}
