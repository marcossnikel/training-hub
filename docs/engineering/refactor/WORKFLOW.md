# Refactor execution workflow

## Default loop

One fresh Codex task implements one ready packet:

```text
Marcos: "Realize Rxx"
  -> builder reads AGENTS.md + Rxx
  -> inspects current main and dirty files
  -> implements and fixes recoverable in-scope failures
  -> proves the task according to its delivery class
  -> inspects the complete diff and repository status
  -> marks Rxx done and commits once to local main
  -> returns SHA, checks, browser paths, and any external blocker
```

There is no required orchestrator, reviewer, feature branch, pull request,
evidence document, or second program-state commit. A separate review session is
optional only when Marcos asks for one.

## Authority

In descending order:

1. the current user request;
2. `AGENTS.md`;
3. accepted product decisions and approved Figma frames;
4. the assigned ready packet;
5. current code and executable tests as evidence of existing behavior.

A task packet may narrow scope but cannot broaden external authority or overturn
an accepted product decision.

## Task states

- **draft:** useful plan, but not executable yet.
- **ready:** self-contained; `Realize Rxx` authorizes execution.
- **done:** implementation, required proof, roadmap update, and local commit are
  complete.
- **blocked:** reserved for a genuinely external dependency or decision that the
  builder cannot safely resolve. Local failures are not blockers.

The task file and `ROADMAP.md` must agree. Only a ready task may be implemented.

## Ready packet contract

A ready packet contains:

1. one observable outcome;
2. current truth with exact files, call sites, tests, and confirmed failure
   mechanism where relevant;
3. locked behavior, product, data, authorization, environment, and UI decisions;
4. exact owned scope plus an explicit discovered-failure policy;
5. protected invariants and non-goals;
6. implementation steps, each ending in an observable result;
7. one delivery class and concrete proof;
8. migration, compatibility, rollback, and external-effect boundaries; and
9. only the stop conditions that truly require Marcos or external access.

Long prose is not a substitute for authority at likely failure boundaries. For
example, a tooling task must say whether deterministic behavior-preserving
repairs exposed by the chosen preset are allowed and how far that permission
extends.

## Builder loop

### 1. Establish current truth

- Read `AGENTS.md`, the assigned packet, and only the sources it names.
- Inspect `git status --short --branch`, the current commit, and overlapping
  changes. Preserve all unrelated work.
- Read the relevant local Next.js guide before changing framework behavior.
- Confirm the packet still matches current files and behavior. Refresh small,
  non-product details inside the task when needed; do not reopen locked choices.

### 2. Implement autonomously

- Deliver the smallest complete vertical slice, not a partial file move.
- Keep framework entry points thin and organize changed code by feature and
  reason to change.
- Resolve attributable and recoverable problems in the same task, including
  focused fixtures, compatible callers, typing, linting, and behavior-preserving
  repairs inside the packet's boundary.
- Do not create generic ports, global layers, or compatibility exports without a
  second caller or a named removal point.

### 3. Validate by delivery class

| Delivery class | Required proof |
| --- | --- |
| API/backend | Focused integration tests at the changed boundary. Use disposable SQLite and local provider doubles where applicable. |
| Full stack | Focused integration tests plus real-browser iteration through the complete user story. |
| Frontend | Real-browser iteration through named states and interactions. |
| Documentation/plan | Link/reference inspection, search for contradictions, `git diff --check`, and status review. |

For browser work, exercise the relevant authenticated/guest state at 1440 px and
390 px, including loading, empty, error/retry, keyboard/focus, responsive, and
reduced-motion behavior named by the packet. Screenshots or recordings are
required only when the packet requests durable visual evidence.

Run the full repository gate only when the packet or a release milestone says
so. Never use typecheck alone as runtime proof.

### 4. Finish in the same task

- Re-read the outcome, decisions, invariants, acceptance checks, and non-goals.
- Inspect the complete diff from the starting commit, all new/deleted files,
  `git diff --check`, and `git status`.
- Fix in-scope findings and rerun affected proof.
- Change the packet and roadmap state to `done` in the same implementation
  commit.
- Stage explicit attributable paths, inspect the staged diff, and create one
  coherent commit directly on local `main`.
- Do not push, deploy, use shared/live data, or trigger external effects.

Return only: outcome, commit SHA, changed areas, exact passed integration tests,
browser paths/viewports when applicable, and a genuine remaining external
blocker if one exists.

## Stop only when

The work needs a credential/account the agent cannot access, a production or
shared resource, deployment, live billing, external communication, destructive
material-data action, a new or changed accepted product decision, resolution of
a security/privacy ambiguity, or an overlapping unowned dirty edit that cannot
be preserved. Explain the dependency precisely; do not manufacture a blocked
state for a recoverable local failure.
