# Refactor execution workflow

## Purpose

This workflow moves expensive reasoning into bounded task packets so a fresh,
lower-cost implementation model can execute without selecting product behavior,
inventing architecture, or weakening safety checks.

`ORCHESTRATION.md` owns agent topology, concrete Codex model assignment,
context budgets, builder self-review, deferred independent review, automatic
progression, and evidence persistence. This file owns the lifecycle and quality
gate inside one task.

One task is one implementation stream. Tasks run in the dependency order in
`ROADMAP.md`; parallel work is allowed only when the roadmap explicitly marks
tasks independent and their permitted files do not overlap.

## Authority

`AGENTS.md` is the operating authority. Current code and executable tests are
the behavior baseline. Accepted decisions under `docs/product/` own product
meaning. Selected and approved Figma frames own visual intent. This workflow
owns refactor sequence and task readiness; it does not override those sources.

`docs/engineering/ORCHESTRATION.md` describes an older issue/PR-centered loop.
Do not require its GitHub Project, draft-PR, builder/reviewer, or merge steps
unless the current user request asks for them. Reconcile or retire that document
in the cleanup task.

## Task states

```text
planned -> ready -> in_progress -> implemented -> verified -> accepted
             |           |             |
             +-----------+-------------+-> blocked
```

- **planned:** outcome is known but at least one decision, dependency, target,
  or verification method remains unresolved.
- **ready:** a fresh-context builder can complete the task without choosing
  product behavior, security policy, file architecture, or visual direction.
- **in_progress:** one builder owns the task and has recorded the starting git
  state.
- **implemented:** the requested diff exists and focused checks pass.
- **verified:** every automated and manual criterion in the packet has evidence.
- **accepted:** the user or an explicitly authorized milestone orchestrator
  accepts the locally verified and self-reviewed result, records independent
  review as completed or deferred, and allows the next dependency to start.
  Human and live-risk gates named by `ORCHESTRATION.md` cannot be self-accepted
  or bypassed by deferred review.
- **blocked:** a named stop condition prevents safe progress.

Only the planner changes a task from `planned` to `ready`. A builder must stop
if a packet marked ready still requires a material decision.

## Ready gate

Before dispatch, the planner verifies that the task file contains all of these:

1. one user or developer outcome;
2. current behavior with direct file/test evidence;
3. locked decisions and invariants;
4. exact permitted scope and explicit non-goals;
5. expected module interface or file ownership direction;
6. migration, data, auth, environment, external-service, and UI impact;
7. focused automated checks with observable assertions;
8. manual/browser proof when behavior is user-visible;
9. compatibility removal or expiry rules;
10. stop conditions and a checkable completion criterion.

A filename list alone is not a ready packet. “Keep behavior unchanged” must be
expanded into the exact behaviors that are protected.

## Builder loop

### 1. Establish the baseline

1. Read `AGENTS.md`, this workflow, the assigned task, and every source named
   under **Required context**.
2. Run `git status --short --branch` and record existing changes. Existing
   changes belong to somebody else unless the packet explicitly assigns them.
3. Read the relevant guide under `node_modules/next/dist/docs/` before changing
   Next.js routes, layouts, Server Components, Server Actions, caching, proxy,
   or runtime behavior.
4. Run the packet's baseline checks. Confirm a newly observed failure once.
5. Stop if an overlapping unowned change or failing prerequisite prevents an
   attributable result.

Completion criterion: the builder can name the starting commit/branch, existing
dirty files, protected behavior, and exact focused checks before editing.

### 2. Characterize the interface

Add or identify tests at the module interface before moving implementation.
Preserve observable results, authorization, redirects, error modes, ordering,
and persistence. Prefer:

- pure tests for in-process rules;
- real disposable SQLite for local-substitutable persistence;
- a narrow injected port and local double for true external providers;
- route tests for transport parsing/mapping only; and
- E2E for the few cross-layer stories that establish user-visible truth.

Do not introduce a port that has only one meaningful adapter. Do not create a
generic storage interface that mirrors database functions.

Completion criterion: every behavior named in the task has a test location or
an explicit manual proof before structural changes begin.

### 3. Implement the smallest complete slice

Keep the diff inside permitted scope. New modules are organized by feature and
present a small interface. Framework entry points parse trusted/untrusted input,
resolve server identity, call the feature module, and map its result.

Compatibility exports may exist only while callers move inside the same task.
Remove them before completion unless the packet names an owner and expiry task.

Completion criterion: the new interface serves every migrated caller, the old
implementation is removed or has a named expiry, and no unrelated behavior was
changed.

### 4. Verify proportionally

Use the task's required levels:

| Level | Evidence |
| --- | --- |
| V0 | format/lint/type feedback for edited files or the repository command |
| V1 | focused pure/module tests |
| V2 | fast repository gate once task R1 provides it |
| V3 | real browser at the packet's desktop and narrow widths |
| V4 | full `npm run verify` at milestones named by `ROADMAP.md` |
| V5 | local production build/start smoke using disposable resources |

Report only commands that actually passed. A typecheck is never the sole proof
of runtime behavior.

Completion criterion: every required level has exact command/result evidence,
or the task is not verified.

### 5. Self-review and hand off

The builder performs this review after implementation and required verification,
using the task's base commit rather than memory of what it changed:

1. reread the task's locked decisions, invariants, non-goals, completion
   criteria, and stop conditions;
2. inspect the complete diff from the recorded base commit, plus `git status`,
   all new/deleted files, and `git diff --check`;
3. trace every completion criterion to a changed file and concrete automated or
   manual proof;
4. confirm behavior, authorization, owner scope, environment isolation, data
   semantics, provider effects, UI states, and compatibility cleanup named by
   the packet;
5. confirm no secret, token, owner identifier, production data, generated
   artifact, or unrelated working-tree change was captured or modified;
6. inspect test output for skipped, flaky, or falsely passing checks and name
   anything not actually exercised; and
7. repair issues found during this review, rerun affected checks, and repeat the
   relevant inspection before handing off; and
8. once every criterion is green, confirm the branch is local `main` at the
   expected base, stage only permitted-scope files by explicit path, inspect
   `git diff --cached`, and create one coherent implementation commit.

Unknown, unexecuted, or ambiguous criteria must be reported as blockers; they
cannot be described as verified or committed. If `main` moved unexpectedly,
stop instead of rebasing, merging, or absorbing somebody else's work. Return:

```md
Task: <ID and title>
Outcome: <observable result>
Files changed: <grouped list>
Implementation commit: <sha>
Protected invariants: <how each remained true>
Automated checks: <exact commands and results>
Manual/browser proof: <route, width, result, artifact or not applicable>
Compatibility removed/remaining: <exact exports/files and expiry>
Data/auth/environment/external impact: <exact statement>
Existing unrelated changes preserved: <list>
Self-review:
  - Packet criteria reread: complete | <gap>
  - Complete diff/status/new/deleted files inspected: complete | <gap>
  - git diff --check: pass | <result>
  - Scope/non-goals/compatibility checked: complete | <gap>
  - Security/data/environment/provider effects checked: complete | <gap>
  - Skipped or unexercised proof: none | <exact list>
  - Repairs made during self-review: none | <files and rerun proof>
Remaining blocker or next task: <ID/reason>
```

The orchestrator may reject this handoff if a checklist entry is generic,
unsupported by evidence, or hides an unknown. This is a completeness check, not
an independent reviewer identity.

The direct commit is local-only authority. The builder does not push, deploy,
access remote/shared data, or trigger external effects. A later orchestrator
correction is a new attributable commit; do not rewrite published or shared
history.

## Model routing

Use the concrete Codex roles and task/model matrix in `ORCHESTRATION.md`. A task
packet may raise its builder reasoning level based on local risk. Authentication,
owner isolation, migrations, invite authorization, connection secrets, and
initial-sync classification use a high-reasoning builder and focused regression
proof. Their independent review may be batched after local acceptance, but it
must be complete before the related preview, production, shared-data, or real
provider effect is authorized.

## Program guardrails

- Every test write targets a disposable file database owned by that test run.
- Production, preview, shared databases, real Strava, live credentials, Vercel
  deployments, and external communication require separate explicit authority.
- Creator authorization never broadens `OwnerContext`; it grants operational
  capabilities only.
- Environment indicators are server-derived displays, never environment
  switches.
- Initial import and incremental sync use a persisted cutoff, not browser time
  or a value recomputed during pagination.
- A deletion needs import evidence, convention/entrypoint review, and a passing
  gate. Line count alone never justifies a split or deletion.

## Mandatory stops

Stop and report the exact blocker when the task would require:

- choosing unresolved product copy, visual layout, role semantics, review-cutoff
  semantics, or a migration strategy;
- reading or changing a live secret, remote/shared data, or a deployment;
- destructive repair of existing user data without an approved dry run,
  before/after counts, and rollback;
- weakening a relevant test or environment check;
- changing an Accepted product decision without recording and accepting the new
  decision; or
- editing an unowned dirty file that overlaps the task.
