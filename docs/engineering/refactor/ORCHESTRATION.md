# Optional batch runner

The default and cheapest mode is a fresh user-started task for each queued packet:
`Realize Rxx`. This document defines only the optional automatic mode.

## When to use it

Use a batch runner only when Marcos explicitly asks to execute a milestone or a
sequence of queued tasks automatically. Each builder refreshes its own local
packet facts; the runner does not add a planning stage.

## Topology

```text
one lightweight runner
  -> selects the next queued dependency
  -> starts one fresh builder
  -> waits for its final result
  -> confirms task state=done and a local commit exists
  -> starts the next queued sibling builder
```

The runner does not edit code, review diffs, rerun tests, create evidence files,
or reinterpret task decisions. Builders do not recursively start the next
builder. This keeps each implementation context small and makes every commit
attributable.

## Model routing

| Work | Default Codex model |
| --- | --- |
| Exact mechanical cleanup or documentation packet | Luna, high reasoning |
| Ordinary refactor, feature, or UI packet | Terra, medium reasoning |
| Auth, ownership, migration, Strava sync, privacy, or AI boundary | Terra, high reasoning |
| Product discovery, difficult architecture, or later independent review requested by Marcos | Sol, high reasoning |
| Optional batch runner | Luna, medium reasoning |

A task may raise its model when current evidence shows more risk. Do not use an
expensive persistent model merely to relay task text.

## Runner algorithm

1. Read only `AGENTS.md` and `ROADMAP.md`.
2. Select the first `queued` task in roadmap priority order whose dependencies
   are `done`.
3. Start one fresh builder with: `Realize Rxx. Read AGENTS.md and <packet>.`
4. Wait. Do not duplicate its context or perform a second acceptance pass.
5. Continue only when the builder returns a commit SHA and both task and roadmap
   say `done`.
6. Stop when no executable queued task remains or a builder reports a genuine
   stop condition.

The runner may retry a task in a fresh builder only after a hard session/tool
failure. An implementation or test failure belongs to the active builder, which
must diagnose and repair it inside the task.

## Runner authority

The runner inherits local implementation authority only. It cannot push,
deploy, access shared/live data, create accounts, spend money, send messages, or
change accepted decisions. It pauses for Marcos only at those boundaries, for
security/privacy ambiguity, or when overlapping unowned work makes safe editing
impossible.

## Launch prompt

```text
Execute the queued tasks in milestone <Mx> sequentially. Read AGENTS.md,
docs/engineering/refactor/ROADMAP.md, and
docs/engineering/refactor/ORCHESTRATION.md. Act only as the lightweight runner:
start one fresh builder per queued task, wait for its committed done result, then
start the next. Do not implement, review, rerun proof, create evidence files,
push, deploy, use shared resources, or ask Marcos about recoverable local
failures. Stop only at the external and decision boundaries in AGENTS.md.
```
