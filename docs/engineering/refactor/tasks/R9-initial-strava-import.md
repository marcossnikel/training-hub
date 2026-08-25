# R9 — Keep initial Strava history out of Review

**Status:** draft
**Delivery class:** full stack
**Risk:** high
**Recommended builder:** Terra high
**Depends on:** R2M
**Unlocks:** R11

## Outcome

When an athlete first connects Strava, existing activity history imports as
confirmed and never floods Review. Only activities whose Strava start time is
after the persisted connection cutoff enter Review. A failed initial import can
retry without skipping older history.

## Required context

- D-013/D-017/D-020, Product ingestion and connection-activation wording
- `src/lib/strava.ts`, callback route and tests
- `src/lib/db/strava-auth.ts`, activity/meta DB modules and lifecycle tests
- E2E Strava provider and BYO connection spec
- Review count/log behavior, owner-scope tests, R2M migration workflow

## Current behavior and confirmed mechanism

`syncActivities()` reads `user_meta.baseline_date`; missing value becomes
timestamp `0`. New accounts never set `baseline_date`, so every valid Strava
activity is newer and receives `pending_review`. The function imports newest
first and later incremental calls use the newest stored start epoch. If an
initial multi-page import fails after storing a newer page, retry can ask only
for activities after that newest timestamp and skip older unimported pages.

`baseline_date` originated as personal gear-mileage policy. It must not remain
the review-inbox cutoff for new multi-user connections.

## Locked decisions

1. Persist `review_after` on the owner-bound `strava_connections` record as an
   immutable UTC instant for one connection lifecycle.
2. Set it server-side during the first successful pending -> connected promotion,
   before the initial activity request. Browser/provider payload cannot choose it.
3. Reconnect/re-authorization of an existing retained connection preserves the
   cutoff. A true disconnect deletes the connection/imported graph; a later new
   connection receives a new cutoff.
4. Persist `initial_sync_completed_at` separately. Cutoff classification and
   pagination completion are different facts.
5. While initial sync is incomplete, request full newest-first history without
   an `after` cursor on every retry; owner + Strava ID uniqueness/existence makes
   already-imported pages idempotent. Mark complete only after all pages finish.
6. After initial completion, incremental sync may use the newest stored epoch.
7. Classification is:
   - valid `started_at <= review_after`: `confirmed`, no review splits;
   - valid `started_at > review_after`: `pending_review`, current prefilled
     split/bike matching applies;
   - missing/invalid start timestamp: reject/skip with redacted observation;
     never silently place malformed provider data in Review.
8. One cutoff value is loaded once per sync and reused for every page/row.
9. `baseline_date` may remain for gear/history display but is removed from
   review classification.
10. Sync result distinguishes historical confirmed imports from new pending
    imports and retains total pending count.
11. Update current callback/log copy so it never asks the athlete to review all
    imported history. R18 later owns the Activation Summary; R9 must expose
    accurate confirmed/pending counts without inventing that future UI.
12. Existing-data repair is separate from code rollout. Provide a dry-run-first,
    owner-explicit operation; do not execute it remotely in this task.

## Existing-schema and repair decisions

1. Add nullable migration columns, then backfill existing connections:
   `review_after = created_at` where missing.
2. Set `initial_sync_completed_at` from the owner's existing `last_sync_at` when
   present; otherwise leave incomplete so the next sync safely walks full
   history.
3. Repair candidate rows are owner-scoped Strava activities with
   `status='pending_review'` and valid `started_at <= review_after`.
4. Dry run reports only owner-safe counts and date range, not raw payloads,
   notes, tokens, or secrets.
5. Approved write changes candidates to `confirmed` and removes their unreviewed
   auto-prefilled splits so historical import behavior matches new connections.
   Manual activities and already-confirmed/reviewed records are untouched.
6. Any production repair requires separate explicit authorization, before/after
   counts, backup/rollback plan, and exact owner target.

## Protected invariants

- every query/write remains owner-scoped;
- Strava connection secrets and payload details remain redacted;
- unique `(user_id, strava_id)` behavior prevents duplicate activities;
- retry does not move cutoff or change already-stored classifications;
- token refresh/reconnect does not reset initial history;
- disconnect deletion semantics remain D-017 compliant;
- insight modules still receive confirmed history; Review counts only pending;
- no real Strava or remote DB in automated proof.

## Permitted scope

- additive connection sync-state migration;
- feature-owned sync classification/orchestration extraction from `strava.ts`;
- callback promotion/sync composition and DB accessors;
- local provider fixtures, module/E2E tests, product/copy updates;
- guarded repair script with dry run as default.

## Non-goals

- user-selectable history window;
- changing requested Strava scopes;
- background jobs/webhooks;
- general R11 Strava transport/cache refactor;
- executing production migration/repair/deployment.

## Implementation sequence

1. Record the new review-cutoff decision in product docs with exact boundary and
   reconnect/disconnect semantics. Completion: code behavior can be judged
   without this chat.
2. Add pure classification tests first, including equality and invalid time.
   Completion: rule has no DB/network dependency.
3. Add connection columns/migration/backfill tests. Completion: fresh/current
   fixtures preserve connection/owner data and expose one immutable cutoff.
4. Make promotion establish cutoff only when absent. Completion: initial connect
   sets it; reconnect and token refresh preserve it; disconnect/new connection
   creates a new one.
5. Separate initial/full and incremental pagination. Completion: injected page-2
   failure followed by retry imports every older row exactly once and sets
   completion only after the terminal page.
6. Apply classification to inserts and remove `baseline_date` dependency.
   Completion: initial history confirmed/no splits; later activity pending with
   current gear-prefill behavior.
7. Update callback/log success result/copy and counts. Completion: first-connect
   UI does not tell athlete to review all history in Inbox.
8. Extend loopback provider/E2E story: initial history -> zero historical Inbox;
   controlled later activity -> one Review item. Completion: no real provider.
9. Add repair dry run/write implementation and local fixture proof. Completion:
   dry run makes no changes; write changes only exact candidates and is
   idempotent.

## Required integration proof

- pure cutoff: before/equal/after/invalid;
- initial all-history import status/splits/counts;
- partial pagination failure + complete retry with no duplicates;
- incremental sync creates only post-cutoff pending;
- reconnect and token refresh preserve cutoff/completion;
- disconnect deletes state; new connection gets new cutoff;
- two-owner overlapping Strava IDs/cutoffs remain isolated;
- repair dry-run no write, exact write/idempotence, manual/other-owner untouched;
- callback error leaves connected/retryable state and same cutoff;
- redaction canaries absent from logs/responses.

When this draft becomes ready, name the focused integration test files and exact
command covering the classification, persistence, callback, repair, owner, and
loopback-provider scenarios above. Do not require the full repository gate.

## Required manual or visual proof

Disposable E2E at 1440/390:

1. creator/member athlete connects with provider fixture containing historical
   activities;
2. recent log shows confirmed imported history;
3. Review badge/page excludes that history;
4. provider fixture exposes one later activity and Sync is invoked;
5. exactly that activity enters Review;
6. success/error copy matches the accepted decision.

Also inspect local repair before/after counts. Never capture a usable token or
real athlete payload.

## Migration, rollout, and rollback

Additive columns and code are backward-compatible only if old code ignores them.
Remote migration and existing-data repair are distinct approved operations.
Release order: migration mechanism -> schema migration -> compatible code ->
read-only verification -> optional owner-targeted repair. Rollback code keeps
columns/state; use forward fix. A repair rollback requires the approved backup
or exact captured candidate IDs, never a broad status rewrite.

## Stop conditions

- “new activity” is redefined as upload time instead of Strava start time;
- reconnect/disconnect cutoff semantics change;
- migration cannot derive a safe existing cutoff;
- repair candidates cannot be bounded owner + Strava origin + cutoff + pending;
- initial retry needs a provider cursor not available from the current contract;
- real Strava/remote DB/deployment is required; or
- D-020/product copy is not updated to the new Inbox meaning.

## Completion criteria

- Initial history is confirmed and absent from Review.
- Only post-cutoff activity becomes pending.
- Cutoff is immutable across retries/reconnect and reset by true deletion/new
  connection.
- Partial initial import retry completes all older pages without duplicates.
- Existing-data repair is dry-run-first, exact, idempotent, and not run remotely.
- owner isolation, secrets, disconnect semantics, and full focused proof pass.
