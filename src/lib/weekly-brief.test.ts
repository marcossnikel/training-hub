import { describe, expect, it } from "vitest";
import { buildWeeklyBrief, type WeeklyBriefActivity } from "@/lib/weekly-brief";

const AS_OF = "2026-08-10"; // Monday; the evaluated week ends on Sunday 16 August.

function activity(
  id: string,
  day: string,
  minutes: number,
  fields: Partial<WeeklyBriefActivity> = {}
): WeeklyBriefActivity {
  return {
    id,
    startedAt: `${day}T12:00:00Z`,
    startedAtLocal: null,
    sportType: "Run",
    movingTimeS: minutes * 60,
    distanceKm: 10,
    confirmed: true,
    ...fields,
  };
}

function baseline(minutes = 100): WeeklyBriefActivity[] {
  return [
    activity("b1", "2026-07-14", minutes),
    activity("b2", "2026-07-21", minutes),
    activity("b3", "2026-07-28", minutes),
    activity("b4", "2026-08-04", minutes),
  ];
}

describe("buildWeeklyBrief", () => {
  it("reports a training-time increase with complete evidence and value-derived copy", () => {
    const result = buildWeeklyBrief({
      asOfWeekStart: AS_OF,
      activities: [...baseline(), activity("current", "2026-08-11", 120)],
    });
    expect(result.state).toBe("observations");
    const observation = result.observations.find((item) => item.kind === "training_time_change");
    expect(observation).toBeDefined();
    expect(observation).toMatchObject({
      kind: "training_time_change",
      currentWindow: { start: "2026-08-10", end: "2026-08-17" },
      baselineWindow: { start: "2026-07-13", end: "2026-08-10" },
      values: { currentMovingTimeS: 7200, baselineMedianMovingTimeS: 6000, changePercent: 20 },
      sources: {
        current: [{ id: "current", date: "2026-08-11" }],
        baseline: expect.arrayContaining([expect.objectContaining({ id: "b1" })]),
      },
    });
    expect(observation?.copy).toContain("+20%");
    expect(observation?.copy).toContain("2026-08-10–2026-08-16");
    expect(observation?.copy).not.toMatch(
      /should|recommend|readiness|health|confidence|better|worse/i
    );
  });

  it("reports decreases at the threshold, and excludes just-under-threshold time changes", () => {
    const decrease = buildWeeklyBrief({
      asOfWeekStart: AS_OF,
      activities: [...baseline(), activity("current", "2026-08-11", 80)],
    });
    expect(decrease.observations[0]).toMatchObject({
      kind: "training_time_change",
      values: { changePercent: -20 },
    });
    const stable = buildWeeklyBrief({
      asOfWeekStart: AS_OF,
      activities: [...baseline(), activity("current", "2026-08-11", 81)],
    });
    expect(stable.state).toBe("no_material_change");
  });

  it("reports frequency only when its count and percentage gates both qualify", () => {
    const result = buildWeeklyBrief({
      asOfWeekStart: AS_OF,
      activities: [
        activity("b1", "2026-07-14", 60),
        activity("b2", "2026-07-21", 60),
        activity("b3", "2026-07-28", 60),
        activity("b4", "2026-08-04", 60),
        activity("c1", "2026-08-11", 30),
        activity("c2", "2026-08-12", 30),
      ],
    });
    expect(result.observations).toContainEqual(
      expect.objectContaining({
        kind: "session_frequency_change",
        values: {
          currentSessions: 2,
          baselineMedianSessions: 1,
          changeCount: 1,
          changePercent: 100,
        },
      })
    );
    const countOnly = buildWeeklyBrief({
      asOfWeekStart: AS_OF,
      activities: [
        ...["2026-07-14", "2026-07-21", "2026-07-28", "2026-08-04"].flatMap((day, i) =>
          Array.from({ length: 5 }, (_, session) => activity(`b${i}-${session}`, day, 12))
        ),
        ...["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14", "2026-08-15"].map(
          (day, i) => activity(`c${i}`, day, 10)
        ),
      ],
    });
    expect(countOnly.observations.some((item) => item.kind === "session_frequency_change")).toBe(
      false
    );
  });

  it("reports sport mix at the 20 percentage-point boundary and ignores a smaller change", () => {
    const mixedBaseline = [
      ...["2026-07-14", "2026-07-21", "2026-07-28", "2026-08-04"].flatMap((day, i) => [
        activity(`run${i}`, day, 30),
        activity(`ride${i}`, day, 70, { sportType: "Ride" }),
      ]),
    ];
    const result = buildWeeklyBrief({
      asOfWeekStart: AS_OF,
      activities: [
        ...mixedBaseline,
        activity("current-run", "2026-08-11", 50),
        activity("current-ride", "2026-08-12", 50, { sportType: "Ride" }),
      ],
    });
    expect(result.observations).toContainEqual(
      expect.objectContaining({
        kind: "sport_mix_change",
        values: expect.objectContaining({
          currentShare: 0.5,
          changePercentagePoints: expect.any(Number),
        }),
      })
    );
    const below = buildWeeklyBrief({
      asOfWeekStart: AS_OF,
      activities: [
        ...mixedBaseline,
        activity("current-run", "2026-08-11", 49),
        activity("current-ride", "2026-08-12", 51, { sportType: "Ride" }),
      ],
    });
    expect(below.state).toBe("no_material_change");
  });

  it("reports longest-session concentration at all boundaries without judging its distribution", () => {
    const result = buildWeeklyBrief({
      asOfWeekStart: AS_OF,
      activities: [
        ...baseline(),
        activity("longest", "2026-08-11", 48),
        activity("other-a", "2026-08-12", 36),
        activity("other-b", "2026-08-13", 36),
      ],
    });
    const longest = result.observations.find(
      (item) => item.kind === "longest_session_concentration"
    );
    expect(longest).toMatchObject({
      kind: "longest_session_concentration",
      values: {
        weeklyMovingTimeS: 7200,
        longestSessionMovingTimeS: 2880,
        longestSessionShare: 0.4,
      },
    });
    expect(longest?.copy).not.toMatch(/good|bad|balanced|should/i);
    const short = buildWeeklyBrief({
      asOfWeekStart: AS_OF,
      activities: [
        ...baseline(),
        activity("longest", "2026-08-11", 44),
        activity("other-a", "2026-08-12", 38),
        activity("other-b", "2026-08-13", 38),
      ],
    });
    expect(short.observations.some((item) => item.kind === "longest_session_concentration")).toBe(
      false
    );
  });

  it("requires 3 of 4 nonempty baseline weeks and marks the three-week limitation", () => {
    const insufficient = buildWeeklyBrief({
      asOfWeekStart: AS_OF,
      activities: [...baseline().slice(0, 2), activity("current", "2026-08-11", 150)],
    });
    expect(insufficient).toMatchObject({
      state: "insufficient_history",
      baselineWeeksWithActivity: 2,
      observations: [],
    });
    const limited = buildWeeklyBrief({
      asOfWeekStart: AS_OF,
      activities: [...baseline().slice(0, 3), activity("current", "2026-08-11", 150)],
    });
    expect(limited.observations[0]?.limitation).toBe(
      "Baseline has activity in 3 of the previous 4 completed weeks."
    );
  });

  it("excludes the following partial week, malformed records, unconfirmed activities, and invalid moving time", () => {
    const result = buildWeeklyBrief({
      asOfWeekStart: AS_OF,
      activities: [
        ...baseline(),
        activity("current", "2026-08-11", 100),
        activity("future", "2026-08-17", 1000),
        activity("unconfirmed", "2026-08-11", 1000, { confirmed: false }),
        activity("zero", "2026-08-11", 0),
        activity("bad-date", "not-a-day", 1000),
      ],
    });
    expect(result.state).toBe("no_material_change");
  });

  it("uses the local timestamp for Monday–Sunday bucketing", () => {
    const result = buildWeeklyBrief({
      asOfWeekStart: AS_OF,
      activities: [
        ...baseline(),
        activity("local-sunday", "2026-08-17", 120, { startedAtLocal: "2026-08-16T21:00:00Z" }),
      ],
    });
    expect(
      result.observations.every((item) => item.sources.current[0]?.date === "2026-08-16")
    ).toBe(true);
  });

  it("orders equal-strength candidates by fixed kind order, then earliest source, while deduplicating contexts", () => {
    const result = buildWeeklyBrief({
      asOfWeekStart: AS_OF,
      activities: [
        ...["2026-07-14", "2026-07-21", "2026-07-28", "2026-08-04"].flatMap((day, i) => [
          activity(`a${i}`, day, 25),
          activity(`b${i}`, day, 25),
          activity(`c${i}`, day, 25),
          activity(`d${i}`, day, 25),
        ]),
        activity("earlier", "2026-08-11", 40),
        activity("middle", "2026-08-12", 40),
        activity("later", "2026-08-13", 40),
      ],
    });
    // Time (+20%) and frequency (-25%) have equal normalized strength; the
    // documented fixed kind order selects time before the overlapping frequency claim.
    expect(result.observations.map((observation) => observation.kind)).toEqual([
      "training_time_change",
    ]);
    expect(result.observations[0].sources.current[0].id).toBe("earlier");
  });

  it("rejects a non-Monday completed-week key", () => {
    expect(() => buildWeeklyBrief({ asOfWeekStart: "2026-08-11", activities: [] })).toThrow(
      "Monday"
    );
  });
});
