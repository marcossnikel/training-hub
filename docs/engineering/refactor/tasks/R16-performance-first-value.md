# R16 — Fill summary performance and repair period controls

**Status:** done
**Delivery class:** full stack
**Risk/model:** medium — Terra medium
**Depends on:** R9 done
**Unlocks:** R18 and R12

## Outcome

Confirmed imported Strava summaries populate Training Log, Totals, and
Consistency immediately, and changing Weeks/Months or curve window preserves
the other Performance selection at desktop and mobile widths.

## Current truth

- `src/lib/db/activities.ts` log, totals, and consistency queries intentionally
  read only `status='confirmed'`; the current initial-import bug leaves them
  blank.
- `src/app/performance/page.tsx` builds curve links with only `window` and totals
  links with only `period`, so each control discards the other URL state.
- `src/lib/totals.ts` already supports monthly buckets; focused totals and
  consistency tests are healthy.
- `src/lib/consistency.ts` currently derives both minutes and sessions through
  the Node process timezone, while Totals prefers persisted `started_at_local`.
  `listSessionStarts` does not return that local stamp, so an evening activity
  can appear on different days across Totals and Consistency.
- Initial sync stores summary fields only. VDOT/curves requiring details or
  streams remain sparse until lazy or bounded enrichment runs.

## Locked decisions

1. Immediate first value uses confirmed summary fields only: activity count,
   moving time, distance, elevation, frequency/consistency, and clearly labeled
   whole-activity bests where eligible.
2. Weeks and Months define bucket granularity; switching preserves the selected
   curve window and other unrelated query state. Curve-window changes preserve
   totals period.
3. Bucket activities by persisted `started_at_local` day with UTC start only as
   fallback, matching the existing totals convention. Define year-to-date from
   an explicit `asOfDay` in the effective validated IANA timezone supplied by
   R19/D-024. Without that timezone, show exact `from`/`through` date bounds and
   never label a rolling or server-time window as `this year`.
4. Empty/partial states distinguish no confirmed data from metrics that require
   detail/stream enrichment. Do not show zero for unknown/unprocessed metrics.
5. Whole-activity bests are labeled as whole-activity estimates, not complete
   Strava segment best efforts.
6. No first-value UI uses the current founder threshold fallbacks. Threshold- or
   zone-dependent modules show `needs athlete input` until R19 supplies data.
7. Mobile Months layout prioritizes period label, primary totals, units, and
   comparison meaning without horizontal page overflow.
8. Consistency is ready when the initial import has committed confirmed summary
   rows; it never waits for activity details, streams, R21 analysis, or post-
   connect animation. The first Performance load shows the trailing-year
   heatmap, active-days-per-week, and the existing streak definition (ending
   today, or yesterday when today has no session).
9. Minutes and session counts share one pure canonical activity-day rule:
   `started_at_local` first and UTC start only as fallback. No server/browser
   process timezone participates. Pending rows remain excluded and enter once
   after confirmation.
10. A partial import may calculate Consistency from committed rows, but its UI
    carries the covered date range/import state. Missing pages never render as
    a trustworthy zero-history result.

## May change

- performance URL-state helpers, summary read model, totals/consistency/whole-
  activity presentation and focused tests;
- the owner-scoped session-start query shape and canonical activity-day helper;
- Training Log/Performance empty and partial copy;
- local seeded/provider fixtures used by the browser story.

The builder may repair deterministic aggregation or URL-state defects exposed
inside these summary surfaces. Stream/detail enrichment and athlete-profile
schema belong to later tasks.

## Must remain true

- all reads remain authenticated-owner and confirmed-only;
- pending Review activities never enter performance summaries;
- dates, units, sources, and data limitations remain visible;
- no real Strava/remote database is used;
- existing curve/detail behavior is preserved when data exists.

## Non-goals

- prefetching full activity details/streams;
- promising complete VDOT or power/pace curves after initial sync;
- changing formulas unrelated to a reproduced defect;
- post-connect activation shell/motion.

## Implementation map

1. Add a provider-flow fixture containing confirmed run/ride/strength summaries,
   including an athlete-local evening start that crosses a UTC date boundary.
   Completion: one owner has non-zero deterministic expected totals and
   Consistency cells; another is isolated.
2. Prove R9-confirmed rows feed log/totals/consistency read models immediately.
   Completion: focused integration assertions match exact fixture dates,
   minutes, session counts, active-days-per-week, and streak without detail or
   stream enrichment.
3. Make minutes and session starts carry the same persisted local-day input and
   use one pure fallback rule. Completion: the cross-midnight fixture occupies
   one identical athlete-day bucket in Totals and Consistency, independent of
   the process timezone.
4. Centralize query-link construction. Completion: every period/window click
   preserves the other supported state and canonical defaults.
5. Repair Weeks/Months responsive UI and partial-data copy. Completion: values,
   labels, focus, and scroll behavior are correct at 1440/390.
6. Add the first-value bounded-summary interface. Completion: its result always
   carries `fromDay`, `throughDay`, and calendar-label eligibility; calendar-YTD
   is deterministic only with an effective timezone, and threshold-dependent
   cards remain honestly unavailable.
7. Prove pending and partial behavior. Completion: pending rows affect no
   Consistency metric, later confirmation adds the activity once, and partial
   coverage is visible rather than presented as complete inactivity.

## Acceptance

- The first `/performance` load after initial connection already contains the
  exact expected heatmap cells, active-days-per-week, and streak from imported
  confirmed history; no detail/stream fetch is required.
- The cross-UTC-midnight fixture contributes its minutes and session count to
  the same persisted athlete-local day in Totals and Consistency.
- Pending items do not affect those surfaces; confirming a later item adds it
  exactly once after refresh.
- Partial import coverage is named and cannot look like a valid empty history.
- Weeks/Months and curve-window controls never reset each other.
- Bounded summary matches exact fixture values; YTD renders only for the fixture
  with a validated timezone, while the unknown-timezone fixture shows dates.
- Unknown enrichment-dependent cards do not render misleading zero/complete
  states.
- 1440/390 layouts preserve labels, units, focus, and no page overflow.

## Validation

Add `src/features/performance/first-value.integration.test.ts` using disposable
SQLite and the R9 loopback-provider fixture. It covers connection-import-to-
performance, exact totals and consistency cells/minutes/session counts/streak,
pending exclusion and later confirmation, partial coverage, local-day/year
boundaries with known/unknown timezone, owner isolation, and query-state
mapping.

```sh
npx vitest run src/features/performance/first-value.integration.test.ts
npx playwright test e2e/byo-connection.spec.ts e2e/performance.spec.ts
```

Do not run the full repository gate. Make the focused integration story green
first, then start the disposable app and iterate connection through the first
`/performance` load. Verify populated Consistency, Weeks/Months and curve-window
controls, empty/partial states, keyboard/focus, no horizontal overflow, and
1440/390 layouts until the focused Playwright specs and direct inspection pass.

## Migration, compatibility, and rollback

No schema change expected. Rollback restores old links/presentation; R9-imported
confirmed data remains valid. No deployment or remote provider effect.

## Stop only if

The accepted immediate-value result genuinely requires unavailable detail/
stream/provider data rather than stored summaries; D-024/D-026 semantics need a
Marcos decision; or proof requires real Strava, a shared database, or deployment.

Owner-scope query defects, explicit-timezone plumbing, aggregation, URL state,
partial copy, fixtures, responsive layout, and all other recoverable local
findings are owned and fixed by the builder within this task. It must not add
automatic detail/stream enrichment.

## Finish

Both named focused commands pass with disposable data and real-browser proof,
R16 is marked done in the roadmap, and the complete attributable change is one
local-main commit with no push or deployment.
