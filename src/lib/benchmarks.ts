// Pure race/summary performance-benchmark engine. From whole-activity RUNNING
// summaries (no per-second streams) it derives:
//   - best times at each standard run distance, merged with the true sub-segment
//     efforts Strava stores per run (`bestEffortRecords`),
//   - a 2-parameter Critical Speed model (CS + D') and the threshold pace it
//     implies,
//   - Riegel race-time predictions,
//   - VDOT (Daniels–Gilbert) per effort, the current value and a monthly-max trend.
// No IO here — the data layer feeds these functions their inputs and the UI
// renders their output.
//
// SCOPE: running only. Cycling power (functional threshold power / mFTP)
// genuinely needs per-second power streams — the average/normalized power held
// over maximal windows — which are not kept as summaries, so cycling power is
// intentionally OUT OF SCOPE in this engine.
import type { StoredBestEffort } from "./best-efforts";
import { localDateInputValue } from "./format";
import { raceCategory, type RaceCategory } from "./races";

/** A whole-activity running summary the benchmark engine reads. */
export interface RunEffort {
  distanceKm: number;
  movingTimeS: number;
  isRace: boolean;
  name: string | null;
  /**
   * The activity's real Strava `sport_type` (e.g. "Run", "TrailRun"). Passed
   * through to `raceCategory` so trail runs are excluded from road benchmarks
   * even when their NAME does not say "trail".
   */
  sportType: string | null;
  /** Local calendar date/ISO of the effort, for display; not used in the math. */
  date: string | null;
}

// Standard road-race distances the engine reports best efforts for and predicts.
// Ultra, trail and the "other" catch-all are deliberately excluded: an ultra has
// no canonical length, and trail terrain/elevation make its pace incomparable to
// road efforts, so neither belongs in a distance ladder or a pace-based fit.
export type StandardDistance = "5k" | "10k" | "12k" | "15k" | "half" | "30k" | "marathon";

const METERS_PER_KM = 1000;
// Exact IAAF road distances for the two non-round standards.
const HALF_MARATHON_M = 21097.5;
const MARATHON_M = 42195;

/** Canonical length in metres of each standard distance. */
export const STANDARD_DISTANCE_M: Record<StandardDistance, number> = {
  "5k": 5000,
  "10k": 10000,
  "12k": 12000,
  "15k": 15000,
  half: HALF_MARATHON_M,
  "30k": 30000,
  marathon: MARATHON_M,
};

/** Standard distances shortest → longest, for display and prediction order. */
export const STANDARD_DISTANCE_ORDER: StandardDistance[] = [
  "5k",
  "10k",
  "12k",
  "15k",
  "half",
  "30k",
  "marathon",
];

/**
 * Narrows a RaceCategory to a StandardDistance, or null for ultra/trail/other.
 * A switch (not a cast) so the mapping stays exhaustive as categories change.
 */
function toStandardDistance(category: RaceCategory): StandardDistance | null {
  switch (category) {
    case "5k":
    case "10k":
    case "12k":
    case "15k":
    case "half":
    case "30k":
    case "marathon":
      return category;
    default:
      return null;
  }
}

// A summary only counts toward a standard distance when its measured length is
// within this fraction of the canonical distance. `raceCategory` uses broad,
// contiguous UI bands (e.g. any 0 < km < 8 snaps to "5k"), so without this a
// 3 km jog would masquerade as a 5k best effort and skew the ladder/Riegel
// anchor. ±10% keeps genuine 5k/10k/half efforts while rejecting stray short or
// odd-length runs that merely land in a band.
export const STANDARD_DISTANCE_TOLERANCE = 0.1;

/** The standard-distance bucket an effort falls in, or null if it is not one. */
function distanceOf(effort: RunEffort): StandardDistance | null {
  // Reuse the app's canonical distance bucketer, feeding it the effort's REAL
  // sport so trail runs are excluded exactly as raceCategory intends.
  const category = raceCategory({
    name: effort.name,
    sport_type: effort.sportType,
    distance_km: effort.distanceKm,
  });
  const standard = toStandardDistance(category);
  if (!standard) return null;
  // Band membership alone is too loose (the bands are contiguous UI bands, not
  // race distances): require the length to sit within tolerance of the canonical
  // distance before treating it as a genuine effort at that distance.
  const meters = effort.distanceKm * METERS_PER_KM;
  const canonical = STANDARD_DISTANCE_M[standard];
  if (Math.abs(meters - canonical) > canonical * STANDARD_DISTANCE_TOLERANCE) return null;
  return standard;
}

function paceSPerKm(effort: { distanceKm: number; movingTimeS: number }): number {
  return effort.movingTimeS / effort.distanceKm;
}

function hasValidSummary(effort: RunEffort): boolean {
  return effort.distanceKm > 0 && effort.movingTimeS > 0;
}

/** The fastest whole-activity effort at one standard distance. */
export interface BestEffort {
  distance: StandardDistance;
  distanceKm: number;
  movingTimeS: number;
  paceSPerKm: number;
  isRace: boolean;
  name: string | null;
  date: string | null;
}

/**
 * The fastest effort at each standard distance the athlete has run.
 *
 * IMPORTANT: this is a WHOLE-ACTIVITY best time at that distance, NOT the best
 * segment within a longer run — per-second streams (which an intra-run segment
 * would need) are not available as summaries. "Fastest" is compared by pace
 * (s/km) so efforts that fall in the same distance band but differ slightly in
 * length are ranked fairly. Returned shortest → longest, only for distances the
 * athlete has actually covered.
 */
export function bestEffortsByDistance(efforts: RunEffort[]): BestEffort[] {
  const best = new Map<StandardDistance, BestEffort>();
  for (const effort of efforts) {
    if (!hasValidSummary(effort)) continue;
    const distance = distanceOf(effort);
    if (!distance) continue;
    const pace = paceSPerKm(effort);
    const current = best.get(distance);
    if (!current || pace < current.paceSPerKm) {
      best.set(distance, {
        distance,
        distanceKm: effort.distanceKm,
        movingTimeS: effort.movingTimeS,
        paceSPerKm: pace,
        isRace: effort.isRace,
        name: effort.name,
        date: effort.date,
      });
    }
  }
  return STANDARD_DISTANCE_ORDER.filter((d) => best.has(d)).map((d) => best.get(d)!);
}

// Strava's best-effort names mapped to our standard distances, keyed uppercase so
// the lookup survives casing drift. Deliberately PARTIAL: Strava also cuts "400m",
// "1/2 mile", "1K", "1 mile", "2 mile", "10 mile" and "20K" segments, and none of
// those is a standard road distance in this engine. "20K" in particular must never
// map to `half`: 20 km is 1097 m SHORT of a half marathon, so its time would read
// as a falsely fast half. Our "12k" has no Strava equivalent, so it always comes
// from the whole-activity ladder.
//
// Exported so a test can pin the mapping itself: the length tolerance below would
// reject a wrongly mapped name for its own reason, which is not proof the mapping
// is right.
export const SEGMENT_DISTANCE_BY_NAME: Record<string, StandardDistance> = {
  "5K": "5k",
  "10K": "10k",
  "15K": "15k",
  "HALF-MARATHON": "half",
  "30K": "30k",
  MARATHON: "marathon",
};

// Strava cuts a best-effort segment at EXACTLY the named distance, so a stored
// length may differ from the canonical one only by its own rounding (the half
// marathon is stored as 21097 m, not 21097.5). 0.1% allows that and nothing more:
// a wider band would let a shorter segment stand in for a longer distance, which
// is the one error that silently manufactures a faster time.
export const SEGMENT_DISTANCE_TOLERANCE = 0.001;

/** The standard distance a stored segment effort is, or null if it is not one. */
function segmentDistanceOf(stored: StoredBestEffort): StandardDistance | null {
  if (!(stored.distance_m > 0) || !(stored.moving_time_s > 0)) return null;
  const distance = SEGMENT_DISTANCE_BY_NAME[stored.name.trim().toUpperCase()];
  if (!distance) return null;
  const canonical = STANDARD_DISTANCE_M[distance];
  if (Math.abs(stored.distance_m - canonical) > canonical * SEGMENT_DISTANCE_TOLERANCE) return null;
  return distance;
}

/** Where a displayed best effort was measured. */
export type BestEffortSource = "segment" | "activity";

/** A best effort with the kind of measurement it came from, for the UI to label. */
export interface BestEffortRecord extends BestEffort {
  source: BestEffortSource;
}

/**
 * Which of the two candidates at one distance the card should show.
 *
 * The segment is the better MEASUREMENT — a real 5 km inside the run rather than a
 * whole activity that merely happened to be about 5 km long — so it wins ties and
 * every close call. The whole activity only takes the row when it is genuinely the
 * better PERFORMANCE:
 *
 *  - Pace decides first, the same key `bestEffortsByDistance` ranks with, because a
 *    whole-activity effort may be up to the ±10% band shorter or longer than the
 *    canonical distance while a segment is exactly it. Comparing raw times across
 *    different lengths would simply favour whichever effort was shortest.
 *  - But a pace win by an OVER-DISTANCE activity is not a performance win at all
 *    when its raw time is no better: running 21.20 km in 1:38:32 spreads the same
 *    effort over 100 m more, which reads as 0.17 s/km "faster" than a true 21097 m
 *    segment in 1:38:07 while actually taking 25 s LONGER to cover the distance.
 *    Rounding noise of that size cannot be allowed to discard the exact segment, so
 *    when the activity is longer than the canonical distance the segment keeps the
 *    row unless the activity also beat it on raw time.
 *
 * An UNDER-distance activity that is faster per kilometre still wins: its raw time is
 * smaller only because it covered less ground, and pace is the only fair comparison
 * left. Live example at the time of writing — 10k shows a true 10.00 km segment in
 * 45:35 (4:34/km) rather than 45:12 over 9.86 km (4:35/km), which was never a 10 km.
 * The UI shows the measured length of whichever row wins, so the reader can always
 * see what the time covers.
 */
function preferredRecord(segment: BestEffortRecord, whole: BestEffortRecord): BestEffortRecord {
  // Strict `<`: an equal-pace segment keeps its place, being the truer measurement.
  if (!(whole.paceSPerKm < segment.paceSPerKm)) return segment;
  const overDistance = whole.distanceKm * METERS_PER_KM > STANDARD_DISTANCE_M[segment.distance];
  if (overDistance && segment.movingTimeS <= whole.movingTimeS) return segment;
  return whole;
}

/**
 * The best time at each standard distance from BOTH sources: the true sub-segments
 * Strava cut out of individual runs (`activity_best_efforts`, passed in as stored
 * rows) and the whole-activity ladder above. `preferredRecord` owns the choice
 * between the two; every distance either source knows about is reported, so a
 * distance with no segment (our "12k" has no Strava equivalent) still falls back to
 * the whole-activity ladder rather than disappearing.
 *
 * Preferring the segment is what makes this an improvement rather than a swap: only
 * a fraction of runs have a cached detail payload, so the fastest stored 5K may come
 * from an easy run while the whole-activity ladder holds a 5 km race, and that race
 * still wins.
 *
 * pr_rank is deliberately IGNORED here. Strava's rank is frozen at the moment an
 * activity's detail was first fetched (`saveActivityDetail` only writes when
 * `detail_json` is empty), so stored ranks go stale: the live table currently has
 * two different activities both claiming pr_rank = 1 at 10K, 15K, 20K and the half.
 * Deriving the fastest row from the TIMES is self-consistent and cannot present a
 * stale rank as current truth.
 */
export function bestEffortRecords(
  efforts: RunEffort[],
  stored: readonly StoredBestEffort[]
): BestEffortRecord[] {
  const segments = new Map<StandardDistance, BestEffortRecord>();
  for (const row of stored) {
    const distance = segmentDistanceOf(row);
    if (!distance) continue;
    const distanceKm = row.distance_m / METERS_PER_KM;
    const record: BestEffortRecord = {
      distance,
      distanceKm,
      movingTimeS: row.moving_time_s,
      paceSPerKm: row.moving_time_s / distanceKm,
      isRace: row.is_race,
      // The run the segment was cut from, so the row still names its activity.
      name: row.activity_name,
      date: row.date,
      source: "segment",
    };
    const current = segments.get(distance);
    if (!current || record.paceSPerKm < current.paceSPerKm) segments.set(distance, record);
  }

  const best = new Map(segments);
  for (const whole of bestEffortsByDistance(efforts)) {
    const segment = best.get(whole.distance);
    const activity: BestEffortRecord = { ...whole, source: "activity" };
    best.set(whole.distance, segment ? preferredRecord(segment, activity) : activity);
  }
  return STANDARD_DISTANCE_ORDER.filter((d) => best.has(d)).map((d) => best.get(d)!);
}

/** One maximal-effort point (distance in metres vs. time in seconds) fed to the CS fit. */
export interface CriticalSpeedPoint {
  distance: StandardDistance;
  distanceM: number;
  timeS: number;
}

export interface CriticalSpeed {
  /** Critical speed in m/s — the regression slope. */
  cs: number;
  /** Anaerobic distance capacity D' in metres — the regression intercept. */
  dPrime: number;
  /** Threshold pace implied by CS, in seconds per km (1000 / CS). */
  thresholdPaceSPerKm: number;
  /** Coefficient of determination (0..1) of the fit — a confidence indicator. */
  rSquared: number;
  /** The maximal-effort points the fit used, so the UI can show its coverage. */
  points: CriticalSpeedPoint[];
}

// The 2-parameter model needs maximal efforts at at least this many DISTINCT
// distances to define a line; below it the fit is under-determined.
export const MIN_CS_DISTANCES = 2;

interface LinearFit {
  slope: number;
  intercept: number;
  rSquared: number;
}

/**
 * Ordinary least-squares fit of y = slope·x + intercept, plus the coefficient
 * of determination. Returns null when x has no spread (a vertical/undefined
 * line). A perfect or degenerate fit (all y equal, or two points) has R² = 1.
 */
function linearFit(xs: number[], ys: number[]): LinearFit | null {
  const n = xs.length;
  if (n < 2) return null;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  const rSquared = syy === 0 ? 1 : Math.max(0, Math.min(1, (sxy * sxy) / (sxx * syy)));
  return { slope, intercept, rSquared };
}

/**
 * Fits the 2-parameter Critical Speed model `distance_m = CS·time_s + D'` by
 * linear regression over the athlete's best maximal efforts at ≥2 distinct
 * distances, and derives the threshold pace CS implies (1000 / CS s/km).
 *
 * PREFERS races as the maximal efforts: an easy or steady run is not a maximal
 * effort and would bias CS downward, so only `isRace` efforts feed the model —
 * one point per distance, the fastest (highest-speed) at each. Returns null when
 * there are fewer than MIN_CS_DISTANCES distinct race distances (the caller
 * shows a "need ≥2 race distances" state) or when the fit is degenerate.
 */
export function estimateCriticalSpeed(efforts: RunEffort[]): CriticalSpeed | null {
  const byDistance = new Map<StandardDistance, CriticalSpeedPoint>();
  for (const effort of efforts) {
    if (!effort.isRace || !hasValidSummary(effort)) continue;
    const distance = distanceOf(effort);
    if (!distance) continue;
    const point: CriticalSpeedPoint = {
      distance,
      distanceM: effort.distanceKm * METERS_PER_KM,
      timeS: effort.movingTimeS,
    };
    const current = byDistance.get(distance);
    // Higher speed = a better maximal-effort estimate at this distance.
    if (!current || point.distanceM / point.timeS > current.distanceM / current.timeS) {
      byDistance.set(distance, point);
    }
  }

  const points = [...byDistance.values()].sort((a, b) => a.timeS - b.timeS);
  if (points.length < MIN_CS_DISTANCES) return null;

  const fit = linearFit(
    points.map((p) => p.timeS),
    points.map((p) => p.distanceM)
  );
  // A non-positive slope would be a nonsensical (negative/zero) critical speed.
  if (!fit || fit.slope <= 0) return null;

  return {
    cs: fit.slope,
    dPrime: fit.intercept,
    thresholdPaceSPerKm: METERS_PER_KM / fit.slope,
    rSquared: fit.rSquared,
    points,
  };
}

// Riegel's endurance model t2 = t1·(d2/d1)^k. 1.06 is Riegel's empirically
// fitted fatigue exponent for running (k > 1 means pace slows as distance grows).
export const RIEGEL_FATIGUE_EXPONENT = 1.06;

export interface RacePrediction {
  distance: StandardDistance;
  distanceM: number;
  predictedTimeS: number;
  paceSPerKm: number;
}

/**
 * Riegel race-time predictions for the given standard distances from one
 * reference effort: `t2 = t1·(d2/d1)^RIEGEL_FATIGUE_EXPONENT`. Returns [] if the
 * reference has no positive distance/time. Extrapolating far from the reference
 * distance is inherently less reliable — the UI notes this.
 */
export function predictRaceTimes(
  reference: { distanceKm: number; movingTimeS: number },
  distances: StandardDistance[] = STANDARD_DISTANCE_ORDER
): RacePrediction[] {
  const d1 = reference.distanceKm * METERS_PER_KM;
  const t1 = reference.movingTimeS;
  if (!(d1 > 0) || !(t1 > 0)) return [];
  return distances.map((distance) => {
    const d2 = STANDARD_DISTANCE_M[distance];
    const predictedTimeS = t1 * Math.pow(d2 / d1, RIEGEL_FATIGUE_EXPONENT);
    return {
      distance,
      distanceM: d2,
      predictedTimeS,
      paceSPerKm: (predictedTimeS / d2) * METERS_PER_KM,
    };
  });
}

/**
 * The best effort to anchor Riegel predictions on: the athlete's fastest (by
 * pace) effort at a standard distance, preferring races since a race is a truer
 * maximal performance. Returns null when there is no usable standard-distance
 * effort. Only standard-distance efforts qualify so a stray short jog cannot
 * become the reference.
 */
export function pickReferenceEffort(efforts: RunEffort[]): RunEffort | null {
  const candidates = efforts.filter((e) => hasValidSummary(e) && distanceOf(e) !== null);
  if (candidates.length === 0) return null;
  const races = candidates.filter((e) => e.isRace);
  const pool = races.length > 0 ? races : candidates;
  return pool.reduce((best, effort) => (paceSPerKm(effort) < paceSPerKm(best) ? effort : best));
}

/**
 * VDOT for one maximal effort, by Daniels and Gilbert: the VO2 that running at
 * this speed demands, divided by the fraction of VO2max a human can hold for
 * this long. The result is a pace-and-duration fitness index in ml/kg/min units,
 * comparable across distances — a 5k and a half marathon run equally hard land on
 * the same number, which is what makes it a fitness trend rather than a PR list.
 *
 * The two published curves, with v in metres per minute and t in minutes:
 *   VO2 demand = -4.6 + 0.182258·v + 0.000104·v²
 *   sustainable fraction = 0.8 + 0.1894393·e^(-0.012778·t) + 0.2989558·e^(-0.1932605·t)
 *
 * Straight arithmetic on the caller's numbers: pass a positive distance and time
 * (`qualifiesForVdot` is the gate the trend uses) or the result is meaningless.
 */
export function vdotFromEffort(distanceM: number, timeS: number): number {
  const minutes = timeS / 60;
  const v = distanceM / minutes;
  const demand = -4.6 + 0.182258 * v + 0.000104 * v * v;
  const fraction =
    0.8 + 0.1894393 * Math.exp(-0.012778 * minutes) + 0.2989558 * Math.exp(-0.1932605 * minutes);
  return demand / fraction;
}

// Shortest effort VDOT is read off. Below about 1500 m the Daniels-Gilbert
// duration curve is being asked about efforts an anaerobic contribution
// dominates, so a fast 400 m reads as implausible aerobic fitness. It also drops
// exactly the three sub-1500 m segments Strava cuts ("400m", "1/2 mile", "1K").
export const MIN_VDOT_DISTANCE_M = 1500;

/** How far back the current VDOT looks for its best qualifying effort. */
export const VDOT_CURRENT_WINDOW_DAYS = 90;

/** Months of monthly-max history the trend covers, including the current one. */
export const VDOT_TREND_MONTHS = 12;

/** A stored effort reduced to what the VDOT math reads: how far, how long, when. */
export type VdotEffort = Pick<StoredBestEffort, "distance_m" | "moving_time_s" | "date">;

/** Is this stored effort long enough, and complete enough, to read VDOT off? */
function qualifiesForVdot(effort: VdotEffort): boolean {
  return (
    effort.distance_m >= MIN_VDOT_DISTANCE_M && effort.moving_time_s > 0 && effort.date !== null
  );
}

/** The best VDOT one calendar month produced, or null when it had no qualifying effort. */
export interface VdotMonth {
  /** Month key, "YYYY-MM". */
  month: string;
  vdot: number | null;
}

export interface VdotTrend {
  /** Best VDOT of the trailing VDOT_CURRENT_WINDOW_DAYS days; null when there is none. */
  current: number | null;
  /** VDOT_TREND_MONTHS entries, oldest first, ending in `asOf`'s month. */
  months: VdotMonth[];
}

/** The local YYYY-MM-DD key `days` before `asOf`, via calendar arithmetic (DST-safe). */
function dayKeyBefore(asOf: Date, days: number): string {
  return localDateInputValue(new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate() - days));
}

/**
 * Current VDOT plus its monthly-max trend, from stored best efforts.
 *
 * Each month keeps the single best VDOT any qualifying effort in it produced, and
 * months with none stay null: only a fraction of runs carry a cached detail
 * payload, so an empty month means "nothing measured", never "fitness dropped to
 * zero", and the UI has to draw it as a gap. The current value is a max over the
 * trailing 90 days rather than the latest reading, so an easy-run segment cannot
 * make fitness look like it collapsed since the last hard effort.
 *
 * Dates are compared as local YYYY-MM-DD keys, the form the rows already carry, so
 * a stored stamp is never re-interpreted through a timezone.
 */
export function vdotTrend(efforts: readonly VdotEffort[], asOf: Date): VdotTrend {
  const months: VdotMonth[] = [];
  for (let back = VDOT_TREND_MONTHS - 1; back >= 0; back--) {
    const month = new Date(asOf.getFullYear(), asOf.getMonth() - back, 1);
    months.push({ month: localDateInputValue(month).slice(0, 7), vdot: null });
  }
  const byMonth = new Map(months.map((m) => [m.month, m]));
  const currentFrom = dayKeyBefore(asOf, VDOT_CURRENT_WINDOW_DAYS);
  let current: number | null = null;

  for (const effort of efforts) {
    if (!qualifiesForVdot(effort)) continue;
    const day = (effort.date as string).slice(0, 10);
    const vdot = vdotFromEffort(effort.distance_m, effort.moving_time_s);
    if (day >= currentFrom && (current === null || vdot > current)) current = vdot;
    const month = byMonth.get(day.slice(0, 7));
    if (month && (month.vdot === null || vdot > month.vdot)) month.vdot = vdot;
  }

  return { current, months };
}
