// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ExecutionCard } from "@/components/execution-card";
import type { RaceAnalysis } from "@/lib/blocks";
import { dictionaries } from "@/lib/i18n";

afterEach(cleanup);

// A half marathon that faded: second half 9 s/km slower, 2.5% off in the final
// quarter, with a goal pace set (shaped like activity 128 in the live database).
const analysis: RaceAnalysis = {
  goalPaceSPerKm: 279,
  actualPaceSPerKm: 284,
  movingS: 6023,
  distanceKm: 21.2,
  avgHr: 176,
  firstHalfPaceSPerKm: 280,
  secondHalfPaceSPerKm: 289,
  splitDeltaS: 9,
  fadePct: 2.5,
  inRaceZoneSec: null,
  atGoalSec: 600,
  aboveGoalSec: 3000,
  belowGoalSec: 2400,
  longestAtGoalSec: 44,
};

function renderCard(overrides: Partial<RaceAnalysis> = {}) {
  return render(<ExecutionCard analysis={{ ...analysis, ...overrides }} t={dictionaries.en} />);
}

describe("ExecutionCard", () => {
  it("renders split, fade and the goal-pace breakdown", () => {
    renderCard();
    expect(screen.getByText("+9 s/km")).toBeTruthy();
    expect(screen.getByText("Positive split")).toBeTruthy();
    expect(screen.getByText("+2.5%")).toBeTruthy();
    expect(screen.getByText("At goal")).toBeTruthy();
    // Goal pace and the longest at-goal stretch, formatted.
    expect(screen.getByText("4:39 /km")).toBeTruthy();
    expect(screen.getByText("0:44")).toBeTruthy();
  });

  it("labels and colours a negative split", () => {
    renderCard({ splitDeltaS: -6 });
    expect(screen.getByText("Negative split")).toBeTruthy();
    expect(screen.getByText("-6 s/km").getAttribute("style")).toContain("--positive");
  });

  it("drops the goal breakdown when no goal pace is set", () => {
    renderCard({
      goalPaceSPerKm: null,
      atGoalSec: null,
      aboveGoalSec: null,
      belowGoalSec: null,
      longestAtGoalSec: null,
    });
    expect(screen.getByText("+9 s/km")).toBeTruthy();
    expect(screen.queryByText("At goal")).toBeNull();
    expect(screen.queryByText(/Longest at goal/i)).toBeNull();
  });

  it("renders nothing when the stream gave no execution numbers", () => {
    const { container } = renderCard({
      splitDeltaS: null,
      fadePct: null,
      goalPaceSPerKm: null,
      atGoalSec: null,
      aboveGoalSec: null,
      belowGoalSec: null,
      longestAtGoalSec: null,
    });
    expect(container.innerHTML).toBe("");
  });
});
