# R15 — Materialize Strava gear with explicit lifecycle

**Status:** draft
**Delivery class:** API/backend
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
4. Capture provider lifetime distance only once as a baseline. Subtract the
   known distance of imported post-cutoff activities that will later become
   local mileage splits, clamp at zero, and label the result provider-derived.
   Historical R9 activities create no splits.
5. Do not refresh the baseline upward on later syncs; later confirmed local
   activity splits own incremental mileage. This prevents provider odometer plus
   local split double counting.
6. Provider name/type/retired state may refresh while the row remains Strava
   origin. Athlete edits that need to survive provider refresh require explicit
   local override fields; do not silently convert origin.
7. A gear item absent from one provider response is not deleted. Track
   `last_seen_at`; provider retirement marks inactive only when returned as such
   or when an accepted provider rule proves retirement.
8. Disconnect deletes Strava-origin gear and mappings as part of the D-017
   Strava graph. Manual gear survives; its optional provider mapping is cleared.
9. Reconnect after true disconnect creates fresh Strava-origin rows for the new
   connection lifecycle. Reauthorization without disconnect updates existing
   rows idempotently.
10. Existing manual gear behavior, mileage, photos, notes, and archive state are
    never overwritten by provider materialization.

## May change

- additive gear origin/baseline/last-seen migration;
- feature-owned provider gear mapper and upsert operations;
- R9/R14 import composition and result counts;
- disconnect graph inventory;
- local provider fixtures and integration tests.

The builder may repair behavior-preserving gear matching and mileage arithmetic
inside this feature. Any destructive merge of manual/provider gear requires a
new product decision.

## Must remain true

- every read/write is owner-scoped;
- historical imports do not create review splits;
- post-cutoff Review confirmation applies mileage once;
- manual gear and data survive disconnect;
- remote/provider data is never needed for tests;
- names and provider metadata are rendered as untrusted text.

## Non-goals

- merging likely duplicate manual and provider gear automatically;
- continuous odometer reconciliation with Strava;
- activity detail/stream enrichment;
- Gear page redesign beyond rendering correct imported rows/states.

## Implementation map

1. Add origin/baseline domain rules and additive migration. Completion: current
   rows become `manual` and retain exact mileage.
2. Implement provider-to-local materialization with deterministic placeholders.
   Completion: repeated sync produces one row per owner/kind/provider ID.
3. Calculate immutable baseline against R9 cutoff/pending distances. Completion:
   confirming every post-cutoff item yields provider total exactly once for the
   fully observed fixture.
4. Apply automatic matching for new pending activities. Completion: a new user
   can review a run/ride with imported gear without manual pre-creation.
5. Update disconnect lifecycle. Completion: Strava-origin rows disappear while
   manual rows and their mileage survive with mapping cleared.
6. Expose imported/updated/placeholder counts to R14. Completion: counts match
   committed owner rows and contain no provider payload.

## Acceptance

- One shoe and bike fixture appear locally after import and remain idempotent.
- Manual gear is never overwritten or deleted by sync/disconnect.
- Historical and post-cutoff mileage are not double-counted.
- Review automatically selects matching imported gear when valid.
- Missing/retired/provider-absent states are explicit and safe.
- Two owners with overlapping provider gear IDs remain isolated.
- Disconnect deletes only Strava-origin gear graph.

## Validation

Focused integration tests with disposable SQLite and loopback provider: schema
upgrade, idempotent upsert, placeholder, rename/retirement, baseline arithmetic,
Review match, two-owner collision, reauthorization, disconnect, and reconnect.
When made ready, name exact test files and command. Browser rendering belongs to
R18/Gear full-stack validation, not this API task.

## Migration, compatibility, and rollback

Add origin with safe `manual` default. Provider-created rows are deletable under
D-017; manual rows are not. Rollback leaves imported rows but old code must not
misclassify them as manual during disconnect, so rollout order must keep new
disconnect logic active until a forward fix. No remote migration is authorized.

## Stop only if

Strava gear distance semantics cannot support the accepted baseline arithmetic,
the provider cannot distinguish gear kinds/IDs, existing manual rows cannot be
safely defaulted, or validation requires real/shared data.
