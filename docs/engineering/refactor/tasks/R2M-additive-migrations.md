# R2M — Establish safe additive migrations

**Status:** draft
**Delivery class:** API/backend
**Risk/model:** high — Terra high
**Depends on:** R2
**Unlocks:** R3, R6, R9

## Outcome

Schema version 23 databases can advance through ordered additive migrations;
local/E2E may migrate automatically, while preview/production fail closed when
behind until an explicitly authorized migration command runs.

## Required context

- `src/lib/db/migrations.ts`, owner-schema tests, DB client/config
- reset/seed/migration environment guards and `docs/environment-boundaries.md`
- current production/preview authority in `AGENTS.md`

## Current behavior and evidence

`OWNER_SCHEMA_VERSION` is 23. `migrate()` refuses every nonzero version below
that constant, then creates the whole owner schema only for version zero. If the
constant were changed to 24 for a new column, an existing version-23 database
would hit the refusal rather than an additive migration.

## Locked decisions

1. Versions below the accepted owner-schema floor remain reset-only and refused.
2. Version 23 is the base for ordered additive migrations.
3. Fresh version-zero databases build the latest schema without replaying unsafe
   assumptions from historical prototypes.
4. Each additive migration is transactional and advances `schema_version` only
   after all statements succeed.
5. Local/E2E auto-apply additive migrations.
6. Preview/production application startup detects a behind schema and fails with
   a redacted actionable error; it does not apply writes implicitly.
7. A separate guarded command may apply remote migrations only with explicit
   target and approval inputs. This task does not run that command remotely.
8. Every future schema task owns forward SQL, compatibility window, backfill,
   verification counts, and rollback/forward-fix statement.

## Protected invariants

- no reset of non-disposable data;
- failed migration leaves prior version and schema usable;
- concurrent starts cannot partially apply the same version;
- URLs/tokens are absent from errors;
- current version-23 data remains intact.

## Permitted scope

- migration registry/runner and tests;
- guarded migration command and package script;
- environment docs needed to explain the new boundary.

## Non-goals

- adding creator, invite, or Strava cutoff columns;
- executing a preview/production migration;
- designing backup infrastructure;
- destructive down migrations.

## Implementation sequence

1. Build version-23 fixture coverage from the exact current schema. Completion:
   tests distinguish fresh, floor, current, behind-additive, and invalid-old.
2. Add ordered migration representation and transactional runner. Completion:
   a synthetic v24 migration applies once and advances only on success.
3. Separate local/E2E auto behavior from remote behind-schema behavior.
   Completion: synthetic preview/production cannot write during normal startup.
4. Add guarded operator command using R2 config semantics. Completion: invalid
   target/approval fails before opening a write transaction.
5. Document the per-migration evidence packet. Completion: R3/R6/R9 can name
   their exact version, forward behavior, and rollout gate.

## Required automated proof

- preserve `src/lib/db.owner-schema.test.ts` current schema/floor behavior;
- add `src/lib/db.migrations.integration.test.ts` using disposable on-disk
  SQLite fixtures rather than mocked SQL;
- fresh DB reaches latest schema;
- v23 fixture migrates additively with exact row/schema preservation assertions;
- migration failure rolls back and retains v23;
- second run is an idempotent no-op;
- local/E2E auto-apply;
- preview/production startup behind version fails without write;
- guarded command refuses unsafe synthetic environments before opening a write
  transaction;
- two concurrent runners leave one complete migration and the expected final
  version, never a partially applied schema.

```sh
npx vitest run src/lib/db.owner-schema.test.ts src/lib/db.migrations.integration.test.ts
```

This API/backend task does not run Playwright, browser validation, a manual
database inspection, or the full repository gate. Schema shape, version, row
preservation, rollback, and before/after counts are integration-test assertions
against disposable files. No remote migration/read is part of completion.

## Required integration fixtures

1. Version zero: builds the latest schema once and preserves seeded fixture rows
   through a second start.
2. Exact version 23: synthetic v24 adds one nullable field/index and preserves
   every existing owner row/value.
3. Failure injection: a statement after the additive change fails; schema,
   rows, and version remain exactly v23.
4. Concurrent starts: two runner instances target the same disposable file and
   converge on one complete v24 result.
5. Synthetic `LOCAL`/`E2E`: startup auto-applies. Synthetic `PREVIEW`/
   `PRODUCTION`: startup performs no schema write and returns the redacted
   behind-version error.
6. Guarded command: missing approval, mismatched target, disposable-safety
   violation, and unsafe synthetic target all fail without writing; a secret-
   bearing URL canary is absent from every captured error/output.

## Migration, rollout, and rollback

This task changes migration machinery only. It must be released before a task
that requires a new schema version. Production rollout remains separately
authorized and rehearsed on a disposable/sanitized copy. Prefer forward fix;
never promise destructive down migration.

## Stop conditions

- accepted remote startup policy would need to change;
- correct proof requires a preview/production/shared database or unavailable
  external credential; or
- the installed libSQL/SQLite runtime lacks a transactional/concurrency primitive
  and no safe local equivalent can satisfy the accepted atomicity contract.

All ordinary migration SQL, transaction, concurrency, fixture, command, and
test failures are owned and repaired by the builder within this task.

## Completion criteria

- v23 -> v24 synthetic path is transactional and tested.
- local/E2E and remote behavior differ exactly as locked.
- no product schema addition is bundled.
- future task packet requirements are documented.
- The named focused Vitest command passes without browser or remote resources.
- no remote/shared database was accessed.
