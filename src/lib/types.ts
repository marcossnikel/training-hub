export type Feeling = "great" | "good" | "ok" | "rough" | "terrible";

export type ActivityStatus = "pending_review" | "confirmed";

export type WearStatus = "fresh" | "worn" | "critical" | "retired";

// The shared gear base: the identity + fields and lifecycle every gear entity
// carries. Shoes and bikes each EXTEND this with their own specialized fields
// (shoes add a retirement cap; bikes add indoor/outdoor/ride breakdown).
export interface Gear {
  id: number;
  name: string;
  role: string | null;
  strava_gear_id: string | null;
  photo_path: string | null;
  initial_km: number;
  retired_at: string | null;
  created_at: string;
}

// The lean projection the gear selects consume (settings matcher, manual entry,
// review). The option shape is identical for both entities, so it lives once.
export interface GearOption {
  id: number;
  name: string;
  role: string | null;
  retired: boolean;
}

export interface Shoe extends Gear {
  retirement_km: number | null;
}

export interface ShoeWithMileage extends Shoe {
  current_km: number;
}

export interface Activity {
  id: number;
  strava_id: number | null;
  name: string | null;
  sport_type: string | null;
  started_at: string | null;
  // Strava's start_date_local: the activity's naive local wall-clock (Z-suffixed).
  // Null for rows synced before it was captured; readers fall back to started_at.
  started_at_local: string | null;
  distance_km: number | null;
  moving_time_s: number | null;
  avg_pace_s_per_km: number | null;
  avg_hr: number | null;
  elevation_gain_m: number | null;
  status: ActivityStatus;
  rpe: number | null;
  feeling: Feeling | null;
  workout_notes: string | null;
  health_notes: string | null;
  raw_json: string | null;
  detail_json: string | null;
  detail_synced_at: string | null;
  bike_id: number | null;
  bike_name: string | null;
  is_race: boolean;
  goal_pace_s_per_km: number | null;
  created_at: string;
}

export interface SplitWithShoe {
  id: number;
  activity_id: number;
  shoe_id: number | null;
  km: number;
  note: string | null;
  shoe_name: string | null;
  shoe_role: string | null;
}

export interface ActivityWithSplits extends Activity {
  splits: SplitWithShoe[];
}

export interface SplitInput {
  shoe_id: number | null;
  km: number;
}

export interface StravaGear {
  id: string;
  name: string;
  distance: number | null;
  retired: boolean | null;
}

export type ShoeOption = GearOption;

// A race or target the athlete is training for.
export interface Goal {
  id: number;
  name: string;
  race_date: string | null; // YYYY-MM-DD
  distance_km: number | null;
  goal_time_s: number | null;
  notes: string | null;
  priority: number; // 1 = primary goal, 0 = secondary
  created_at: string;
}

export type GoalInput = Omit<Goal, "id" | "created_at">;

// A bike carries exactly the shared gear base (no extra stored field); its
// distinguishing data lives on BikeWithMileage.
export type Bike = Gear;

export interface BikeWithMileage extends Bike {
  current_km: number;
  indoor_km: number;
  outdoor_km: number;
  ride_count: number;
}

export type BikeOption = GearOption;
