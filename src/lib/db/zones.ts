import { many } from "./helpers";
import { listBestEffortsForVdot } from "./activities";
import { getMeta, setMeta } from "./meta";
import { getAthleteThresholds } from "./load";
import { getResolvedNumericSeries } from "./health";
import { currentVdot } from "../benchmarks";
import { localDateInputValue } from "../format";
import type { AthleteThresholds } from "../fitness";
import type { DerivedZones } from "../zones";

// Assembles the athlete's REAL running field signals for the zones agent — the
// same evidence a coach would read off the data: observed max HR, HR↔pace at
// each effort, best race efforts, and aerobic decoupling on long runs. All from
// the generic activity/stream tables; the agent reasons over this text.

export interface MaxHrSample {
  hr: number;
  date: string;
  paceSPerKm: number | null;
  avgHr: number | null;
  isRace: boolean;
  name: string;
}
export interface EffortSample {
  label: string;
  distanceKm: number;
  timeS: number;
  paceSPerKm: number;
  avgHr: number | null;
  maxHr: number | null;
  date: string;
  isRace: boolean;
}
export interface HrPaceBucket {
  paceSPerKm: number;
  avgHr: number;
  n: number;
}
export interface DecouplingSample {
  date: string;
  distanceKm: number;
  paceSPerKm: number | null;
  firstHalfHr: number;
  secondHalfHr: number;
  driftPct: number;
}
export interface FieldSignals {
  runCount: number;
  windowDays: number;
  maxHr: MaxHrSample[];
  efforts: EffortSample[];
  hrPace: HrPaceBucket[];
  decoupling: DecouplingSample[];
  thresholds: AthleteThresholds;
  restingHr: number;
  latestHrvMs: number | null;
  /**
   * Daniels VDOT from the best stored sub-segment effort of the trailing
   * VDOT_CURRENT_WINDOW_DAYS days (the engine owns that number, so it is not restated
   * here), or null when no qualifying effort was recorded. Computed here so the agent
   * reasons from the same number /performance shows instead of guessing a VO2max
   * off the effort list.
   */
  currentVdot: number | null;
}

interface RunRow {
  id: number;
  started_at: string;
  distance_km: number;
  moving_time_s: number;
  avg_pace_s_per_km: number | null;
  avg_hr: number | null;
  is_race: number;
  raw_json: string | null;
  has_streams: number;
}

const WINDOW_DAYS = 130;

export async function getRunningFieldSignals(): Promise<FieldSignals> {
  const rows = await many<RunRow>(
    `SELECT a.id, a.started_at, a.distance_km, a.moving_time_s, a.avg_pace_s_per_km, a.avg_hr, a.is_race,
            a.raw_json,
            (SELECT COUNT(*) FROM activity_streams s WHERE s.activity_id = a.id) AS has_streams
     FROM activities a
     WHERE LOWER(COALESCE(a.sport_type,'')) LIKE '%run%'
       AND a.started_at >= datetime('now', ?)
       AND a.distance_km IS NOT NULL AND a.moving_time_s IS NOT NULL
     ORDER BY a.started_at ASC`,
    [`-${WINDOW_DAYS} days`]
  );

  const runs = rows.map((r) => {
    let raw: { max_heartrate?: number; name?: string } = {};
    try {
      raw = r.raw_json ? JSON.parse(r.raw_json) : {};
    } catch {
      raw = {};
    }
    return {
      id: r.id,
      date: String(r.started_at).slice(0, 10),
      distanceKm: r.distance_km,
      timeS: r.moving_time_s,
      paceSPerKm: r.avg_pace_s_per_km,
      avgHr: r.avg_hr,
      maxHr: typeof raw.max_heartrate === "number" ? raw.max_heartrate : null,
      isRace: r.is_race !== 0,
      hasStreams: r.has_streams !== 0,
      name: raw.name ?? "",
    };
  });

  const maxHr: MaxHrSample[] = runs
    .filter((r) => r.maxHr)
    .sort((a, b) => (b.maxHr ?? 0) - (a.maxHr ?? 0))
    .slice(0, 8)
    .map((r) => ({
      hr: r.maxHr as number,
      date: r.date,
      paceSPerKm: r.paceSPerKm,
      avgHr: r.avgHr,
      isRace: r.isRace,
      name: r.name,
    }));

  // Best effort per distance band (whole-activity), preferring races.
  const bands: [string, number, number][] = [
    ["5k", 4.6, 5.6],
    ["10k", 9.3, 11],
    ["15k", 14, 16.5],
    ["HM", 20, 22.5],
    ["30k+", 24, 34],
  ];
  const efforts: EffortSample[] = [];
  for (const [label, lo, hi] of bands) {
    const best = runs
      .filter((r) => r.distanceKm >= lo && r.distanceKm <= hi && r.paceSPerKm)
      .sort((a, b) => (a.paceSPerKm as number) - (b.paceSPerKm as number))[0];
    if (best)
      efforts.push({
        label,
        distanceKm: best.distanceKm,
        timeS: best.timeS,
        paceSPerKm: best.paceSPerKm as number,
        avgHr: best.avgHr,
        maxHr: best.maxHr,
        date: best.date,
        isRace: best.isRace,
      });
  }

  // HR↔pace at each effort: average HR per 15s/km pace bucket.
  const byBucket = new Map<number, number[]>();
  for (const r of runs) {
    if (!r.avgHr || !r.paceSPerKm) continue;
    const key = Math.round(r.paceSPerKm / 15) * 15;
    const arr = byBucket.get(key);
    if (arr) arr.push(r.avgHr);
    else byBucket.set(key, [r.avgHr]);
  }
  const hrPace: HrPaceBucket[] = [...byBucket.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([paceSPerKm, arr]) => ({
      paceSPerKm,
      avgHr: Math.round(arr.reduce((s, x) => s + x, 0) / arr.length),
      n: arr.length,
    }));

  const decoupling = await computeDecoupling(
    runs.filter((r) => r.distanceKm >= 15 && r.hasStreams)
  );

  const thresholds = await getAthleteThresholds();
  const today = localDateInputValue(new Date());
  const from = localDateInputValue(new Date(Date.now() - WINDOW_DAYS * 86_400_000));
  const hrv = await getResolvedNumericSeries("hrv_overnight", from, today);
  // Only the current value is evidence here; the monthly trend behind it belongs to
  // /performance, which reads the same query. `currentVdot` computes just that value
  // rather than twelve months of history to read one field off.
  const vdot = currentVdot(await listBestEffortsForVdot(), new Date());

  return {
    runCount: runs.length,
    windowDays: WINDOW_DAYS,
    maxHr,
    efforts,
    hrPace,
    decoupling,
    thresholds,
    restingHr: thresholds.restingHr,
    latestHrvMs: hrv.at(-1)?.value ?? null,
    currentVdot: vdot,
  };
}

/** Pa:Hr aerobic decoupling (first vs second half) on long runs with streams. */
async function computeDecoupling(
  longs: { id: number; date: string; distanceKm: number; paceSPerKm: number | null }[]
): Promise<DecouplingSample[]> {
  const out: DecouplingSample[] = [];
  for (const run of longs.slice(0, 6)) {
    const row = await many<{ json: string }>(
      "SELECT json FROM activity_streams WHERE activity_id = ?",
      [run.id]
    );
    if (row.length === 0) continue;
    let s: { heartrate?: (number | null)[]; paceSPerKm?: (number | null)[]; distanceKm?: number[] };
    try {
      s = JSON.parse(row[0].json);
    } catch {
      continue;
    }
    const hr = s.heartrate ?? [];
    const pace = s.paceSPerKm ?? [];
    const dist = s.distanceKm ?? [];
    const pts: { hr: number; spd: number }[] = [];
    for (let i = 0; i < hr.length; i++) {
      const h = hr[i];
      const p = pace[i];
      // drop the first km (warmup) and invalid samples
      if (h && h > 0 && p && p > 0 && p < 900 && (dist[i] ?? 0) > 1) {
        pts.push({ hr: h, spd: 60000 / p });
      }
    }
    if (pts.length < 20) continue;
    const mid = Math.floor(pts.length / 2);
    const eff = (arr: { hr: number; spd: number }[]) => {
      const h = arr.reduce((sum, x) => sum + x.hr, 0) / arr.length;
      const v = arr.reduce((sum, x) => sum + x.spd, 0) / arr.length;
      return { h, e: v / h };
    };
    const a1 = eff(pts.slice(0, mid));
    const a2 = eff(pts.slice(mid));
    out.push({
      date: run.date,
      distanceKm: run.distanceKm,
      paceSPerKm: run.paceSPerKm,
      firstHalfHr: Math.round(a1.h),
      secondHalfHr: Math.round(a2.h),
      driftPct: Math.round(((a1.e - a2.e) / a1.e) * 1000) / 10,
    });
  }
  return out;
}

// --- Stored derived zones (single latest, in app_meta) -----------------------

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

export async function setTrainingZones(zones: DerivedZones): Promise<void> {
  await setMeta(ZONES_KEY, JSON.stringify(zones));
}
