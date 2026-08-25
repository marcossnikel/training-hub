# Rxx — Outcome title

**Status:** queued | done | blocked
**Delivery class:** API/backend | full stack | frontend | documentation/plan
**Risk/model:** low, medium, or high — recommended Codex model and effort
**Depends on:** done task IDs or none
**Unlocks:** task IDs or none

## Outcome

One observable result for the user or developer.

## Current truth

Name the exact files, call sites, tests, existing behavior, and confirmed failure
mechanism needed to execute this task. Do not rely on the planning chat.
At invocation, refresh stale local facts here and continue directly into
implementation; no separate readiness transition exists.

## Locked decisions

Number every product, domain, authorization, data, environment, provider, UI,
motion, accessibility, migration, and compatibility choice the builder must
implement rather than reinterpret.

## May change

Name owned files/areas and allowed change types. Include this task-specific
failure policy:

> The builder may make deterministic behavior-preserving repairs exposed by
> this change inside <boundary>. If a required repair escapes that boundary or
> changes accepted behavior, stop only when it meets an external/decision stop
> condition; otherwise extend the in-scope repair and document it.

## Must remain true

List protected behavior, owner isolation, privacy, secrets, environment, data,
route/API contracts, responsive/accessibility behavior, and unrelated work.

## Non-goals

Name attractive adjacent work that this task must not absorb.

## Implementation map

Number the edits in dependency order. End every step with an observable
completion condition, including cleanup of temporary compatibility code.

## Acceptance

Use five to ten observable assertions. Each assertion maps to an integration
test, browser path/state, or documentation inspection below.

## Validation

Use only the selected delivery class:

- **API/backend:** exact focused integration test files, fixtures, assertions,
  and command.
- **Full stack:** exact focused integration tests plus browser route, auth/data
  state, interactions, 1440/390 expectations, and relevant failure states.
- **Frontend:** browser route, auth/data state, interactions, 1440/390
  expectations, keyboard/focus, and reduced-motion behavior.
- **Documentation/plan:** exact link/reference/contradiction searches and diff
  checks.

Name `npm run verify` only for a release-critical or explicitly justified gate.

## Migration, compatibility, and rollback

State schema/data handling, idempotency, compatibility lifetime, local/remote
boundary, and safe rollback. Write `not applicable` where appropriate.

## Stop only if

List only: inaccessible external credential/account, shared/production/live
effect, destructive material-data action, unresolved product/security/privacy
decision requiring Marcos, or unavoidable overlap with unowned dirty work.

## Finish

Inspect the complete diff from the starting commit, all new/deleted files,
`git diff --check`, and `git status`; fix in-scope findings and rerun affected
proof; update this packet and `ROADMAP.md` to `done`; stage explicit paths;
set `Next task` to the first dependency-satisfied queued item in roadmap priority
order; inspect the staged diff; commit once directly on local `main`; do not
push or deploy; return outcome, SHA, exact checks/browser paths, next task, and
genuine external blockers.
