# Autonomous delivery system

## Purpose

The Training Hub delivery system has one human-managed **Orchestrator**. The
Orchestrator drives GitHub issues through plan, implementation, independent
review, validation, and a draft PR. Builders and reviewers are ephemeral child
agents, not persistent peer chats that Marcos has to relay between.

This is an autonomous **issue loop**, not an infinite daemon. It keeps moving
through eligible issues while its task is active and usage is available, then
stops with exact evidence whenever it hits a boundary.

## Operating model

```text
GitHub Project → Orchestrator → fresh Builder → fresh Reviewer
       ↑               ↓               ↑             ↓
  status/evidence   plan/select     repair once   accept/reject
       └────────────── draft PR and issue update ────────┘
```

### Orchestrator

The Orchestrator is the only agent Marcos needs to manage. It owns task
selection, product/technical coherence, model routing, child prompts, review
decisions, GitHub status, and final evidence. It does not take a builder's
claim of success as proof.

Use the highest-capability available model for this role. It performs semantic
judgment: selecting an unblocked issue, resolving plan quality, accepting
trade-offs, reviewing high-risk changes, and deciding whether work can
continue.

### Builder

Each Builder receives a fresh-context, self-contained packet. It owns exactly
one issue and one isolated worktree. Default to a balanced lower-cost model for
implementation. It may use a tiny read-only helper only for a clearly bounded
question; it remains responsible for all edits and validation.

### Reviewer

Each Reviewer starts fresh and has no stake in the implementation. It checks
the issue against the diff, runs the required checks where practical, examines
manual/visual evidence, and returns either explicit findings or an approval.
Use a balanced model for authentication, data, Strava, billing, security, or
design-system changes. A lower-cost model is appropriate only for mechanical,
low-risk checks.

## Queue selection

On every loop, the Orchestrator must:

1. Read the Training Hub v0 GitHub Project and the assigned issue.
2. Select the highest-priority open issue that is not blocked and whose
   dependencies are merged or otherwise accepted.
3. Confirm a clean baseline branch and no conflicting active worktree.
4. Read `AGENTS.md`, `docs/product/`, this document, and the relevant design
   or platform documents.
5. Stop rather than skip the queue if product decisions, issue detail, access,
   or a dependency are missing.

The current early sequence is: merge the delivery baseline (#18 and #19),
complete design work for tenant identity/data lifecycle (#21), then begin real
accounts/sessions (#22). Do not use the system to leap ahead to onboarding,
billing, or public launch work.

## Builder packet

Before spawning a Builder, the Orchestrator writes or verifies all of these in
the issue body/comment:

- desired user outcome and acceptance criteria;
- scope and explicit non-goals;
- relevant product decisions and design direction;
- target files/systems and data, auth, privacy, billing, or deployment impact;
- required automated checks and manual/visual validation;
- rollback/reset notes and prohibited actions;
- expected final handoff format.

A missing packet is a planning task for the Orchestrator, not a reason to let
a cheaper Builder infer product behavior.

### Ready for Build gate

An issue is **Ready for Build** only when another fresh-context agent can make
the intended experience without choosing the product or visual design itself.
The Orchestrator must put the issue into a planning/design state, rather than
dispatching a Builder, if any applicable item below is missing:

- a specific user moment, user goal, and success signal;
- primary path, entry point, exit point, and an explicit statement of what is
  not in scope;
- data/evidence meaning, including what must never be implied when data is
  absent, stale, partial, or uncertain;
- a screen or component contract: hierarchy, density, content priority,
  responsive behavior, and copy/voice;
- an interaction and state matrix covering default, hover/focus, press,
  loading, empty, error/retry, success, disabled, and narrow-screen behavior;
- every microinteraction's trigger, feedback, duration/intent, keyboard
  behavior, and reduced-motion fallback;
- reference translation: named source, the specific principle to adopt, and
  what must not be copied or carried over;
- observable acceptance criteria plus automated, manual, accessibility, and
  visual-proof requirements; and
- dependencies, prohibited actions, rollout/rollback, and reset behavior.

The gate prevents polished-looking but generic output. "Make it modern" or a
list of brand names is direction, not an executable design contract.

### Product-surface design contract

For product-facing issues, the design packet must additionally identify:

| Concern | Required decision/evidence |
| --- | --- |
| User feeling | The intended feeling at the decisive moment (for example, calm confidence rather than dashboard overload). |
| Information hierarchy | The one primary decision, the supporting evidence, and what is deliberately de-emphasized. |
| Interaction | Trigger, feedback, motion purpose, focus behavior, keyboard path, and reduced-motion fallback. |
| States | Loading/skeleton, empty/first-use, partial or stale data, error/retry, success, disabled, and responsive states. |
| Voice | Exact high-signal copy or copy rules; no generic AI-summary language or coaching/medical claims. |
| Reference translation | Link/reference, specific idea being adapted, and a no-copy boundary. |
| Visual proof | Named desktop and narrow viewport screenshots (or a short recording when motion matters) plus the review route. |

The design-system foundation issue defines the reusable component, token, and
motion rules behind this contract. Until it is accepted, product-surface code
must not be dispatched for implementation. Planning/specification work may
continue only when it adds the missing contract rather than guessing it.

## Validation and repair loop

1. Builder implements, runs its checks, and provides a structured handoff.
2. Orchestrator checks that all acceptance criteria and required evidence are
   present before commissioning review.
3. Reviewer independently compares the issue, diff, tests, and evidence.
4. If findings are valid, the Orchestrator sends the Builder one consolidated
   repair request. The Builder fixes, reruns affected checks, and hands back
   evidence.
5. The Orchestrator reviews again. A second unresolved failure stops the loop
   and is documented as a blocker rather than generating unlimited retries.
6. On acceptance, create a draft PR using the PR template, comment with the
   validation record, and update the GitHub Project.

No agent may mark an issue Done based only on code generation, a type check, or
the Builder's final message.

## Cost and concurrency guardrails

- One Builder at a time on the critical path; one Reviewer at a time.
- At most two active child agents per issue, plus one optional read-only
  research child before implementation.
- Fresh children receive a compact packet, not the full conversation history.
- No recursive spawning. A Builder cannot delegate its implementation to more
  builders.
- Spend high-capability model use on planning, high-risk review, and difficult
  decisions; use balanced/lower-cost models for bounded execution.
- Close completed child agents promptly. Do not leave idle agents consuming
  concurrency or context.

## Automatic authority

The Orchestrator may, within the assigned issue:

- inspect code, tests, GitHub issues/PRs, logs, and non-secret configuration;
- create isolated branches/worktrees; edit code/docs; run non-destructive
  validation; and repair failures it introduced;
- commit, push, create draft PRs, comment with evidence, and update the
  GitHub Project.

## Mandatory stops

The loop stops and records the exact blocker when it needs to:

- select or create external accounts, credentials, or secret values;
- access a production/shared database, run a production migration, or delete
  material data;
- deploy or promote production; change live billing; create live Stripe
  objects; or bypass TLS/security controls;
- change an Accepted product decision; make a new legal/policy claim; or
  promise unavailable Strava access;
- merge a PR unless it satisfies an explicitly enabled auto-merge policy;
- resolve an ambiguous design/product choice with material user impact;
- work around an unowned dirty worktree, failing baseline, or second failed
  repair cycle.

## Merge policy

Start with draft PRs and manual merge for the tenant/auth foundation. This is
not a bottleneck; it is the calibration period for the autonomous system.

After three clean, independently reviewed PRs, an explicit future decision may
enable auto-merge only for issues labelled `automerge` that have green CI, no
unresolved review findings, and no auth, data, Strava, billing, deployment, or
credential impact. Those high-risk areas remain manual until separately
approved.

## Completion record

Every completed loop leaves this record in the issue/PR:

```md
Outcome delivered:
Acceptance criteria: [met / unmet with reason]
Automated validation: [exact commands and results]
Manual/visual validation: [environment, path, evidence]
Independent review: [agent scope and findings]
Failures found and repaired: [list or none]
Data/auth/billing/deployment impact: [summary]
PR: [link]
Next unblocked issue or blocker: [link/reason]
```
