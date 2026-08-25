# R3 — Add creator operational authorization

**Status:** done
**Delivery class:** API/backend
**Risk/model:** high — Terra high
**Depends on:** R2M
**Unlocks:** R4 and R6

## Outcome

An authenticated local user is either `member` or `creator`; creator gains only
named operational capabilities, while both roles remain restricted to their own
training data.

## Required context

- `docs/product/DECISIONS.md`, tenant identity architecture
- `src/lib/auth.ts`, `src/lib/owner-context.ts`, auth/owner tests
- `src/lib/db/migrations.ts`, E2E owner fixtures, seed scripts
- Better Auth 1.4.18 local package admin-plugin surface for comparison only

## Current behavior and evidence

`CurrentUser` contains application `userId`, Better Auth subject/session, and
email. The local `users` row has no access role. Better Auth's bundled admin
plugin includes broad user/session administration that is unnecessary for
environment display and invite management.

## Locked decisions

1. Canonical roles are `creator` and `member`; default is `member`.
2. Store the role on the application `users` record, not Better Auth tables or
   an environment email comparison.
3. Role does not alter `OwnerContext` and never permits cross-owner reads/writes.
4. Initial capabilities are `viewOperationalEnvironment` and
   `manageBetaInvites`; central authorization maps role to capability.
5. Add a small server-only interface such as `requireCreator()` or equivalent;
   callers do not duplicate string comparisons.
6. Do not install the Better Auth admin plugin.
7. Bootstrap uses a guarded operator command: locate one existing auth account,
   resolve its local user, then persist creator. Ongoing authorization uses
   `userId` + stored role, never email.
8. Each environment grants creator independently. No live grant occurs here.
9. Record the domain terms and the decision that creator is not a data
   superuser in the project glossary/decision log.

## Protected invariants

- forged headers/form/query values cannot select role or owner;
- session revocation immediately removes operational access;
- member is safe default for existing/new accounts;
- creator cannot access another owner's activities, gear, notes, blobs, Strava,
  or connection state;
- guest behavior remains unchanged.

## Permitted scope

- one additive role migration;
- server auth/access feature module and tests;
- local/E2E fixture role assignment;
- guarded bootstrap command and domain/decision documentation.

## Non-goals

- user listing, impersonation, banning, password management, member editing;
- creator UI, environment indicator, or invite management;
- automatic production role grant;
- organizations or general RBAC engine.

## Implementation sequence

1. Add role migration with default/check semantics. Completion: current rows are
   member and invalid roles are rejected.
2. Extend server current-user resolution through one access module. Completion:
   role is server-derived and no owner call site changes authorization scope.
3. Implement named capability/creator guard. Completion: guest/member/creator
   results are exhaustively tested.
4. Seed distinct creator and member E2E identities without weakening disposable
   DB isolation. Completion: both roles can be exercised by this task's
   integration suite and reused by later browser tasks.
5. Add guarded bootstrap command with dry-run/readback. Completion: local works;
   synthetic unsafe targets fail before write.
6. Capture glossary/decision. Completion: future agents cannot interpret creator
   as cross-owner admin.

## Required automated proof

- new `src/features/access/access.integration.test.ts` covers migration from the
  current schema, preserving users and defaulting them to member;
- creator capability allowed; member/guest denied;
- forged role inputs ignored;
- revoked creator session denied;
- existing owner-context and two-owner DB isolation suites remain green;
- bootstrap local success and unsafe-target refusal.

```sh
npx vitest run src/features/access/access.integration.test.ts src/lib/auth.owner-context.test.ts src/lib/db.owner-scope.test.ts
```

This API/backend task does not run Playwright, browser validation, or the full
repository gate. R5 and R7 own creator-only browser surfaces. Integration tests
must use disposable SQLite plus real session/current-user resolution at the
feature boundary rather than mocking the authorization result.

## Required integration scenarios

1. Migrate a disposable current-schema database containing two members;
   confirm both remain members and invalid role storage is rejected.
2. Promote exactly one disposable account through the bootstrap command's
   programmatic boundary; dry-run changes nothing and apply/readback identifies
   only the resolved local user with redacted output.
3. Resolve fresh creator, member, revoked-session, and guest requests through
   the real auth/current-user boundary and assert the two named capabilities.
4. Attempt forged role/owner inputs and cross-owner activity/gear/connection
   reads; creator receives no broader owner access than member.
5. Run unsafe database-target and ambiguous-account fixtures; both refuse before
   mutation. Do not run the operator command against a remote/shared database.

## Migration, rollout, and rollback

Additive role column. Release requires R2M process and explicit remote migration
authorization. Old code must tolerate the added column. Rollback code leaves the
column/data unused; do not destructively drop it.

## Stop conditions

- role location or creator capabilities are changed from locked decisions;
- existing production account mapping is ambiguous;
- a safe bootstrap target cannot be identified without Marcos or an external
  account/credential; or
- proof would require a remote/shared database.

All local migration, authorization, bootstrap, fixture, and test failures remain
owned by the builder and are fixed within this task's permitted boundary.

## Completion criteria

- Server-derived role and named capabilities exist.
- Member/guest denial and creator success are proven.
- Owner isolation is unchanged and independently tested.
- Bootstrap is guarded but not run remotely.
- domain/decision documentation states creator's non-superuser boundary.
- The named focused Vitest command passes without browser or remote resources.
