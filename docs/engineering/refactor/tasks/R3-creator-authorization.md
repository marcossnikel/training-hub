# R3 — Add creator operational authorization

**Status:** draft
**Risk:** high
**Recommended builder:** Terra high
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
   DB isolation. Completion: both roles can be exercised.
5. Add guarded bootstrap command with dry-run/readback. Completion: local works;
   synthetic unsafe targets fail before write.
6. Capture glossary/decision. Completion: future agents cannot interpret creator
   as cross-owner admin.

## Required automated proof

- migration from current schema preserves users and defaults member;
- creator capability allowed; member/guest denied;
- forged role inputs ignored;
- revoked creator session denied;
- existing two-owner isolation suite remains green;
- bootstrap local success and unsafe-target refusal.

```sh
npm run verify:fast
npx playwright test e2e/tenant-isolation.spec.ts
```

## Required manual or visual proof

No UI. Inspect redacted local bootstrap output and DB role values for disposable
creator/member fixtures.

## Migration, rollout, and rollback

Additive role column. Release requires R2M process and explicit remote migration
authorization. Old code must tolerate the added column. Rollback code leaves the
column/data unused; do not destructively drop it.

## Stop conditions

- role location or creator capabilities are changed from locked decisions;
- existing production account mapping is ambiguous;
- bootstrap would authorize by env email on every request; or
- migration/tenant tests are not green.

## Completion criteria

- Server-derived role and named capabilities exist.
- Member/guest denial and creator success are proven.
- Owner isolation is unchanged and independently tested.
- Bootstrap is guarded but not run remotely.
- domain/decision documentation states creator's non-superuser boundary.
