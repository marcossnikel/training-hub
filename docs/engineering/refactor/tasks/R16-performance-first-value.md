# R16 — Fill summary performance and repair period controls

**Status:** draft
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

## May change

- performance URL-state helpers, summary read model, totals/consistency/whole-
  activity presentation and focused tests;
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

1. Add a provider-flow fixture containing confirmed run/ride/strength summaries.
   Completion: one owner has non-zero deterministic expected totals; another is
   isolated.
2. Prove R9-confirmed rows feed log/totals/consistency read models. Completion:
   focused integration assertions match fixture dates/units/counts.
3. Centralize query-link construction. Completion: every period/window click
   preserves the other supported state and canonical defaults.
4. Repair Weeks/Months responsive UI and partial-data copy. Completion: values,
   labels, focus, and scroll behavior are correct at 1440/390.
5. Add the first-value bounded-summary interface. Completion: its result always
   carries `fromDay`, `throughDay`, and calendar-label eligibility; calendar-YTD
   is deterministic only with an effective timezone, and threshold-dependent
   cards remain honestly unavailable.

## Acceptance

- Imported confirmed history fills recent log, totals, and consistency.
- Pending items do not affect those surfaces.
- Weeks/Months and curve-window controls never reset each other.
- Bounded summary matches exact fixture values; YTD renders only for the fixture
  with a validated timezone, while the unknown-timezone fixture shows dates.
- Unknown enrichment-dependent cards do not render misleading zero/complete
  states.
- 1440/390 layouts preserve labels, units, focus, and no page overflow.

## Validation

Focused owner-scoped integration tests for imported summaries, totals,
consistency, local-day/year boundaries with known/unknown timezone, and query-
state mapping. Then iterate `/`,
`/performance`, period/window controls, empty/partial states, keyboard focus,
and 1440/390 layouts in a real browser using disposable fixture data.

## Migration, compatibility, and rollback

No schema change expected. Rollback restores old links/presentation; R9-imported
confirmed data remains valid. No deployment or remote provider effect.

## Stop only if

Summary queries require unowned data, an effective timezone cannot be passed as
an explicit validated input without importing client/server globals, or correct
behavior requires automatic detail/stream enrichment outside this task.
