// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import WeeklyBriefError from "./error";

describe("WeeklyBriefError", () => {
  it("announces the safe route error and retries through the boundary reset", () => {
    const reset = vi.fn();
    render(<WeeklyBriefError error={new Error("database detail")} reset={reset} />);
    expect(
      screen.getByRole("heading", { level: 1, name: "We couldn’t load this weekly brief." })
    ).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("We couldn’t load this weekly brief.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
    expect(screen.queryByText("database detail")).toBeNull();
  });
});
