import { describe, expect, it } from "vitest";
import { buildActivityContext, type CoachStreamSummary } from "@/lib/coach";
import type { AthleteThresholds } from "@/lib/fitness";
import type { ActivityWithSplits } from "@/lib/types";

// The coach reads a plain-text context block, so a number formatted wrongly there
// is a number the model reasons about wrongly — with nothing on screen to reveal
// it. These pin the two figures that were leaving in a different shape from the
// one every page shows: run cadence (halved and unitless) and form (unsigned).

const thresholds: AthleteThresholds = {
  maxHr: 190,
  restingHr: 45,
  lthr: 176,
  thresholdPaceSPerKm: 269,
  ftpW: 250,
  restingHrEstimated: false,
  ftpProvisional: false,
  updatedAt: null,
};

function activity(overrides: Partial<ActivityWithSplits> = {}): ActivityWithSplits {
  return {
    id: 1,
    strava_id: null,
    name: "Morning run",
    sport_type: "Run",
    started_at: "2026-07-20T12:00:00Z",
    started_at_local: "2026-07-20T09:00:00Z",
    distance_km: 10,
    moving_time_s: 3000,
    avg_pace_s_per_km: 300,
    avg_hr: 150,
    elevation_gain_m: 50,
    status: "confirmed",
    rpe: null,
    feeling: null,
    workout_notes: null,
    health_notes: null,
    raw_json: null,
    detail_json: null,
    detail_synced_at: null,
    bike_id: null,
    bike_name: null,
    is_race: false,
    goal_pace_s_per_km: null,
    coach_insight: null,
    coach_insight_at: null,
    created_at: "2026-07-20T12:00:00Z",
    splits: [],
    ...overrides,
  };
}

const streams: CoachStreamSummary = {
  avgHr: 150,
  maxHr: 170,
  fastestPaceSPerKm: 250,
  slowestPaceSPerKm: 400,
  avgPower: null,
  maxPower: null,
  avgCadence: 88,
};

function context(overrides: Partial<Parameters<typeof buildActivityContext>[0]> = {}): string {
  return buildActivityContext({
    activity: activity(),
    thresholds,
    streams,
    journal: { rpe: null, feeling: null, workoutNotes: null, healthNotes: null },
    goals: [],
    zones: null,
    laps: [],
    recent: [],
    ...overrides,
  });
}

describe("coach context cadence", () => {
  it("sends a run's true step rate, not Strava's one-leg revolutions", () => {
    expect(context()).toContain("cadence avg 176 spm");
  });

  it("leaves a ride's cadence in rpm", () => {
    expect(context({ activity: activity({ sport_type: "Ride" }) })).toContain("cadence avg 88 rpm");
  });
});
