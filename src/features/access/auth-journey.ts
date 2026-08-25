import "server-only";

const INTERNAL_ORIGIN = "https://training-hub.invalid";

/**
 * R17 replaces this one server-owned seam when first-login onboarding ships.
 * It is deliberately separate from a returning user's protected-route recovery.
 */
export function firstAuthContinuation(): "/" {
  return "/";
}

/**
 * Preserves only an internal relative destination from a protected-route login
 * recovery. Parsing, rather than prefix matching alone, rejects protocol-relative
 * and backslash-based external URLs as well as absolute browser input.
 */
export function signInContinuation(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) return "/";

  try {
    const destination = new URL(value, INTERNAL_ORIGIN);
    if (destination.origin !== INTERNAL_ORIGIN) return "/";
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return "/";
  }
}
