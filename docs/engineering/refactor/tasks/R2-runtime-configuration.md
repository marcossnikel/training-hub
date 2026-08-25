# R2 — Make runtime configuration explicit and testable

**Status:** draft
**Risk:** high
**Recommended builder:** Terra high
**Depends on:** R1
**Unlocks:** R2M

## Outcome

Application code resolves database target and runtime identity through pure,
tested configuration functions, while operators have a redacted `doctor`
command that explains the active local/E2E/preview/production boundary.

## Required context

- `.env.example`, `docs/environment-boundaries.md`
- `scripts/check-environment-boundary.mjs`, reset/seed/backfill guards
- `src/lib/db/client.ts`, auth, invite, Strava BYO, storage config readers
- `playwright.config.ts`, Vercel/Next runtime guidance from installed docs

## Current behavior and evidence

Database precedence (`TURSO_DATABASE_URL` -> `DATABASE_URL` -> local file) is
repeated across application and scripts. Environment checks are strong but
separate from application resolution. Many tests mutate `process.env` before a
dynamic import because the database singleton resolves at import time.

## Locked decisions

1. Centralize semantics, not every physical `process.env` access. Playwright and
   standalone scripts may have their own composition entry points.
2. Pure resolvers accept `Record<string, string | undefined>` and return typed,
   non-secret values or controlled errors.
3. Runtime identity is `local | e2e | preview | production`; E2E production-build
   mode remains runtime identity `e2e`.
4. Database precedence and every current fail-closed environment rule remain
   behaviorally identical unless a separate accepted decision changes them.
5. `doctor` prints environment, database kind/host when safe, registration
   enabled state, and presence/validity of required values. It never prints or
   fingerprints secret values.
6. Server-only config cannot be imported by Client Components.
7. `.env.example` and documentation are checked against the canonical variable
   catalog; secret values remain blank placeholders.

## Protected invariants

- local/E2E reject Turso and remote URLs;
- preview requires dedicated preview/staging host and test-only external modes;
- production requires explicit production metadata/approval;
- test/import paths cannot accidentally capture a prior test's singleton;
- secret values never enter errors, logs, snapshots, or browser bundles.

## Permitted scope

- new `src/server/config/` pure resolvers/composition;
- DB client construction changes needed to accept resolved config while keeping
  the production singleton;
- environment/check scripts and contract tests;
- `.env.example` and environment docs.

## Non-goals

- schema migrations;
- changing production/preview values;
- pulling Vercel environment files;
- converting every feature module in one task;
- exposing runtime configuration to the browser.

## Implementation sequence

1. Inventory every supported variable by concern and classify secret/non-secret,
   required modes, default, and consumer. Completion: all code readers are
   accounted for.
2. Extract pure runtime/database resolvers with current behavior pinned by tests.
   Completion: local/E2E/preview/production matrices pass without global env.
3. Compose the DB singleton from the resolver and expose a test client factory.
   Completion: new module tests can create isolated DB clients without relying
   on a shared `process.env` mutation.
4. Add the redacted doctor command. Completion: canary secrets never appear.
5. Add catalog/docs parity verification. Completion: a referenced undocumented
   variable or stale example fails a focused check.
6. Migrate only immediate core consumers needed for a single source of truth.
   Completion: duplicate DB precedence is removed from assigned application
   files; guarded operational scripts remain safe.

## Required automated proof

- focused config matrix tests for every runtime mode;
- canary-secret redaction tests;
- DB client factory tests using two distinct disposable files;
- existing owner/auth/invite environment tests;

```sh
npm run check:env
npm run doctor
npm run verify:fast
npm run test:e2e:production
```

## Required manual or visual proof

Run `doctor` in local and synthetic non-secret preview configurations. Confirm
the output is useful without revealing any URL token, auth secret, encryption
key, or credential. No browser proof.

## Migration, rollout, and rollback

No schema change. Production behavior must remain compatible with current Vercel
variables. Rollback restores direct client resolution and removes new config
composition without changing stored data.

## Stop conditions

- current preview/production semantics are ambiguous;
- a resolver would require secret output to be diagnosable;
- a Next server/client import boundary cannot be proven; or
- a standalone script would lose its current remote-write refusal.

## Completion criteria

- Runtime/database resolution has one tested semantic source.
- Application DB construction is testable without shared global state.
- `doctor` is redacted and mode-aware.
- env example/docs parity is executable.
- existing environment and production-local checks pass.
