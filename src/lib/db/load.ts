import { batchWrite, exec, many, one, WRITE_CHUNK } from "./helpers";
import { THRESHOLD_DEFAULTS } from "../baseline";
import {
  computeLoad,
  loadPlanDrifted,
  summarizeLoadRecompute,
  type AthleteThresholds,
  type HrStream,
  type LoadChange,
  type LoadMethod,
  type LoadRecomputeExpectation,
  type LoadRecomputeSummary,
  type LoadVariant,
} from "../fitness";
import { currentAthlete, requireAthlete } from "../identity";
import type { ActivityStreams } from "../streams";

interface AthleteThresholdsRow {
  max_hr: number | null;
  resting_hr: number | null;
  lthr: number | null;
  threshold_pace_s_per_km: number | null;
  ftp_w: number | null;
  resting_hr_estimated: number;
  ftp_provisional: number;
  updated_at: string | null;
}

export async function getAthleteThresholds(): Promise<AthleteThresholds> {
  const row = await one<AthleteThresholdsRow>(
    `SELECT max_hr, resting_hr, lthr, threshold_pace_s_per_km, ftp_w,
            resting_hr_estimated, ftp_provisional, updated_at
     FROM athlete_thresholds WHERE id = ?`,
    [currentAthlete().id]
  );
  if (!row) return { ...THRESHOLD_DEFAULTS };
  return {
    maxHr: row.max_hr ?? THRESHOLD_DEFAULTS.maxHr,
    restingHr: row.resting_hr ?? THRESHOLD_DEFAULTS.restingHr,
    lthr: row.lthr ?? THRESHOLD_DEFAULTS.lthr,
    thresholdPaceSPerKm: row.threshold_pace_s_per_km ?? THRESHOLD_DEFAULTS.thresholdPaceSPerKm,
    ftpW: row.ftp_w ?? THRESHOLD_DEFAULTS.ftpW,
    restingHrEstimated: row.resting_hr_estimated !== 0,
    ftpProvisional: row.ftp_provisional !== 0,
    updatedAt: row.updated_at ?? null,
  };
}

export interface AthleteThresholdFields {
  maxHr: number;
  restingHr: number;
  lthr: number;
  thresholdPaceSPerKm: number;
  ftpW: number;
  restingHrEstimated: boolean;
  ftpProvisional: boolean;
}

export async function saveAthleteThresholds(fields: AthleteThresholdFields): Promise<void> {
  await exec(
    `INSERT INTO athlete_thresholds
       (id, max_hr, resting_hr, lthr, threshold_pace_s_per_km, ftp_w,
        resting_hr_estimated, ftp_provisional, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       max_hr = excluded.max_hr,
       resting_hr = excluded.resting_hr,
       lthr = excluded.lthr,
       threshold_pace_s_per_km = excluded.threshold_pace_s_per_km,
       ftp_w = excluded.ftp_w,
       resting_hr_estimated = excluded.resting_hr_estimated,
       ftp_provisional = excluded.ftp_provisional,
       updated_at = excluded.updated_at`,
    [
      requireAthlete().id,
      fields.maxHr,
      fields.restingHr,
      fields.lthr,
      fields.thresholdPaceSPerKm,
      fields.ftpW,
      fields.restingHrEstimated ? 1 : 0,
      fields.ftpProvisional ? 1 : 0,
      new Date().toISOString(),
    ]
  );
}

export interface ActivityLoadRow {
  tss: number;
  method: LoadMethod | null;
  intensity_factor: number | null;
  /** How an hrTSS was measured; null on the other methods and on legacy rows. */
  variant: LoadVariant | null;
  source: string;
}

export async function getActivityLoad(activityId: number): Promise<ActivityLoadRow | null> {
  return one<ActivityLoadRow>(
    `SELECT tss, method, intensity_factor, variant, source
     FROM activity_load WHERE activity_id = ? AND tss IS NOT NULL`,
    [activityId]
  );
}

const ACTIVITY_LOAD_COLUMNS =
  "(activity_id, tss, method, intensity_factor, variant, source, computed_at)";

/**
 * Canonical `activity_load` upsert — the single source of truth for every writer.
 *
 * `source` selects the correlated column handling that legitimately differs (these
 * are NOT the same behaviour, so they are parameterized, not force-merged):
 *   - 'auto'   → method + intensity_factor + variant are bound params (`?`) that
 *                overwrite on conflict (a computed load row).
 *   - 'manual' → method/intensity_factor/variant are inserted as NULL; on conflict
 *                the existing method is preserved and intensity_factor and variant
 *                cleared (a user-entered TSS override was measured from nothing).
 *
 * `overrideManual` applies to auto writers only, choosing whether an existing
 * manual row is clobbered:
 *   - false → guarded with `WHERE source != 'manual'`; a bulk recompute keeps hand
 *             edits (source is left untouched).
 *   - true  → unguarded and forces the row back to `source = 'auto'`; a single
 *             recompute overrides any manual value.
 */
function activityLoadUpsert(opts: { source: "auto" | "manual"; overrideManual?: boolean }): string {
  if (opts.source === "manual") {
    return `INSERT INTO activity_load ${ACTIVITY_LOAD_COLUMNS}
     VALUES (?, ?, NULL, NULL, NULL, 'manual', ?)
     ON CONFLICT(activity_id) DO UPDATE SET
       tss = excluded.tss,
       source = 'manual',
       intensity_factor = NULL,
       variant = NULL,
       computed_at = excluded.computed_at`;
  }
  const sourceSet = opts.overrideManual ? "\n       source = 'auto'," : "";
  const guard = opts.overrideManual ? "" : "\n     WHERE activity_load.source != 'manual'";
  return `INSERT INTO activity_load ${ACTIVITY_LOAD_COLUMNS}
     VALUES (?, ?, ?, ?, ?, 'auto', ?)
     ON CONFLICT(activity_id) DO UPDATE SET
       tss = excluded.tss,
       method = excluded.method,
       intensity_factor = excluded.intensity_factor,
       variant = excluded.variant,${sourceSet}
       computed_at = excluded.computed_at${guard}`;
}

/** Manual override: keeps any existing method, clears the intensity factor. */
export async function setActivityLoadManual(activityId: number, tss: number): Promise<void> {
  await exec(activityLoadUpsert({ source: "manual" }), [activityId, tss, new Date().toISOString()]);
}

const ACTIVITY_LOAD_FIELDS =
  "id, sport_type, moving_time_s, distance_km, avg_hr, avg_pace_s_per_km, rpe, raw_json";

interface ActivityLoadInput {
  id: number;
  sport_type: string | null;
  moving_time_s: number | null;
  distance_km: number | null;
  avg_hr: number | null;
  avg_pace_s_per_km: number | null;
  rpe: number | null;
  raw_json: string | null;
}

interface AutoLoadRow {
  activityId: number;
  tss: number;
  method: LoadMethod;
  intensityFactor: number | null;
  variant: LoadVariant | null;
}

/** Bulk auto upsert; never clobbers rows the athlete edited by hand. */
export async function upsertActivityLoads(rows: AutoLoadRow[]): Promise<void> {
  if (rows.length === 0) return;
  const sql = activityLoadUpsert({ source: "auto", overrideManual: false });
  const now = new Date().toISOString();
  for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
    await batchWrite(
      rows.slice(i, i + WRITE_CHUNK).map((r) => ({
        sql,
        args: [r.activityId, r.tss, r.method, r.intensityFactor, r.variant, now],
      }))
    );
  }
}

// ---------------------------------------------------------------------------
// Stream-integrated hrTSS
// ---------------------------------------------------------------------------

/**
 * Activities read per stream query. The cached stream is a 400-point JSON blob
 * of eight channels (~20 kB), so a few hundred of them are worth pulling in
 * pages rather than in one response — and never one query per activity, which
 * is several hundred Turso round trips for a single click.
 */
const STREAM_READ_CHUNK = 50;

/**
 * The heart-rate traces of the given activities, as `computeLoad` reads them.
 *
 * Only the two channels the load engine uses survive the parse: the rest of the
 * blob is dropped immediately, so holding every trace of a full history costs
 * arrays of numbers rather than a few hundred parsed stream objects. Activities
 * with no stream row, with the negative marker `'null'` cached, or with no
 * heart-rate channel are simply absent from the map — the caller falls back to
 * the average-HR reading for those.
 */
async function loadHrStreams(activityIds: number[]): Promise<Map<number, HrStream>> {
  const byActivity = new Map<number, HrStream>();
  for (let i = 0; i < activityIds.length; i += STREAM_READ_CHUNK) {
    const chunk = activityIds.slice(i, i + STREAM_READ_CHUNK);
    const rows = await many<{ activity_id: number; json: string }>(
      `SELECT activity_id, json FROM activity_streams
       WHERE json != 'null' AND activity_id IN (${chunk.map(() => "?").join(", ")})`,
      chunk
    );
    for (const row of rows) {
      try {
        const streams = JSON.parse(row.json) as ActivityStreams | null;
        if (streams?.heartrate) {
          byActivity.set(row.activity_id, { hr: streams.heartrate, timeS: streams.timeS });
        }
      } catch {
        // A malformed cached blob is a missing stream, not a failed recompute.
      }
    }
  }
  return byActivity;
}

/**
 * Which rows a bulk recompute lets switch to the stream-integrated hrTSS.
 *
 * - `keep` — only rows already stored as `variant = 'stream'` read their stream
 *   again. Every routine recompute (a sync, a threshold save) runs this way, so
 *   it can refresh the numbers without silently ADOPTING a new measurement of
 *   history behind the athlete's back, and equally without reverting the ones
 *   already adopted back to the average.
 * - `adopt` — every heart-rate activity with a cached stream switches. That is
 *   the whole point of the explicit "recompute loads" action, and the reason
 *   that action previews its effect on today's CTL before it writes anything.
 */
type StreamPolicy = "keep" | "adopt";

/** One confirmed activity, its stored load, and how that load was measured. */
interface LoadCandidate extends ActivityLoadInput {
  /** Null on the odd undated row, which is recomputed but cannot be dated into a PMC. */
  started_at: string | null;
  stored_tss: number | null;
  stored_variant: LoadVariant | null;
  /** 'auto', 'manual', or null when the activity has no load row yet. */
  source: string | null;
}

/**
 * Every confirmed activity with the load it currently carries.
 *
 * raw_json is a large blob that computeLoad reads ONLY inside its power branch,
 * which is gated on isRideSport(sport_type). Fetch the blob only for ride sports
 * (the LIKE conditions mirror isRideSport exactly: lower(sport) contains "ride" —
 * which also covers "ebikeride" — or "velomobile"); every other row never reads
 * it, so returning NULL there is behaviour-identical while skipping the blob for
 * the majority of activities.
 */
async function listLoadCandidates(): Promise<LoadCandidate[]> {
  return many<LoadCandidate>(
    `SELECT a.id, a.sport_type, a.moving_time_s, a.distance_km, a.avg_hr, a.avg_pace_s_per_km,
            a.rpe, a.started_at,
            CASE
              WHEN LOWER(COALESCE(a.sport_type, '')) LIKE '%ride%'
                OR LOWER(COALESCE(a.sport_type, '')) LIKE '%velomobile%'
              THEN a.raw_json
            END AS raw_json,
            l.tss AS stored_tss, l.variant AS stored_variant, l.source AS source
     FROM activities a
     LEFT JOIN activity_load l ON l.activity_id = a.id
     WHERE a.status = 'confirmed'`
  );
}

/** What a recompute would write, and what it would do to the athlete's history. */
export interface LoadRecomputePlan extends LoadRecomputeSummary {
  /** Confirmed activities the recompute is allowed to touch. */
  considered: number;
  /** Of those, the ones that produced a load — the rows an apply writes. */
  computed: number;
  /**
   * Rows left alone because the athlete typed the TSS by hand. They are excluded
   * from every count above and from the write, but their load still feeds both
   * CTL figures — they are part of the history, they are just not up for
   * recomputation.
   */
  manualSkipped: number;
  /** Activities whose new load was integrated from a heart-rate stream. */
  streamCount: number;
}

/** A recompute worked out in full, and the rows that writing it would upsert. */
interface PlannedLoadRecompute {
  plan: LoadRecomputePlan;
  rows: AutoLoadRow[];
}

/**
 * Computes every confirmed activity's load in memory and reports what writing it
 * would change, WITHOUT writing anything.
 *
 * The rows come back with the summary deliberately: the caller that decides to
 * write hands back exactly the array that produced the figures it just checked,
 * so a plan can never be summarized from one pass and written from another.
 */
async function planLoadRecompute(policy: StreamPolicy): Promise<PlannedLoadRecompute> {
  const thresholds = await getAthleteThresholds();
  const candidates = await listLoadCandidates();
  const manual = candidates.filter((c) => c.source === "manual");
  const recomputable = candidates.filter((c) => c.source !== "manual");

  // Which activities are worth a stream read: the heart-rate method is the only
  // one with a stream reading, and under the `keep` policy only the rows that
  // already carry one. Deciding it from a first pass with no stream costs one
  // extra pure call per activity and saves reading hundreds of blobs that the
  // power and pace branches would never look at.
  const wantsStream = recomputable.filter((c) => {
    if (policy === "keep" && c.stored_variant !== "stream") return false;
    return computeLoad(c, thresholds)?.method === "hr";
  });
  const hrStreams = await loadHrStreams(wantsStream.map((c) => c.id));

  const rows: AutoLoadRow[] = [];
  const changes: LoadChange[] = [];
  /** Undated rows are still recomputed; they just cannot enter a daily series. */
  const track = (candidate: LoadCandidate, after: number | null) => {
    if (candidate.started_at == null) return;
    changes.push({ started_at: candidate.started_at, before: candidate.stored_tss, after });
  };
  for (const candidate of manual) track(candidate, candidate.stored_tss);
  let streamCount = 0;
  for (const candidate of recomputable) {
    const load = computeLoad({ ...candidate, hrStream: hrStreams.get(candidate.id) }, thresholds);
    // An activity that no longer computes keeps whatever it has: the bulk path
    // has never deleted a load row, and a preview must not imply that it does.
    if (!load) {
      track(candidate, candidate.stored_tss);
      continue;
    }
    if (load.variant === "stream") streamCount += 1;
    rows.push({
      activityId: candidate.id,
      tss: load.tss,
      method: load.method,
      intensityFactor: load.intensityFactor,
      variant: load.variant,
    });
    track(candidate, load.tss);
  }
  return {
    plan: {
      ...summarizeLoadRecompute(changes),
      considered: recomputable.length,
      computed: rows.length,
      manualSkipped: manual.length,
      streamCount,
    },
    rows,
  };
}

/** A plan, and whether this call wrote it. */
export interface LoadRecomputeOutcome extends LoadRecomputePlan {
  /**
   * True only when the rows were actually upserted. False on a preview, and on
   * an apply that aborted because the plan had moved — in which case the figures
   * alongside it are the FRESH ones, which is what the athlete needs to see.
   */
  applied: boolean;
}

/**
 * The explicit "recompute loads" action's two halves: `write: false` reports what
 * would happen and touches nothing, `write: true` applies exactly that.
 *
 * This is the only path that ADOPTS the stream-integrated hrTSS across history,
 * and it is deliberately a two-click action rather than a background job: TSS is
 * the input to CTL and ATL, so re-measuring a thousand past sessions moves the
 * fitness curve the athlete reads their training against.
 *
 * The two clicks are two requests, and the database moves between them (the
 * history fetch caches more streams by the minute, and every newly cached stream
 * changes one more row). So an apply re-plans against what is there NOW and
 * refuses to write when that no longer matches the preview the athlete
 * confirmed: better a second look than a fitness curve moved by an amount that
 * was never on screen. Carrying the previewed rows through the browser instead
 * would have the server write a thousand TSS values it did not compute, which is
 * precisely what Next's own server-action guidance says not to do — send a
 * reference, re-read the substance from a trusted source.
 */
export async function recomputeLoadsWithStreams(
  opts: { write: false } | { write: true; expect: LoadRecomputeExpectation }
): Promise<LoadRecomputeOutcome> {
  const { plan, rows } = await planLoadRecompute("adopt");
  if (!opts.write) return { ...plan, applied: false };
  if (loadPlanDrifted(opts.expect, plan)) return { ...plan, applied: false };
  await upsertActivityLoads(rows);
  return { ...plan, applied: true };
}

/** One persisted load per confirmed activity, ascending — the PMC's raw input. */
export interface PmcLoadRow {
  started_at: string;
  tss: number;
  /** Raw Strava sport_type, bucketed by sportCategory() where sport matters. */
  sport_type: string | null;
}

export async function listActivityLoadsForPmc(): Promise<PmcLoadRow[]> {
  return many<PmcLoadRow>(
    `SELECT a.started_at AS started_at, l.tss AS tss, a.sport_type AS sport_type
     FROM activities a
     JOIN activity_load l ON l.activity_id = a.id
     WHERE a.status = 'confirmed' AND l.tss IS NOT NULL AND a.started_at IS NOT NULL
     ORDER BY a.started_at ASC`
  );
}

/**
 * Recomputes every confirmed activity's load; returns the auto rows written.
 *
 * The routine path, run after a sync and after a threshold change. It preserves
 * each row's existing measurement (`policy: "keep"`), so it refreshes the numbers
 * without ever switching an activity between the two hrTSS readings in either
 * direction — adopting the stream across history is the explicit action's job,
 * and reverting what that action adopted would silently undo it.
 */
export async function recomputeAllLoads(): Promise<{ count: number }> {
  const { plan, rows } = await planLoadRecompute("keep");
  await upsertActivityLoads(rows);
  return { count: plan.computed };
}

/**
 * Recompute a single activity as an auto row, overriding any manual value.
 *
 * Unlike the bulk path this always reads the cached stream when there is one:
 * one activity, one visible result, no history rewritten. It is how a newly
 * confirmed session picks up `variant = 'stream'` on its own — `confirmActivityAction`
 * caches that one activity's trace immediately before calling this, so the read
 * below finds it.
 */
export async function recomputeActivityLoad(activityId: number): Promise<void> {
  const thresholds = await getAthleteThresholds();
  const activity = await one<ActivityLoadInput>(
    `SELECT ${ACTIVITY_LOAD_FIELDS} FROM activities WHERE id = ?`,
    [activityId]
  );
  if (!activity) return;
  const hrStreams = await loadHrStreams([activityId]);
  const load = computeLoad({ ...activity, hrStream: hrStreams.get(activityId) }, thresholds);
  if (!load) {
    await exec("DELETE FROM activity_load WHERE activity_id = ?", [activityId]);
    return;
  }
  await exec(activityLoadUpsert({ source: "auto", overrideManual: true }), [
    activityId,
    load.tss,
    load.method,
    load.intensityFactor,
    load.variant,
    new Date().toISOString(),
  ]);
}
