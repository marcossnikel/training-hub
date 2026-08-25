# R12 — Refactor activity and chart hotspots by reason to change

**Status:** queued
**Delivery class:** full stack
**Risk/model:** medium — Terra medium; use high reasoning for data-query changes
**Depends on:** R10, R11, R16, and R19 done
**Unlocks:** R13

## Outcome

The activity detail page, activity persistence, and chart can evolve
independently through cohesive interfaces. A feature change no longer requires
understanding an 856-line page, 798-line DB module, 941-line chart component,
and 1,133-line chart test at once.

## Required context

- accepted R10/R11 feature boundaries and current import/dependency graph;
- `src/app/activity/[id]/page.tsx` and nested compare route/layout/loading/error;
- `src/components/activity-chart.tsx`, `activity-chart-series.ts`, and tests;
- `src/lib/db/activities.ts`, activity types, evidence/insight consumers;
- `docs/design/FOUNDATION.md`, `docs/design/VISUAL_QA.md`, approved activity
  Figma frame(s), and product evidence/limitation decisions;
- installed Next.js page/loading/caching docs relevant to touched entry points.

## Current behavior and evidence

The current hotspots combine several independent reasons to change:

- activity page: owner loading, not-found/error behavior, data preparation,
  insight/evidence sections, chart configuration, controls, and layout;
- activity DB: list/read/write, sync inserts, streams/detail cache, best efforts,
  comparison/race/session projections, and manual activities;
- chart: series preparation, scales/formatting, SVG rendering, hover/pointer and
  keyboard behavior, selection, annotations, responsive presentation;
- chart test: fixtures, pure series expectations, rendering, input interaction,
  accessibility, and responsive behavior in one suite.

Large line count is discovery evidence, not permission to split arbitrarily.
This task begins by identifying cohesive interfaces and change reasons after
R10/R11 have settled their callers.

## Locked decisions

1. Preserve the App Router entry point as composition. Move feature loading and
   presentation-model construction to server-only activity modules; do not hide
   navigation/not-found semantics in generic repositories.
2. Split activity persistence by stable capability/use case, such as review,
   detail/enrichment cache, comparison/evidence queries, and manual journal
   mutation. Shared row mapping may remain internal to DB infrastructure.
3. DB interfaces remain owner-explicit and use real SQLite in tests. Do not add
   one generic `ActivityRepository` mirroring every query.
4. Keep chart series/scale/annotation derivation pure and independent of React,
   DOM measurements, or browser events.
5. Keep the interactive renderer responsible for accessible input, focus,
   pointer/keyboard selection, resize, and reduced-motion presentation.
6. Use named view-model types containing only display/evidence data. Do not pass
   raw DB rows, provider payloads, owner IDs, or secrets to Client Components.
7. Preserve existing product evidence, dates, windows, units, limitations,
   status rules, and comparison meaning exactly.
8. Preserve the accepted Figma visual contract. This is a structural refactor,
   not an unsolicited redesign. Any visible correction needs before/after proof
   and explicit acceptance.
9. Tests follow interfaces: pure chart/data rules, SQLite query behavior,
   component accessibility/interaction, and a small E2E activity story.
10. No mandatory file-size target. A module is complete when its interface is
    cohesive and its implementation is understandable without unrelated state.

## Protected invariants

- owner A cannot load/mutate owner B activity, detail, streams, splits, or gear;
- pending/confirmed and evidence inclusion rules remain unchanged after R9;
- displayed metrics/units/dates/limitations and comparison inputs remain exact;
- not-found, loading, empty, partial, provider-data-missing, and error states;
- chart mouse, touch/pointer, keyboard, focus, accessible names, responsive
  behavior, and reduced-motion behavior;
- Server Components do not serialize secrets/internal owner identifiers;
- activity mutation revalidation and navigation remain consistent after R10.

## Permitted scope

- activity feature query/command/view-model modules and focused SQLite tests;
- page composition and activity-owned presentational components;
- chart pure calculation modules, interactive renderer modules, and test split;
- update exact callers/imports and delete replaced helpers/compatibility exports;
- small accessibility or responsive corrections required to preserve the
  accepted contract, with explicit evidence.

## Non-goals

- new metrics, insights, chart types, comparison rules, or coaching claims;
- changing Review workflow, Strava sync, role/invite flows, or DB schema;
- redesigning the page or extracting a universal charting/design framework;
- moving every DB module or UI component into the target tree;
- splitting files solely to satisfy line-count thresholds.

## Proposed seams

Final names are refreshed after dependencies, but the responsibilities are:

```text
activity detail loader -> owner-bound aggregate -> display-safe view model
activity review commands -> status/splits/gear mutations
activity evidence queries -> comparison/race/session projections
activity enrichment cache -> detail/streams/best-effort persistence

provider/DB data -> pure chart model -> interactive accessible chart renderer
```

## Implementation sequence

1. Build a responsibility/caller/test map for the four hotspots and record
   which code changes together. Completion: proposed interfaces are justified
   by callers and invariants, not line count.
2. Pin one representative activity fixture through DB -> page view model ->
   chart model, plus owner/not-found/partial-data cases. Completion: output and
   evidence meaning are characterized before moving code.
3. Extract pure chart model calculations and move corresponding tests.
   Completion: calculations have no React/DOM dependency and preserve exact
   numeric/format/annotation results.
4. Extract interactive chart renderer concerns with dedicated component tests.
   Completion: pointer, keyboard, focus, resize, accessibility, and reduced
   motion pass without testing unrelated series formulas.
5. Split activity persistence behind named owner-explicit feature operations,
   one capability at a time. Completion: real SQLite tests prove outputs,
   ordering, writes, and two-owner isolation for each moved capability.
6. Introduce the display-safe activity aggregate/view model and slim page
   composition. Completion: page owns route composition while feature modules
   own loading/calculation; Client props contain no internal/raw provider data.
7. Migrate callers and delete compatibility helpers. Completion: searches and
   cycle/dead-code checks show one owner for each moved capability.
8. Run browser comparison against the accepted desktop/mobile contract.
   Completion: before/after artifacts at 1440/390 show no unexplained drift.

## Required automated proof

- pure chart model: series, units, bounds, gaps/missing data, annotations,
  selection mapping, and deterministic formatting;
- renderer: empty/partial/full, mouse/pointer/touch where supported, keyboard,
  focus, resize, accessible name/description, and reduced motion;
- SQLite feature operations: read/write/order/not-found and two-owner isolation;
- page/view model: complete, missing enrichment, pending/confirmed, not-found,
  and no internal/provider fields serialized;
- existing compare, Review, journal/splits/gear, insight/evidence tests;
- focused activity/tenant E2E and repository cycle/dead-code gates.

```sh
npm run verify:fast
npx playwright test e2e/activities.spec.ts e2e/tenant-isolation.spec.ts
npm run test:e2e:production
```

Use the current actual E2E filenames when refreshing readiness. Run full
`npm run verify` at Milestone M4 with R13.

## Required manual or visual proof

For one complete, one partial/no-stream, and one pending activity, inspect the
accepted route at 1440 and 390. Record loading, content, chart interaction,
keyboard focus, narrow layout, missing-data limitation, mutation feedback, and
reduced-motion behavior. Compare before/after screenshots; any visible change
must be named and approved, not dismissed as refactor drift.

## Migration, rollout, and rollback

No data migration or route contract change. Move callers atomically; temporary
exports expire inside this task. Rollback is the prior code revision. If a
visible correction is accepted separately, document its independent rollback.

## Stop conditions

- no concrete approved activity frame/visual baseline is available;
- R10/R11 still have temporary callers whose owner is unresolved;
- a query split would change evidence/status/comparison meaning;
- a client boundary would serialize owner/provider/internal data;
- a failing chart behavior cannot be distinguished from existing behavior; or
- an overlapping redesign/feature branch edits the same page/chart modules.

## Completion criteria

- Page, persistence capabilities, chart model, and renderer have cohesive seams.
- All moved DB operations remain explicitly owner-bound and SQLite-tested.
- Evidence/metric behavior and accessible chart interaction are preserved.
- Accepted 1440/390 appearance has no unexplained drift.
- Replaced modules/helpers and temporary imports are removed.
