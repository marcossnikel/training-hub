# R14 — Persist truthful initial-import progress

**Status:** draft
**Delivery class:** API/backend
**Risk/model:** high — Terra high
**Depends on:** R2M and R9 done
**Unlocks:** R18

## Outcome

An owner can observe and safely resume one initial Strava import through
persisted factual stages and counters. The backend never exposes a fabricated
percentage, ETA, another owner's job, or secret/provider payload.

## Current truth

- `src/app/api/strava/callback/route.ts` promotes the connection, awaits the
  entire `syncActivities()` call, and redirects only after it finishes.
- `src/lib/strava.ts` paginates internally and returns aggregate imported and
  pending counts only at the end. Page-level state is not persisted.
- `src/lib/db/strava-auth.ts` persists only connection lifecycle state.
- `src/lib/db/meta.ts` has generic owner metadata, but no connection-scoped job
  state.
- R9 adds immutable review cutoff and initial-sync completion. R14 extends that
  state; it must not create a competing sync definition.

## Locked decisions

1. Import state is server-owned and scoped to one owner plus one connection
   lifecycle. Browser input can ask to observe/advance but cannot set stage,
   counters, cursor, cutoff, or completion.
2. Persist an import attempt/job with a stable ID, connection ID, status,
   current factual stage, cumulative counters, last successful page/cursor
   information needed by the provider contract, started/updated/completed time,
   retry count, and a redacted error category.
3. Status values are `queued`, `running`, `partial`, `completed`, and `failed`.
   Stage values describe work that actually exists: `fetching_activities`,
   `classifying_history`, `materializing_gear`, `aggregating_summary`, and
   `completed`. Do not emit a stage before its operation begins.
4. Persist job-work counters as unique outcomes keyed by the job and provider
   activity ID: `historical_confirmed_created`, `new_pending_created`,
   `already_present`, and identifiable `skipped_invalid`. One valid provider
   activity ID contributes to exactly one outcome at most once across page
   replay/retry. A malformed item without stable provider identity is only a
   per-response diagnostic and never enters a cumulative athlete total. Also
   persist pages successfully committed and canonical sport-family counts over
   unique outcomes. R9's owner + provider-ID identity remains authoritative.
5. `fetched` may describe the latest provider response/attempt for diagnostics,
   but is never added into a cumulative athlete/activity total. If exposed, its
   name and scope make that distinction explicit.
6. The status snapshot separates work progress from product facts. Available
   confirmed history, current pending total, sport mix, date coverage, and
   Consistency readiness are recomputed from committed owner-scoped read models;
   they are not reconstructed by summing attempt/job counters.
7. No percentage or ETA is returned unless a future provider contract supplies
   a trustworthy denominator. The API returns `percent: null` now.
8. One lease/compare-and-set rule prevents concurrent owners' tabs or retries
   from processing the same job simultaneously. An expired lease is resumable.
9. A bounded worker step processes at most one provider page or one named local
   aggregation transaction, persists progress, and returns. It does not rely on
   a browser tab staying open for correctness.
10. Callback may begin the job, and owner-scoped status/advance requests may
   resume it. Closing or skipping the UI may pause active work, but the next
   authorized visit/sync resumes without duplicates or lost pages. Continuous
   background execution is not promised until a separately accepted runtime
   mechanism exists.
11. Failure preserves the valid connection and same cutoff/job. Retry continues
   the same lifecycle and makes prior successful pages visible in counters.
12. Logs and API responses contain only redacted categories and counts: no
    access/refresh token, client secret, raw payload, activity name, athlete
    name, provider response body, or foreign owner identifier.

## May change

- additive migration and DB module for connection import jobs;
- the R9 sync orchestration boundary to expose bounded page/classification
  steps;
- owner-scoped status/advance route or server action;
- local provider fixtures and focused integration tests.

The builder may repair deterministic behavior-preserving pagination/counter
issues exposed inside the initial-import feature. A required live background
service, deployment change, or new provider contract is outside this task.

## Must remain true

- R9 cutoff classification and initial-completion meaning are unchanged;
- provider calls use the connection's owner-scoped credentials only;
- duplicate owner/provider activity IDs remain idempotent;
- no remote database or real Strava call is needed for proof;
- incremental sync cannot reuse or overwrite an initial-import job;
- callback and status routes retain safe auth/redirect/error behavior.

## Non-goals

- progress UI or Framer Motion;
- durable queue vendor, cron, webhook, or Vercel deployment configuration;
- gear lifecycle design beyond emitting the real stage/result supplied by R15;
- Training Analyst execution or stream/detail enrichment.

## Implementation map

1. Define job/state/counter types and transition table with pure tests.
   Completion: illegal regression, double completion, and foreign job access are
   representable as explicit results.
2. Add additive schema and owner/connection-scoped DB operations. Completion:
   creation, lease, monotonic update, failure, retry, and completion work against
   disposable SQLite.
3. Extract one bounded import step from R9 orchestration. Completion: an injected
   page-2 failure persists page-1 unique outcomes and retry finishes without
   counting either replayed page twice.
4. Add owner-scoped observation/advance boundary. Completion: guest/foreign
   access is indistinguishable from safe not-found; browser-supplied counters and
   cursor are ignored.
5. Compose callback/start and later resume paths. Completion: connection remains
   usable and job resumable after callback, refresh, navigation, and lease expiry.
6. Add redaction and counter/snapshot checks. Completion: canary secrets and
   payload fields are absent from response/log captures; job outcomes remain
   stable on replay while the committed-data snapshot matches owner records.

## Acceptance

- Counters increase only after committed work and survive process restart.
- Replaying a committed provider page changes no unique outcome or sport-family
  counter, while an actually new provider ID changes exactly one outcome.
- Retry after any page imports no duplicate and loses no older page.
- Concurrent advance requests process one leased step.
- Status is visible only to the owning authenticated account.
- `percent` and ETA remain absent/null without a real denominator.
- Partial/failed state retains a safe retry path and same R9 cutoff.
- Activation-facing confirmed/pending/sport/coverage facts equal committed
  owner records and never depend on the number of fetch attempts.

## Validation

Focused integration tests against disposable SQLite and the loopback Strava
double: transition table, lease race, page failure/retry, restart/resume,
replayed-page counter stability, job-outcome versus committed-snapshot parity,
owner isolation, redaction canaries, and callback composition. Name exact test
files/commands when converting this packet to `ready`; do not use browser proof
or the full repository gate for this API task.

## Migration, compatibility, and rollback

Additive job tables/columns only through R2M. Old code may ignore them. Rollback
leaves inert job records and must not reset R9 cutoff/completion. No remote
migration or data repair is authorized.

## Stop only if

The installed Next/runtime cannot safely expose a bounded resumable step without
a deployment-level service choice; provider pagination requires an unavailable
cursor contract; schema design conflicts with accepted R9 state; or proof needs
real provider/shared resources.
