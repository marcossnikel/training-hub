// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const actions = vi.hoisted(() => ({
  saveInsightUsefulnessAction: vi.fn(),
  saveInsightFeedbackNoteAction: vi.fn(),
  removeInsightFeedbackAction: vi.fn(),
}));

vi.mock("@/lib/actions", () => actions);

import { InsightFeedback } from "./insight-feedback";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const target = { kind: "weekly_brief" } as const;

describe("InsightFeedback", () => {
  it("saves a selected usefulness choice and exposes its semantic selected state", async () => {
    actions.saveInsightUsefulnessAction.mockResolvedValue({
      ok: true,
      usefulness: "useful",
      note: null,
    });
    render(<InsightFeedback target={target} initial={null} />);
    const useful = screen.getByRole("button", { name: "Useful" });
    expect(useful.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(useful);
    await waitFor(() =>
      expect(actions.saveInsightUsefulnessAction).toHaveBeenCalledWith({
        target,
        usefulness: "useful",
      })
    );
    expect(useful.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Feedback saved.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add a note" })).toBeTruthy();
  });

  it("cancels a note editor with Escape and returns focus to its trigger", async () => {
    render(<InsightFeedback target={target} initial={{ usefulness: "not_useful", note: null }} />);
    const trigger = screen.getByRole("button", { name: "Add a note" });
    fireEvent.click(trigger);
    const note = screen.getByLabelText("Optional note");
    expect(note).toBeTruthy();
    fireEvent.keyDown(note, { key: "Escape" });
    await waitFor(() => expect(screen.queryByLabelText("Optional note")).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add a note" }));
  });

  it("returns focus to Useful after a successful response removal commits", async () => {
    actions.removeInsightFeedbackAction.mockResolvedValue({
      ok: true,
      usefulness: null,
      note: null,
    });
    render(<InsightFeedback target={target} initial={{ usefulness: "not_useful", note: null }} />);
    const remove = screen.getByRole("button", { name: "Remove response" });
    remove.focus();
    fireEvent.click(remove);

    await waitFor(() =>
      expect(actions.removeInsightFeedbackAction).toHaveBeenCalledWith({ target })
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Useful" }))
    );
    expect(screen.getByText("Feedback removed.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove response" })).toBeNull();
  });

  it("keeps a generic retry error private when a save fails", async () => {
    actions.saveInsightUsefulnessAction.mockResolvedValue({
      ok: false,
      error: "We couldn’t save your feedback. Try again.",
    });
    render(<InsightFeedback target={target} initial={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Not useful" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Try again."));
    expect(screen.getByRole("button", { name: "Not useful" }).getAttribute("aria-pressed")).toBe(
      "false"
    );
  });
});
