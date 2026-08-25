// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: { email: mocks.signIn },
    signUp: { email: mocks.signUp },
  },
}));

import { AuthForm } from "./auth-form";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };
}

// Node 26 exposes an unavailable experimental storage getter that shadows
// jsdom's implementation. Install isolated in-memory stores for this worker.
Object.defineProperty(globalThis, "localStorage", {
  value: memoryStorage(),
  configurable: true,
});
Object.defineProperty(globalThis, "sessionStorage", {
  value: memoryStorage(),
  configurable: true,
});

afterEach(cleanup);

beforeEach(() => {
  mocks.signIn.mockReset();
  mocks.signUp.mockReset();
  window.history.replaceState(null, "", "/login");
  localStorage.clear();
  sessionStorage.clear();
});

describe("AuthForm", () => {
  it("keeps existing sign-in available without exposing a public registration path", () => {
    render(<AuthForm mode="sign-in" />);

    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.getByText(/you’ll need an invitation/i)).toBeTruthy();
    expect(document.querySelector('a[href="/sign-up"]')).toBeNull();
  });

  it("prevents duplicate submissions and focuses a generic retryable error without clearing input", async () => {
    let resolve!: (value: { error: { message: string } }) => void;
    mocks.signIn.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      })
    );
    render(<AuthForm mode="sign-in" />);

    const email = screen.getByLabelText("Email");
    const password = screen.getByLabelText("Password");
    fireEvent.change(email, { target: { value: "athlete@example.test" } });
    fireEvent.change(password, { target: { value: "private-password" } });
    const form = screen.getByRole("button", { name: "Sign in" }).closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(() => expect(mocks.signIn).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Signing in…" }).hasAttribute("disabled")).toBe(true);

    resolve({ error: { message: "provider detail that must not render" } });
    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(alert.textContent).toBe("We couldn't sign you in with those details.");
    expect((email as HTMLInputElement).value).toBe("athlete@example.test");
    expect((password as HTMLInputElement).value).toBe("private-password");
    expect(document.body.textContent).not.toContain("provider detail that must not render");
  });

  it("removes an opaque invitation from the address bar and never renders or persists it", async () => {
    const token = "a".repeat(43);
    window.history.replaceState(null, "", `/sign-up?invite=${token}`);

    render(<AuthForm mode="sign-up" inviteToken={token} />);

    await waitFor(() => expect(window.location.pathname + window.location.search).toBe("/sign-up"));
    expect(screen.getByText("Private invitation ready")).toBeTruthy();
    expect(document.body.textContent).not.toContain(token);
    expect(JSON.stringify(Object.entries(localStorage))).not.toContain(token);
    expect(JSON.stringify(Object.entries(sessionStorage))).not.toContain(token);
  });
});
