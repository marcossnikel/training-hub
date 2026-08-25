# Comparable prior activity rule contract

This is the accepted v1 contract for [#36](https://github.com/marcossnikel/training-hub/issues/36). It defines a deterministic comparison between one current activity and one prior activity from the same athlete. It is the implementation boundary for the future [#37](https://github.com/marcossnikel/training-hub/issues/37) surface.

It does **not** define comparable workouts or training blocks. The stored summaries contain no trustworthy workout-intent classification or general persisted block entity, so neither may be inferred here.

## Outcome, scope, and non-goals

An athlete can inspect a confirmed activity and see either one prior activity that meets published similarity criteria or an honest no-match result. The result is evidence, not a verdict.

In scope:

- one authenticated owner's confirmed activity summaries;
- running and cycling families as already recognised by the application;
- distance and moving-time similarity, deterministic selection, and factual provenance;
- a pure matching module plus an owner-scoped adapter seam; and
- the implementation and visual-proof handoff for #37.

Out of scope:

- UI, routes, migrations, sync, Strava callbacks, streams, secrets, billing, or an external service;
- workout classification, activity-name inference, a general block model, race-lead-up comparison, or cross-athlete comparisons;
- a limited/low-confidence result, a weighted or machine-learned score, and AI output; and
- a claim that two activities are equivalent, that the athlete improved, is fitter or ready, or should change training.

## Data and boundary contract

The database/route adapter authenticates the request and supplies only one owner's records with `status = 'confirmed'`. It must return the following lean projection for both source and candidates; it must not return or read journals, notes, raw payloads, connection material, streams, or derived metrics.

```ts
interface ComparableActivitySummary {
  id: number;
  sportType: string | null;
  startedAt: string | null; // ISO instant from activities.started_at
  distanceKm: number | null;
  movingTimeS: number | null;
}
```

The route resolves the requested source through the same owner-and-confirmed scope before calling the matcher. A guessed, pending, missing, or another owner's source is a normal not-found result, not a comparison, redirect, or data leak. Candidate links/IDs are evidence handles and remain owner-scoped in every later route or action.

`listConfirmedActivities(owner)` demonstrates the necessary ownership and status boundary today. `listBlockActivities` is not an acceptable adapter for this rule: its block-focused projection omits activity IDs and adds inputs this matcher must not use. The implementation should add a purpose-named owner-scoped projection rather than widening an unrelated block query.

## Pure matcher interface

The matcher is a pure module. It accepts an already-authorized source, already-owner-scoped candidate summaries, and an explicit `asOf` instant. It does not accept an owner ID, query a database, call the network, read the clock, access Strava, or persist state.

```ts
matchComparablePriorActivity({ source, candidates, asOf }):
  | { state: "match"; match: ComparableActivityMatch }
  | { state: "no_match" }
```

`asOf` is a valid ISO instant supplied by the adapter or caller. Invalid dates are unusable; implementations must never coerce an invalid date into a current time. Eligibility and ordering use unrounded numeric values. Formatting belongs at the presentation boundary only.

## Eligibility

The source must be usable. A candidate is eligible only when all conditions below hold:

1. Source and candidate have a finite, positive `distanceKm` and `movingTimeS`.
2. Source and candidate have a valid `startedAt` instant no later than `asOf`.
3. The candidate `startedAt` is strictly earlier than the source `startedAt`; the source itself is therefore excluded even if supplied in `candidates`.
4. Source and candidate resolve to the same supported sport family.
5. The candidate meets both reliable thresholds below.

Unsupported sport, `null`, zero, negative, `NaN`, infinite, invalid-date, pending (adapter failure), future, same-ID, same-or-later timestamp, and cross-owner records are excluded. There is no fallback to a partial record and no fabricated zero.

### Supported sport families

Use the existing predicates, not a new taxonomy:

| Family | Rule | Intentional effect |
| --- | --- | --- |
| `run` | `isRunSport(sportType)` | Existing run variants, including trail/virtual variants whose type contains `run`, are compared as running. This does not imply equal terrain, surface, or workout intent. |
| `ride` | `!isRunSport(sportType) && isRideSport(sportType)` | Existing ride variants, including the current `ride`, `velomobile`, and `EBikeRide` semantics, are compared as cycling. This does not imply equal terrain, equipment, power, or intent. |
| unsupported | Neither rule matches | It cannot produce a v1 comparison. |

The `run` guard on the `ride` rule makes malformed values that match both predicates deterministic without broadening either predicate. It is not a new sport category.

## Reliable similarity and selection

For each eligible candidate, calculate with the **source/current activity as the denominator**:

```text
distanceDifference = abs(candidate.distanceKm - source.distanceKm) / source.distanceKm
movingTimeDifference = abs(candidate.movingTimeS - source.movingTimeS) / source.movingTimeS
```

A reliable match requires both inclusive thresholds:

```text
distanceDifference <= 0.10
movingTimeDifference <= 0.20
```

Exactly 10% distance and exactly 20% moving-time differences qualify. A value just above either boundary does not. There is no limited, low-confidence, near-match, or best-available tier; return `no_match` instead.

Among reliable candidates, select one deterministic result by ascending lexicographic order:

1. smaller `distanceDifference`;
2. then smaller `movingTimeDifference`;
3. then newer candidate `startedAt`;
4. then higher stable numeric activity `id`.

Do not replace this order with a composite score, rounding, title/name similarity, recency weight, or an implicit database order. The selected match carries both unrounded differences for validation and signed display deltas for factual presentation:

```text
signedDistanceDelta = (candidate.distanceKm - source.distanceKm) / source.distanceKm
signedMovingTimeDelta = (candidate.movingTimeS - source.movingTimeS) / source.movingTimeS
```

Positive means the prior candidate is greater/longer than the current source; negative means it is smaller/shorter. It does not mean better or worse.

## Evidence and copy contract

Every reliable result must expose, in readable text and owner-scoped links, all of the following:

- the sport family;
- current/source and prior/candidate dates;
- both activity IDs or source links;
- distance in km and moving time in a human-readable duration for both activities;
- signed factual deltas for distance and moving time, with direction in words;
- the method statement and both inclusive thresholds; and
- the exact limitation: **“This match uses confirmed activity summaries: sport family, distance, and moving time. It does not use heart-rate or stream data.”**

Missing heart-rate or stream data does not change eligibility, ranking, or result language because neither is an input. Do not label a match as missing HR/streams, substitute a value, or imply an absent measurement was considered. The method statement is the visible limitation.

Allowed conclusion language is factual: “A prior running activity met the distance and moving-time criteria.” Never say or imply “same workout,” “equivalent effort,” “improved,” “slower/faster is better/worse,” “fitness,” “readiness,” “recovery,” “coach,” “medical,” “recommended,” “AI,” causality, or a training prescription.

### No-match state

Use this exact copy:

> **No reliable prior match**<br>
> There isn’t a prior activity that meets the current comparison criteria.

Keep the current source activity linked or named. Explain the method in immediately available text: “Matches require the same sport family, distance within 10%, and moving time within 20%.” Do not say that history is missing, insufficient, incomplete, or weak unless a future accepted rule distinguishes that condition.

## Fixture and test matrix

The implementation must add pure-matcher tests and an owner-scoped adapter test. Fixtures must use fixed ISO instants and explicit `asOf`, not the machine clock.

| Case | Required proof |
| --- | --- |
| Exact reliable boundary | 10.0 km source vs 11.0 km candidate and 1,000 s source vs 1,200 s candidate returns `match`. |
| Just outside distance | 11.0001 km candidate with otherwise valid input returns `no_match`. |
| Just outside moving time | 1,200.0001 s candidate with otherwise valid input returns `no_match`. |
| Denominator direction | A source/candidate pair proves percentages divide by source values, not candidate values or an average. |
| No limited tier | A candidate outside either threshold returns `no_match`, not a labelled weak result. |
| Sport family | Run variants match run variants; ride variants match ride variants; run/ride and unsupported sport pairs do not match. |
| Invalid and temporal input | `null`, zero, negative, `NaN`, infinity, invalid date, source-self, candidate at the same/later instant, and any future record are excluded. |
| Confirmation/ownership | The adapter supplies only confirmed records for the authenticated owner; overlapping another-owner data cannot be returned, selected, linked, or inferred. |
| Deterministic selection | Fixtures prove distance first, then moving time, then newest prior instant, then highest ID, independent of candidate input order. |
| Provenance and deltas | A match contains both source/candidate evidence handles and correctly signed, unrounded deltas. |
| Non-input limitation | Missing HR/streams neither rejects a usable record nor appears as an inferred missing-value explanation; restricted copy remains free of coaching/readiness/AI/equivalence claims. |
| No match | Exact heading, body, current-activity provenance, and method criteria are available to the UI. |

Run focused integration tests for the matcher, owner-scoped adapter, and route,
then iterate the full user story in the browser. The implementation does not
require a database reset, remote database, account, Strava credential, network
call, or deployed environment. There is no persisted matcher state; rollback is
removing the pure module, adapter, and surface together.

## #37 implementation handoff

#37 is not ready to implement until its issue packet links this contract and retains the following design contract. The screen must use existing design-system primitives from [`docs/design/FOUNDATION.md`](../design/FOUNDATION.md), especially the page shell, evidence card, metric/comparison, and error/retry patterns.

### User moment and hierarchy

The athlete opens a confirmed activity to answer one question: “Is there a reliable prior activity with similar distance and moving time?” The primary element is the reliable match or the no-match outcome. Immediately below it: source/candidate dates, two metrics with units and signed directions, and source links. The method and limitation are progressively disclosed but discoverable; unrelated metrics, trend charts, and calls to train are deliberately absent.

The intended feeling is calm confidence in a bounded observation, not a performance grade. Use a single primary column; a wide contextual rail is allowed only if it contains the visible source evidence. At 390 px, stack source/candidate evidence in the same reading order and preserve labels, units, source links, and touch targets without horizontal page scroll.

### States, interaction, and visual proof

| State | Required behavior, copy, and proof |
| --- | --- |
| Reliable/default | Show one deterministic comparable prior activity, factual deltas, IDs/links, dates, units, thresholds, and the exact limitation. Capture at 1440 px and 390 px. |
| Loading | Use a static hierarchy-preserving skeleton within 200 ms; it contains no invented dates or metrics. Capture at one viewport. |
| No match / first usable state | Use the exact no-match heading/body and visible criteria; keep the current activity provenance. Capture at 1440 px and 390 px. |
| Error/retry | On a recoverable owner-scoped read failure, retain safe source context, announce a plain-language error, and offer an action-specific retry. Never expose IDs that failed ownership, raw errors, secrets, or another athlete's data. Capture the retryable state and successful retry. |
| Disabled/unavailable source | A pending, invalid, missing, or unowned source never enters the comparison surface. The authenticated route returns its existing safe not-found/access behavior; do not render a disabled comparison card that leaks why. Document this no-card state in the task result. |
| Hover/focus/press | Source links and retry controls have visible `focus.ring`, a 100–150 ms nonessential tone/opacity response, and immediate press acknowledgement. Keyboard has the same meaning as pointer input; no information depends on hover. |
| Keyboard | Tab order follows heading → current source link → prior source link → method disclosure → retry when present. Enter activates links; Enter or Space activates semantic buttons/disclosures. Any disclosure returns focus normally. Include focus evidence. |
| Reduced motion | All state and focus feedback is immediate/static under `prefers-reduced-motion: reduce`; no animation is needed to understand a match or retry. Record the result. |

Follow [`docs/design/VISUAL_QA.md`](../design/VISUAL_QA.md): include named 1440 px and 390 px screenshots for the primary and no-match states, plus loading, error/retry, and focus evidence as applicable. Name captures `37-comparable-prior-activity-<state>-<viewport>.png`, record route/test data/commit, and use only disposable owner-scoped test data.

Translate references through the foundation: adapt Linear's dense-but-legible hierarchy and keyboard predictability, Beautiful UI's evidence-first contextual detail, and Resend's code-to-screenshot polish loop. Do not copy their layouts, components, branding, wording, assets, dark theme, dashboard-card mosaics, or generic AI framing.

### #37 acceptance checklist

- [ ] The route resolves the source and candidates through authenticated owner + `confirmed` scope and uses the pure matcher with an explicit `asOf`.
- [ ] Only the reliable and no-match outcomes from this contract can render; no classifier, block, limited tier, or hidden similarity score appears.
- [ ] Evidence, copy restrictions, method limitation, source provenance, and no-match copy are exact.
- [ ] Focused integration tests cover matcher, owner isolation, and route results; browser iteration covers the stated keyboard, state, responsive, and reduced-motion matrix.
- [ ] The task result records the required desktop/narrow/state/focus browser proof.

## Acceptance record for #36

- [x] The product decision is recorded as D-015.
- [x] Inputs, owner/confirmation boundary, exclusions, sport semantics, inclusive thresholds, and deterministic tie-breaks are implementation-ready.
- [x] Evidence, no-match, missing-input, and prohibited-claim rules are explicit.
- [x] Matcher/adapter seams, fixtures, validation, rollback, and the full #37 design/visual handoff are specified.

This documentation-only change does not alter runtime behavior, data, auth, billing, deployment, or environment boundaries.
