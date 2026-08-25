# Training Hub implementation packets

This folder turns product and architecture decisions into small, executable
tasks. A fresh implementation model should not need the planning chat.

## Reading routes

- **Implement one task:** read `AGENTS.md` and only the assigned queued packet.
- **Prepare or refine packets:** read [WORKFLOW.md](WORKFLOW.md),
  [ROADMAP.md](ROADMAP.md), and [TASK_TEMPLATE.md](TASK_TEMPLATE.md).
- **Run several queued tasks automatically:** use the optional lightweight
  runner in [ORCHESTRATION.md](ORCHESTRATION.md).
- **Review later:** start a separate review session only when Marcos asks. No
  reviewer is part of ordinary task completion.

## Manual invocation

```text
Realize Rxx.
```

That is the complete user prompt. `AGENTS.md` and the roadmap map it to the
packet and finish contract. Packet drift, missing local fixtures, and outdated
paths are corrected by the builder in that same session. Only external/decision
stop conditions return control to Marcos.

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
