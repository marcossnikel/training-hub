import { afterEach, describe, expect, it } from "vitest";
import {
  buildByoAuthorizeUrl,
  callbackUrlForOrigin,
  deriveCurrentRequestOrigin,
  STRAVA_BYO_SCOPE,
  validateByoCredentials,
} from "./strava-byo";

const ENV_ID = process.env.STRAVA_CLIENT_ID;
const ENV_SECRET = process.env.STRAVA_CLIENT_SECRET;

afterEach(() => {
  if (ENV_ID === undefined) delete process.env.STRAVA_CLIENT_ID;
  else process.env.STRAVA_CLIENT_ID = ENV_ID;
  if (ENV_SECRET === undefined) delete process.env.STRAVA_CLIENT_SECRET;
  else process.env.STRAVA_CLIENT_SECRET = ENV_SECRET;
});

describe("BYO Strava authorization contract", () => {
  it("trims a displayable client ID while rejecting blank, control, and oversized credentials", () => {
    expect(
      validateByoCredentials({ clientId: "  athlete-app  ", clientSecret: "secret-value" })
    ).toEqual({
      clientId: "athlete-app",
      clientSecret: "secret-value",
      errors: {},
    });
    for (const input of [
      { clientId: " ", clientSecret: "secret" },
      { clientId: "client\nvalue", clientSecret: "secret" },
      { clientId: "client", clientSecret: "  " },
      { clientId: "client", clientSecret: "secret\u0000value" },
      { clientId: "x".repeat(129), clientSecret: "secret" },
      { clientId: "client", clientSecret: "x".repeat(513) },
    ]) {
      const result = validateByoCredentials(input);
      expect(Object.keys(result.errors).length).toBeGreaterThan(0);
      expect(JSON.stringify(result.errors)).not.toContain(input.clientSecret);
    }
  });

  it("uses only the supplied owner credential, exact scope, server-derived callback, and opaque state", () => {
    process.env.STRAVA_CLIENT_ID = "legacy-founder-client";
    process.env.STRAVA_CLIENT_SECRET = "legacy-founder-secret";
    const url = new URL(
      buildByoAuthorizeUrl({
        clientId: "athlete-owned-client",
        origin: "https://preview.training-hub.example",
        state: "opaque-random-state",
      })
    );
    expect(url.origin).toBe("https://www.strava.com");
    expect(url.pathname).toBe("/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("athlete-owned-client");
    expect(url.searchParams.get("scope")).toBe(STRAVA_BYO_SCOPE);
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://preview.training-hub.example/api/strava/callback"
    );
    expect(url.searchParams.get("state")).toBe("opaque-random-state");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.toString()).not.toContain("legacy-founder-client");
    expect(url.toString()).not.toContain("legacy-founder-secret");
    for (const forbidden of [
      "client_secret",
      "access_token",
      "refresh_token",
      "owner",
      "redirect",
    ]) {
      expect(url.searchParams.has(forbidden)).toBe(false);
    }
  });

  it("accepts only a single server-observed http(s) host and never a request redirect field", () => {
    expect(
      deriveCurrentRequestOrigin(
        new Headers({ host: "localhost:3100", "x-forwarded-proto": "http" })
      )
    ).toBe("http://localhost:3100");
    expect(
      deriveCurrentRequestOrigin(
        new Headers({
          host: "ignored.example",
          "x-forwarded-host": "preview.training-hub.example",
          "x-forwarded-proto": "https",
          origin: "https://attacker.example",
        })
      )
    ).toBe("https://preview.training-hub.example");
    for (const headers of [
      new Headers({ host: "preview.example/path", "x-forwarded-proto": "https" }),
      new Headers({ host: "preview.example", "x-forwarded-proto": "javascript" }),
      new Headers({ host: "preview.example, attacker.example", "x-forwarded-proto": "https" }),
    ]) {
      expect(deriveCurrentRequestOrigin(headers)).toBeNull();
    }
    expect(callbackUrlForOrigin("https://preview.training-hub.example")).toBe(
      "https://preview.training-hub.example/api/strava/callback"
    );
  });
});
