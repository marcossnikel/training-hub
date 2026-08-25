// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ComparableActivityError from "./error";

describe("ComparableActivityError", () => {
  it("announces the safe error and retries without exposing the raw error", () => {
    const retry = vi.fn();
    render(
      <ComparableActivityError
        error={new Error("database connection detail")}
        unstable_retry={retry}
      />
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "We couldn’t load this comparison." })
    ).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("We couldn’t load this comparison.");
    expect(screen.queryByText("database connection detail")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
