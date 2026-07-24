import { many } from "./helpers";
import { getLatestHealthDate, getResolvedNumericSeries } from "./health";
import { getAthleteThresholds, listActivityLoadsForPmc } from "./load";
import { computeAcwr, computePmc, dailyLoadSeries, type LoadMethod } from "../fitness";
import { localDateInputValue, parseLocalDate } from "../format";
import {
  computeReadiness,
  mean,
  sampleStdDev,
  type HrvContext,
  type Readiness,
  type ReadinessInputs,
} from "../readiness";
import {
  computeRecovery,
  type RecoveryActivity,
  type RecoveryHrvStatus,
  type RecoveryResult,
} from "../recovery";

// Data-layer assembler for the readiness + recovery engines. It fetches the
// resolved health series and the load/PMC state, derives the personal rolling
// baselines, and calls the pure engines (src/lib/readiness.ts, recovery.ts). The
// baselines are personal and rolling so the numbers survive a Garmin -> Coros
// switch. All source-specific knowledge stays out — it reads only the generic
// resolved metrics.

// Model defaults (need real-data tuning; see the engine module headers).
const HRV_BASELINE_WINDOW_DAYS = 60; // long-term HRV mean/SD window
const HRV_ROLLING_DAYS = 7; // short rolling HRV baseline
const RHR_BASELINE_WINDOW_DAYS = 30;
const DEFAULT_SLEEP_NEED_MIN = 480; // 8h; personalize later
const RECOVERY_WINDOW_DAYS = 14; // trailing activities the recovery fold reads
// HRV 7-day z thresholds that flip the recovery drain modulation.
const HRV_RECOVERED_Z = 0.5;
const HRV_SUPPRESSED_Z = -0.5;

function shiftDays(dayKey: string, days: number): string {
  const d = parseLocalDate(dayKey);
  d.setDate(d.getDate() + days);
  return localDateInputValue(d);
}

function last<T>(list: T[]): T | null {
  return list.length > 0 ? list[list.length - 1] : null;
}

/** Latest resolved numeric value for a metric within a trailing window. */
async function latestValue(
  metric: Parameters<typeof getResolvedNumericSeries>[0],
  from: string,
  to: string
): Promise<number | null> {
  const point = last(await getResolvedNumericSeries(metric, from, to));
  return point?.value ?? null;
}

/** HRV context in ln(rMSSD) space + the 7-day z used for the drain modulation. */
async function buildHrv(today: string): Promise<{ context: HrvContext; z7: number } | null> {
  const series = await getResolvedNumericSeries(
    "hrv_overnight",
    shiftDays(today, -HRV_BASELINE_WINDOW_DAYS),
    today
  );
  const valid = series.filter((p) => p.value > 0);
  if (valid.length === 0) return null;
  // Require a same-day HRV reading: a stale value must not drive today's readiness
  // or the HRV-modulated recovery drain. Absent today -> omit HRV entirely.
  const latest = valid[valid.length - 1];
  if (latest.date !== today) return null;
  const ln = valid.map((p) => Math.log(p.value));
  const todayLn = ln[ln.length - 1];
  const baseline7 = mean(ln.slice(-HRV_ROLLING_DAYS)) ?? todayLn;
  const mean60 = mean(ln) ?? todayLn;
  const sd60 = sampleStdDev(ln) ?? 0;
  const z7 = sd60 > 0 ? (baseline7 - mean60) / sd60 : 0;
  return {
    context: { today: todayLn, baseline7, mean60, sd60 },
    z7,
  };
}

interface LoadState {
  ctl: number;
  tsb: number;
  acwr: number | null;
}

/** CTL/TSB from the whole-history PMC and an acute:chronic ratio from daily load. */
async function loadState(): Promise<LoadState | null> {
  const daily = dailyLoadSeries(await listActivityLoadsForPmc());
  if (daily.length === 0) return null;
  const pmc = computePmc(daily);
  const latest = pmc[pmc.length - 1];
  return {
    ctl: latest.ctl,
    tsb: latest.tsb,
    acwr: computeAcwr(daily),
  };
}

function hrvStatusFromZ(z7: number | null): RecoveryHrvStatus | null {
  if (z7 === null) return null;
  if (z7 >= HRV_RECOVERED_Z) return "recovered";
  if (z7 <= HRV_SUPPRESSED_Z) return "suppressed";
  return "normal";
}

export interface ReadinessSnapshot {
  date: string;
  readiness: Readiness;
  inputs: ReadinessInputs;
}

/**
 * Assemble today's readiness from the resolved health metrics + load state.
 * Returns null only when there is nothing to score (no health data and no load).
 */
export async function getReadinessSnapshot(): Promise<ReadinessSnapshot | null> {
  const today = (await getLatestHealthDate()) ?? localDateInputValue(new Date());
  const from60 = shiftDays(today, -HRV_BASELINE_WINDOW_DAYS);
  const from30 = shiftDays(today, -RHR_BASELINE_WINDOW_DAYS);

  const hrv = await buildHrv(today);

  const rhrSeries = await getResolvedNumericSeries("resting_hr", from30, today);
  const rhrToday = last(rhrSeries)?.value ?? null;
  const rhrBaseline = mean(rhrSeries.map((p) => p.value));

  const sleepTotal = await latestValue("sleep_total", from30, today);
  const sleepQuality = await latestValue("sleep_quality", from30, today);

  const bodyBattery = await latestValue("body_battery_high", from30, today);
  const stress = await latestValue("stress_avg", from30, today);

  const fatigue = await latestValue("fatigue", from30, today);
  const soreness = await latestValue("soreness", from30, today);
  const stressSubj = await latestValue("stress_subjective", from30, today);
  const mood = await latestValue("mood", from30, today);
  const sickness = await latestValue("sickness", from30, today);
  const injury = await latestValue("injury", from30, today);

  const load = await loadState();

  const inputs: ReadinessInputs = {
    hrv: hrv?.context ?? null,
    rhr:
      rhrToday !== null && rhrBaseline !== null ? { today: rhrToday, baseline: rhrBaseline } : null,
    sleep:
      sleepTotal !== null
        ? { durationMin: sleepTotal, needMin: DEFAULT_SLEEP_NEED_MIN, quality: sleepQuality }
        : null,
    energy: bodyBattery !== null || stress !== null ? { bodyBattery, stress } : null,
    load: load ? { tsb: load.tsb, acwr: load.acwr } : null,
    subjective:
      fatigue !== null || soreness !== null || stressSubj !== null || mood !== null
        ? { fatigue, soreness, stress: stressSubj, mood }
        : null,
    sickness: sickness === 1,
    injury: injury === 1,
    hrvBaselineDays: hrv
      ? (await getResolvedNumericSeries("hrv_overnight", from60, today)).length
      : 0,
  };

  const readiness = computeReadiness(inputs);
  if (readiness.components.length === 0 && !inputs.sickness && !inputs.injury) return null;
  return { date: today, readiness, inputs };
}

interface RecentActivityRow {
  id: number;
  name: string | null;
  started_at: string | null;
  moving_time_s: number | null;
  avg_hr: number | null;
  tss: number | null;
  method: LoadMethod | null;
  intensity_factor: number | null;
}

/**
 * The current global recovery state: fold the last ~14 days of confirmed
 * activities (with their load) through the recovery engine, modulating the drain
 * by the HRV trend when it is available.
 */
export async function getRecoveryState(now = new Date().toISOString()): Promise<RecoveryResult> {
  const since = new Date(Date.now() - RECOVERY_WINDOW_DAYS * 86_400_000).toISOString();
  const rows = await many<RecentActivityRow>(
    `SELECT a.id, a.name, a.started_at, a.moving_time_s, a.avg_hr,
            l.tss, l.method, l.intensity_factor
     FROM activities a
     JOIN activity_load l ON l.activity_id = a.id
     WHERE a.status = 'confirmed' AND a.started_at IS NOT NULL AND a.started_at >= ?
       AND l.tss IS NOT NULL
     ORDER BY a.started_at ASC`,
    [since]
  );

  // Cheap presence check: with no recent load rows there is no debt, so skip the
  // full PMC fold + threshold/HRV reads entirely (the common/empty path — this
  // runs in the root layout on every request).
  if (rows.length === 0) {
    return computeRecovery(
      [],
      { ctl: 0, tsb: 0, hrvStatus: null, restingHr: null, lthr: null },
      now
    );
  }

  const activities: RecoveryActivity[] = rows.map((r) => {
    const startMs = new Date(r.started_at as string).getTime();
    const durationS = r.moving_time_s ?? 0;
    return {
      id: r.id,
      name: r.name,
      finishedAt: new Date(startMs + durationS * 1000).toISOString(),
      intensityFactor: r.intensity_factor,
      method: r.method,
      tss: r.tss,
      avgHr: r.avg_hr,
      durationS: durationS > 0 ? durationS : null,
    };
  });

  const load = await loadState();
  const thresholds = await getAthleteThresholds();
  const today = (await getLatestHealthDate()) ?? localDateInputValue(new Date());
  const hrv = await buildHrv(today);

  return computeRecovery(
    activities,
    {
      ctl: load?.ctl ?? 0,
      tsb: load?.tsb ?? 0,
      hrvStatus: hrvStatusFromZ(hrv?.z7 ?? null),
      restingHr: thresholds.restingHr,
      lthr: thresholds.lthr,
    },
    now
  );
}
