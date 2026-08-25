# R18 — Deliver post-Strava connection activation

**Status:** queued
**Delivery class:** full stack
**Risk/model:** high — Terra high
**Depends on:** R9, R14, R15, and R16 done
**Unlocks:** R19 and later R21 integration

## Outcome

After each new Strava connection lifecycle, the athlete sees one skippable,
resumable progress experience backed by real import state and then a personalized
Activation Summary that links into populated product surfaces.

## Current truth

- OAuth callback currently accepts only Settings continuation, awaits sync, and
  redirects to `/?strava=connected` with a success alert.
- There is no separate connection-activation state, progress route, or persisted
  dismissal/completion.
- Root asks the athlete to review imported records even though R9 changes
  historical records to confirmed.
- Summary totals/consistency can use activity summaries after R9/R16; rich
  stream/detail metrics may still be incomplete.
- Welcome onboarding is a separate event under D-019/R17.
- Connection activation must work from Settings or any other authorized
  connection entry even if R17 has not shipped, was skipped, or was completed.

## Locked decisions

1. Activation is keyed to the owner and connection lifecycle, not global user
   onboarding. Reauthorization of the same retained connection does not replay;
   true disconnect plus new connection creates a new eligible activation.
   Welcome eligibility/state is never read to decide this.
2. Callback redirects to one owner-safe activation route after authorization and
   job creation. The route never accepts an owner ID, token, stage, or result
   from query parameters.
3. Presentation state is `pending`, `dismissed`, `summary_ready`, or `completed`.
   Import job state remains separately authoritative under R14.
4. `Skip for now`/close marks presentation dismissed and navigates safely. It
   never cancels, completes, or corrupts the import. A later app visit/sync may
   resume backend work; dismissed UI does not auto-replay.
5. A persistent Settings or Performance entry lets the athlete reopen the
   current import/summary manually after dismissal. Automatic one-time behavior
   and manual revisit are different.
6. Progress copy maps only to R14 stages and committed counters. Show an
   indeterminate bar/skeleton while total is unknown. Do not show percentage,
   ETA, synthetic per-activity names, or a rotating claim for work not running.
   Displayed job counters use R14's unique outcome semantics, so retry cannot
   make an activity appear imported twice.
7. Framer Motion may animate stage transition, counter change, and summary
   reveal with established tokens. Reduced motion renders immediate/static state
   with identical text and live-region meaning.
8. Activation Summary first release is deterministic and summary-derived:
   imported date range, counts by canonical sport family, explicitly bounded
   distance/time/elevation, recent frequency/consistency, imported gear count/
   mapping state, whole-activity best labels where eligible, historical
   confirmed count, and new pending count. Calendar-YTD wording is used only
   when R19 supplies a validated effective timezone; otherwise exact dates are
   part of the label.
   These facts come from committed owner-scoped product read models and coverage
   state, not by adding progress attempts or treating a counter as the database.
9. Unknown/partial/enrichment-not-ready values are omitted or labeled, never
   zero-filled. Each calculation names its date window/unit and links to the
   populated Training Log, Performance, Gear, or Review evidence surface.
   Consistency is summary-ready under R16, not an enrichment-pending metric: its
   link opens the already populated athlete-local heatmap. Partial import copy
   preserves the committed coverage boundary.
10. First release does not infer easy HR or apply threshold pace. It may invite
    the athlete to complete profile values or confirm candidate races later. R21
    may add analyst hypotheses without changing activation completion semantics.
11. Summary seen/completed is recorded only after the summary is actually
    rendered. A failed/partial import cannot be presented as complete.
12. No real provider/remote DB is used in automated or browser proof.

## May change

- callback continuation and activation route;
- connection-scoped presentation persistence and owner-safe actions;
- progress/status polling or server-render refresh composition over R14;
- summary read model and UI components;
- success/error/retry copy, i18n, navigation, and disposable E2E fixtures.

The builder may repair behavior-preserving callback, focus, polling, and summary
composition defects within the connection-activation slice. It must not invent
new analysis or replace R14/R9 state.

## Must remain true

- state, job, counts, activities, gear, and links are owner-scoped;
- OAuth state validation, requested scopes, secrets, and safe redirects remain;
- import remains resumable after refresh, tab close, dismissal, or transient
  failure;
- historical data remains out of Review under R9;
- motion never carries unique meaning and cannot block navigation;
- browser back/reload cannot create duplicate jobs or replay completed flow.

## Non-goals

- LLM call during initial import;
- training prescription, readiness score, medical interpretation, or easy-HR
  target;
- full-history stream/detail enrichment;
- changing BYO credential collection;
- replaying welcome onboarding.

## Implementation map

1. Lock route, presentation state, exact stage/error/partial/summary copy, and
   design states from accepted decisions and the design foundation before code.
   Completion: no visual/product choice remains during implementation.
2. Add owner/connection-scoped activation state and callback handoff.
   Completion: new connection enters once; same connection reauthorization and
   foreign/guest routes do not.
3. Render R14 progress with bounded refresh/advance behavior. Completion:
   committed counters update, refresh resumes, error offers retry, and dismissal
   leaves job unchanged.
4. Build deterministic summary adapter over R14/R15/R16 outputs. Completion:
   every displayed value has fixture-derived source, window, unit, and partial
   rule.
5. Build responsive/motion UI and manual revisit entry. Completion: 1440/390,
   keyboard, focus, live regions, back/reload, and reduced motion work.
6. Replace old root success/review-all copy and prove final navigation.
   Completion: Training Log/Performance/Gear/Review links open their populated
   owner-scoped surfaces and no historical Review flood appears.

## Acceptance

- New connection enters activation exactly once; welcome state is irrelevant.
- The same connection story succeeds with welcome absent, skipped, and
  completed; none of those states changes activation eligibility or results.
- Progress displays only real stages/counters and survives retry/refresh.
- Skip dismisses UI only; import continues when possible or resumes safely.
- Completed fixture summary matches exact sport counts, date range, bounded
  totals, consistency, gear count, and pending count; its Consistency link opens
  the exact populated heatmap immediately, and known/unknown timezone fixtures
  prove YTD versus exact-date copy.
- Partial/failed/enrichment-pending states never claim completion or zero.
- Summary links resolve to correct owner data.
- Callback/OAuth/session/foreign-owner protections pass.
- Desktop/mobile, keyboard/focus, live-region, and reduced-motion behavior pass.

## Validation

Add `src/features/onboarding/connection-activation.integration.test.ts` using
disposable SQLite plus the loopback provider. It composes already-proven R14/
R15/R16 outputs and covers callback handoff, per-connection eligibility,
welcome-state independence, dismiss/revisit/complete, progress/retry, exact
deterministic summary, summary-seen timing, owner isolation, and no replay.

```sh
npx vitest run src/features/onboarding/connection-activation.integration.test.ts
npx playwright test e2e/connection-activation.spec.ts
```

Do not rerun every prerequisite suite or the full repository gate. Make the
focused composition integration green, then iterate the complete disposable
OAuth-return-to-summary browser story at 1440/390. The one focused Playwright
spec owns slow/indeterminate progress, real counters, partial failure/retry,
skip, refresh, manual revisit, completion, no replay, populated evidence links,
light/dark, keyboard/focus, live regions, and reduced motion.

## Migration, compatibility, and rollback

Add versioned connection-activation presentation state through R2M. Old callback
query compatibility may remain for one task only and is removed before done.
Rollback routes connected users to the normal authenticated app while retaining
import/activation records. No deployment or remote migration is authorized.

## Stop only if

A truthful experience requires a new background-runtime/provider contract;
OAuth safety creates an unresolved security decision; or proof requires real
Strava, a shared database, remote migration, deployment, or external credential.

Callback composition, presentation persistence, polling/advance behavior,
summary mapping, retry, fixtures, motion, focus, responsive layout, and all other
recoverable local findings, including exact copy/layout within the accepted
contract, are owned and fixed by the builder within this task.

## Finish

Both named focused commands pass with disposable data and real-browser proof,
R18 is marked done in the roadmap, and the complete attributable change is one
local-main commit with no push, migration execution, or deployment.
