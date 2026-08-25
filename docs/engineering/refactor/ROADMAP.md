# Implementation roadmap

## Current program state

Product implementation paused after R0 while the product direction and task
contract were refined. R1 is the first completed packet. Every later packet
remains non-executable until both its file and this index say `ready`.

The state vocabulary is `draft | ready | done | blocked`. `blocked` is reserved
for a genuinely external dependency; a local implementation or test failure is
owned by the builder.

## Task index

| ID | Status | Delivery class | Risk/model | Outcome | Packet |
| --- | --- | --- | --- | --- | --- |
| R0 | done | documentation/tooling | medium, Terra medium | Trustworthy tooling baseline. | [R0](tasks/R0-tooling-baseline.md) |
| R1 | done | API/backend | medium, Terra medium | Affordable developer loop and truthful local production smoke. | [R1](tasks/R1-developer-loop.md) |
| R2 | draft | API/backend | high, Terra high | Validated runtime configuration without weaker environment isolation. | [R2](tasks/R2-runtime-configuration.md) |
| R2M | draft | API/backend | high, Terra high | Additive, idempotent schema migration runner. | [R2M](tasks/R2M-additive-migrations.md) |
| R3 | draft | API/backend | high, Terra high | Creator/member capabilities without cross-owner authority. | [R3](tasks/R3-creator-authorization.md) |
| R4 | draft | frontend design contract | medium, Sol high | Approved creator-only environment indicator contract. | [R4](tasks/R4-environment-indicator-contract.md) |
| R5 | draft | full stack | medium, Terra medium | Server-derived creator-only environment indicator. | [R5](tasks/R5-environment-indicator-implementation.md) |
| R6 | draft | API/backend | high, Terra high | Owner-safe invite issuance, listing, and revocation module. | [R6](tasks/R6-invite-module.md) |
| R7 | draft | full stack | high, Terra high | Creator generates an email-bound invite and copies a ready message. | [R7](tasks/R7-creator-invite-ui.md) |
| R8 | draft | full stack | medium, Terra medium | Coherent sign-in/sign-up continuation and access errors. | [R8](tasks/R8-auth-journey.md) |
| R9 | draft | full stack | high, Terra high | Initial Strava history is confirmed; only later activities enter Review. | [R9](tasks/R9-initial-strava-import.md) |
| R10 | draft | API/backend | medium, Terra medium | Server actions grouped by owning feature. | [R10](tasks/R10-server-action-organization.md) |
| R11 | draft | API/backend | high, Terra high | Deep Strava connection, transport, sync, and cache interfaces. | [R11](tasks/R11-strava-module-deepening.md) |
| R12 | draft | full stack | medium, Terra medium | Activity and performance hotspots split by reason to change. | [R12](tasks/R12-activity-ui-hotspots.md) |
| R13 | draft | documentation/plan | medium, Luna high | Proven dead code/files removed and documentation converged. | [R13](tasks/R13-cleanup-convergence.md) |
| R14 | draft | API/backend | high, Terra high | Persisted initial-import job state exposes real stages and counts. | [R14](tasks/R14-import-progress.md) |
| R15 | draft | full stack | high, Terra high | Strava gear materializes locally with explicit origin/lifecycle rules. | [R15](tasks/R15-strava-gear-materialization.md) |
| R16 | draft | full stack | medium, Terra medium | Performance summary data and week/month controls work from imported summaries. | [R16](tasks/R16-performance-first-value.md) |
| R17 | draft | full stack | medium, Terra medium | One-time, skippable first-login platform onboarding. | [R17](tasks/R17-welcome-onboarding.md) |
| R18 | draft | full stack | high, Terra high | One-time, skippable post-connection progress and Activation Summary. | [R18](tasks/R18-connection-activation.md) |
| R19 | draft | full stack | high, Terra high | Athlete performance profile stores nullable values with provenance. | [R19](tasks/R19-athlete-performance-profile.md) |
| R20 | draft | documentation/plan | high, Sol high | Training Analyst evidence, theory, privacy, and output contract. | [R20](tasks/R20-training-analyst-contract.md) |
| R21 | draft | full stack | high, Terra high | Bounded Training Analyst hypotheses with confirm/edit/reject feedback. | [R21](tasks/R21-training-analyst-hypotheses.md) |

Current packet files are under `tasks/`. R2-R21 remain drafts until each receives
a current-truth refresh, exact target/test commands, and any remaining design or
external decision required by the new task contract.

## Dependency direction

```text
R0
 └─ R1
     ├─ R2 ─ R2M
     │          ├─ R3 ─┬─ R4 ─ R5
     │          │      └─ R6 ─ R7 ─ R8
     │          └─ R9 ─ R14 ─ R18
     │                 ├─ R15
     │                 ├─ R16
     │                 └─ R19 ─ R20 ─ R21
     └─ R10

R17 depends on R2M and R8 and may be delivered before Strava connection.
R18 depends on R9, R14, R15, and R16, but not R17. The two experiences may be
delivered in either order because eligibility, persistence, skip/completion,
and replay semantics are independent. If both exist, R17 hands off to the same
connection entry that already works without welcome state.
R11 follows R9/R14 so it deepens proven boundaries rather than guessing them.
R12 follows R16 and R19. R13 closes only after the changed product slices.
```

This graph is a planning direction, not permission to run tasks automatically.
When a packet becomes ready, replace prose dependencies with exact done IDs.

## Packet-refinement order

1. Convert R1 to the new task contract and decide whether its production smoke
   is still worth the cost under the new validation matrix.
2. Reconcile R2/R2M/R9 so the initial-import fix has the smallest safe migration
   path and does not inherit unnecessary architecture work.
3. Specify R14 and R18 together: the backend must expose truthful progress and
   the UI must never animate invented work or percentages.
4. Specify R15's provider-origin lifecycle before importing any gear.
5. Specify R16/R19 around summary-derived immediate value versus later
   detail/stream enrichment.
6. Specify creator/access tasks R3-R8 without broad admin semantics.
7. Keep R20/R21 draft until Marcos supplies the curated theory library and the
   privacy/provider contract is explicit.

## Organization direction

Move a touched slice only when its feature interface is known:

```text
src/
  app/                  framework routes/pages/composition
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
    db/
    storage/
    telemetry/
  components/ui/        generic visual primitives only
```

Keep `src/lib` during incremental migration. Do not create mandatory global
`core/application/adapters` folders or move files solely to match a diagram.
