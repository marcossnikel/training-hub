# R8 — Make login and invited signup coherent

**Risk:** medium  
**Recommended builder:** Terra medium  
**Deferred review focus:** Terra high for auth/session/invite behavior; visual audit  
**Depends on:** R7  
**Unlocks:** Milestone M2 completion

## Outcome

Guests understand the invitation boundary, invited signup continues directly
to the existing Strava setup, returning users preserve safe destination recovery,
and authenticated users do not remain on auth-entry pages.

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
4. Successful invited signup goes to the existing Settings Strava connection
   section using a fixed server-owned path/state; browser input cannot choose an
   external destination.
5. Remove “STEP 1 OF 4” unless the exact four existing steps and transitions are
   implemented/proven. Recommended copy is a non-numeric private-invitation
   stage plus the real continuation to Settings.
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
- fixed post-signup continuation into existing Settings;
- focused component/route/E2E tests and auth-entry visual proof.

## Non-goals

- new onboarding wizard or persisted step engine;
- password recovery/email;
- changing Better Auth provider/schema/session lifetime;
- invite management implementation.

## Implementation sequence

1. Add server session redirect tests for auth-entry pages. Completion:
   authenticated user never receives form markup.
2. Separate sign-in success destination from sign-up continuation. Completion:
   sign-in safe `next` remains; signup uses fixed Settings destination.
3. Replace unsupported numeric-step copy and make continuation explicit.
   Completion: copy matches actual next screen and existing product boundaries.
4. Verify session-expiry, invalid invite/credentials, double submit, keyboard,
   password manager, focus, and 390 layout. Completion: existing protections
   remain observable.

## Required automated proof

- component tests for sign-in/sign-up destinations and safe hostile `next`;
- authenticated auth-entry redirects;
- existing generic invite failure/concurrency tests;
- logout/revocation and guest protected-route E2E;
- invited signup lands in Settings Strava setup.

```sh
npm run verify:fast
npx playwright test e2e/auth.spec.ts e2e/beta-invite.spec.ts e2e/byo-connection.spec.ts
```

## Required manual or visual proof

At 1440/390 and reduced motion: login default/error/pending; signup invited,
invalid retry, pending, success continuation; authenticated redirect; no-invite
boundary. Use only disposable invite tokens and never retain them in artifacts.

## Migration, rollout, and rollback

No schema change. Rollback restores previous destinations/copy while keeping R6
invite and R3 role data. No live auth/deployment operation.

## Stop conditions

- a new onboarding step/product surface is required;
- exact approved auth design/copy is missing at Ready time;
- change would weaken generic failure or token removal; or
- password recovery is pulled into scope without a mail/security decision.

## Completion criteria

- Authenticated users leave auth-entry pages.
- Returning sign-in safe `next` works.
- Invited signup continues to existing Strava setup.
- Unsupported step count is removed or fully proven.
- all existing auth/invite security and visual checks pass.
