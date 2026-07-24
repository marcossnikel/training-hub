import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  fmtDate,
  fmtDateLong,
  fmtDateWithYear,
  fmtDayMonth,
  fmtDuration,
  fmtHoursMin,
  fmtPace,
  fmtPaceShort,
  fmtStepRate,
  fmtTime,
  localStartedAt,
  parsePace,
  round2,
} from "@/lib/format";

describe("pace formatting", () => {
  it("formats seconds-per-km into m:ss", () => {
    expect(fmtPaceShort(269)).toBe("4:29");
    expect(fmtPace(269)).toBe("4:29 /km");
  });

  it("pads the seconds component", () => {
    expect(fmtPaceShort(305)).toBe("5:05");
  });

  it("returns placeholders for non-positive paces", () => {
    expect(fmtPaceShort(0)).toBe("");
    expect(fmtPace(0)).toBe("–");
  });

  it("round-trips through parsePace", () => {
    expect(parsePace("4:29")).toBe(269);
    expect(parsePace("not a pace")).toBeNull();
  });
});

describe("duration formatting", () => {
  it("formats durations over an hour as h:mm:ss", () => {
    expect(fmtDuration(5915)).toBe("1:38:35");
  });

  it("formats sub-hour durations as m:ss", () => {
    expect(fmtDuration(155)).toBe("2:35");
  });

  it("formats hours and minutes compactly", () => {
    expect(fmtHoursMin(5915)).toBe("1h 39m");
  });

  // Riegel predictions are fractional seconds. Rounding the total (not just the
  // seconds remainder) must roll the minute/hour over instead of printing 34:60.
  it("rolls fractional seconds over the minute boundary", () => {
    expect(fmtDuration(2099.6)).toBe("35:00"); // 34:59.6 -> 35:00, not 34:60
    expect(fmtDuration(3599.6)).toBe("1:00:00"); // rolls the hour over too
  });
});

describe("fmtStepRate", () => {
  // Strava reports run cadence as one-leg rpm, so spm is double.
  it("doubles one-leg rpm into steps per minute", () => {
    expect(fmtStepRate(85.6)).toBe("171 spm");
    expect(fmtStepRate(90)).toBe("180 spm");
  });

  it("returns a placeholder without cadence", () => {
    expect(fmtStepRate(null)).toBe("–");
    expect(fmtStepRate(0)).toBe("–");
  });
});

describe("round2", () => {
  it("rounds to two decimals", () => {
    expect(round2(1.2345)).toBe(1.23);
    expect(round2(10)).toBe(10);
  });
});

describe("date formatting", () => {
  // fmtDate/fmtTime format a STORED UTC instant (Strava start_date, Z-suffixed),
  // so they read it with UTC getters and render the same value in any timezone.
  it("formats a weekday, day and month from a UTC instant", () => {
    expect(fmtDate("2026-05-15T12:00:00Z", "en")).toBe("Fri 15 May");
    expect(fmtDate("2026-05-15T12:00:00Z", "pt")).toBe("Sex 15 Mai");
  });

  // fmtDayMonth takes a wall-clock Date the caller built locally (parseLocalDate),
  // so it deliberately stays on local getters.
  it("formats a day and month from a local wall-clock Date", () => {
    expect(fmtDayMonth(new Date(2026, 4, 15), "en")).toBe("15 May");
    expect(fmtDayMonth(new Date(2026, 4, 15), "pt")).toBe("15 Mai");
  });

  it("formats a wall-clock time from a UTC instant", () => {
    expect(fmtTime("2026-05-15T08:05:00Z")).toBe("08:05");
  });
});

// T3.4 regression: stored UTC instants must render consistently regardless of
// the process timezone. We force a non-UTC zone (Asia/Tokyo, UTC+9, no DST) so
// that the buggy local-getter code shifts an evening-UTC instant into the next
// calendar day/time and FAILS; the UTC-getter fix keeps it stable and PASSES.
describe("timezone consistency (T3.4)", () => {
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "Asia/Tokyo";
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  // 2026-03-15T23:30:00Z is Sunday 15 March, 23:30 UTC.
  // In Asia/Tokyo it is Monday 16 March, 08:30 local — the drift the bug causes.
  const eveningUtc = "2026-03-15T23:30:00Z";

  it("renders the UTC calendar day, not the local-shifted day (fmtDate)", () => {
    expect(fmtDate(eveningUtc, "en")).toBe("Sun 15 Mar");
    expect(fmtDate(eveningUtc, "pt")).toBe("Dom 15 Mar");
  });

  it("renders the UTC weekday/day/year (fmtDateLong)", () => {
    expect(fmtDateLong(eveningUtc, "en")).toBe("Sunday, 15 March 2026");
  });

  it("renders the UTC day/month/year (fmtDateWithYear)", () => {
    expect(fmtDateWithYear(eveningUtc, "en")).toBe("15 Mar 2026");
  });

  it("renders the UTC wall-clock time, not the local-shifted time (fmtTime)", () => {
    expect(fmtTime(eveningUtc)).toBe("23:30");
  });
});

// T3.4 regression: an unparseable ISO must render a controlled placeholder
// instead of "undefined NaN undefined" (fmtDate/fmtDateLong/fmtDateWithYear) or
// "NaN:NaN" (fmtTime).
describe("invalid ISO handling (T3.4)", () => {
  it("renders the en-dash placeholder for unparseable dates", () => {
    expect(fmtDate("not-a-date", "en")).toBe("–");
    expect(fmtDateLong("not-a-date", "en")).toBe("–");
    expect(fmtDateWithYear("not-a-date", "en")).toBe("–");
  });

  it("renders an empty time for an unparseable instant", () => {
    expect(fmtTime("not-a-date")).toBe("");
  });
});

// The start_date_local fix: an evening activity whose UTC instant crosses midnight
// shows the WRONG calendar day when the UTC start_date is formatted, but the RIGHT
// local day when Strava's naive-local start_date_local is formatted instead.
// localStartedAt selects the local stamp when present and falls back to the UTC
// instant when it is null (rows synced before the column existed).
describe("localStartedAt renders the athlete's true local day", () => {
  // Same 21:00 run on Sunday 15 March in a UTC-3 zone: the UTC instant lands on
  // Monday 16 March, the naive-local stamp stays on Sunday 15 March.
  const utcInstant = "2026-03-16T00:00:00Z"; // Strava start_date
  const localStamp = "2026-03-15T21:00:00Z"; // Strava start_date_local

  it("formats the UTC instant on the wrong (next) day", () => {
    expect(fmtDate(utcInstant, "en")).toBe("Mon 16 Mar");
  });

  it("formats the local stamp on the correct day", () => {
    expect(fmtDate(localStamp, "en")).toBe("Sun 15 Mar");
    expect(fmtTime(localStamp)).toBe("21:00");
  });

  it("prefers the local stamp when captured", () => {
    const iso = localStartedAt({ started_at: utcInstant, started_at_local: localStamp });
    expect(fmtDate(iso, "en")).toBe("Sun 15 Mar");
  });

  it("falls back to the UTC instant when the local stamp is null", () => {
    const iso = localStartedAt({ started_at: utcInstant, started_at_local: null });
    expect(fmtDate(iso, "en")).toBe("Mon 16 Mar");
  });
});
