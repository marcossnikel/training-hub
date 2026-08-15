// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ beginByoConnectionAction: vi.fn() }));

vi.mock("@/lib/byo-connection-actions", () => ({
  beginByoConnectionAction: mocks.beginByoConnectionAction,
}));

import { ByoConnectionForm } from "./byo-connection-form";

afterEach(cleanup);

beforeEach(() => {
  mocks.beginByoConnectionAction.mockReset();
});

describe("ByoConnectionForm", () => {
  it("exposes both credentials as semantically required despite custom validation", () => {
    render(<ByoConnectionForm callbackUrl="http://localhost:3100/api/strava/callback" />);

    for (const name of ["Strava Client ID", "Strava Client Secret"]) {
      const input = screen.getByLabelText(name);
      expect(input.getAttribute("required")).not.toBeNull();
      expect(input.getAttribute("aria-required")).toBe("true");
    }
  });

  it("provides a session-ended recovery without retaining the submitted secret", async () => {
    mocks.beginByoConnectionAction.mockResolvedValue({ status: "unauthorized" });
    render(<ByoConnectionForm callbackUrl="http://localhost:3100/api/strava/callback" />);

    fireEvent.change(screen.getByRole("textbox", { name: "Strava Client ID" }), {
      target: { value: "athlete-client" },
    });
    const secret = screen.getByLabelText("Strava Client Secret");
    fireEvent.change(secret, { target: { value: "secret-that-must-not-render" } });
    fireEvent.submit(secret.closest("form")!);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Your session ended");
    const signIn = screen.getByRole("link", { name: "Sign in again" });
    expect(signIn.getAttribute("href")).toBe("/login?next=%2Fsettings");
    await waitFor(() => expect(alert.textContent).not.toContain("secret-that-must-not-render"));
  });
});
