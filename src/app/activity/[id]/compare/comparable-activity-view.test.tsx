// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dictionaries } from "@/lib/i18n";
import {
  matchComparablePriorActivity,
  type ComparableActivitySummary,
} from "@/lib/comparable-activity";
import { ComparableActivityView } from "./comparable-activity-view";

afterEach(cleanup);

const source: ComparableActivitySummary = {
  id: 42,
  sportType: "Run",
  startedAt: "2026-08-10T08:00:00Z",
  distanceKm: 10,
  movingTimeS: 3_000,
};
const prior: ComparableActivitySummary = {
  id: 7,
  sportType: "TrailRun",
  startedAt: "2026-08-03T08:00:00Z",
  distanceKm: 10.5,
  movingTimeS: 2_850,
};

function renderResult(candidates: ComparableActivitySummary[]) {
  const result = matchComparablePriorActivity({
    source,
    candidates,
    asOf: "2026-08-15T12:00:00Z",
  });
  return render(
    <ComparableActivityView
      source={source}
      result={result}
      lang="en"
      t={dictionaries.en.comparableActivity}
    />
  );
}

describe("ComparableActivityView", () => {
  it("renders the one reliable evidence-linked result with factual signed deltas and no prohibited claim", () => {
    renderResult([prior]);
    expect(
      screen.getByRole("heading", { level: 1, name: "Comparable prior activity" })
    ).toBeTruthy();
    expect(
      screen.getByText("A prior running activity met the distance and moving-time criteria.")
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Open current activity #42" }).getAttribute("href")
    ).toBe("/activity/42");
    expect(screen.getByRole("link", { name: "Open prior activity #7" }).getAttribute("href")).toBe(
      "/activity/7"
    );
    expect(screen.getByText("+5.0%")).toBeTruthy();
    expect(screen.getByText("prior activity is longer")).toBeTruthy();
    expect(screen.getByText("prior activity is shorter")).toBeTruthy();
    expect(
      screen.getByText(
        "This match uses confirmed activity summaries: sport family, distance, and moving time. It does not use heart-rate or stream data."
      )
    ).toBeTruthy();
    expect(
      screen.getByText("Same sport family · Distance within 10% · Moving time within 20%")
    ).toBeTruthy();
    expect(
      screen.queryByText(/workout|equivalent|improved|fitness|readiness|coach|AI/i)
    ).toBeNull();
  });

  it("renders the exact no-match state with source provenance and no limited alternative", () => {
    renderResult([
      { ...prior, distanceKm: 12 },
      { ...prior, id: 8, movingTimeS: 3_700 },
    ]);
    expect(screen.getByRole("heading", { level: 1, name: "No reliable prior match" })).toBeTruthy();
    expect(
      screen.getByText("There isn’t a prior activity that meets the current comparison criteria.")
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Matches require the same sport family, distance within 10%, and moving time within 20%."
      )
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open current activity #42" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Open prior activity #7" })).toBeNull();
    expect(screen.queryByText(/limited|low confidence|best available/i)).toBeNull();
  });

  it("uses semantic source links and a keyboard-focusable native method disclosure", () => {
    renderResult([prior]);
    const sourceLink = screen.getByRole("link", { name: "Open current activity #42" });
    const priorLink = screen.getByRole("link", { name: "Open prior activity #7" });
    const summary = screen.getByText("How matching works");
    expect(summary.tagName).toBe("SUMMARY");
    sourceLink.focus();
    expect(document.activeElement).toBe(sourceLink);
    priorLink.focus();
    expect(document.activeElement).toBe(priorLink);
    summary.focus();
    expect(document.activeElement).toBe(summary);
    fireEvent.keyDown(summary, { key: "Enter" });
    expect(summary.closest("details")).toBeTruthy();
  });
});
