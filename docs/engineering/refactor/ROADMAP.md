# Refactor roadmap

## Sequencing rule

Only tasks marked **ready** may be dispatched. A later task starts after every
dependency is **accepted**, not merely implemented. Update target files and
baseline evidence immediately before marking a packet ready; long-range file
moves are intentionally not frozen months ahead of execution.

The task-index `Status` column is canonical execution state. Follow
`ORCHESTRATION.md` for model selection, one-writer ownership, builder
self-review, deferred independent review, evidence, automatic progression, and
milestone context resets.

## Dependency graph

```text
R0 tooling baseline
  -> R1 developer loop
      -> R2 runtime configuration
          -> R2M additive migration runner
              -> R3 creator authorization
                  -> R4 environment indicator contract
                      -> R5 environment indicator implementation
                  -> R6 invite module
                      -> R7 creator invite UI
                          -> R8 auth journey
              -> R9 initial Strava import cutoff
                  -> R11 Strava module deepening

R1 -> R10 server-action organization
R10 + R11 -> R12 activity/UI hotspots
R0..R12 -> R13 dead-code and documentation convergence
```

R3–R8 and R9 are independent only after R2M. They may run separately in
isolated worktrees if the user explicitly asks for parallel agents and their
migrations are serialized. Otherwise run them sequentially as one
implementation stream.

## Task index

| ID | Status | Risk | Outcome | Packet |
| --- | --- | --- | --- | --- |
| R0 | blocked | medium | Restore one trustworthy quality baseline around the in-progress lint migration | [R0](tasks/R0-tooling-baseline.md) |
| R1 | planned | medium | Add an affordable inner loop and an explicit local production-mode smoke | [R1](tasks/R1-developer-loop.md) |
| R2 | planned | high | Centralize validated runtime semantics without weakening environment isolation | [R2](tasks/R2-runtime-configuration.md) |
| R2M | planned | high | Replace the exact-version schema gate with explicit additive migrations | [R2M](tasks/R2M-additive-migrations.md) |
| R3 | planned | high | Add creator/member operational authorization without cross-owner privilege | [R3](tasks/R3-creator-authorization.md) |
| R4 | planned | medium | Produce and approve the creator-only environment-indicator design contract | [R4](tasks/R4-environment-indicator-contract.md) |
| R5 | planned | medium | Implement the approved environment indicator | [R5](tasks/R5-environment-indicator-implementation.md) |
| R6 | planned | high | Deepen invite issuance/list/revocation behind a creator-authorized module | [R6](tasks/R6-invite-module.md) |
| R7 | planned | high | Let creator generate and copy a ready-to-send invite without exposing recoverable tokens | [R7](tasks/R7-creator-invite-ui.md) |
| R8 | planned | medium | Make login/signup entry and post-signup continuation coherent | [R8](tasks/R8-auth-journey.md) |
| R9 | planned | high | Keep initial Strava history out of Review and make retry complete | [R9](tasks/R9-initial-strava-import.md) |
| R10 | planned | medium | Split the server-action seam by owning feature | [R10](tasks/R10-server-action-organization.md) |
| R11 | planned | high | Deepen Strava provider, connection, sync, and cache modules | [R11](tasks/R11-strava-module-deepening.md) |
| R12 | planned | medium | Refactor activity page/chart/data hotspots by reason to change | [R12](tasks/R12-activity-ui-hotspots.md) |
| R13 | planned | medium | Remove proven dead code and reconcile current documentation | [R13](tasks/R13-cleanup-convergence.md) |

## Milestones

### M1 — Trusted development loop

R0–R2M accepted. The baseline is green; environment configuration is testable;
local production-mode smoke cannot reuse a development server or reach remote
resources; current databases can advance through explicit additive migrations.
Run the full `npm run verify` gate.

### M2 — Creator operations

R3–R8 accepted. Creator capability is server-authorized; member isolation is
unchanged; the current environment is visible only to creator; creator can
issue/list/revoke invitations and copy a one-time ready-to-send message;
login/signup continue into the existing Strava onboarding path. Run full
verification plus 1440/390 visual proof.

### M3 — Correct Strava ingestion

R9 and R11 accepted. Initial history is confirmed, post-cutoff activities are
pending, partial initial imports resume completely, and the Strava module has a
small tested interface. Run full verification plus the local provider story.

### M4 — Navigable codebase

R10–R13 accepted. Feature ownership is discoverable, the largest change
hotspots have cohesive interfaces, and deletion/documentation evidence is
current. Run the full gate and inspect the final dependency graph.

## Target organization

This is a direction applied by touched slices, not a bulk-move task:

```text
src/
  app/                 Next entry points and route/page composition
  features/
    access/
    invites/
    strava/
    activities/
    gear/
    insights/
  server/
    config/
    db/                shared DB client/migration infrastructure
    storage/
    telemetry/
  components/ui/       generic visual primitives only
```

Keep `src/lib` during migration. A touched module moves only when its owning
feature and new interface are clear. Do not create `core/`, `application/`, and
`adapters/` as mandatory global layers.
