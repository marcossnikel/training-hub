# R17 — Add one-time first-login platform onboarding

**Status:** draft
**Delivery class:** full stack
**Risk/model:** medium — Terra medium
**Depends on:** R2M and R8 done
**Unlocks:** no post-connection task; it may ship independently of R18

## Outcome

Every existing or new account sees one short, skippable, versioned platform
onboarding on its next eligible authenticated login. It explains Training Hub
and offers Strava setup without pretending that onboarding and connection are
the same event.

## Current truth

- Sign-up and sign-in currently continue to `next` or `/`; there is no distinct
  first-login destination.
- R8 introduces the server-owned first-auth continuation seam with `/` as its
  compatibility destination; R17 owns replacing that seam for eligible accounts
  without changing returning sign-in `next` behavior.
- `/` shows a Training Log empty-state CTA to Settings for an unconnected owner.
- No onboarding completion/skip/version state exists. `user_meta` carries other
  owner values but does not model this experience.
- The auth shell copy says `STEP 1 OF 4` despite no persisted four-step journey.
- BYO credential setup currently lives in Settings and leaves the app for OAuth,
  so a tooltip tour/modal cannot own the real connection lifecycle.

## Locked decisions

1. Welcome onboarding and post-connection activation are separate persisted
   events. Welcome completion/skip never implies Strava connection or value,
   and R17 creates no prerequisite state that R18 needs in order to run.
2. Audience includes all accounts existing at release and all future accounts.
3. Use a dedicated route-level, resumable experience, not a tooltip tour over
   unrelated pages. Suggested route: `/onboarding/welcome`; final route must be
   locked when packet becomes ready.
4. Show a maximum of four concise moments: product/evidence model, core surfaces,
   private BYO Strava boundary, and choose `Connect Strava` or `Explore first`.
5. `Skip` and `Explore first` permanently dismiss this onboarding version.
   They do not remove a persistent, non-blocking `Continue Strava setup` entry
   from the empty connected-data state.
6. `Connect Strava` hands off to the existing Settings/BYO setup with a safe
   return/continuation key. The welcome flow does not collect secrets itself,
   and the same connection entry remains usable when R18 ships before R17.
7. Completion/skip is server-persisted, owner-scoped, versioned, and idempotent.
   Client storage is not authority.
8. Framer Motion may provide restrained transition/continuity only. Content and
   navigation remain complete with reduced motion, JavaScript interruption, and
   browser back/refresh.
9. Focus moves to the new step heading after navigation, Skip is always visible,
   browser Back is predictable, and no focus is trapped.
10. Remove false `STEP 1 OF 4` auth copy unless the rendered persisted journey
    truthfully owns that count.

## May change

- additive versioned owner onboarding persistence boundary;
- safe auth continuation and onboarding route/components/copy/i18n;
- existing unconnected empty-state CTA;
- focused browser fixtures/state reset for disposable accounts.

The builder may repair navigation/focus/responsive issues inside welcome and
auth continuation. It must not redesign Settings or implement connection
activation.

## Must remain true

- unauthenticated users cannot read or set onboarding state;
- one owner cannot complete another's flow;
- invite/sign-up security and safe `next` validation remain unchanged;
- BYO credentials remain Settings/server responsibilities;
- no founder credentials or policy-resolution claim appears;
- 1440/390, keyboard, screen-reader status, and reduced motion are supported.

## Non-goals

- importing/analyzing data;
- post-connection progress or Activation Summary;
- mandatory profile questionnaire;
- coach marks on every application control;
- automatically reopening an already skipped version.

## Implementation map

1. Lock exact route, four-moment copy, state/version API, and authenticated
   redirect rules in the ready packet. Completion: the R8 first-auth seam names
   this route for eligible owners and no copy/navigation decision remains for
   builder.
2. Add first-login eligibility and idempotent complete/skip actions. Completion:
   existing/new disposable accounts enter once; completed/skipped accounts do
   not replay.
3. Build the route-level responsive experience with established primitives and
   restrained motion. Completion: all steps work without motion and survive
   reload/back.
4. Hand off Connect to Settings with safe continuation; preserve Explore setup
   CTA. Completion: either choice exits predictably without marking connection.
5. Remove misleading auth step count and cover localization. Completion: copy
   matches real persisted state in supported locales.

## Acceptance

- Existing and new accounts see the current version once.
- Skip/complete persist server-side and prevent replay.
- Connect hands off to BYO setup; Explore reaches the app with setup still
  available.
- No Strava state is inferred or mutated by welcome completion.
- Refresh/back/keyboard/focus/reduced-motion and 1440/390 work.
- Guest/foreign attempts cannot observe or set state.

## Validation

Focused integration tests for owner-scoped eligibility, versioning, complete,
skip, safe continuation, and guest/foreign denial. Then iterate invited sign-up,
existing-account first login, complete, skip, refresh, back, Connect handoff,
Explore, and no-replay paths in a real browser at 1440/390. Exercise keyboard,
focus, and reduced motion.

## Migration, compatibility, and rollback

Add versioned owner-scoped state through R2M. Rollback hides the route but retains
terminal state so users are not replayed after forward deployment. No remote
migration/deployment is authorized.

## Stop only if

Exact copy/route remains undecided at ready time, safe auth continuation cannot
distinguish guest/onboarding state, or implementing persistence would escape the
approved prerequisite boundary.
