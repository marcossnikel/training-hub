# Training Hub implementation packets

This folder turns product and architecture decisions into small, executable
tasks. A fresh implementation model should not need the planning chat.

## Reading routes

- **Implement one task:** read `AGENTS.md` and only the assigned ready packet.
- **Prepare or refine packets:** read [WORKFLOW.md](WORKFLOW.md),
  [ROADMAP.md](ROADMAP.md), and [TASK_TEMPLATE.md](TASK_TEMPLATE.md).
- **Run several ready tasks automatically:** use the optional lightweight
  runner in [ORCHESTRATION.md](ORCHESTRATION.md).
- **Review later:** start a separate review session only when Marcos asks. No
  reviewer is part of ordinary task completion.

## Manual invocation

```text
Realize Rxx. Read AGENTS.md and
docs/engineering/refactor/tasks/<Rxx-file>. Treat the ready packet as
self-contained, work directly on local main, implement through its acceptance
checks, fix recoverable in-scope findings, run its delivery-class proof, mark
the task done, commit the attributable paths once, and return the SHA and exact
proof. Do not start another task, reviewer, subagent, push, or deployment.
```

`Realize Rxx` is intentionally enough. If the packet cannot support that prompt,
it remains `draft` and planning must improve the packet before implementation.

## Organization direction

Apply this only when a touched slice has a clear owner; do not bulk-move files:

```text
src/
  app/                 framework entry points and composition
  features/
    access/
    invites/
    onboarding/
    strava/
    activities/
    gear/
    performance/
    insights/
  server/
    config/
    db/                shared database and migration infrastructure
    storage/
    telemetry/
  components/ui/       generic visual primitives only
```

Keep `src/lib` while migration is incremental. Prefer a deep feature interface
over mandatory global `core/application/adapters` layers.
