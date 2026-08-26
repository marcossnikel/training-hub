# R13 — Converge dead code, tooling, and documentation

**Status:** done
**Delivery class:** full stack
**Risk/model:** medium — Luna high after the inventory is frozen
**Depends on:** R0 through R12 and R14 through R19 done; R20/R21 are outside this cleanup
**Unlocks:** Milestone M4 completion

## Outcome

The repository contains one current development/refactor workflow, a trustworthy
dead-code signal, no expired compatibility layers, and no files retained only
because earlier tools broadly ignored them. A new developer can navigate the
implemented feature ownership without relying on stale AI-generated guidance.

## Required context

- done packets from R0–R12 and R14–R19, especially every named compatibility
  expiry;
- `AGENTS.md`, `package.json`, `biome.json`, `knip.json`, TypeScript/Vitest/
  Playwright configuration, scripts, and import aliases;
- `docs/product/`, `docs/design/`, `docs/engineering/`, root Markdown files, and
  current workflow and roadmap documents;
- framework/config entrypoint conventions from installed Next.js/tool docs;
- final `rg --files`, import/dependency graph, build output, and full verify.

## Current behavior and evidence

At discovery time, `knip.json` ignores all `src/lib/db/**` plus UI primitives,
`src/lib/sports.ts`, and telemetry, so a passing dead-code check cannot prove
those areas are live. The old GitHub Project/draft-PR/orchestrator documents
were removed while preparing the current task workflow. The retired-Strava
configuration checker scans every tracked file, so tracked-file removal and
the check's staging behavior must be understood before further cleanup.
Earlier refactors may also introduce aliases, exports, scripts, schema
compatibility fields, or docs that must be deliberately expired.

This task must regenerate its candidate list after every earlier product/
structural packet is done. The current observations are reasons to investigate,
not deletion authorization.

## Frozen candidate inventory

Frozen 2026-08-25 from the current checkout. Rows marked `delete` or `move`
are the only rows this task may change.

| Candidate | Evidence unused/stale | Dynamic/convention checks | Decision | Replacement/expiry | Proof |
| --- | --- | --- | --- | --- | --- |
| `src/server/config/server.ts` | It is an intentional server-only boundary fixture, not a general runtime resolver | Explicit Knip entry plus config integration marker test; scripts use `runtime.ts` because `server-only` rejects plain Node composition | keep with reason | Keep as the server-only boundary fixture; no new expiry | config integration marker test + Knip |
| `src/lib/db/config.ts` + `src/lib/db.config.test.ts` | Thin compatibility wrappers have one production caller and a duplicate test seam | Search finds only `beta-invites.ts` and its test; no framework/script entrypoint | move | Use `src/server/config/runtime.ts`; move precedence assertions to its integration suite | typecheck + config integration |
| `src/components/ui/badge.tsx` | Knip unused file; `rg` finds no import/JSX use | Not a route or framework-discovered file; no dynamic use | delete | None | Knip + repository search |
| `src/components/ui/dropdown-menu.tsx` | Knip unused file; `rg` finds no import/use | Not a route or framework-discovered file; no dynamic use | delete | None | Knip + repository search |
| `src/components/ui/progress.tsx` | Knip unused file; `rg` finds no import/use | Not a route or framework-discovered file; no dynamic use | delete | None | Knip + repository search |
| `AlertAction`, `CardAction`, `CardFooter`, `DialogClose` | Knip unused exports; exact symbol search finds no caller | Definitions are not framework entrypoints and are not used internally | delete | Keep only used UI primitive exports | Knip + typecheck |
| `loadStravaGear`, `loadStravaShoes`, `loadStravaBikes` | Knip reports the leaf exports; callers use provider/materialization directly | No dynamic import; enrichment remains used for detail/streams | delete | None | Knip + Strava tests |
| `track()` from `src/lib/telemetry.ts` | Knip unused export; exact search finds no caller; documented as a no-op future seam | Logger remains imported by live server modules; no analytics package depends on it | delete | Keep structured `logger` only | Knip + fast gates |
| `scripts/issue-beta-invite.ts`, `beta:invite` package script | R7 UI proof is complete; BETA_INVITES still calls the CLI temporary adapter | No script, e2e fixture, or docs needs it after fixture migration | delete | Creator UI `/admin/invites` is the current adapter | invite integration + negative search |
| `issueBetaInvite`, token-based `revokeBetaInvite`, `revokeBetaInviteById`, `BetaInvite` | R7 moved creator operations to `features/invites/server`; current callers are tests/CLI compatibility | Auth still needs validation policy; feature server owns issue/list/revoke | delete | Test-only fixture creates digest-only rows; auth keeps validation | invite/auth integration |
| `beta_invites.issued_by` | R6 explicitly expires it in R13; product persistence already supplies `issued_by_user_id` | Historical migration 26/27 remains; current schema can drop the column forward | move | Migration 33 drops only the expired column and preserves rows/provenance | migration integration + PRAGMA assertion |
| `docs/engineering/BETA_INVITES.md` CLI instructions | Current UI contradicts the “temporary CLI expires in R13” text | Product/decision history remains in R6/R7 packets; this is the current operator guide | move | Document creator UI and no-CLI boundary | link/search inspection |
| references to removed `src/lib/strava.ts` in completed packets | Historical context, not a current import; exact search finds no live path | Packets are retained history and R11 records the replacement | keep with reason | Mark as historical baseline; do not rewrite decision history | explicit historical note + search |

## Locked decisions

1. Generate a candidate inventory from multiple signals: imports, configured
   entrypoints, dynamic references, framework conventions, package scripts,
   tests, build behavior, and documentation ownership.
2. Classify each candidate as delete, keep with named reason, move/merge, or
   externally blocked. The builder freezes that table from current repository
   evidence before making mechanical edits.
3. Tighten broad Knip ignores. A remaining ignore must identify the convention
   or dynamic entrypoint that requires it and, where practical, a negative test.
4. Delete expired compatibility exports/files named by R0–R12. If one remains,
   assign a current owner, reason, and new expiry; “might be used” is not enough.
5. `AGENTS.md` remains operating authority. Searches must prove no surviving
   current document reintroduces the deleted orchestrator/reviewer loop.
6. Keep product/design decision history when it explains accepted behavior.
   Mark superseded records rather than erasing meaningful decision provenance.
7. Remove dependencies only after source/config/script usage and package lifecycle
   hooks are checked. Lockfile updates must be generated by the package manager.
8. Never delete based solely on filename age, line count, a single tool report,
   or an AI assessment.
9. Add a tombstone regression test only when removal could silently reintroduce
   unsafe behavior (retired env path, broad compatibility import, secret path).
10. No opportunistic formatting/rewrite of surviving product documentation.

## Protected invariants

- all user-visible capabilities, routes, scripts intentionally documented as
  supported, schema history, owner isolation, and environment safeguards remain;
- Next.js/framework-discovered files and dynamic entrypoints remain discoverable;
- local/E2E/production-mode verification commands remain reproducible;
- product/design decisions retain current truth and useful provenance;
- no secret, local DB, screenshots, or generated runtime artifacts are committed;
- unrelated user changes remain untouched.

## Permitted scope

- delete candidates from the accepted inventory;
- narrow Knip/tool ignores and explicitly configure real entrypoints;
- remove unused dependencies/config/scripts with lockfile update;
- reconcile or delete stale engineering guidance and repair links;
- remove expired refactor docs/compatibility notices after preserving final
  architecture/navigation guidance;
- add narrow negative/static checks protecting important removals.

## Non-goals

- new product features, visual changes, module redesign, DB migrations, or data
  cleanup;
- rewriting all docs for style;
- upgrading dependencies/toolchains;
- deleting historical product decisions that still explain behavior;
- fixing unrelated warnings discovered only once and not blocking this task.

## Candidate inventory format

At the start of the same implementation session, add a frozen table to this task:

| Candidate | Evidence unused/stale | Dynamic/convention checks | Decision | Replacement/expiry | Proof |
| --- | --- | --- | --- | --- | --- |
| exact path/export/dependency | at least two signals | exact searches/docs | delete/keep/move/blocked | exact owner | command/test |

The implementation model may act only on rows marked `delete` or `move`.

## Implementation sequence

1. Refresh file/import/config/doc link/dependency inventories after R12.
   Completion: every candidate has evidence and dynamic/framework conventions
   have been checked.
2. Collect all compatibility/expiry promises from R0–R12 handoffs.
   Completion: each is present in the candidate table with an outcome.
3. Freeze delete/move/keep decisions before editing files. Completion: no row
   asks the builder to judge current product or architecture while deleting.
4. Tighten Knip entrypoints/ignores until its report is meaningful. Completion:
   remaining ignores are narrow and justified; known safe dead fixture proves the
   checker would fail when appropriate.
5. Remove accepted code/config/dependency candidates in small coherent groups.
   Completion after each group: focused checks and import/config searches pass;
   lockfile matches package manifest.
6. Reconcile engineering docs and links. Completion: one authoritative current
   workflow remains and link checking/search finds no references presented as
   current to deleted guidance.
7. Delete expired compatibility layers and run negative searches/tombstones.
   Completion: each prior expiry has evidence of removal or an approved new owner.
8. Run full Milestone M4 verification and inspect the built application at the
   critical guest/auth/Strava/activity paths. Completion: no capability loss and
   no untracked generated artifacts.

## Required automated proof

- format, lint, type, unit, dead-code, cycle, environment, retired-path, and E2E
  gates from the final package scripts;
- repository searches for every removed import/export/doc link/config key;
- package-manager dependency/lockfile consistency;
- a controlled temporary dead fixture (not committed) demonstrates Knip detects
  the class of files previously hidden by broad ignores;
- link/reference check for moved/deleted current engineering docs;
- focused tombstone tests named by the accepted inventory.

```sh
npm run verify
npm run test:e2e:production
git diff --check
```

## Required manual or visual proof

No visual redesign proof. Run a final disposable local smoke at 1440 and 390 for
guest landing/auth, creator environment/invites, Strava connection/sync, Review,
and activity detail. Record each route/result; screenshots are required only if
the final program changed or unexpectedly affected the visible surface.

## Migration, rollout, and rollback

No data migration. Delete in coherent commits so an incorrectly classified
candidate can be restored without reverting unrelated refactors. Package/config
rollback restores both manifest and lockfile. Documentation reconciliation must
retain history in version control, not duplicate stale files in the live tree.
No deployment is authorized.

## Stop conditions

- a candidate has only one weak unused signal or an unresolved dynamic reference;
- current and stale docs disagree on product behavior with no accepted owner;
- deletion removes a supported route/script/capability or changes build output;
- Knip requires another broad ignore whose cause is unknown;
- full verification fails in an unrelated/unattributable way after one focused
  confirmation; or
- cleanup requires a feature, migration, deployment, or external-service change.

## Completion criteria

- Every candidate has a documented delete/keep/move/blocked decision and proof.
- Broad dead-code blind spots and all accepted compatibility expiries are gone.
- One current agent/development workflow is authoritative and links are valid.
- Dependencies/config/lockfile agree and the full Milestone M4 gate passes.
- Final smoke shows no lost product capability or environment/security guardrail.

## Completion evidence

- `npm run verify` passed: environment and retired-path checks, typecheck, lint,
  formatting, 766 unit tests, Knip, cycle detection, and 61 E2E tests.
- `npm run test:e2e:production` passed its disposable build/start smoke.
- `git diff --check` passed after the final documentation and source review.
