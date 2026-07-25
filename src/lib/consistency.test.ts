import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  activeDaysPerWeek,
  consistencyHeatmap,
  currentStreak,
  heatmapFrom,
  HEATMAP_WEEKS,
  sessionCountsByDay,
  type SessionStart,
} from "@/lib/consistency";
import { dailyLoadSeries } from "@/lib/fitness";
import { eachDay } from "@/lib/format";

// Saturday 25 July 2026, built from local wall-clock components so it is the
// same calendar day whatever timezone the process runs in (the totals.test.ts
// idiom). Its Monday is the 20th.
const now = new Date(2026, 6, 25, 9);

/** A gap-filled daily series over [from, to] with `loads` keyed by day. */
function series(from: string, to: string, loads: Record<string, number> = {}) {
  return eachDay(from, to).map((date) => ({ date, load: loads[date] ?? 0 }));
}

function session(startedAt: string, sport: string | null = "Run"): SessionStart {
  return { started_at: startedAt, sport_type: sport };
}

describe("heatmapFrom", () => {
  it("reaches a day past the grid's first Monday", () => {
    // 53 columns ending with the week of Monday 20 July 2026 open on Monday
    // 21 July 2025; the extra day is the timezone slack the query needs.
    expect(heatmapFrom(now)).toBe("2025-07-20");
  });

  it("lands on the same day whatever weekday it is called on", () => {
    for (let day = 20; day <= 26; day += 1) {
      expect(heatmapFrom(new Date(2026, 6, day, 6))).toBe("2025-07-20");
    }
  });
});

describe("consistencyHeatmap grid", () => {
  const heatmap = consistencyHeatmap(series("2025-07-21", "2026-07-25"), new Map(), now);

  it("spans 53 Monday-started columns ending with today, and stops at today", () => {
    expect(heatmap.columns).toBe(HEATMAP_WEEKS);
    expect(heatmap.rows).toBe(7);
    // Monday 21 July 2025 through Saturday 25 July 2026: 365 days of full weeks
    // plus Tuesday to Saturday of the current one. The rest of this week gets no
    // cell at all, so the grid never trails empty future squares.
    expect(heatmap.cells).toHaveLength(370);
    expect(heatmap.cells[0]).toMatchObject({ date: "2025-07-21", column: 0, row: 0 });
    const last = heatmap.cells[heatmap.cells.length - 1];
    // Row 0 is Monday, so Saturday is row 5.
    expect(last).toMatchObject({ date: "2026-07-25", column: 52, row: 5 });
  });

  it("puts every weekday on its own row and every week in its own column", () => {
    const monday = heatmap.cells.find((cell) => cell.date === "2026-07-20");
    expect(monday).toMatchObject({ column: 52, row: 0 });
    // The Sunday before it closes the previous column.
    expect(heatmap.cells.find((cell) => cell.date === "2026-07-19")).toMatchObject({
      column: 51,
      row: 6,
    });
  });

  it("labels each month at the column its 1st falls in", () => {
    // 1 Jan 2026 is 164 days into the grid: column 23, and a Thursday (row 3).
    expect(heatmap.cells.find((cell) => cell.date === "2026-01-01")).toMatchObject({
      column: 23,
      row: 3,
    });
    expect(heatmap.months).toContainEqual({ month: 0, column: 23 });
    // Twelve labels: August 2025 through July 2026. The grid opens mid-July
    // 2025, whose 1st precedes it, so that partial month goes unlabeled.
    expect(heatmap.months).toHaveLength(12);
    expect(heatmap.months[0]).toEqual({ month: 7, column: 1 });
    expect(heatmap.months[11]).toEqual({ month: 6, column: 49 });
  });
});

describe("consistencyHeatmap levels", () => {
  it("buckets active days by the year's load quartiles and leaves rest days empty", () => {
    // Quartiles of [10, 20, 30, 40] are 17.5 / 25 / 32.5, so each day lands in
    // its own step and the untouched days stay at level 0.
    const heatmap = consistencyHeatmap(
      series("2026-07-20", "2026-07-25", {
        "2026-07-20": 10,
        "2026-07-21": 20,
        "2026-07-22": 30,
        "2026-07-23": 40,
      }),
      new Map(),
      now
    );
    const levelOn = (date: string) => heatmap.cells.find((cell) => cell.date === date)?.level;
    expect(levelOn("2026-07-20")).toBe(1);
    expect(levelOn("2026-07-21")).toBe(2);
    expect(levelOn("2026-07-22")).toBe(3);
    expect(levelOn("2026-07-23")).toBe(4);
    expect(levelOn("2026-07-24")).toBe(0);
    // A day the series does not cover at all is an empty day, not a hole.
    expect(levelOn("2025-12-25")).toBe(0);
  });

  it("ignores rest days when cutting the quartiles", () => {
    // One session in a year of rest: a single active day is its own top quartile
    // rather than being drowned by 364 zeros.
    const heatmap = consistencyHeatmap(
      series("2025-07-21", "2026-07-25", { "2026-07-22": 40 }),
      new Map(),
      now
    );
    expect(heatmap.cells.find((cell) => cell.date === "2026-07-22")?.level).toBe(1);
    expect(heatmap.cells.every((cell) => cell.load > 0 || cell.level === 0)).toBe(true);
  });

  it("keeps a session count on a day that carries no load", () => {
    // A strength session with no computable TSS is still a session; the cell
    // reads empty but its tooltip must not claim zero sessions.
    const heatmap = consistencyHeatmap(
      series("2026-07-20", "2026-07-25"),
      new Map([["2026-07-24", 1]]),
      now
    );
    expect(heatmap.cells.find((cell) => cell.date === "2026-07-24")).toMatchObject({
      load: 0,
      sessions: 1,
      level: 0,
    });
  });
});

describe("currentStreak", () => {
  it("counts consecutive days with load ending today", () => {
    const daily = series("2026-07-20", "2026-07-25", {
      "2026-07-23": 40,
      "2026-07-24": 50,
      "2026-07-25": 30,
    });
    expect(currentStreak(daily, now)).toBe(3);
  });

  it("holds the streak while today is still empty", () => {
    // Before the day's first session an unfinished today must not read as a break.
    const daily = series("2026-07-20", "2026-07-25", {
      "2026-07-23": 40,
      "2026-07-24": 50,
    });
    expect(currentStreak(daily, now)).toBe(2);
  });

  it("breaks once a whole day has passed without load", () => {
    const daily = series("2026-07-20", "2026-07-25", {
      "2026-07-22": 40,
      "2026-07-23": 50,
    });
    expect(currentStreak(daily, now)).toBe(0);
  });

  it("stops at a gap rather than counting through it", () => {
    const daily = series("2026-07-13", "2026-07-25", {
      "2026-07-14": 30,
      "2026-07-15": 30,
      // 16 July off.
      "2026-07-17": 30,
      "2026-07-18": 30,
      "2026-07-19": 30,
      "2026-07-20": 30,
      "2026-07-21": 30,
      "2026-07-22": 30,
      "2026-07-23": 30,
      "2026-07-24": 30,
      "2026-07-25": 30,
    });
    expect(currentStreak(daily, now)).toBe(9);
  });

  it("is zero without any history", () => {
    expect(currentStreak([], now)).toBe(0);
  });
});

describe("activeDaysPerWeek", () => {
  it("averages the days with load over the trailing four weeks", () => {
    // 7 active days inside the 28-day window: 1.75 per week.
    const daily = series("2026-06-28", "2026-07-25", {
      "2026-07-01": 30,
      "2026-07-05": 30,
      "2026-07-09": 30,
      "2026-07-13": 30,
      "2026-07-19": 30,
      "2026-07-22": 30,
      "2026-07-25": 30,
    });
    expect(activeDaysPerWeek(daily, 4, now)).toBe(1.75);
  });

  it("counts a week with no data as a week with no training", () => {
    // 28 June is 27 days back, so only the last four weeks count: the days in
    // May are outside the window and do not inflate the figure.
    const daily = series("2026-05-01", "2026-07-25", {
      "2026-05-04": 60,
      "2026-05-05": 60,
      "2026-05-06": 60,
      "2026-07-25": 60,
    });
    expect(activeDaysPerWeek(daily, 4, now)).toBe(0.25);
  });
});

// Pinned to UTC so the expected keys can be read straight off the fixtures: this
// block is about the counting, and which day an instant belongs to is the pinned
// three-zone block at the bottom of the file.
describe("sessionCountsByDay", () => {
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "UTC";
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it("counts every session on its day", () => {
    const counts = sessionCountsByDay([
      session("2026-07-20T09:00:00Z"),
      session("2026-07-20T18:00:00Z"),
      session("2026-07-21T09:00:00Z"),
    ]);
    expect(counts.get("2026-07-20")).toBe(2);
    expect(counts.get("2026-07-21")).toBe(1);
    expect(counts.get("2026-07-22")).toBeUndefined();
  });
});

// The landmine this task was corrected for: a heatmap cell paints a load that
// `dailyLoadSeries` bucketed and a count that `sessionCountsByDay` bucketed, so
// the two MUST key days identically. dailyLoadSeries reads the stored UTC instant
// in the process timezone, so these fixtures are literal ISO instants and the
// block is re-run pinned to three zones: switching the counts to the athlete's
// local stamp (localStartedAt), to UTC getters, or to a SQL substr of started_at
// fails at least one of them.
for (const tz of ["UTC", "America/Sao_Paulo", "Asia/Tokyo"]) {
  describe(`session counts share dailyLoadSeries' day key under TZ=${tz}`, () => {
    const originalTz = process.env.TZ;
    beforeAll(() => {
      process.env.TZ = tz;
    });
    afterAll(() => {
      process.env.TZ = originalTz;
    });

    // 23:30Z on Saturday 25 July 2026: still the 25th in UTC and in Sao Paulo
    // (20:30), already the 26th in Tokyo (08:30 the next morning).
    const lateNight = "2026-07-25T23:30:00Z";
    const expected: Record<string, string> = {
      UTC: "2026-07-25",
      "America/Sao_Paulo": "2026-07-25",
      "Asia/Tokyo": "2026-07-26",
    };

    it("keys a late-night session on the same day its load lands on", () => {
      const loaded = dailyLoadSeries([{ started_at: lateNight, tss: 42 }]);
      const counts = sessionCountsByDay([session(lateNight)]);
      const loadDay = loaded.find((day) => day.load > 0)?.date;
      expect(loadDay).toBe(expected[tz]);
      expect(counts.get(expected[tz])).toBe(1);
      expect([...counts.keys()]).toEqual([expected[tz]]);
    });

    it("paints load and count in the very same cell", () => {
      const rows = [
        { started_at: lateNight, tss: 42 },
        { started_at: "2026-07-24T13:00:00Z", tss: 30 },
      ];
      const heatmap = consistencyHeatmap(
        dailyLoadSeries(rows),
        sessionCountsByDay(rows.map((row) => session(row.started_at))),
        new Date(2026, 6, 26, 9)
      );
      for (const cell of heatmap.cells) {
        // No cell may carry one without the other: a load with no session (or a
        // session with no load) is exactly the one-day drift a mismatched key
        // would produce for this fixture.
        expect(cell.load > 0).toBe(cell.sessions > 0);
      }
      expect(heatmap.cells.filter((cell) => cell.sessions > 0)).toHaveLength(2);
    });
  });
}
