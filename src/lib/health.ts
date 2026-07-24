// Pure health-domain module: the source-agnostic vocabulary and logic for the
// daily health layer. No DB/IO imports — the data layer (src/lib/db/health.ts)
// feeds these and persists their output, and the ingest route calls the
// normalizer. Three jobs live here:
//   1. metric metadata (kind, unit, grouping, direction) — one source of truth;
//   2. the source resolver (device > manual by default) — one place;
//   3. the snapshot normalizer that turns an ingest payload into flat rows.
import type { HealthMetric, HealthMetricInput, HealthSource } from "./types";

// ---------------------------------------------------------------------------
// Metric metadata
// ---------------------------------------------------------------------------

/**
 * How a metric's reading is stored and read:
 *  - "numeric": a real number in `value` (e.g. resting_hr = 47).
 *  - "flag":    a 0/1 boolean in `value` (e.g. sickness).
 *  - "text":    a categorical label in `value_text` (e.g. hrv_status = BALANCED).
 */
export type MetricKind = "numeric" | "flag" | "text";

/** UI grouping for the metrics panel. */
export type MetricGroup = "sleep" | "cardio" | "stress" | "body" | "device" | "subjective";

/**
 * Which direction is "good" for a metric, used for trend coloring and to give
 * the readiness/coach layers a consistent sense of a signal without hardcoding
 * it per call site. `neutral` = no inherent good/bad direction (e.g. steps).
 */
export type MetricDirection = "higher_better" | "lower_better" | "neutral";

export interface MetricMeta {
  kind: MetricKind;
  group: MetricGroup;
  /** Storage/display unit, or null for unitless scores/labels. */
  unit: string | null;
  direction: MetricDirection;
  /** Subjective metrics are entered by hand; objective ones come from a device. */
  subjective: boolean;
}

// One source of truth for every metric's shape. Iteration order here is the
// display order in the panel.
export const METRIC_META: Record<HealthMetric, MetricMeta> = {
  sleep_total: {
    kind: "numeric",
    group: "sleep",
    unit: "min",
    direction: "higher_better",
    subjective: false,
  },
  sleep_deep: {
    kind: "numeric",
    group: "sleep",
    unit: "min",
    direction: "higher_better",
    subjective: false,
  },
  sleep_light: {
    kind: "numeric",
    group: "sleep",
    unit: "min",
    direction: "neutral",
    subjective: false,
  },
  sleep_rem: {
    kind: "numeric",
    group: "sleep",
    unit: "min",
    direction: "higher_better",
    subjective: false,
  },
  sleep_awake: {
    kind: "numeric",
    group: "sleep",
    unit: "min",
    direction: "lower_better",
    subjective: false,
  },
  sleep_quality: {
    kind: "numeric",
    group: "sleep",
    unit: null,
    direction: "higher_better",
    subjective: false,
  },
  hrv_overnight: {
    kind: "numeric",
    group: "cardio",
    unit: "ms",
    direction: "higher_better",
    subjective: false,
  },
  resting_hr: {
    kind: "numeric",
    group: "cardio",
    unit: "bpm",
    direction: "lower_better",
    subjective: false,
  },
  stress_avg: {
    kind: "numeric",
    group: "stress",
    unit: null,
    direction: "lower_better",
    subjective: false,
  },
  body_battery_low: {
    kind: "numeric",
    group: "stress",
    unit: null,
    direction: "higher_better",
    subjective: false,
  },
  body_battery_high: {
    kind: "numeric",
    group: "stress",
    unit: null,
    direction: "higher_better",
    subjective: false,
  },
  respiration: {
    kind: "numeric",
    group: "cardio",
    unit: "br/min",
    direction: "lower_better",
    subjective: false,
  },
  spo2: {
    kind: "numeric",
    group: "cardio",
    unit: "%",
    direction: "higher_better",
    subjective: false,
  },
  steps: { kind: "numeric", group: "body", unit: null, direction: "neutral", subjective: false },
  weight: { kind: "numeric", group: "body", unit: "kg", direction: "neutral", subjective: false },
  hrv_status: {
    kind: "text",
    group: "cardio",
    unit: null,
    direction: "neutral",
    subjective: false,
  },
  device_training_status: {
    kind: "text",
    group: "device",
    unit: null,
    direction: "neutral",
    subjective: false,
  },
  device_readiness: {
    kind: "numeric",
    group: "device",
    unit: null,
    direction: "higher_better",
    subjective: false,
  },
  device_recovery_hours: {
    kind: "numeric",
    group: "device",
    unit: "h",
    direction: "lower_better",
    subjective: false,
  },
  fatigue: {
    kind: "numeric",
    group: "subjective",
    unit: null,
    direction: "lower_better",
    subjective: true,
  },
  soreness: {
    kind: "numeric",
    group: "subjective",
    unit: null,
    direction: "lower_better",
    subjective: true,
  },
  stress_subjective: {
    kind: "numeric",
    group: "subjective",
    unit: null,
    direction: "lower_better",
    subjective: true,
  },
  mood: {
    kind: "numeric",
    group: "subjective",
    unit: null,
    direction: "higher_better",
    subjective: true,
  },
  sickness: {
    kind: "flag",
    group: "subjective",
    unit: null,
    direction: "lower_better",
    subjective: true,
  },
  injury: {
    kind: "flag",
    group: "subjective",
    unit: null,
    direction: "lower_better",
    subjective: true,
  },
};

/** Every known metric, in display order. */
export const HEALTH_METRICS = Object.keys(METRIC_META) as HealthMetric[];

/** The subjective self-report metrics, the ones the manual form collects. */
export const SUBJECTIVE_METRICS = HEALTH_METRICS.filter((m) => METRIC_META[m].subjective);

/**
 * The 1–5 scale bounds for the Hooper-style subjective ratings (fatigue,
 * soreness, stress, mood). Named so the form and the server validation share one
 * definition.
 */
export const SUBJECTIVE_SCALE = { min: 1, max: 5 } as const;

const HEALTH_SOURCES: HealthSource[] = ["garmin", "coros", "manual", "computed"];

export function isHealthMetric(value: unknown): value is HealthMetric {
  return typeof value === "string" && value in METRIC_META;
}

export function isHealthSource(value: unknown): value is HealthSource {
  return typeof value === "string" && (HEALTH_SOURCES as string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Wellness lanes — recovery signals aligned to a training date axis (T08)
// ---------------------------------------------------------------------------

/** The recovery signals the fitness page can overlay under the PMC, in lane order. */
export const WELLNESS_METRICS = ["hrv_overnight", "resting_hr", "sleep_total"] as const;

export type WellnessMetric = (typeof WELLNESS_METRICS)[number];

/** Trailing window (days) the lane line averages over. */
const WELLNESS_AVG_DAYS = 7;

/** One day of a lane, index-aligned to the date axis it was built against. */
export interface WellnessLanePoint {
  date: string;
  /** That day's reading in the lane's display unit, or null when there is none. */
  value: number | null;
  /**
   * Trailing average of the readings in the last WELLNESS_AVG_DAYS days, or null
   * on days without a reading — so missing days break the line instead of being
   * interpolated across.
   */
  avg: number | null;
}

/** A wellness metric resolved onto a date axis, ready to draw as one lane. */
export interface WellnessLane {
  metric: WellnessMetric;
  /** Display unit of `value`/`avg` (minute-stored sleep is converted to hours). */
  unit: string;
  points: WellnessLanePoint[];
}

/**
 * Align a resolved daily health series onto `dates` (consecutive local days, as
 * the PMC produces) and smooth it with a trailing average. Days missing from the
 * series carry null value AND null avg, which is what makes a lane render as
 * breaks over a period the wearable has no history for. Values are converted to
 * their display unit here, so callers never repeat the minutes-to-hours step.
 */
export function buildWellnessLane(
  metric: WellnessMetric,
  dates: string[],
  series: { date: string; value: number }[]
): WellnessLane {
  const isMinutes = METRIC_META[metric].unit === "min";
  const byDate = new Map(series.map((p) => [p.date, isMinutes ? p.value / 60 : p.value] as const));
  const values = dates.map((date) => byDate.get(date) ?? null);
  const points = dates.map((date, i): WellnessLanePoint => {
    const value = values[i];
    if (value == null) return { date, value: null, avg: null };
    const window = values
      .slice(Math.max(0, i - (WELLNESS_AVG_DAYS - 1)), i + 1)
      .filter((v): v is number => v != null);
    return { date, value, avg: window.reduce((a, b) => a + b, 0) / window.length };
  });
  return { metric, unit: isMinutes ? "h" : (METRIC_META[metric].unit ?? ""), points };
}

// ---------------------------------------------------------------------------
// Source resolver — the ONE place precedence between sources is decided.
// ---------------------------------------------------------------------------

// Higher wins. Device readings (garmin/coros) beat a manual entry for the same
// metric by default; `computed` proxies are the last resort. This is the single
// knob to make user-overridable later without touching call sites.
const SOURCE_PRIORITY: Record<HealthSource, number> = {
  garmin: 3,
  coros: 3,
  manual: 2,
  computed: 1,
};

interface Resolvable {
  source: HealthSource;
  recorded_at: string | null;
}

/**
 * Pick the preferred row from several sources of the SAME metric on the same
 * day: highest source priority wins, ties broken by the most recent
 * recorded_at. Returns null for an empty list.
 */
export function resolveBySource<T extends Resolvable>(rows: T[]): T | null {
  let best: T | null = null;
  for (const row of rows) {
    if (best === null) {
      best = row;
      continue;
    }
    const byPriority = SOURCE_PRIORITY[row.source] - SOURCE_PRIORITY[best.source];
    if (byPriority > 0) {
      best = row;
    } else if (byPriority === 0 && (row.recorded_at ?? "") > (best.recorded_at ?? "")) {
      best = row;
    }
  }
  return best;
}

/**
 * Collapse a day's rows (possibly several sources per metric) down to one
 * resolved row per metric. Order follows METRIC_META display order.
 */
export function resolveMetrics<T extends Resolvable & { metric: HealthMetric }>(rows: T[]): T[] {
  const byMetric = new Map<HealthMetric, T[]>();
  for (const row of rows) {
    const list = byMetric.get(row.metric);
    if (list) list.push(row);
    else byMetric.set(row.metric, [row]);
  }
  const out: T[] = [];
  for (const metric of HEALTH_METRICS) {
    const resolved = resolveBySource(byMetric.get(metric) ?? []);
    if (resolved) out.push(resolved);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Snapshot normalizer — ingest payload -> flat health_metric rows.
// ---------------------------------------------------------------------------

// The ingest payload is a nested, source-agnostic snapshot. Every field is
// optional so a partial night (e.g. no HRV read) still ingests what it has. It
// is validated from `unknown` below rather than trusted as a type — the two
// hard requirements are a valid date and a known source. The full shape is the
// contract in docs/health-readiness/RESEARCH_GARMIN_LIBS.md §5.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True when a YYYY-MM-DD string is a real calendar day. The regex alone accepts
 * impossible dates (2026-02-30); a UTC round-trip rejects them so malformed
 * ingest data can never become a latest-date/baseline key.
 */
export function isRealCalendarDate(date: string): boolean {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A finite number or null (NaN/Infinity/strings/absent all collapse to null). */
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** A trimmed non-empty string (uppercased for categorical labels) or null. */
function label(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.toUpperCase().slice(0, 40) : null;
}

/**
 * Normalize an ingest payload into flat health_metric rows, dropping any field
 * that is absent or not a finite value. Returns an `error` for the two things
 * that make a payload unusable: a missing/invalid date, or an unknown source.
 * Everything else degrades to "just fewer rows", never a hard failure — a
 * best-effort feed must not reject a whole day over one odd field.
 */
export function snapshotToMetrics(
  input: unknown,
  recordedAt: string
): { rows: HealthMetricInput[] } | { error: string } {
  if (!isRecord(input)) return { error: "body must be a JSON object" };
  const date = input.date;
  if (typeof date !== "string" || !DATE_RE.test(date) || !isRealCalendarDate(date)) {
    return { error: "date must be YYYY-MM-DD" };
  }
  if (!isHealthSource(input.source)) {
    return { error: "unknown source" };
  }
  const source = input.source;
  const rows: HealthMetricInput[] = [];

  const push = (metric: HealthMetric, value: number | null, valueText: string | null) => {
    if (value === null && valueText === null) return;
    rows.push({
      date,
      metric,
      value,
      value_text: valueText,
      unit: METRIC_META[metric].unit,
      source,
      recorded_at: recordedAt,
    });
  };
  const pushNum = (metric: HealthMetric, value: number | null) => push(metric, value, null);
  const pushText = (metric: HealthMetric, value: string | null) => push(metric, null, value);

  const sleep = isRecord(input.sleep) ? input.sleep : {};
  pushNum("sleep_total", num(sleep.totalMin));
  pushNum("sleep_deep", num(sleep.deepMin));
  pushNum("sleep_light", num(sleep.lightMin));
  pushNum("sleep_rem", num(sleep.remMin));
  pushNum("sleep_awake", num(sleep.awakeMin));
  pushNum("sleep_quality", num(sleep.score));

  const hrv = isRecord(input.hrv) ? input.hrv : {};
  pushNum("hrv_overnight", num(hrv.overnightAvgMs));
  pushText("hrv_status", label(hrv.status));

  pushNum("resting_hr", num(input.restingHr));

  const stress = isRecord(input.stress) ? input.stress : {};
  pushNum("stress_avg", num(stress.avg));

  const bodyBattery = isRecord(input.bodyBattery) ? input.bodyBattery : {};
  pushNum("body_battery_low", num(bodyBattery.low));
  pushNum("body_battery_high", num(bodyBattery.high));

  const respiration = isRecord(input.respiration) ? input.respiration : {};
  // Prefer the overnight/sleep breathing rate; fall back to waking.
  pushNum("respiration", num(respiration.avgSleep) ?? num(respiration.avgWaking));

  const spo2 = isRecord(input.spo2) ? input.spo2 : {};
  pushNum("spo2", num(spo2.avg));

  pushNum("steps", num(input.steps));
  pushNum("weight", num(input.weight));

  const readiness = isRecord(input.trainingReadiness) ? input.trainingReadiness : {};
  pushNum("device_readiness", num(readiness.score));
  pushNum("device_recovery_hours", num(readiness.recoveryTimeHrs));

  const status = isRecord(input.trainingStatus) ? input.trainingStatus : {};
  pushText("device_training_status", label(status.status));

  // Subjective self-report is MANUAL-only: a device snapshot must never write or
  // overwrite these (they would change readiness + the red-flag state). Flags are
  // stored 0/1 so a cleared flag is captured, not just a set one.
  const subjective = source === "manual" && isRecord(input.subjective) ? input.subjective : {};
  pushNum("fatigue", num(subjective.fatigue));
  pushNum("soreness", num(subjective.soreness));
  pushNum("stress_subjective", num(subjective.stress));
  pushNum("mood", num(subjective.mood));
  const sickness = num(subjective.sickness);
  if (sickness !== null) pushNum("sickness", sickness ? 1 : 0);
  const injury = num(subjective.injury);
  if (injury !== null) pushNum("injury", injury ? 1 : 0);

  return { rows };
}
