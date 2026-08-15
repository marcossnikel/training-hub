import { afterEach, describe, expect, it } from "vitest";
import {
  buildByoAuthorizeUrl,
  callbackUrlForOrigin,
  parseConfiguredPublicOrigin,
  resolveAuthorizationByoOrigin,
  resolveSettingsByoOrigin,
  normalizeExactByoGrantedScope,
  STRAVA_BYO_SCOPE,
  validateByoCredentials,
} from "./strava-byo";

const ENV_ID = process.env.STRAVA_CLIENT_ID;
const ENV_SECRET = process.env.STRAVA_CLIENT_SECRET;
const ENV_PUBLIC_ORIGIN = process.env.TRAINING_HUB_PUBLIC_ORIGIN;

afterEach(() => {
  if (ENV_ID === undefined) delete process.env.STRAVA_CLIENT_ID;
  else process.env.STRAVA_CLIENT_ID = ENV_ID;
  if (ENV_SECRET === undefined) delete process.env.STRAVA_CLIENT_SECRET;
  else process.env.STRAVA_CLIENT_SECRET = ENV_SECRET;
  if (ENV_PUBLIC_ORIGIN === undefined) delete process.env.TRAINING_HUB_PUBLIC_ORIGIN;
  else process.env.TRAINING_HUB_PUBLIC_ORIGIN = ENV_PUBLIC_ORIGIN;
});

describe("granted BYO scopes", () => {
  it("normalizes only the exact order-insensitive approved scope set", () => {
    for (const scope of [
      "activity:read_all,profile:read_all",
      "profile:read_all activity:read_all",
      "activity:read_all, profile:read_all activity:read_all",
    ]) {
      expect(normalizeExactByoGrantedScope(scope)).toBe(STRAVA_BYO_SCOPE);
    }
    for (const scope of [
      "activity:read_all",
      "activity:read_all,profile:read_all,read_all",
      "profile:read_all,activity:read",
      "ACTIVITY:READ_ALL,PROFILE:READ_ALL",
      "",
      "activity:read_all\u0000,profile:read_all",
    ]) {
      expect(normalizeExactByoGrantedScope(scope)).toBeNull();
    }
  });
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

  it("accepts only a strict configured HTTPS deployed origin", () => {
    expect(parseConfiguredPublicOrigin("https://preview.training-hub.example")).toBe(
      "https://preview.training-hub.example"
    );
    expect(parseConfiguredPublicOrigin("https://preview.training-hub.example:8443")).toBe(
      "https://preview.training-hub.example:8443"
    );
    for (const value of [
      "http://preview.training-hub.example",
      "https://preview.training-hub.example/path",
      "https://preview.training-hub.example?redirect=attacker",
      "https://user:pass@preview.training-hub.example",
      "https://localhost:3100",
      "https://127.0.0.1",
      "https://preview.training-hub.localhost",
      " https://preview.training-hub.example",
    ]) {
      expect(parseConfiguredPublicOrigin(value)).toBeNull();
    }
  });

  it("ignores forwarding headers and allows unconfigured origins only for direct loopback development", () => {
    expect(
      resolveSettingsByoOrigin(
        new Headers({
          host: "localhost:3100",
          "x-forwarded-host": "attacker.example",
          "x-forwarded-proto": "https",
        }),
        null
      )
    ).toBe("http://localhost:3100");
    expect(
      resolveSettingsByoOrigin(
        new Headers({
          host: "preview.training-hub.example",
          "x-forwarded-host": "preview.training-hub.example",
          "x-forwarded-proto": "https",
        }),
        null
      )
    ).toBeNull();
    expect(
      resolveAuthorizationByoOrigin(new URL("https://preview.training-hub.example"), null)
    ).toBeNull();
    expect(resolveAuthorizationByoOrigin(new URL("http://127.0.0.1:3100"), null)).toBe(
      "http://127.0.0.1:3100"
    );
    expect(
      resolveAuthorizationByoOrigin(
        new URL("https://ignored.example"),
        "https://preview.training-hub.example"
      )
    ).toBe("https://preview.training-hub.example");
    expect(callbackUrlForOrigin("https://preview.training-hub.example")).toBe(
      "https://preview.training-hub.example/api/strava/callback"
    );
  });
});
