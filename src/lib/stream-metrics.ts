// The derived metrics an activity's stream is worth keeping after the chart has
// taken its 400 points: efficiency factor, aerobic decoupling, normalized power,
// time in zone and grade-adjusted pace. Computed once — at fetch time from the full-resolution
// stream, or by the local backfill from the cached downsample — and persisted in
// `activity_metrics`, so pages read columns instead of re-integrating a stream on
// every render.
//
// Pure: no DB, no network. The efficiency factor and decoupling are the T12
// functions in analysis.ts, called with the same whole-activity inputs the
// activity page passes, so a persisted value and a freshly computed one are the
// same number. Only normalized power is new here, and only it needs full
// resolution.

import { computeDecoupling, computeEf, efBasisFor } from "./analysis";
import { isRideSport, rideMetrics } from "./cycling";
import { hrZones, paceZones, zoneSeconds, type AthleteThresholds } from "./fitness";
import type { ActivityStreams } from "./streams";
import type { Activity } from "./types";
import { isRunSport } from "./validate";

/**
 * What a stored row was computed FROM, which is the only thing that separates two
 * otherwise identical rows. The numbers are a precision ladder — a higher version
 * is strictly better informed than a lower one — which is what lets the backfill
 * refuse to overwrite a row above the one it can produce.
 *
 * 1 — the 400-point cached downsample: good enough for half averages and zone
 *     integration, useless for a 30-second rolling power window, so it never
 *     carries normalized power. Grade, when it has any, is differentiated from
 *     the altitude trace.
 * 2 — the full-resolution stream WITHOUT a usable `grade_smooth` channel.
 *     Carries normalized power; any grade-adjusted pace on it came from the
 *     altitude fallback. Most of these rows are the handful fetched between plan
 *     tasks T24 and T26, before the channel was requested, but a fetch still
 *     lands here today whenever Strava returns no grade — an indoor run, or any
 *     activity with no elevation trace.
 * 3 — the full-resolution stream including `grade_smooth`. The only source of a
 *     per-sample GAP from real grade.
 *
 * 2 versus 3 is decided per payload by {@link fullResMetricsVersion}, never
 * assumed from the fact that the channel was asked for: the ladder is how a
 * future re-fetch decides what is worth upgrading, so a row that says 3 has to
 * actually hold grade.
 */
export const METRICS_VERSION_DOWNSAMPLED = 1;
export const METRICS_VERSION_FULL_RES_NO_GRADE = 2;
export const METRICS_VERSION_FULL_RES = 3;

/** The derived metrics of one activity. Every field is independently nullable. */
export interface ActivityMetrics {
  /** Efficiency factor: watts per bpm (rides with a meter) or m/min per bpm (runs). */
  ef: number | null;
  /** Aerobic decoupling, percent. */
  decouplingPct: number | null;
  /** Normalized power, watts. Rides with a real meter, at full resolution, only. */
  npW: number | null;
  /** Seconds in heart-rate zones Z1 to Z5. */
  hrZoneSecs: number[] | null;
  /** Seconds in pace zones Z1 to Z5. Runs only. */
  paceZoneSecs: number[] | null;
  /** Whole-activity grade-adjusted pace, seconds per km. Runs only. */
  avgGapSPerKm: number | null;
}

/**
 * The whole-activity figures the metrics read alongside the stream. Kept as one
 * group rather than five loose arguments because they describe a single thing —
 * the activity the stream belongs to — and because the efficiency factor is
 * defined on exactly these summary averages, not on stream integrals.
 */
export interface MetricsActivity {
  sportType: string | null;
  distanceKm: number | null;
  movingTimeS: number | null;
  /**
   * The activity's average pace, seconds per km — the very number the activity
   * page's Pace tile renders, not `movingTimeS / distanceKm`. The two differ:
   * `distance_km` is stored rounded to two decimals, so re-deriving the pace
   * from it lands up to a few seconds per km off the stored pace, which is more
   * than the median terrain adjustment. The grade-adjusted pace scales THIS, so
   * a run with no grade at all shows a GAP exactly equal to its pace.
   */
  avgPaceSPerKm: number | null;
  avgHr: number | null;
  /** Average power from a real meter, watts. Null for every other sport. */
  powerW: number | null;
  /** Strava's `device_watts`: a real power meter recorded this activity. */
  hasRealPower: boolean;
}

/**
 * Reduces a stored activity row to the figures {@link computeStreamMetrics}
 * reads. One adapter so the fetch-time hook and the local backfill can never
 * disagree about which wattage counts as real or which average feeds the
 * efficiency factor.
 */
export function metricsActivityOf(
  activity: Pick<
    Activity,
    "sport_type" | "distance_km" | "moving_time_s" | "avg_pace_s_per_km" | "avg_hr" | "raw_json"
  >
): MetricsActivity {
  const ride = rideMetrics(activity);
  return {
    sportType: activity.sport_type,
    distanceKm: activity.distance_km,
    movingTimeS: activity.moving_time_s,
    avgPaceSPerKm: activity.avg_pace_s_per_km,
    avgHr: activity.avg_hr,
    // Strava's weighted average is its own normalized power; it is the better
    // efficiency-factor numerator when present, and it is what the activity page
    // already divides by heart rate.
    powerW: ride.hasRealPower ? (ride.normalizedPower ?? ride.avgPower) : null,
    hasRealPower: ride.hasRealPower,
  };
}

const METRES_PER_KM = 1000;

/** Rolling window normalized power averages over, seconds. */
const NP_WINDOW_S = 30;

/**
 * The longest span a single sample's wattage may be credited for, seconds.
 *
 * A power trace samples every one to three seconds, so a longer step is not a
 * slow recording rate, it is a gap: auto-pause at a traffic light, a dropped
 * ANT+ connection, a tunnel. Holding the last recorded wattage across it would
 * charge the whole stop at the power going into it — a 300 W effort, a
 * 20-minute pause and a 100 W spin back home reads 287 W instead of the ~240 W
 * the recorded riding actually cost. Capped at the rolling window, so no single
 * sample can ever outweigh the window it feeds, and the trace either side of a
 * gap is spliced together rather than bridged.
 */
const MAX_SAMPLE_SPAN_S = NP_WINDOW_S;

/**
 * Normalized power: a 30-second rolling average of the power trace, then the
 * mean of those averages raised to the fourth, then the fourth root. The fourth
 * power is what makes it read as "the steady wattage that would have cost the
 * same", since physiological cost rises far faster than power does — a surging
 * ride normalizes well above its plain average, a perfectly steady one lands
 * exactly on it.
 *
 * Time-weighted rather than per-sample, so a stream with gaps or a non-1 Hz
 * recording rate is not silently mis-averaged, and no sample is credited for
 * more than {@link MAX_SAMPLE_SPAN_S} (see there). Null when the trace is
 * shorter than one window, which is why this can only be computed at full
 * resolution: the 400-point downsample of an hour-long ride steps ~9 seconds at
 * a time and would average away exactly the surges the metric exists to capture.
 */
export function normalizedPower(
  timeS: readonly (number | null)[],
  watts: readonly (number | null)[]
): number | null {
  const t: number[] = [];
  const w: number[] = [];
  const n = Math.min(timeS.length, watts.length);
  for (let i = 0; i < n; i++) {
    const time = timeS[i];
    const power = watts[i];
    if (time == null || power == null || power < 0) continue;
    // Time must advance for a segment to carry any duration.
    if (t.length > 0 && time <= t[t.length - 1]) continue;
    t.push(time);
    w.push(power);
  }
  if (t.length < 2) return null;

  // The clock the integration runs on: elapsed recorded time, with every step
  // capped at MAX_SAMPLE_SPAN_S so a recording gap is closed rather than filled
  // in at the last wattage. Identical to raw elapsed time on a stream that
  // recorded continuously, which is every stream without a pause or a dropout.
  const c: number[] = new Array(t.length);
  c[0] = 0;
  for (let i = 1; i < t.length; i++) {
    c[i] = c[i - 1] + Math.min(t[i] - t[i - 1], MAX_SAMPLE_SPAN_S);
  }
  if (c[c.length - 1] < NP_WINDOW_S) return null;

  // Sample i's power holds over [c[i], c[i+1]). `acc` is the integral of power
  // over the segments ending at or before the cursor, from c[lo] onwards; `lo`
  // trails just far enough back that the 30 s window starts inside segment lo.
  let acc = 0;
  let lo = 0;
  let quartic = 0;
  let weight = 0;
  for (let i = 1; i < c.length; i++) {
    acc += w[i - 1] * (c[i] - c[i - 1]);
    const windowStart = c[i] - NP_WINDOW_S;
    while (c[lo + 1] <= windowStart) {
      acc -= w[lo] * (c[lo + 1] - c[lo]);
      lo++;
    }
    if (windowStart < c[0]) continue;
    // Segment lo straddles the window start; drop only the part before it.
    const partial = w[lo] * (windowStart - c[lo]);
    const rolling = (acc - partial) / NP_WINDOW_S;
    const dt = c[i] - c[i - 1];
    // The fourth power and the matching fourth root ARE normalized power: a
    // square/square-root pair would be a root-mean-square and a 1/1 pair the
    // plain average, both of which under-read a surging ride. Pinned by the
    // exact-value tests in stream-metrics.test.ts.
    quartic += rolling ** 4 * dt;
    weight += dt;
  }
  if (weight <= 0) return null;
  return (quartic / weight) ** 0.25;
}

// ---------------------------------------------------------------------------
// Grade-adjusted pace
// ---------------------------------------------------------------------------

/**
 * Minetti's measured cost of running, joules per kilogram per metre, against the
 * gradient `i` expressed as a fraction (0.1 is a 10% climb). Fitted from
 * treadmill respirometry across -45% to +45% (Minetti et al., 2002); the terms
 * run from the fifth power down to the constant.
 *
 * The polynomial is a U, not a line: cost bottoms out around -20% and climbs
 * again on anything steeper downhill, because braking a descent eventually costs
 * more than the gravity assist returns. That is the whole reason it replaces the
 * linear credit/debit approximation this task deletes, which had a run that
 * plunged 25% reading as effortless.
 */
const MINETTI_COST_COEFFS = [155.4, -30.4, -43.3, 46.3, 19.5, 3.6] as const;

/** Cost of running on the flat, J/kg/m: the constant term, and the divisor. */
const MINETTI_FLAT_COST = MINETTI_COST_COEFFS[MINETTI_COST_COEFFS.length - 1];

/**
 * Beyond this the polynomial is extrapolating past the treadmill data it was fit
 * to, and real recorded grades that steep are almost always artefacts — a
 * barometric spike, a GPS point through a building. Both directions.
 */
const MAX_ABS_GRADE_PCT = 30;

/**
 * How much a grade multiplies the metabolic cost of running one metre, relative
 * to flat ground. 1.0 on the flat, above 1 uphill, below 1 downhill.
 *
 * Grade-adjusted pace DIVIDES the raw pace by this: climbing at a factor of 1.66
 * (a 10% grade) means each metre cost 1.66 flat metres, so the same effort would
 * have produced a pace 1.66 times faster on the level. Pure and total — every
 * input maps to a finite positive factor, with the grade clamped to
 * ±{@link MAX_ABS_GRADE_PCT} and a non-finite grade treated as flat.
 */
export function paceAdjustmentFactor(gradePct: number): number {
  if (!Number.isFinite(gradePct)) return 1;
  const clamped = Math.max(-MAX_ABS_GRADE_PCT, Math.min(MAX_ABS_GRADE_PCT, gradePct));
  const i = clamped / 100;
  let cost = 0;
  for (const coeff of MINETTI_COST_COEFFS) cost = cost * i + coeff;
  return cost / MINETTI_FLAT_COST;
}

/**
 * Shortest run a grade may be measured over, metres. Not a rejection threshold
 * but a WINDOW WIDTH: the fallback below widens forward until it has this much
 * ground, so a grade is always a rise over ten metres whatever the sample
 * spacing happens to be. That matters because the spacing is not a constant —
 * the 400-point downsample steps ~58 m on a 22 km run and ~2 m on a 0.9 km one,
 * and a fixed count of samples means completely different things on the two.
 *
 * Ten metres is the shortest run over which the barometric altimeter's own
 * quantization (0.2 m steps) stays under a couple of percent of grade. The
 * previous rule — a fixed five-sample window with a one-METRE floor — admitted
 * exactly that noise: production activity 31's derived series reached -140%
 * grade and activity 26's spanned -30.9% to +20.3% on a run with 39 m of gain.
 */
const MIN_GRADE_RUN_M = 10;

/**
 * Widest that window may grow, metres, and it only grows for one reason: the
 * slope it measured was physically impossible (past {@link MAX_ABS_GRADE_PCT}).
 * That is an altimeter STEP rather than a hill, and a step spread over more
 * ground resolves back into the real slope either side of it, so widening
 * recovers the terrain where discarding the sample would throw away a genuine
 * climb — production activity 56 loses 1.9 s/km of a real adjustment if its
 * spikes are simply dropped. The bound is what stops the widening turning into
 * the smoothing this fallback exists to avoid: three times the minimum, on the
 * flat of the 20–30 m plateau where the whole corpus scores the same.
 */
const MAX_GRADE_RUN_M = 30;

/**
 * Strava's `grade_smooth` channel, but only when it actually carries a reading.
 *
 * Strava returns the key for activities with no elevation trace with every
 * sample null. Taken verbatim that is a grade series that adjusts nothing, which
 * is not the same claim as "this route was flat": it yields a ratio of exactly
 * 1, a persisted `avg_gap_s_per_km` indistinguishable from a real flat-road
 * measurement, and an efficiency-factor tooltip that credits a grade adjustment
 * that never happened. An empty channel is no channel.
 */
function gradeChannel(streams: ActivityStreams): (number | null)[] | null {
  const { gradePct } = streams;
  return gradePct && gradePct.some((g) => g != null) ? gradePct : null;
}

/**
 * Per-sample grade in percent, from Strava's own `grade_smooth` channel when the
 * stream carries one, otherwise differentiated from the altitude trace.
 *
 * The fallback exists for the streams cached before `grade_smooth` was requested:
 * those rows are never re-fetched (`ensureActivityStreams` returns the cache and
 * never fetches over it), so without it their grade-adjusted pace would stay
 * missing forever. It is the lower-precision path of the two — the difference is
 * what `metrics_version` 1/2 versus 3 records.
 *
 * It differentiates over the SHORTEST run that clears {@link MIN_GRADE_RUN_M},
 * looking forward, so sample i's grade is the slope of the ground the segment
 * leaving i actually crosses. Widening beyond that is not free smoothing, it is
 * a systematic error: Minetti's cost is convex, so averaging grade before
 * applying cost pulls every ratio towards 1 (Jensen's inequality). Measured
 * against Strava's own split grade-adjusted speeds across the 28 cached runs
 * that carry them, the five-sample window this replaces understated the
 * adjustment two- to fourfold and inverted its sign on five runs; the forward
 * window agrees in sign with Strava on every run whose adjustment is large
 * enough to print.
 *
 * Null when the stream has neither channel; individual samples are null where
 * the window has no usable altitude, never reaches {@link MIN_GRADE_RUN_M} of
 * ground, or still reads an impossible slope at {@link MAX_GRADE_RUN_M}.
 */
export function gradePctSeries(streams: ActivityStreams): (number | null)[] | null {
  const channel = gradeChannel(streams);
  if (channel) return channel;
  const { altitudeM, distanceKm, n } = streams;
  if (!altitudeM) return null;
  const out: (number | null)[] = new Array(n).fill(null);
  let any = false;
  /** Ground from sample i to sample j, metres; null where either is unrecorded. */
  const runM = (near: number, j: number): number | null => {
    const d = distanceKm[j];
    return d == null ? null : (d - near) * METRES_PER_KM;
  };
  // Both ends of the window only ever move forward, so `far` is carried across
  // iterations: one pass over the stream, not a scan per sample, even where the
  // distance stream stalls and the window has to reach a long way.
  let far = 0;
  for (let i = 0; i < n; i++) {
    const near = distanceKm[i];
    const low = altitudeM[i];
    if (near == null || low == null) continue;
    if (far < i) far = i;
    while (far < n - 1) {
      const run = runM(near, far);
      if (run != null && run >= MIN_GRADE_RUN_M && altitudeM[far] != null) break;
      far++;
    }
    // From there, widen ONLY while the slope reads impossible (see
    // MAX_GRADE_RUN_M). `far` itself must not move with it: the next sample's
    // window starts from the honest minimum again.
    let grade: number | null = null;
    for (let end = far; end < n; end++) {
      const run = runM(near, end);
      const high = altitudeM[end];
      if (run == null || high == null || run < MIN_GRADE_RUN_M) continue;
      const measured = ((high - low) / run) * 100;
      if (Math.abs(measured) <= MAX_ABS_GRADE_PCT) {
        grade = measured;
        break;
      }
      if (run >= MAX_GRADE_RUN_M) break;
    }
    if (grade == null) continue;
    out[i] = grade;
    any = true;
  }
  return any ? out : null;
}

/**
 * Which full-resolution rung a freshly fetched stream has earned: 3 only when
 * the payload really carried grade, 2 when it did not. Stamping 3 on every fetch
 * because the key was requested would file an indoor run — Strava omits the
 * channel with no elevation trace — as the best evidence there is, and a later
 * re-fetch pass would then skip the one activity it should upgrade.
 */
export function fullResMetricsVersion(streams: ActivityStreams): number {
  return gradeChannel(streams) ? METRICS_VERSION_FULL_RES : METRICS_VERSION_FULL_RES_NO_GRADE;
}

/**
 * Per-sample grade-adjusted pace, seconds per km: the recorded pace divided by
 * the terrain's cost factor. Null when the stream carries no pace or no grade;
 * individual samples are null where the pace stream is (a stopped GPS).
 *
 * This is the chart's overlay series, index-aligned with every other channel.
 */
export function gapPaceSeries(streams: ActivityStreams): (number | null)[] | null {
  const pace = streams.paceSPerKm;
  const grade = gradePctSeries(streams);
  if (!pace || !grade) return null;
  return pace.map((p, i) => {
    if (p == null || p <= 0) return null;
    const g = grade[i];
    return g == null ? p : p / paceAdjustmentFactor(g);
  });
}

/**
 * Fastest a segment may read, seconds per km, before its grade is thrown away:
 * quicker than 2 min/km is a GPS jump that no human runs, over any distance, and
 * it would contribute its fabricated slope with a lot of distance behind it.
 *
 * There is deliberately no slow bound to match. A stalled or dawdling segment
 * covers almost no ground, and the sum below weights by ground, so it already
 * counts for almost nothing — while EXCLUDING it silently rewrites the route.
 * The slow segments of a run are its climbs and its traffic lights, so dropping
 * them unbalances the activity's elevation budget: on production activity 48 the
 * surviving segments net 23 m of DESCENT out of a loop that nets 2 m, which was
 * enough to render a run Strava calls 4.0 s/km grade-assisted as 0.4 s/km
 * penalised. Activity 56 did the same. That is what `stream-range.ts`'s
 * STOPPED_S_PER_KM is for — deciding whether the athlete was moving, on the
 * TIME-weighted averages over there — and this integral is not that question.
 */
const MIN_GAP_SEGMENT_PACE_S_PER_KM = 120;

/**
 * How much further the athlete would have got on the flat for the same effort,
 * as a multiple of the ground they actually covered — or equivalently, what the
 * activity's average pace must be multiplied by to become its grade-adjusted
 * pace. 1 on flat ground, below 1 on a climbing route, above 1 on a descending
 * one.
 *
 * A ratio rather than a pace, because a pace computed straight out of the stream
 * would answer a subtly different question from the one on the page: the stream
 * runs on the elapsed clock and drops the segments below, so its own average
 * would sit a few seconds per km off the moving-time pace displayed beside it
 * and every flat run would look adjusted when nothing had been adjusted. Scaling
 * the activity's own displayed pace makes a flat run's GAP exactly its pace.
 *
 * Distance-weighted, and weighting the COST rather than its reciprocal: the flat
 * equivalent of a segment is the ground the same effort would have covered
 * (`factor * distance`), so rolling terrain correctly comes out costlier than
 * flat, where averaging the reciprocals would have made it look cheaper.
 *
 * Null when the stream carries no grade or no segment survives the filter.
 */
function gradeAdjustmentRatio(streams: ActivityStreams): number | null {
  const grade = gradePctSeries(streams);
  if (!grade) return null;
  const { distanceKm, timeS, n } = streams;
  let km = 0;
  let adjustedKm = 0;
  for (let i = 1; i < n; i++) {
    const t0 = timeS[i - 1];
    const t1 = timeS[i];
    const d0 = distanceKm[i - 1];
    const d1 = distanceKm[i];
    if (t0 == null || t1 == null || d0 == null || d1 == null) continue;
    const dt = t1 - t0;
    const dd = d1 - d0;
    if (dt <= 0 || dd <= 0) continue;
    if (dt / dd < MIN_GAP_SEGMENT_PACE_S_PER_KM) continue;
    // The grade of the sample the segment leaves, the same sample whose pace it
    // is; a null there is an unmeasurable slope, taken as flat rather than
    // dropping ground that was genuinely covered.
    const g = grade[i - 1];
    km += dd;
    adjustedKm += dd * (g == null ? 1 : paceAdjustmentFactor(g));
  }
  return km > 0 && adjustedKm > 0 ? km / adjustedKm : null;
}

/**
 * The whole activity's grade-adjusted pace, seconds per km: the flat-ground pace
 * that would have cost the same as the terrain actually did. Faster than the
 * recorded pace on a climbing route, slower on a descending one, and exactly the
 * recorded pace on the flat.
 *
 * Scales {@link MetricsActivity.avgPaceSPerKm} — the pace the page prints — and
 * not `movingTimeS / distanceKm`, so the two tiles can never disagree about the
 * run they describe (see there).
 *
 * Null without a stored average pace, without grade, or when no segment of the
 * stream survives the plausibility filter. Running economy only — the caller
 * gates on the sport.
 */
export function avgGapSPerKm(
  streams: ActivityStreams,
  activity: Pick<MetricsActivity, "avgPaceSPerKm">
): number | null {
  const paceSPerKm = activity.avgPaceSPerKm ?? 0;
  if (paceSPerKm <= 0) return null;
  const ratio = gradeAdjustmentRatio(streams);
  return ratio == null ? null : paceSPerKm * ratio;
}

/**
 * Every derived metric of one activity, from its stream. Each is independently
 * gated, so a run with a dropped heart-rate strap still gets its pace zones and a
 * ride with no meter still gets its heart-rate zones.
 *
 * `streams` may be either resolution; pass the full-resolution stream when there
 * is one, because normalized power is the one metric that needs it (and is left
 * null when it cannot be trusted, never approximated from the downsample).
 */
export function computeStreamMetrics(
  source: { streams: ActivityStreams; activity: MetricsActivity },
  thresholds: AthleteThresholds
): ActivityMetrics {
  const { streams, activity } = source;
  const basis = efBasisFor(activity.sportType, activity.hasRealPower);
  // Running economy only. A ride's grade matters just as much, but the cost
  // polynomial is a runner's, and a bike's gearing breaks the link between grade
  // and pace that the whole adjustment rests on.
  const gapSPerKm = isRunSport(activity.sportType) ? avgGapSPerKm(streams, activity) : null;

  const ef =
    basis === "power"
      ? computeEf({ basis: "power", watts: activity.powerW, avgHr: activity.avgHr })
      : basis === "speed"
        ? computeEf({
            basis: "speed",
            distanceKm: activity.distanceKm,
            movingTimeS: activity.movingTimeS,
            avgHr: activity.avgHr,
            gapSPerKm,
          })
        : null;

  return {
    ef,
    avgGapSPerKm: gapSPerKm,
    decouplingPct: basis
      ? computeDecoupling({ streams, basis, movingTimeS: activity.movingTimeS })
      : null,
    // Rides with a real meter only, the same gate `efBasisFor` applies to power.
    // `hasRealPower` alone is not that gate: Strava sets `device_watts` on runs
    // too (266 of them here), where the wattage is a watch's run-power model of
    // pace, not a meter reading. Normalizing it would produce a number that
    // looks like a ride's NP, is stored beside real ones, and means nothing.
    npW:
      isRideSport(activity.sportType) && activity.hasRealPower && streams.watts
        ? normalizedPower(streams.timeS, streams.watts)
        : null,
    hrZoneSecs:
      streams.heartrate && thresholds.lthr > 0
        ? zoneSeconds(streams.timeS, streams.heartrate, hrZones(thresholds))
        : null,
    paceZoneSecs:
      isRunSport(activity.sportType) && streams.paceSPerKm && thresholds.thresholdPaceSPerKm > 0
        ? zoneSeconds(streams.timeS, streams.paceSPerKm, paceZones(thresholds))
        : null,
  };
}

/**
 * True when a computed set says anything at all. An all-null row is not a
 * finding, it is an activity whose stream carried nothing usable (no heart rate,
 * no pace, no power), so storing one would only add a row every reader has to
 * fall through anyway.
 */
export function hasAnyMetric(metrics: ActivityMetrics): boolean {
  return (
    metrics.ef !== null ||
    metrics.decouplingPct !== null ||
    metrics.npW !== null ||
    metrics.hrZoneSecs !== null ||
    metrics.paceZoneSecs !== null ||
    metrics.avgGapSPerKm !== null
  );
}

/** Zone-second arrays are stored as JSON; five slots, Z1 to Z5. */
const ZONE_COUNT = 5;

/** Serializes a zone-seconds array for storage; null stays null. */
export function serializeZoneSecs(zoneSecs: number[] | null): string | null {
  return zoneSecs === null ? null : JSON.stringify(zoneSecs);
}

/**
 * Reads a stored zone-seconds array back, returning null for anything that is not
 * five finite numbers. A malformed or short array must not reach a stacked bar,
 * where it would silently shade the wrong zones; falling back to on-the-fly
 * computation is always available to the callers.
 */
export function parseZoneSecs(json: string | null): number[] | null {
  if (!json) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed) || parsed.length !== ZONE_COUNT) return null;
    if (!parsed.every((value) => typeof value === "number" && Number.isFinite(value))) return null;
    return parsed as number[];
  } catch {
    return null;
  }
}
