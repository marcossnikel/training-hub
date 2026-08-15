import { constantTimeEqual, digestOAuthState, issueOpaqueOAuthState } from "../crypto";
import type { OwnerContext } from "../owner-context";
import { exec } from "./helpers";

export const OAUTH_STATE_INTENTS = ["connect", "reconnect"] as const;
export const OAUTH_STATE_REDIRECT_KEYS = ["onboarding", "settings"] as const;
export type OAuthStateIntent = (typeof OAUTH_STATE_INTENTS)[number];
export type OAuthStateRedirectKey = (typeof OAUTH_STATE_REDIRECT_KEYS)[number];

export interface OAuthStateRequest {
  intent: OAuthStateIntent;
  redirectKey: OAuthStateRedirectKey;
  expiresAt?: Date;
}

export interface ConsumedOAuthState {
  intent: OAuthStateIntent;
  redirectKey: OAuthStateRedirectKey;
}

function includes<T extends readonly string[]>(values: T, value: string): value is T[number] {
  return values.includes(value);
}

function requireAllowed(request: OAuthStateRequest): void {
  if (
    !includes(OAUTH_STATE_INTENTS, request.intent) ||
    !includes(OAUTH_STATE_REDIRECT_KEYS, request.redirectKey)
  ) {
    throw new Error("Invalid OAuth state request.");
  }
}

/** Stores only an HMAC digest; the returned random state is safe for the browser. */
export async function createOAuthState(
  owner: OwnerContext,
  request: OAuthStateRequest
): Promise<string> {
  requireAllowed(request);
  const state = issueOpaqueOAuthState();
  const expiresAt = request.expiresAt ?? new Date(Date.now() + 10 * 60 * 1000);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    throw new Error("Invalid OAuth state request.");
  }
  await exec(
    `INSERT INTO oauth_states (state_hash, user_id, connection_intent, redirect_key, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      digestOAuthState(state),
      owner.userId,
      request.intent,
      request.redirectKey,
      expiresAt.toISOString(),
    ]
  );
  return state;
}

/**
 * Atomically consumes a state for its initiating owner. No redirect URL or owner
 * id is encoded in the browser value, and state reuse always fails closed.
 */
export async function consumeOAuthState(
  owner: OwnerContext,
  state: string,
  now = new Date()
): Promise<ConsumedOAuthState | null> {
  const stateHash = digestOAuthState(state);
  const result = await exec(
    `UPDATE oauth_states SET consumed_at = ?
     WHERE state_hash = ? AND user_id = ? AND consumed_at IS NULL AND expires_at > ?
     RETURNING state_hash, connection_intent, redirect_key`,
    [now.toISOString(), stateHash, owner.userId, now.toISOString()]
  );
  if (result.rows.length !== 1) return null;
  const row = result.rows[0];
  const intent = String(row.connection_intent);
  const redirectKey = String(row.redirect_key);
  if (
    !constantTimeEqual(stateHash, String(row.state_hash)) ||
    !includes(OAUTH_STATE_INTENTS, intent) ||
    !includes(OAUTH_STATE_REDIRECT_KEYS, redirectKey)
  ) {
    return null;
  }
  return { intent, redirectKey };
}
