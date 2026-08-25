# Issue 60 beta invitation validation

All proof uses the disposable local Playwright database (`data/e2e.db`) with
`TRAINING_HUB_ENV=e2e`, `TRAINING_HUB_DISPOSABLE_DATA=1`, and
`BETA_INVITE_REGISTRATION_ENABLED=1`. It never contacts a remote database or
issues a real invitation.

## Automated proof

`src/lib/beta-invites.test.ts` calls Better Auth's real server handler and
proves that the endpoint rejects missing, malformed, email-mismatched,
expired, revoked, replayed, and cross-user tokens with the same generic 401
response. It also proves a failed password validation does not consume a
token, successful account creation consumes/binds it exactly once and removes
the transient claim, a concurrent duplicate produces one success and one
generic rejection, and the local command refuses an unlabelled target.

`e2e/beta-invite.spec.ts` proves the rendered boundary and signup flow through
the existing Better Auth endpoint. It uses only direct E2E fixture data in the
disposable SQLite file; there is no invitation HTTP/API/admin management path.

## Visual and interaction proof

Review route: `/sign-up` and `/sign-up?invite=<opaque-token>` in the isolated
E2E server.

| Evidence | Viewport/state | Observed result |
| --- | --- | --- |
| `60-sign-up-boundary-1440.png` | 1440x900, no token | A calm private-beta boundary explains the access condition and leaves only a focused, labelled login path. No account form is rendered. |
| `60-sign-up-boundary-reduced-motion-390.png` | 390x844, reduced motion | The same boundary fits without horizontal overflow and remains static; the login link retains a visible focus path. |
| `60-sign-up-pending-1440.png` | 1440x900, intercepted request | The native labelled form remains stable while its submit control reads `Working…` and is disabled. |
| `60-sign-up-invalid-retry-1440.png` | 1440x900, invalid opaque token | An inline generic `aria-live` failure avoids invite-state disclosure and the control returns enabled for retry. |
| `60-sign-up-success-1440.png` | 1440x900, redeemed disposable invite | The athlete lands in the empty training-log first-use state after keyboard submission. |

The Playwright test covers keyboard submission (Enter), native label/focus
order, button disabled/re-enabled behavior, reduced-motion rendering, token
removal from the address bar, and absence from browser storage. The UI has no
meaningful motion: state changes are static and do not require animation to
understand.

## Operator boundary

The only operator interface is the local, environment-guarded CLI documented
in `docs/engineering/BETA_INVITES.md`. It is disabled by default, refuses
production/non-disposable/remote-local targets, and prints an opaque token URL
once. No capture contains a usable invitation token.
