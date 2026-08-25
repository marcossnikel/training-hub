# R8 — Make login and invited signup coherent

**Status:** draft
**Delivery class:** full stack
**Risk/model:** medium — Terra medium
**Depends on:** R7
**Unlocks:** R17 and invited-access milestone completion

## Outcome

Guests understand the invitation boundary, invited signup enters a server-owned
first-auth continuation seam, returning users preserve safe destination
recovery, and authenticated users do not remain on auth-entry pages. R17 can
later attach welcome onboarding without rewriting invite redemption or login.

## Required context

- D-012/D-014 and auth validation docs
- login/signup pages, AuthShell/AuthForm and tests
- Settings BYO connection entry, proxy/auth session behavior
- approved auth Figma frames and design foundation

## Current behavior and evidence

AuthForm already removes invite token from the address bar, uses generic errors,
uses safe internal `next`, and hides public signup links. Successful sign-in and
signup both navigate to safe `next` or `/`. Authenticated requests can render
login/signup. Signup copy says “STEP 1 OF 4,” but no persisted four-step journey
continues from it.

## Locked decisions

1. Keep private invite-only registration, generic errors, token removal, safe
   internal `next`, password-manager attributes, disabled/pending state, and
   accessible error focus/live region.
2. Authenticated `/login` and `/sign-up` redirect to `/` unless a separately
   approved safe creator/admin destination is requested.
3. Sign-in continues honoring a validated protected-route `next`.
4. Successful invited signup uses a fixed server-owned first-auth destination,
   separate from sign-in `next`. R8's compatibility destination is `/`; R17
   later changes only this seam to the eligible welcome route. Browser/query/
   invite input cannot select or bypass the first-auth destination.
5. Remove “STEP 1 OF 4” unless the exact four existing steps and transitions are
   implemented/proven. Recommended copy is a non-numeric private-invitation
   stage without claiming that Settings, Strava connection, or a four-step flow
   is the immediate next screen.
6. No password reset, verification email, magic link, or mail provider in this
   task; D-012 explicitly does not promise recovery delivery.
7. Signup does not reveal whether a token/email/account exists beyond the current
   generic outcome.

## Protected invariants

- invalid/malformed/expired/revoked/replayed/mismatched invites remain generic;
- login invalid credentials create no session;
- logout/session revocation remains immediate;
- guest protected routes preserve safe login `next`;
- no public landing/signup CTA or open registration.

## Permitted scope

- auth pages/shell/form copy and redirects;
- fixed server-owned first-auth continuation seam with current `/` fallback;
- focused component/route/E2E tests and auth-entry visual proof.

## Non-goals

- new onboarding wizard or persisted step engine;
- password recovery/email;
- changing Better Auth provider/schema/session lifetime;
- invite management implementation.

## Implementation sequence

1. Add server session redirect tests for auth-entry pages. Completion:
   authenticated user never receives form markup.
2. Separate sign-in success destination from the server-owned sign-up
   continuation. Completion: sign-in safe `next` remains, signup ignores
   browser-supplied destination, and the current fallback is `/`.
3. Replace unsupported numeric-step copy and make continuation explicit.
   Completion: copy matches actual next screen and existing product boundaries.
4. Verify session-expiry, invalid invite/credentials, double submit, keyboard,
   password manager, focus, and 390 layout. Completion: existing protections
   remain observable.

## Required automated proof

- `src/features/access/auth-journey.integration.test.ts` exercises real Better
  Auth/session/invite transactions against disposable SQLite;
- sign-in honors safe internal `next` and rejects hostile/absolute destinations;
- sign-up ignores `next`, consumes the invite atomically, and uses only the
  server-owned `/` compatibility destination;
- authenticated auth-entry redirects, generic invite failures/concurrency,
  logout/revocation, and guest protected-route recovery remain intact.

```sh
npx vitest run src/lib/beta-invites.test.ts src/features/access/auth-journey.integration.test.ts
npx playwright test e2e/auth.spec.ts e2e/beta-invite.spec.ts
```

Do not run the full repository gate. Make the integration story green first,
then iterate the real login/signup browser paths at 1440/390 until the focused
Playwright specs and direct inspection match the approved auth frames.

## Required manual or visual proof

At 1440/390 and reduced motion: login default/error/pending; signup invited,
invalid retry, pending, success continuation to `/`; authenticated redirect;
no-invite boundary. Use only disposable invite tokens and never retain them in
artifacts. R17 separately proves the later welcome destination.

## Migration, rollout, and rollback

No schema change. Rollback restores previous destinations/copy while keeping R6
invite and R3 role data. No live auth/deployment operation.

## Stop conditions

- exact approved auth design/copy or a change to D-012/D-014/D-019 requires a
  Marcos decision;
- correct proof requires a live invite, deployment, mail provider, or shared
  database; or
- password recovery is added without a separate mail/security decision.

Redirect wiring, generic failure/token-removal regressions, auth fixtures,
responsive/focus defects, and all other recoverable local findings are owned
and fixed by the builder inside this task. No onboarding surface is added here.

## Completion criteria

- Authenticated users leave auth-entry pages.
- Returning sign-in safe `next` works.
- Invited signup uses the server-owned `/` compatibility destination and exposes
  the narrow continuation seam R17 will replace.
- Unsupported step count is removed or fully proven.
- all existing auth/invite security and visual checks pass.
- Both named focused commands pass with disposable data and real-browser proof.
