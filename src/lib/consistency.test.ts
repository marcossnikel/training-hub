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
import { eachDay, localDateInputValue } from "@/lib/format";

// Saturday 25 July 2026, built from local wall-clock components so it is the
// same calendar day whatever timezone the process runs in (the totals.test.ts
// idiom). Its Monday is the 20th.
const now = new Date(2026, 6, 25, 9);

/** A gap-filled daily series over [from, to] with `loads` keyed by day. */
function series(from: string, to: string, loads: Record<string, number> = {}) {
  return eachDay(from, to).map((date) => ({ date, minutes: loads[date] ?? 0 }));
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

// The grid has to come out identical in every zone, so it is built under each of
// them here rather than under whatever the ambient TZ happens to be.
// America/Santiago is the regression guard: it shifts at local MIDNIGHT, which is
// where eachDay used to lose a day and drop today's cell (369 cells, last one
// yesterday).
for (const tz of ["UTC", "America/Sao_Paulo", "Asia/Tokyo", "America/Santiago"]) {
  describe(`consistencyHeatmap grid under TZ=${tz}`, () => {
    const originalTz = process.env.TZ;
    beforeAll(() => {
      process.env.TZ = tz;
    });
    afterAll(() => {
      process.env.TZ = originalTz;
    });

    // Built inside each test, never in this describe body: a describe body runs at
    // collection time, before beforeAll pins the zone.
    const grid = () =>
      consistencyHeatmap(series("2025-07-21", "2026-07-25"), new Map(), new Date(2026, 6, 25, 9));

    it("spans 53 Monday-started columns ending with today, and stops at today", () => {
      const heatmap = grid();
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
      const heatmap = grid();
      const monday = heatmap.cells.find((cell) => cell.date === "2026-07-20");
      expect(monday).toMatchObject({ column: 52, row: 0 });
      // The Sunday before it closes the previous column.
      expect(heatmap.cells.find((cell) => cell.date === "2026-07-19")).toMatchObject({
        column: 51,
        row: 6,
      });
    });

    it("labels each month at the column its 1st falls in", () => {
      const heatmap = grid();
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

    it("covers a leap day when the trailing year contains one", () => {
      // 29 February 2024 is a Thursday; a grid ending Monday 4 March 2024 must
      // carry it as a cell of its own rather than skipping from 28 Feb to 1 Mar.
      const heatmap = consistencyHeatmap(
        series("2023-03-06", "2024-03-04"),
        new Map(),
        new Date(2024, 2, 4, 9)
      );
      expect(heatmap.cells.find((cell) => cell.date === "2024-02-29")).toMatchObject({ row: 3 });
      expect(heatmap.cells[heatmap.cells.length - 1]).toMatchObject({ date: "2024-03-04" });
      // Friday 1 March 2024 sits in the week of Monday 26 February: column 51.
      expect(heatmap.months).toContainEqual({ month: 2, column: 51 });
    });

    it("covers a DST-transition day", () => {
      // Santiago springs forward at 24:00 on 5 September 2026, so 6 September is a
      // 23-hour local day. It still gets exactly one cell, and the grid still ends
      // on the day asked for.
      const heatmap = consistencyHeatmap(
        series("2025-09-08", "2026-09-08", { "2026-09-06": 40 }),
        new Map(),
        new Date(2026, 8, 8, 9)
      );
      const dstDay = heatmap.cells.filter((cell) => cell.date === "2026-09-06");
      expect(dstDay).toHaveLength(1);
      expect(dstDay[0].minutes).toBe(40);
      expect(heatmap.cells[heatmap.cells.length - 1]).toMatchObject({ date: "2026-09-08" });
    });
  });
}

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

  it("puts a day sitting exactly on a cut in the lower bucket", () => {
    // Loads 10..50 over five days: with five sorted values the quantiles need no
    // interpolation and land exactly ON 20 / 30 / 40. Those three days pin the
    // `<=` in levelOf — with `<` each would step up a level.
    const heatmap = consistencyHeatmap(
      series("2026-07-21", "2026-07-25", {
        "2026-07-21": 10,
        "2026-07-22": 20,
        "2026-07-23": 30,
        "2026-07-24": 40,
        "2026-07-25": 50,
      }),
      new Map(),
      now
    );
    const levelOn = (date: string) => heatmap.cells.find((cell) => cell.date === date)?.level;
    expect(levelOn("2026-07-21")).toBe(1);
    expect(levelOn("2026-07-22")).toBe(1); // == q1
    expect(levelOn("2026-07-23")).toBe(2); // == q2
    expect(levelOn("2026-07-24")).toBe(3); // == q3
    expect(levelOn("2026-07-25")).toBe(4);
  });

  it("ignores rest days when cutting the quartiles, and reads a lone one as a top day", () => {
    // One session in a year of rest: all three cuts collapse onto its load, so it
    // is painted as a top day rather than at the faintest step, where the year's
    // only trained day would be barely distinguishable from the 369 rest days.
    const heatmap = consistencyHeatmap(
      series("2025-07-21", "2026-07-25", { "2026-07-22": 40 }),
      new Map(),
      now
    );
    expect(heatmap.cells.find((cell) => cell.date === "2026-07-22")?.level).toBe(4);
    expect(heatmap.cells.every((cell) => cell.minutes > 0 || cell.level === 0)).toBe(true);
  });

  it("reads an all-equal year as all top days, not all faintest", () => {
    // Identical loads leave no gradient to draw: q1 == q2 == q3, and painting
    // every day at 0.3 opacity would understate a year of steady training.
    const heatmap = consistencyHeatmap(
      series("2025-07-21", "2026-07-25", {
        "2026-07-20": 30,
        "2026-07-22": 30,
        "2026-07-25": 30,
      }),
      new Map(),
      now
    );
    const active = heatmap.cells.filter((cell) => cell.minutes > 0);
    expect(active).toHaveLength(3);
    expect(active.every((cell) => cell.level === 4)).toBe(true);
  });

  it("leaves every cell empty in a year without a single load", () => {
    // loadQuartiles has no active day to cut, so it returns null and no cell can
    // claim a level.
    const heatmap = consistencyHeatmap(series("2025-07-21", "2026-07-25"), new Map(), now);
    expect(heatmap.cells).toHaveLength(370);
    expect(heatmap.cells.every((cell) => cell.level === 0)).toBe(true);
    expect(heatmap.streak).toBe(0);
    expect(heatmap.activeDaysPerWeek).toBe(0);
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
      minutes: 0,
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

  it("pins the window at 28 days: the oldest day inside counts, the one before it does not", () => {
    // Today is Saturday 25 July 2026, so the window is [28 Jun, 25 Jul]: 28 June
    // is its oldest day and 27 June the first day outside. A 29-day window (the
    // off-by-one this bound invites) would count both and report 0.5, silently
    // inflating the headline consistency figure.
    const daily = series("2026-06-20", "2026-07-25", {
      "2026-06-27": 60,
      "2026-06-28": 60,
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
// `` bucketed and a count that `sessionCountsByDay` bucketed, so
// the two MUST key days identically.  reads the stored UTC instant
// in the process timezone, so these fixtures are literal ISO instants and the
// block is re-run pinned to three zones: switching the counts to the athlete's
// local stamp (localStartedAt), to UTC getters, or to a SQL substr of started_at
// fails at least one of them.
for (const tz of ["UTC", "America/Sao_Paulo", "Asia/Tokyo"]) {
  describe(`session counts share ' day key under TZ=${tz}`, () => {
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

    it("keys a late-night session on the same day its minutes land on", () => {
      const counts = sessionCountsByDay([session(lateNight)]);
      expect(counts.get(expected[tz])).toBe(1);
      expect([...counts.keys()]).toEqual([expected[tz]]);
    });

    it("paints minutes and count in the very same cell", () => {
      const rows = [
        { started_at: lateNight, minutes: 42 },
        { started_at: "2026-07-24T13:00:00Z", minutes: 30 },
      ];
      const heatmap = consistencyHeatmap(
        rows.map((r) => ({
          date: localDateInputValue(new Date(r.started_at)),
          minutes: r.minutes,
        })),
        sessionCountsByDay(rows.map((row) => session(row.started_at))),
        new Date(2026, 6, 26, 9)
      );
      for (const cell of heatmap.cells) {
        // No cell may carry one without the other: a load with no session (or a
        // session with no load) is exactly the one-day drift a mismatched key
        // would produce for this fixture.
        expect(cell.minutes > 0).toBe(cell.sessions > 0);
      }
      expect(heatmap.cells.filter((cell) => cell.sessions > 0)).toHaveLength(2);
    });
  });
}
