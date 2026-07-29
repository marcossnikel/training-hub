import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  filterBySport,
  periodTotals,
  totalsFrom,
  TOTALS_METRICS,
  TOTALS_PERIODS,
  TOTALS_ROWS,
  type TotalsActivity,
} from "@/lib/totals";

// A stored UTC instant, written as the literal ISO the DB holds rather than built
// from local wall-clock components: the day these tests expect is the one printed
// in the string, in every process timezone.
function at(y: number, m: number, d: number, hour = 12): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${y}-${pad(m)}-${pad(d)}T${pad(hour)}:00:00Z`;
}

function activity(
  startedAt: string,
  fields: Partial<Omit<TotalsActivity, "started_at">> = {}
): TotalsActivity {
  return {
    started_at: startedAt,
    started_at_local: null,
    sport_type: "Run",
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
    expect(rows[2].values).toEqual({ seconds: 0, km: 0, elevationM: 0, sessions: 0 });
  });

  it("sums every metric over the period and treats missing numbers as zero", () => {
    const rows = periodTotals(
      [
        activity(at(2026, 7, 20), { moving_time_s: 4372, distance_km: 0 }),
        activity(at(2026, 7, 21), { moving_time_s: 3332, distance_km: 10.03 }),
        activity(at(2026, 7, 22), {
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
      seconds: 7704,
      km: 10.03,
      elevationM: 200,
      sessions: 3,
    });
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

  it("carries the previous period's totals for every row to compare against", () => {
    const rows = periodTotals(
      [
        activity(at(2026, 7, 21), { moving_time_s: 3600, distance_km: 10 }),
        activity(at(2026, 7, 14), { moving_time_s: 5400, distance_km: 15 }),
        activity(at(2026, 7, 15), { moving_time_s: 1800, distance_km: 0 }),
      ],
      "weeks",
      2,
      now
    );
    expect(rows[0].previous).toEqual(rows[1].values);
    expect(rows[0].previous).toEqual({
      seconds: 7200,
      km: 15,
      elevationM: 200,
      sessions: 2,
    });
    // The oldest displayed row compares against the extra period loaded behind
    // it, which is empty here.
    expect(rows[1].previous).toEqual({ seconds: 0, km: 0, elevationM: 0, sessions: 0 });
  });

  it("ignores activities outside the loaded range", () => {
    const rows = periodTotals([activity(at(2025, 1, 1))], "weeks", 4, now);
    expect(rows.every((r) => r.values.sessions === 0)).toBe(true);
  });

  it("offers weeks first, so weeks is the default pill", () => {
    expect(TOTALS_PERIODS[0]).toBe("weeks");
    expect(TOTALS_METRICS).toEqual(["seconds", "km", "elevationM", "sessions"]);
  });
});

describe("filterBySport", () => {
  const rows = [
    activity(at(2026, 7, 21), { sport_type: "Run" }),
    activity(at(2026, 7, 21), { sport_type: "TrailRun" }),
    activity(at(2026, 7, 22), { sport_type: "VirtualRide" }),
    activity(at(2026, 7, 23), { sport_type: "WeightTraining" }),
    activity(at(2026, 7, 23), { sport_type: null }),
  ];

  it("keeps every row when no sport is selected", () => {
    expect(filterBySport(rows, "all")).toBe(rows);
  });

  it("keeps the rows the weekly bars stack under that sport, not just the exact name", () => {
    expect(filterBySport(rows, "run").map((r) => r.sport_type)).toEqual(["Run", "TrailRun"]);
    expect(filterBySport(rows, "bike").map((r) => r.sport_type)).toEqual(["VirtualRide"]);
    expect(filterBySport(rows, "other").map((r) => r.sport_type)).toEqual(["WeightTraining", null]);
  });

  it("totals only the filtered sport, so the table agrees with a sport-filtered page", () => {
    const runOnly = periodTotals(filterBySport(rows, "run"), "weeks", 2, now);
    expect(runOnly[0].values).toEqual({
      seconds: 7200,
      km: 20,
      elevationM: 200,
      sessions: 2,
    });
    expect(periodTotals(rows, "weeks", 2, now)[0].values.sessions).toBe(5);
  });
});

// The plan's central landmine: a period must be keyed by the athlete's own
// calendar day, never by the day the server process happens to be in. Every
// fixture below is a LITERAL ISO instant and the block is re-run pinned to three
// zones (the format.test.ts idiom), so bucketing that keys off `started_at`
// instead of the local stamp, or reads either stamp with local getters, fails in
// at least one of them.
for (const tz of ["UTC", "America/Sao_Paulo", "Asia/Tokyo"]) {
  describe(`local-day bucketing under TZ=${tz}`, () => {
    const originalTz = process.env.TZ;
    beforeAll(() => {
      process.env.TZ = tz;
    });
    afterAll(() => {
      process.env.TZ = originalTz;
    });

    // Saturday 25 July 2026 at midday UTC: the same local day in all three zones.
    const today = new Date("2026-07-25T12:00:00Z");

    it("counts an evening session on its local day's week, not the UTC instant's", () => {
      // 21:00 on Sunday 26 July in a UTC-3 zone: the stored instant is already
      // Monday the 27th, but the session belongs to the week of Monday the 20th.
      const rows = periodTotals(
        [
          activity("2026-07-27T00:00:00Z", { started_at_local: "2026-07-26T21:00:00Z" }),
          activity("2026-07-20T02:00:00Z", { started_at_local: "2026-07-19T23:00:00Z" }),
        ],
        "weeks",
        2,
        today
      );
      expect(rows.map((r) => r.start)).toEqual(["2026-07-20", "2026-07-13"]);
      // The Sunday-evening session lands in the week of the 20th; the Sunday
      // 19th one (stored as 02:00Z on the 20th) in the week before it.
      expect(rows[0].values.sessions).toBe(1);
      expect(rows[1].values.sessions).toBe(1);
    });

    it("falls back to reading the UTC instant as UTC when no local stamp was captured", () => {
      // Rows synced before started_at_local existed have only the instant, and
      // 02:00Z on Monday 20 July must stay in that week rather than sliding back
      // to Sunday where local getters would put it in a negative-offset zone.
      const rows = periodTotals([activity("2026-07-20T02:00:00Z")], "weeks", 2, today);
      expect(rows[0].start).toBe("2026-07-20");
      expect(rows[0].values.sessions).toBe(1);
      expect(rows[1].values.sessions).toBe(0);
    });

    it("counts a month by the local day too", () => {
      // 21:00 on 30 June in a UTC-3 zone: stored as 1 July, counted in June.
      const rows = periodTotals(
        [activity("2026-07-01T00:00:00Z", { started_at_local: "2026-06-30T21:00:00Z" })],
        "months",
        2,
        today
      );
      expect(rows.map((r) => r.start)).toEqual(["2026-07-01", "2026-06-01"]);
      expect(rows[0].values.sessions).toBe(0);
      expect(rows[1].values.sessions).toBe(1);
    });
  });
}
