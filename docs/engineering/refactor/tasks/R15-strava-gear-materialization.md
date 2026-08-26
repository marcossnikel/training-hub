# R15 — Materialize Strava gear with explicit lifecycle

> Historical task context: this packet records the pre-R11 gear seam; current
> Strava ownership is recorded in the architecture document.

**Status:** done
**Delivery class:** full stack
**Risk/model:** high — Terra high
**Depends on:** R2M and R9 done
**Unlocks:** R18

## Outcome

Shoes and bikes returned or referenced by Strava appear in the owner's Gear
page and can match new Review activities without double-counting imported
history or changing manual gear lifecycle.

## Current truth

- `src/components/gear-sections.tsx` renders only local `shoes` and `bikes`.
  Provider gear is fetched as matching/dropdown options, not persisted.
- `src/lib/strava.ts` maps provider gear and can match only an already-created
  local row with the provider ID.
- `src/components/review-flow.tsx` cannot confirm a run when the owner has no
  active local shoes, creating new-user friction.
- `src/lib/db/strava-auth.ts` disconnect currently preserves all gear and clears
  provider mappings because existing gear is assumed manual.
- Existing schemas/types have no manual-versus-provider origin.

## Locked decisions

1. Local gear has explicit origin `manual` or `strava`; origin is server-owned.
2. Provider-created rows are idempotently keyed by owner, gear kind, and Strava
   gear ID. A provider ID never links owners or shoe/bike kinds.
3. Materialize gear returned by the athlete endpoint and any gear ID referenced
   by an imported activity. Missing metadata produces a clearly labeled
   provider placeholder, not a dropped activity relationship.
4. Store the provider-reported lifetime distance in its original meter meaning
   as a nullable, non-negative source value with `provider_observed_at`. It may
   refresh upward or downward when a later successful provider response changes;
   never take `MAX`, add deltas, or convert an absent value to zero.
5. For `strava` origin, that latest provider snapshot is the displayed current
   odometer. Confirmed local activity assignments/splits remain evidence and
   breakdown but are not added to it. For `manual` origin, current mileage
   remains `initial_km + confirmed local mileage`; a linked provider snapshot is
   a separately labeled reference and never changes the manual total.
6. A missing/failed provider refresh preserves the last successful value and
   observation time as stale. A gear item that has never supplied distance has
   an unknown odometer, not `0 km`.
7. Provider name/type/retired state may refresh while the row remains Strava
   origin. Athlete edits that need to survive provider refresh require explicit
   local override fields; do not silently convert origin.
8. A gear item absent from one provider response is not deleted. Track
   `last_seen_at`; provider retirement marks inactive only when returned as such
   or when an accepted provider rule proves retirement.
9. Disconnect deletes Strava-origin gear and mappings as part of the D-017
   Strava graph. Manual gear survives; its optional provider mapping and
   provider-reported snapshot are cleared.
10. Reconnect after true disconnect creates fresh Strava-origin rows for the new
   connection lifecycle. Reauthorization without disconnect updates existing
   rows idempotently.
11. Existing manual gear behavior, mileage, photos, notes, and archive state are
    never overwritten by provider materialization.

## May change

- additive gear origin/provider-distance/observation/last-seen migration;
- feature-owned provider gear mapper and upsert operations;
- R9/R14 import composition and result counts;
- disconnect graph inventory;
- Gear page origin/odometer/unknown/stale presentation and Review matching UI;
- local provider fixtures and integration tests.

The builder may repair behavior-preserving gear matching and mileage arithmetic
inside this feature. Any destructive merge of manual/provider gear requires a
new product decision.

## Must remain true

- every read/write is owner-scoped;
- historical imports do not create review splits;
- Review confirmation keeps one local assignment while Strava-origin odometer
  and manual-origin mileage formulas remain source-separated;
- manual gear and data survive disconnect;
- remote/provider data is never needed for tests;
- names and provider metadata are rendered as untrusted text.

## Non-goals

- merging likely duplicate manual and provider gear automatically;
- inferring provider odometer deltas from activity history;
- activity detail/stream enrichment;
- Gear page redesign beyond rendering correct imported rows/states.

## Implementation map

1. Add origin and source-separated odometer domain rules plus additive migration.
   Completion: current rows become `manual` and retain exact local mileage;
   provider fields are nullable.
2. Implement provider-to-local materialization with deterministic placeholders.
   Completion: repeated sync produces one row per owner/kind/provider ID.
3. Implement origin-aware read models. Completion: Strava-origin current
   odometer equals the exact provider snapshot regardless of historical/new
   local assignments; manual current mileage retains the existing formula and a
   linked provider distance is returned separately.
4. Apply automatic matching for new pending activities. Completion: a new user
   can review a run/ride with imported gear without manual pre-creation.
5. Update disconnect lifecycle. Completion: Strava-origin rows disappear while
   manual rows and their mileage survive with mapping cleared.
6. Expose imported/updated/placeholder counts to R14. Completion: counts match
   committed owner rows and contain no provider payload.

## Acceptance

- One shoe and bike fixture appear locally after import and remain idempotent.
- Manual gear is never overwritten or deleted by sync/disconnect.
- Historical and post-cutoff activity assignment never changes a Strava-origin
  provider odometer; manual gear continues to add confirmed local mileage once.
- Provider distance can increase, decrease, remain stale, or be unknown without
  being accumulated, clamped, or rendered as zero.
- Review automatically selects matching imported gear when valid.
- Missing/retired/provider-absent states are explicit and safe.
- Two owners with overlapping provider gear IDs remain isolated.
- Disconnect deletes only Strava-origin gear graph.

## Validation

Add `src/features/gear/strava-gear.integration.test.ts` using disposable SQLite
plus the loopback provider. It owns schema upgrade, idempotent upsert,
placeholder, rename/retirement, provider-distance increase/decrease/unknown/
stale, source-separated mileage reads, Review match, two-owner collision,
reauthorization, disconnect, reconnect, and R14 committed-count parity.

```sh
npx vitest run src/features/gear/strava-gear.integration.test.ts
npx playwright test e2e/byo-connection.spec.ts e2e/gear.spec.ts e2e/review.spec.ts
```

Do not run the full repository gate. Make the focused integration suite green
first, then start the disposable loopback-provider app and iterate connection,
`/gear`, Review, and disconnect at 1440/390 until the focused Playwright specs
and direct inspection pass: imported/manual origin, exact provider odometer and
observation/stale label, unknown distance without zero, local manual mileage,
automatic match, and post-disconnect manual survival.

## Migration, compatibility, and rollback

Add origin with safe `manual` default and nullable provider distance/timestamps.
Provider-created rows are deletable under D-017; manual rows are not. Rollback
leaves imported rows but old code must not reinterpret provider odometer as
`initial_km` or misclassify origin during disconnect, so rollout order keeps the
new read/disconnect logic active until a forward fix. No remote migration is
authorized.

## Stop only if

The provider distance unit/nullability or kind/ID contract remains genuinely
unavailable after inspecting installed/local provider documentation and needs
external clarification; Marcos changes D-017/D-025 gear lifecycle; or proof
requires real Strava, a shared database, remote migration, or deployment.

Schema/default migration, origin arithmetic, placeholders, provider refresh,
matching, disconnect cleanup, fixtures, responsive UI, and all other
recoverable local findings are owned and fixed by the builder within this task.

## Finish

Both named focused commands pass with disposable data and real-browser proof,
R15 is marked done in the roadmap, and the complete attributable change is one
local-main commit with no push, migration execution, or deployment.
