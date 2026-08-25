import { afterEach, describe, expect, it } from "vitest";
import { decryptStravaSecret, encryptStravaSecret, StravaSecretStorageError } from "@/lib/crypto";

const ENV = "STRAVA_CONNECTION_ENCRYPTION_KEY";
const originalKey = process.env[ENV];
const testKey = Buffer.alloc(32, 41).toString("base64url");

afterEach(() => {
  if (originalKey === undefined) delete process.env[ENV];
  else process.env[ENV] = originalKey;
});

describe("owner-bound Strava connection encryption", () => {
  it("uses distinct IVs and never returns plaintext in the envelope", () => {
    process.env[ENV] = testKey;
    const first = encryptStravaSecret("owner-a", "access_token", "test-access-token");
    const second = encryptStravaSecret("owner-a", "access_token", "test-access-token");
    expect(first).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(second).not.toBe(first);
    expect(first).not.toContain("test-access-token");
    expect(decryptStravaSecret("owner-a", "access_token", first)).toBe("test-access-token");
  });

  it("accepts canonical segments and rejects an otherwise valid envelope with extra data", () => {
    process.env[ENV] = testKey;
    const envelope = encryptStravaSecret("owner-a", "access_token", "private-value");
    const [version, iv, ciphertext, tag] = envelope.split(".");
    expect(decryptStravaSecret("owner-a", "access_token", envelope)).toBe("private-value");
    expect(() =>
      decryptStravaSecret("owner-a", "access_token", `${version}.${iv}#.${ciphertext}.${tag}`)
    ).toThrow(StravaSecretStorageError);
  });

  it("rejects owner and field swaps, malformed envelopes, and wrong keys without disclosure", () => {
    process.env[ENV] = testKey;
    const envelope = encryptStravaSecret("owner-a", "access_token", "private-value");
    const cases = [
      () => decryptStravaSecret("owner-b", "access_token", envelope),
      () => decryptStravaSecret("owner-a", "refresh_token", envelope),
      () => decryptStravaSecret("owner-a", "access_token", "v1.not-an-iv.bad.tag"),
    ];
    for (const attempt of cases) {
      try {
        attempt();
        throw new Error("expected storage failure");
      } catch (error) {
        expect(error).toBeInstanceOf(StravaSecretStorageError);
        expect(String(error)).not.toContain("private-value");
        expect(String(error)).not.toContain(envelope);
      }
    }
    process.env[ENV] = Buffer.alloc(32, 42).toString("base64url");
    expect(() => decryptStravaSecret("owner-a", "access_token", envelope)).toThrow(
      StravaSecretStorageError
    );
  });

  it("fails closed for missing or malformed runtime keys", () => {
    delete process.env[ENV];
    expect(() => encryptStravaSecret("owner-a", "access_token", "private-value")).toThrow(
      StravaSecretStorageError
    );
    process.env[ENV] = "not-a-32-byte-key";
    expect(() => encryptStravaSecret("owner-a", "access_token", "private-value")).toThrow(
      StravaSecretStorageError
    );
  });
});
