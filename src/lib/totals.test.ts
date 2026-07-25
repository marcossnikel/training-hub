import { describe, expect, it } from "vitest";
import {
  periodTotals,
  totalsFrom,
  TOTALS_METRICS,
  TOTALS_PERIODS,
  TOTALS_ROWS,
  type TotalsActivity,
} from "@/lib/totals";

// Timestamps are built from local wall-clock components and stored as the UTC
// instant they represent, exactly like Strava's start_date. Bucketing reads them
// back as local days, so these tests hold in any process timezone.
function at(y: number, m: number, d: number, hour = 12): string {
  return new Date(y, m - 1, d, hour).toISOString();
}

function activity(
  startedAt: string,
  fields: Partial<Omit<TotalsActivity, "started_at">> = {}
): TotalsActivity {
  return {
    started_at: startedAt,
    tss: 50,
    moving_time_s: 3600,
    distance_km: 10,
    elevation_gain_m: 100,
    ...fields,
  };
}

// Saturday 25 July 2026; its Monday is the 20th.
const now = new Date(2026, 6, 25, 9);

describe("totalsFrom", () => {
  it("reaches back one period further than the table shows", () => {
    // 12 displayed weeks + 1 comparison base: the 12th Monday before the 20th.
    expect(totalsFrom("weeks", TOTALS_ROWS, now)).toBe("2026-04-27");
    expect(totalsFrom("months", TOTALS_ROWS, now)).toBe("2025-07-01");
  });

  it("starts a week range on a Monday whatever day of the week it is run", () => {
    for (let day = 20; day <= 26; day += 1) {
      expect(totalsFrom("weeks", 1, new Date(2026, 6, day, 6))).toBe("2026-07-13");
    }
  });
});

describe("periodTotals", () => {
  it("buckets by local Monday, newest period first, and keeps empty periods", () => {
    const rows = periodTotals(
      [activity(at(2026, 7, 21)), activity(at(2026, 7, 25)), activity(at(2026, 7, 14))],
      "weeks",
      3,
      now
    );
    expect(rows.map((r) => r.start)).toEqual(["2026-07-20", "2026-07-13", "2026-07-06"]);
    expect(rows[0].values.sessions).toBe(2);
    expect(rows[1].values.sessions).toBe(1);
    expect(rows[2].values).toEqual({ load: 0, seconds: 0, km: 0, elevationM: 0, sessions: 0 });
  });

  it("sums every metric over the period and treats missing numbers as zero", () => {
    const rows = periodTotals(
      [
        activity(at(2026, 7, 20), { tss: 13, moving_time_s: 4372, distance_km: 0 }),
        activity(at(2026, 7, 21), { tss: 60.8, moving_time_s: 3332, distance_km: 10.03 }),
        activity(at(2026, 7, 22), {
          tss: null,
          moving_time_s: null,
          distance_km: null,
          elevation_gain_m: null,
        }),
      ],
      "weeks",
      2,
      now
    );
    expect(rows[0].values).toEqual({
      load: 73.8,
      seconds: 7704,
      km: 10.03,
      elevationM: 200,
      sessions: 3,
    });
  });

  it("buckets an activity started late in the local evening into that local day's week", () => {
    // 23:30 local on Sunday 26 July is a UTC instant that lands in the next
    // calendar day for negative offsets; the week it counts in is still the one
    // starting Monday 20 July.
    const rows = periodTotals([activity(at(2026, 7, 26, 23))], "weeks", 2, now);
    expect(rows[0].start).toBe("2026-07-20");
    expect(rows[0].values.sessions).toBe(1);
  });

  it("buckets by calendar month when asked for months", () => {
    const rows = periodTotals(
      [activity(at(2026, 7, 1)), activity(at(2026, 7, 31)), activity(at(2026, 6, 30))],
      "months",
      2,
      now
    );
    expect(rows.map((r) => r.start)).toEqual(["2026-07-01", "2026-06-01"]);
    expect(rows[0].values.sessions).toBe(2);
    expect(rows[1].values.sessions).toBe(1);
  });

  it("shows exactly the requested number of periods, ending with the current one", () => {
    const rows = periodTotals([], "weeks", TOTALS_ROWS, now);
    expect(rows).toHaveLength(TOTALS_ROWS);
    expect(rows[0].start).toBe("2026-07-20");
    expect(rows[TOTALS_ROWS - 1].start).toBe("2026-05-04");
  });

  it("deltas every metric against the previous period", () => {
    const rows = periodTotals(
      [
        activity(at(2026, 7, 21), { tss: 60, moving_time_s: 3600, distance_km: 10 }),
        activity(at(2026, 7, 14), { tss: 100, moving_time_s: 5400, distance_km: 15 }),
        activity(at(2026, 7, 15), { tss: 20, moving_time_s: 1800, distance_km: 0 }),
      ],
      "weeks",
      2,
      now
    );
    expect(rows[0].delta).toEqual({
      load: -60,
      seconds: -3600,
      km: -5,
      elevationM: -100,
      sessions: -1,
    });
    // The oldest displayed row compares against the extra period loaded behind it.
    expect(rows[1].delta).toEqual({
      load: 120,
      seconds: 7200,
      km: 15,
      elevationM: 200,
      sessions: 2,
    });
  });

  it("gives the oldest displayed row a delta too, so no row is left without one", () => {
    const rows = periodTotals([activity(at(2026, 7, 25))], "weeks", TOTALS_ROWS, now);
    expect(rows.every((r) => r.delta !== null)).toBe(true);
  });

  it("ignores activities outside the loaded range", () => {
    const rows = periodTotals([activity(at(2025, 1, 1))], "weeks", 4, now);
    expect(rows.every((r) => r.values.sessions === 0)).toBe(true);
  });

  it("offers weeks first, so weeks is the default pill", () => {
    expect(TOTALS_PERIODS[0]).toBe("weeks");
    expect(TOTALS_METRICS).toEqual(["load", "seconds", "km", "elevationM", "sessions"]);
  });
});
