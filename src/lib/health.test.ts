import { describe, expect, it } from "vitest";
import {
  HEALTH_METRICS,
  METRIC_META,
  SUBJECTIVE_METRICS,
  SUBJECTIVE_SCALE,
  buildWellnessLane,
  isHealthMetric,
  isHealthSource,
  resolveBySource,
  resolveMetrics,
  snapshotToMetrics,
} from "@/lib/health";
import type { HealthMetricRow } from "@/lib/types";

const AT = "2026-07-23T06:00:00.000Z";

function row(over: Partial<HealthMetricRow>): HealthMetricRow {
  return {
    id: 0,
    date: "2026-07-23",
    metric: "resting_hr",
    value: 50,
    value_text: null,
    unit: "bpm",
    source: "manual",
    recorded_at: AT,
    ...over,
  };
}

describe("metric metadata", () => {
  it("covers every metric and every union member is a known metric", () => {
    expect(HEALTH_METRICS.length).toBe(Object.keys(METRIC_META).length);
    for (const m of HEALTH_METRICS) expect(isHealthMetric(m)).toBe(true);
    expect(isHealthMetric("not_a_metric")).toBe(false);
    expect(isHealthMetric(42)).toBe(false);
  });

  it("recognizes the source union", () => {
    for (const s of ["garmin", "coros", "manual", "computed"]) expect(isHealthSource(s)).toBe(true);
    expect(isHealthSource("whoop")).toBe(false);
    expect(isHealthSource(null)).toBe(false);
  });

  it("exposes the subjective self-report set on a 1-5 scale", () => {
    expect(SUBJECTIVE_METRICS).toEqual([
      "fatigue",
      "soreness",
      "stress_subjective",
      "mood",
      "sickness",
      "injury",
    ]);
    for (const m of SUBJECTIVE_METRICS) expect(METRIC_META[m].subjective).toBe(true);
    expect(SUBJECTIVE_SCALE).toEqual({ min: 1, max: 5 });
  });
});

describe("source resolver", () => {
  it("prefers a device reading over a manual one for the same metric", () => {
    const rows = [row({ source: "manual", value: 55 }), row({ source: "garmin", value: 48 })];
    expect(resolveBySource(rows)?.source).toBe("garmin");
    expect(resolveBySource(rows)?.value).toBe(48);
  });

  it("falls back to manual when no device reading exists", () => {
    const rows = [row({ source: "manual", value: 55 })];
    expect(resolveBySource(rows)?.source).toBe("manual");
  });

  it("breaks ties on source priority by most recent recorded_at", () => {
    const rows = [
      row({ source: "garmin", value: 48, recorded_at: "2026-07-23T06:00:00.000Z" }),
      row({ source: "garmin", value: 46, recorded_at: "2026-07-23T09:00:00.000Z" }),
    ];
    expect(resolveBySource(rows)?.value).toBe(46);
  });

  it("returns null for an empty list", () => {
    expect(resolveBySource([])).toBeNull();
  });

  it("collapses a mixed day to one resolved row per metric, in display order", () => {
    const rows = [
      row({ metric: "resting_hr", source: "manual", value: 55 }),
      row({ metric: "resting_hr", source: "garmin", value: 48 }),
      row({ metric: "sleep_total", source: "garmin", value: 452 }),
    ];
    const resolved = resolveMetrics(rows);
    expect(resolved.map((r) => r.metric)).toEqual(["sleep_total", "resting_hr"]);
    expect(resolved.find((r) => r.metric === "resting_hr")?.value).toBe(48);
  });
});

describe("snapshotToMetrics", () => {
  it("normalizes a full Garmin snapshot into flat rows", () => {
    const result = snapshotToMetrics(
      {
        date: "2026-07-23",
        source: "garmin",
        sleep: { totalMin: 452, deepMin: 78, lightMin: 250, remMin: 96, awakeMin: 28, score: 82 },
        hrv: { overnightAvgMs: 61, status: "balanced" },
        restingHr: 47,
        stress: { avg: 28, max: 91 },
        bodyBattery: { low: 24, high: 96 },
        respiration: { avgSleep: 13.2, avgWaking: 15.1 },
        spo2: { avg: 95, low: 90 },
        steps: 9432,
        trainingReadiness: { score: 74, level: "HIGH", recoveryTimeHrs: 11 },
        trainingStatus: { status: "productive" },
      },
      AT
    );
    expect("rows" in result).toBe(true);
    if (!("rows" in result)) return;
    const byMetric = new Map(result.rows.map((r) => [r.metric, r]));
    expect(byMetric.get("sleep_total")?.value).toBe(452);
    expect(byMetric.get("resting_hr")?.value).toBe(47);
    expect(byMetric.get("respiration")?.value).toBe(13.2); // sleep preferred
    expect(byMetric.get("device_readiness")?.value).toBe(74);
    expect(byMetric.get("device_recovery_hours")?.value).toBe(11);
    // categorical labels are uppercased and stored as text, not value
    expect(byMetric.get("hrv_status")?.value_text).toBe("BALANCED");
    expect(byMetric.get("hrv_status")?.value).toBeNull();
    expect(byMetric.get("device_training_status")?.value_text).toBe("PRODUCTIVE");
    // every row carries the source + recorded_at
    for (const r of result.rows) {
      expect(r.source).toBe("garmin");
      expect(r.recorded_at).toBe(AT);
    }
  });

  it("drops absent / non-finite fields instead of writing null rows", () => {
    const result = snapshotToMetrics(
      { date: "2026-07-23", source: "garmin", restingHr: 47, steps: null, weight: NaN },
      AT
    );
    if (!("rows" in result)) throw new Error("expected rows");
    const metrics = result.rows.map((r) => r.metric);
    expect(metrics).toContain("resting_hr");
    expect(metrics).not.toContain("steps");
    expect(metrics).not.toContain("weight");
  });

  it("encodes subjective flags as 0/1", () => {
    const result = snapshotToMetrics(
      { date: "2026-07-23", source: "manual", subjective: { fatigue: 3, sickness: 1, injury: 0 } },
      AT
    );
    if (!("rows" in result)) throw new Error("expected rows");
    const byMetric = new Map(result.rows.map((r) => [r.metric, r]));
    expect(byMetric.get("fatigue")?.value).toBe(3);
    expect(byMetric.get("sickness")?.value).toBe(1);
    expect(byMetric.get("injury")?.value).toBe(0);
  });

  it("rejects a missing or malformed date", () => {
    expect(snapshotToMetrics({ source: "garmin" }, AT)).toEqual({
      error: "date must be YYYY-MM-DD",
    });
    expect(snapshotToMetrics({ date: "07/23/2026", source: "garmin" }, AT)).toEqual({
      error: "date must be YYYY-MM-DD",
    });
  });

  it("rejects an unknown source", () => {
    expect(snapshotToMetrics({ date: "2026-07-23", source: "whoop" }, AT)).toEqual({
      error: "unknown source",
    });
  });

  it("rejects an impossible calendar date that passes the format regex", () => {
    expect(snapshotToMetrics({ date: "2026-02-30", source: "garmin", restingHr: 47 }, AT)).toEqual({
      error: "date must be YYYY-MM-DD",
    });
  });

  it("ignores subjective fields from a non-manual source", () => {
    const result = snapshotToMetrics(
      {
        date: "2026-07-23",
        source: "garmin",
        restingHr: 47,
        subjective: { fatigue: 4, sickness: 1 },
      },
      AT
    );
    if (!("rows" in result)) throw new Error("expected rows");
    const metrics = result.rows.map((r) => r.metric);
    expect(metrics).toContain("resting_hr");
    expect(metrics).not.toContain("fatigue");
    expect(metrics).not.toContain("sickness");
  });

  it("rejects a non-object body", () => {
    expect(snapshotToMetrics("nope", AT)).toEqual({ error: "body must be a JSON object" });
    expect(snapshotToMetrics(null, AT)).toEqual({ error: "body must be a JSON object" });
  });
});

describe("buildWellnessLane (T08)", () => {
  const dates = ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04"];

  it("aligns a series onto the date axis, leaving missing days null in value AND avg", () => {
    const lane = buildWellnessLane("hrv_overnight", dates, [
      { date: "2026-07-02", value: 60 },
      { date: "2026-07-04", value: 70 },
    ]);

    expect(lane.metric).toBe("hrv_overnight");
    expect(lane.unit).toBe("ms");
    expect(lane.points.map((p) => p.date)).toEqual(dates);
    // Day 1 and 3 have no reading: null value, and null avg so the line breaks
    // there instead of interpolating across the gap.
    expect(lane.points[0]).toEqual({ date: "2026-07-01", value: null, avg: null });
    expect(lane.points[2]).toEqual({ date: "2026-07-03", value: null, avg: null });
    expect(lane.points[1].value).toBe(60);
    expect(lane.points[3].value).toBe(70);
  });

  it("averages only the readings inside the trailing 7-day window", () => {
    const week = Array.from({ length: 9 }, (_, i) => ({
      date: `2026-07-${String(i + 1).padStart(2, "0")}`,
      value: i + 1, // 1..9
    }));
    const lane = buildWellnessLane(
      "resting_hr",
      week.map((p) => p.date),
      week
    );

    // Third day: mean of 1,2,3.
    expect(lane.points[2].avg).toBe(2);
    // Ninth day: mean of 3..9, i.e. the trailing 7 only (1 and 2 have dropped out).
    expect(lane.points[8].avg).toBe(6);
  });

  it("converts minute-stored sleep into hours, unit included", () => {
    const lane = buildWellnessLane(
      "sleep_total",
      ["2026-07-01"],
      [{ date: "2026-07-01", value: 450 }]
    );
    expect(lane.unit).toBe("h");
    expect(lane.points[0].value).toBe(7.5);
    expect(lane.points[0].avg).toBe(7.5);
  });

  it("returns an all-null lane for a metric with no readings in the window", () => {
    const lane = buildWellnessLane("hrv_overnight", dates, []);
    expect(lane.points.every((p) => p.value === null && p.avg === null)).toBe(true);
  });
});
