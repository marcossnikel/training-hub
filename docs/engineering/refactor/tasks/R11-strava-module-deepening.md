# R11 — Deepen the Strava integration module

**Status:** done
**Delivery class:** API/backend
**Risk/model:** high — Terra high
**Depends on:** R9 and R14 done
**Unlocks:** R12 and R13

## Outcome

Strava transport, owner connection lifecycle, activity synchronization, and
lazy activity enrichment have small feature-owned interfaces. Developers can
change one concern and test it with a local provider double and disposable DB
without loading or mocking the 740-line `src/lib/strava.ts` module.

## Required context

- accepted R9 implementation/tests and the current product Strava decisions;
- `src/lib/strava.ts`, `strava-byo.ts`, `strava-lifecycle-actions.ts`,
  `byo-connection-actions.ts`, `src/lib/db/strava-auth.ts`, and callback/connect
  routes;
- `src/lib/strava.test.ts`, `strava-byo.test.ts`, connection/lifecycle tests,
  route tests, and local E2E provider;
- installed Next.js route/runtime docs when route entry points change;
- token encryption/redaction, owner context, DB activity/detail/stream modules.

## Current behavior and evidence

`src/lib/strava.ts` exports connection checks, deauthorization, auto-sync,
OAuth exchange, generic API GET/retry behavior, gear fetching, activity detail
and stream parsing/caching, request observers/backoff seams, and full activity
sync. It therefore changes for transport policy, provider mapping, sync policy,
DB cache policy, and test instrumentation. Tests can observe or mutate global
backoff/request behavior, coupling internal implementation to callers.

R9 deliberately fixes cutoff and pagination semantics before this structural
split. This task must treat those accepted state-machine tests as a contract,
not redesign them.

## Locked decisions

1. Organize under `src/features/strava/server/` by responsibility:
   - provider transport/OAuth and provider DTO mapping;
   - owner-bound connection lifecycle and encrypted credentials;
   - activity sync orchestration/classification;
   - lazy detail/stream/gear enrichment and cache persistence.
2. Define one narrow provider client boundary because Strava is a true external
   system with a local fake. Do not hide local SQLite behind the same port.
3. Provider DTOs terminate at the mapping boundary. Feature/domain inputs must
   use internal named types and explicit timestamp/unit conversion.
4. The sync use case owns pagination/checkpoint decisions and calls owner-bound
   persistence directly; transport must not know Review status or DB rows.
5. Connection lifecycle owns token exchange, encryption, refresh, reconnect,
   deauthorization, and deletion semantics. Tokens never appear in domain
   results, logs, action results, or browser props.
6. Lazy detail/stream fetching retains current best-effort behavior and cache
   meaning; provider failure must not corrupt an existing cached value.
7. Replace global mutable request observers/backoff overrides with an injected
   client/clock/sleeper only at the external boundary. Do not expose new test-
   only production APIs.
8. Route handlers parse HTTP/OAuth input, call the feature, and map redirects or
   responses. They do not own connection/sync policy.
9. Compatibility exports expire inside this task unless R12 names an exact
   caller and removal step.

## Protected invariants

- R9 cutoff, initial completion, retry idempotence, counts, and repair behavior;
- BYO Strava credentials and currently accepted scopes/callback validation;
- owner-scoped credentials, activities, gear, streams, detail, and deletion;
- encryption at rest and redaction of tokens/codes/raw payloads;
- rate-limit/retry bounds and no retry of unsafe/non-retryable effects;
- unique owner + Strava activity behavior and no duplicate imports;
- existing cached detail/stream fallback and insight evidence integrity;
- no real Strava, remote DB, or live deauthorization in tests.

## Permitted scope

- feature-owned Strava server modules/types and a local provider implementation;
- move/split focused tests around public feature interfaces;
- update route, action, page, and DB callers to the new interfaces;
- delete replaced code, global test seams, and temporary exports;
- improve redacted telemetry at stable feature outcomes.

## Non-goals

- webhooks, queues, cron/background synchronization, or new provider scopes;
- changing BYO credential product policy;
- another sports provider or a generic multi-provider framework;
- schema/behavior changes beyond a separately documented defect found while
  characterizing the accepted R9 behavior;
- refactoring the activity page/chart or all activity persistence.

## Proposed public interfaces

Names may adapt to local conventions, but responsibilities may not merge back:

```ts
type StravaProvider = {
  exchangeAuthorizationCode(input: ProviderAuthorization): Promise<ProviderTokens>;
  deauthorize(accessToken: SecretToken): Promise<void>;
  listActivities(input: ActivityPageRequest): Promise<ActivityPage>;
  getActivityDetail(id: string): Promise<ProviderActivityDetail>;
  getActivityStreams(id: string): Promise<ProviderActivityStreams>;
  listAthleteGear(): Promise<ProviderGear[]>;
};

connectStrava(owner, authorization): Promise<ConnectionOutcome>;
disconnectStrava(owner): Promise<DisconnectOutcome>;
syncStravaActivities(owner): Promise<SyncOutcome>;
loadActivityEnrichment(owner, activityId): Promise<ActivityEnrichment>;
```

The actual provider client may bind credentials per request/session rather than
store them on a shared object. Results must be secret-free and discriminated.

## Implementation sequence

1. Refresh the call/dependency map after R9 and write the final interface list.
   Completion: every current export/caller belongs to transport, lifecycle,
   sync, enrichment, or an explicitly shared type.
2. Pin R9/lifecycle/transport/cache characterization tests to public outcomes.
   Completion: tests do not require the final file layout but fail on semantic
   drift, cross-owner access, or secret exposure.
3. Extract provider transport and DTO mapping behind the narrow provider
   boundary; adapt route/provider fakes. Completion: provider retries/mapping
   test without DB and no sync policy appears in transport.
4. Extract connection lifecycle with encrypted persistence. Completion: connect,
   refresh/reconnect, disconnect, failure, and owner isolation pass with tokens
   absent from observable results.
5. Move R9 sync orchestration intact onto the provider boundary and real
   disposable SQLite. Completion: initial/incremental/partial retry stories pass
   without internal backoff/request observers.
6. Extract detail/stream/gear enrichment and cache behavior. Completion: hit,
   miss, provider failure, malformed payload, and other-owner cases pass.
7. Migrate callers, remove old exports/global test seams, and inspect cycles.
   Completion: `src/lib/strava.ts` is deleted or contains only a named temporary
   compatibility item with R12 expiry; dependency-cycle gate passes.
8. Run local provider E2E and secret-canary audit. Completion: complete connect
   -> initial import -> later sync -> enrichment -> disconnect works locally.

## Required automated proof

- provider mapping: valid/malformed timestamps, units, pagination, HTTP errors,
  rate limits, bounded retries, refresh behavior, and redaction;
- lifecycle: connect/reconnect/refresh/disconnect, encrypted storage, failures,
  owner isolation, and no browser-visible token;
- every R9 classification, completion, pagination, and repair test;
- enrichment cache hit/miss/failure and cross-owner denial;
- route tests limited to validation, callback-state handling, and mapping;
- loopback provider E2E with no network to Strava;
- dead export/cycle/static checks.

```sh
npm run verify:fast
npx playwright test e2e/byo-connection.spec.ts e2e/tenant-isolation.spec.ts
npm run test:e2e:production
npm run verify
```

## Required manual or visual proof

Using disposable local accounts/provider at 1440 and 390, record connect,
historical import, a later activity entering Review, detail/chart enrichment,
reconnect, and disconnect. Inspect server output with a unique fake secret/code
canary and prove it never appears in logs, responses, screenshots, or artifacts.

## Migration, rollout, and rollback

No new data migration is expected after R9. Structural compatibility is one
release and temporary exports expire inside this task. Rollback is the previous
code revision using the R9-compatible schema/state. No remote provider call,
migration, repair, deploy, or deauthorization is authorized by this task.

## Stop conditions

- accepted R9 behavior is not yet stable/verified;
- the provider needs an unresolved pagination/retry/refresh policy;
- extraction exposes secrets or weakens owner-bound persistence;
- a real provider/shared DB is needed for proof;
- a discovered behavior defect requires product/data migration judgment; or
- an overlapping action/activity refactor makes ownership ambiguous.

## Completion criteria

- Transport, lifecycle, sync, and enrichment each have one small tested seam.
- R9 semantics, BYO policy, encryption, redaction, and owner isolation hold.
- Automated proof uses the provider fake plus real disposable SQLite.
- Old broad exports/global test hooks are removed or have an exact R12 expiry.
