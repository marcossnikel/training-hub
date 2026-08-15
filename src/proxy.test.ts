import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));

import { proxy } from "./proxy";

beforeEach(() => {
  mocks.getSession.mockReset();
  mocks.getSession.mockResolvedValue(null);
});

describe("auth proxy", () => {
  it("lets an unauthenticated Server Action reach its server-side authorization boundary", async () => {
    const response = await proxy(
      new NextRequest("http://localhost:3100/settings", {
        method: "POST",
        headers: { "next-action": "server-action-id" },
      })
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("continues to redirect an unauthenticated page request to sign-in", async () => {
    const response = await proxy(new NextRequest("http://localhost:3100/settings?tab=strava"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3100/login?next=%2Fsettings%3Ftab%3Dstrava"
    );
  });
});
