// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  reconnectStravaAction: vi.fn(),
  disconnectStravaAction: vi.fn(),
}));

vi.mock("@/lib/strava-lifecycle-actions", () => ({
  reconnectStravaAction: mocks.reconnectStravaAction,
  disconnectStravaAction: mocks.disconnectStravaAction,
}));

import { StravaConnectionControls } from "./strava-connection-controls";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  window.matchMedia ??= (() => ({
    matches: false,
    media: "",
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("StravaConnectionControls", () => {
  it("keeps cancel as the initial destructive-dialog choice and returns focus after Escape", async () => {
    render(<StravaConnectionControls />);
    const trigger = screen.getByRole("button", { name: "Disconnect and delete" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }))
    );
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("closes the dialog and gives generic recovery when deletion cannot be confirmed", async () => {
    mocks.disconnectStravaAction.mockResolvedValue({ status: "unavailable" });
    render(<StravaConnectionControls />);
    fireEvent.click(screen.getByRole("button", { name: "Disconnect and delete" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Disconnect and delete" }).at(-1)!);

    await waitFor(() => expect(mocks.disconnectStravaAction).toHaveBeenCalledTimes(1));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We couldn’t disconnect Strava");
    expect(alert.textContent).toContain("We couldn’t finish that Strava step. Try again.");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("prevents duplicate reconnect and exposes only the fixed continuation path", async () => {
    let resolve!: (result: { status: "unavailable" }) => void;
    mocks.reconnectStravaAction.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      })
    );
    render(<StravaConnectionControls />);
    const reconnect = screen.getByRole("button", { name: "Reconnect" });
    fireEvent.click(reconnect);
    fireEvent.click(reconnect);
    await waitFor(() => expect(mocks.reconnectStravaAction).toHaveBeenCalledTimes(1));
    expect(
      (screen.getByRole("button", { name: "Preparing reconnect…" }) as HTMLButtonElement).disabled
    ).toBe(true);
    resolve({ status: "unavailable" });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We couldn’t reconnect Strava");
  });
});
