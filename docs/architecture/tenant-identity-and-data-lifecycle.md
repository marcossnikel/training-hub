# Tenant identity and data lifecycle

**Status:** implementation-ready technical design for #21; no provider account,
credentials, package, schema, or runtime behavior is selected or changed here.

**Decision boundary.** This document recommends an implementation direction for
D-012; accepting that recommendation remains a deliberate Product & Architecture
decision at #22. D-013 remains **Open** and blocks any user-facing privacy,
scope, retention, or deletion promise in #26/#27.

## Outcome and non-goals

The next foundation work must make two simultaneous accounts safe: a request can
only act as the server-derived account in its session, and every persisted record
and private blob belongs to that account. The existing single-user database may
be discarded under accepted D-005. This is a technical design, not a migration or
an authorization implementation.

It does not choose a hosted provider account, email sender, production database,
Strava policy interpretation, retention duration, or a legal privacy commitment.
It does not authorize a shared/founder Strava application.

## Current-code inventory (implementation seams)

This is an inventory of current code, not an assertion that old planning docs are
accurate. `src/lib/identity.ts` returns singleton `{ id: 1 }`; it has no request
or session input. `src/lib/auth.ts` is a shared owner-password HMAC cookie gate
(`th_session`), not accounts. When its environment secrets are absent it allows
every caller. `src/proxy.ts` redirects at the edge/proxy, but helpers, pages, and
server actions still query global data. Therefore proxy protection is never the
authorization mechanism for tenancy.

### Tables and ownership conversion

| Current table / relation | Current ownership and data | Required owner-scoped target |
| --- | --- | --- |
| `schema_version` | global migration marker | stays global; never tenant data |
| `users` (new) | absent | root local profile: immutable text/UUID `id`, unique normalized `auth_subject`, created/deleted timestamps; no secrets |
| provider auth tables (new) | absent | library-owned account/session/verification records; `auth_subject` is the only identity bridge, never an authorization substitute |
| `athlete_profiles` (new) | singleton implicit athlete | one row per `users.id` (`user_id` PK/FK); thresholds/profile defaults. Keep a distinct athlete profile so a future organization model does not redefine `users`. |
| `strava_connections` (replaces singleton `strava_auth`) | `id = 1`, plaintext access/refresh token and expiry | `id`, `user_id` FK, encrypted client secret/access/refresh ciphertext plus key version, expiry, Strava athlete id, granted scope, state, timestamps. `UNIQUE(user_id)` initially; `UNIQUE(user_id, strava_athlete_id)` after policy for reconnect/identity mismatch is selected. |
| `oauth_states` (new, short-lived) | cookie-only random `strava_oauth_state` | hashed state, `user_id` FK, connection intent, redirect allowlist key, created/expiry/consumed timestamps; one-time consume transaction. |
| `activities` | global; globally unique `strava_id`; raw/detail JSON, notes, `bike_id` | add non-null `user_id` FK. Use `UNIQUE(user_id, strava_id)` (nullable external IDs allowed) and indexes `(user_id, started_at DESC, id DESC)`, `(user_id, status, started_at)`, `(user_id, bike_id)`. Every activity read/write predicates owner and id together. |
| `activity_splits` -> `activities`, optionally `shoes` | child activity and cross-table shoe reference | retains activity FK cascade; all access joins through owner-scoped activity. Validate referenced shoe has same `user_id` in repository/service transaction; SQLite cannot express this composite ownership with the current key shape. |
| `activity_streams`, `activity_metrics`, `activity_best_efforts`, `activity_curve_points` -> `activities` | activity-derived streams, metrics, best efforts, curve points | keep FK cascade and never expose direct child lookup by activity id without an owner-scoped parent join. Optional redundant `user_id` is not source-of-truth and is deferred; if added for indexing it must be composite-FK validated. |
| `shoes`, `bikes` | global names, globally unique `strava_gear_id`, `photo_path` | add non-null `user_id`; replace global unique gear IDs with `UNIQUE(user_id, strava_gear_id)`, index `(user_id, retired_at, name)`. Blob object key must be owner-prefixed and stored reference is treated as private data. |
| `athlete_thresholds` | singleton `id = 1` | replace with `athlete_profiles` columns or `athlete_thresholds(user_id PK/FK)`; do not retain `id=1`. |
| `athlete_goals` | global goals | add `user_id` FK and `(user_id, race_date, id)` index; all list/delete predicates include owner. |
| `app_meta` | global key/value: `athlete_name`, `last_sync_at`, `baseline_date`, weekly digest keys | replace with `user_meta(user_id, key, value, PRIMARY KEY(user_id,key))`; better yet move typed connection/profile fields out of meta. No global key is tenant data. |
| deleted historical `health_metrics` / `activity_load` | migration 15 drops them | do not revive. If reintroduced, they require `user_id`, per-user uniqueness, and owner indexes from day one. |

The foreign-key graph is `users -> athlete_profiles, strava_connections,
oauth_states, user_meta, activities, shoes, bikes, athlete_goals`; `activities
-> activity_splits/activity_streams/activity_metrics/activity_best_efforts/
activity_curve_points` and `activities -> bikes`; splits point to
shoes. Delete order is connection secrets/OAuth state/blobs and dependent rows,
then root user, within the accepted lifecycle policy. Foreign keys are a safety
net; server-side predicates remain mandatory because a valid foreign key does
not prove the caller owns a supplied numeric ID.

### Query, singleton, route, blob, and script seams

All exported functions in `src/lib/db/activities.ts`, `bikes.ts`, `shoes.ts`,
`curves.ts`, `goals.ts`, `metrics.ts`, `benchmarks.ts`, and `zones.ts`
currently query globally. Their reads, mutations, aggregations, caches, and
upserts must accept a required `OwnerContext` (or be methods on an owner-bound
repository); no public helper accepts a caller-provided `userId`. In particular:

- Direct numeric-ID seams: `/activity/[id]`, activity journal/splits/review,
  activity-bike/race changes, stream/detail/metric writers, goals and
  shoes/bikes update/retire/gear actions. A guessed ID must return not-found or
  a generic authorization result, never another tenant's data.
- List/aggregate seams: log, review, gear/bikes/shoes, performance, races and
  comparison, settings, root layout pending badge, curve and
  backfill candidates. `countPending` is currently React-cached without an owner
  argument and must become `countPending(owner.id)` so its cache key cannot cross
  tenants.
- Singleton seams: `currentAthlete`/`requireAthlete`, `strava_auth(id=1)`,
  `athlete_thresholds(id=1)`, global `app_meta`, `AUTH_PASSWORD`/`AUTH_SECRET`,
  process-wide Strava credential environment and `strava_oauth_state` cookie. The
  first four become per-user storage; the password gate is removed only as part
  of #22 after the new session boundary exists. Environment-wide Strava
  credentials must not be silently reused in BYO mode.
- Strava seams: `src/lib/strava.ts` gets/saves the singleton auth, writes global
  metadata, deduplicates on global `strava_id`, and is called by connect/callback,
  sync, pages, scripts, and lazy detail/stream reads. It must receive the server
  owner context and a connection record, and dedupe by `(user_id,strava_id)`.
- Route seams: `/api/strava/connect`, `/api/strava/callback`, and
  `/api/uploads/[name]`; only callback may be unauthenticated at entry, and it
  must bind to a valid, unconsumed stored OAuth state. `/api/uploads/[name]`
  currently authorizes only through proxy and filename; it must resolve an
  owner-scoped blob record/key after session authorization.
- Blob/file seams: `storePhoto`, `deletePhoto`, `photoSrc`, `UPLOADS_DIR`,
  `shoes.photo_path`, and `bikes.photo_path`. Mint keys such as
  `user/<opaque-user-id>/gear/<uuid>.<ext>`; never use a client filename or a
  bare globally guessable name as authority. Deletion queues/retries must retain
  only opaque object keys in logs.
- Operational seams: `scripts/seed.ts`, phase seed, backfills, and
  `fetch-history.ts` currently target the global database/connection. They must
  require an explicit local/E2E fixture owner and refuse remote targets under the
  existing environment guard. Production-like repair tooling must be designed
  separately after beta data exists.

## Authentication options (D-012 input)

All options below require a separate local/E2E database and fake/captured email
delivery for deterministic tests. They do not replace owner predicates in this
document.

| Option | Next 16 + libSQL/Turso fit | Session/recovery/revocation | Testing and lifecycle | Cost / lock-in |
| --- | --- | --- | --- | --- |
| **A. Better Auth, database sessions, email/password** | Application-owned tables alongside libSQL; Better Auth documents broad Kysely support including libSQL/sqld. Next integration and adapter compatibility must be spike-verified against the exact package versions before #22. | Server derives subject from validated session; use database session rows for logout-all/revocation. Email verification and reset need an app-selected mail sender. | Disposable local/E2E DB can seed two users and inspect sessions; user and auth data remain exportable SQL. Deletion must delete provider-library rows in the same lifecycle job. | Library/dependency lock-in, but no hosted identity data plane; ongoing cost is mail delivery/operations. |
| **B. Supabase Auth + local profile in Turso** | Supported SSR PKCE/password flow, but adds a separate managed Auth project/data plane from Turso and maps Supabase subject to local `users.auth_subject`. | Managed password/reset/email flow; documentation says reset does not reveal account existence and reset/confirmation need SMTP for production. Session expiry/revocation is provider-managed. | Local Supabase stack or a test project is an extra boundary; tests must prove a forged/mismatched JWT subject cannot select another Turso user. Deletion needs coordinated Auth API and local/Blob deletion with repair state. | Managed operational cost and explicit vendor/data-plane lock-in; identity export/deletion/recovery depend on provider capabilities. |
| **C. Clerk + local profile in Turso** | Mature Next server identity/session APIs, but sessions/users are hosted outside Turso and require provider keys. | Backend API supports session revocation and user deletion; password/recovery delivery is managed/configured through Clerk. | Provider test mode/tokens must be isolated from preview/prod; still run two-account local repository tests with injected subjects. Account deletion becomes a multi-system saga. | Highest SaaS lock-in and plan-sensitive feature/cost exposure; fastest hosted auth UI/operations, but adds an external processor. |

Primary-source basis: Better Auth lists libSQL/sqld among supported Kysely
dialects ([Better Auth database adapters](https://better-auth.com/docs/adapters/other-relational-databases));
Supabase documents SSR PKCE, email confirmation/reset behavior and SMTP
requirements ([Supabase password auth](https://supabase.com/docs/guides/auth/passwords));
Clerk documents server session revocation and user deletion ([session
revocation](https://clerk.com/docs/reference/backend/sessions/revoke-session),
[user deletion](https://clerk.com/docs/reference/backend/user/delete-user)).

**Recommendation (not an adopted provider decision):** choose **Option A,
Better Auth with database-backed sessions and email/password**, subject to a
time-boxed #22 compatibility spike. It best preserves the current libSQL/Turso
boundary, enables authoritative server identity and deterministic local/E2E
fixtures, and limits identity data-plane lock-in. Its real trade-off is that
Training Hub must own email delivery, abuse controls, upgrade monitoring, and
the recovery UX. If the spike finds an unsupported/unsafe libSQL or Next 16
combination, stop #22 and reconvene D-012; do not fall back to custom credentials
or the current shared password gate. Supabase and Clerk remain viable only if
the owner explicitly accepts their separate identity data plane and lifecycle
coordination cost.

## Session and authorization contract

1. A single server-only `requireCurrentUser()` validates the library session on
   every Server Component, route handler, server action, and Strava operation,
   returning `{ userId, authSubject, sessionId }` or a typed unauthenticated
   outcome. Proxy/middleware performs redirect UX only; it is not trusted as the
   sole check.
2. `getOwnerRepository(context)` is created server-side. Its SQL always includes
   `WHERE user_id = ?`; mutations use `WHERE id = ? AND user_id = ?`; child reads
   join `activities` with its owner predicate. Route IDs, form values, query
   params, and object names are untrusted inputs, never identity.
3. Server actions call `requireCurrentUser` before parsing/mutating and return a
   safe generic result for cross-owner IDs. Route handlers return 401 when no
   session and 404 (or a uniform 403 policy selected once) for an inaccessible
   owned resource; avoid an ID-existence oracle.
4. Sessions use secure, HttpOnly, `SameSite=Lax` cookies, explicit absolute and
   idle expiry, rotation per selected library defaults, and server-side session
   records. Logout invalidates the current record; password reset, account
   deletion, suspicious access, and an explicit "log out everywhere" invalidate
   all user sessions. Cookie expiry alone is insufficient for revocation.
5. Authentication subject creates/links exactly one local `users` record in a
   transaction. Application authorization uses only that local `userId`; no
   client-supplied email, provider ID, or Strava athlete ID authorizes data.

## Secrets, OAuth, logs, and connection lifecycle

`strava_connections` holds encrypted-at-rest client secret, access token, and
refresh token. Encrypt each independently with authenticated encryption using a
versioned envelope (`ciphertext`, nonce/IV, algorithm, `key_version`, timestamps);
the active data-encryption key comes from environment/secret management, never
the database. On read, decrypt only inside the server-side Strava client; on
write/refresh, encrypt with the current version. Rotation: introduce a new key
version, dual-read old/new, re-encrypt on successful use or a bounded owner-safe
job, record progress without plaintext, then retire the old key only after a
verified sweep and rollback window. Losing an old key means the connection is
unrecoverable and must be disconnected/re-authorized—not silently replaced.

Initiating OAuth requires a current session and creates a 10-minute, one-use
state row plus an HttpOnly state cookie. Store only a state hash in the DB; bind
it to `user_id`, connection intent, callback origin/environment, expiry, and
optional nonce. The callback validates cookie and hash in constant time,
atomically consumes the state before code exchange, derives the owner from that
state (not from the current callback cookie alone), and clears cookie/state on
all terminal paths. It must reject replay, expired state, mismatched origin,
and cross-account callback attempts. The existing global `STRAVA_CLIENT_*`
variables are replaced by a future BYO credential handoff only after D-013 and
#26 authorize it; this document makes no Strava scope claim.

Logs/audit events may contain opaque user/connection/session correlation IDs,
event category, outcome, and timestamps. They must never contain passwords,
session cookies, OAuth `code`/`state`, client secrets, access/refresh tokens,
authorization headers, raw Strava payloads, photo URLs, or free-text notes.
Redaction occurs at the telemetry boundary and error formatting boundary; tests
must inject canary secret values and prove they do not reach logs/responses.
Keep an audit event minimal and access-controlled; its retention is a D-013
adjacent policy decision, not a substitute for analytics or a record of activity
contents.

### Disconnect, deletion, retention, and D-013

Proposed implementation choices, pending acceptance:

- **Disconnect:** revoke/delete local encrypted connection material immediately,
  invalidate in-flight sync work through a connection generation/version, delete
  pending OAuth state, and stop future access. Imported activities/gear are
  retained or deleted only according to the accepted D-013 choice; UI must say
  which before confirmation.
- **Delete imported data:** idempotent request keyed by `(user_id, request_id)`;
  enter `deleting`, block sync/writes, delete owner blobs and child/root records,
  retry failed Blob deletion from a private work item, then mark complete. Do
  not report completion while an object deletion is unresolved.
- **Delete account:** reauthenticate, invalidate sessions first, execute the
  same owned-data deletion, remove local auth/profile records, and call any
  selected hosted provider deletion last/with a durable repair record. Preserve
  only the minimal non-content evidence required by a policy that has been
  accepted; today no such policy exists.
- **Retention:** three viable policy choices need an explicit D-013 decision:
  (1) retain imported data until user disconnects/deletes; (2) retain while the
  account is active plus a stated grace period; (3) auto-prune after a stated
  window. Each needs exact treatment of raw JSON, streams, derived metrics,
  backups, Blob objects, connection secrets, and audit records. No duration,
  scope, or external Strava-policy assertion is approved here.

**D-013 status: Open / implementation blocker.** Before #26/#27 merge, the
owner must accept minimum scopes, the selected retention option and exact
durations, whether disconnect deletes imports, deletion-request SLA/semantics,
backup treatment, and user-facing wording. Until then #22–25 may implement no
public lifecycle promise beyond safe internal fixtures; #26/#27 cannot claim
completion of connection/deletion behavior.

## D-005 reset and later migration policy

For #22–25, make a new schema and start with a fresh **local, E2E, and beta
dataset**: archive no production-like data, remove only explicitly identified
disposable local files under the current environment guard, run the new schema,
and seed two synthetic owners. The accepted preserved shoe-mileage export stays
outside automated import; re-entry is manual unless a later issue explicitly
approves a format and validation. Never run a reset/seed/migration against
remote/shared/preview/production merely because `ALLOW_REMOTE_DB` could exist.

Once real beta data exists, D-005's fresh reset no longer applies. A future
migration must be a separately approved issue with: backup/restore rehearsal on
a sanitized copy; an immutable versioned migration; pre/post row and ownership
counts; duplicate Strava and orphan-FK checks; encryption migration; a bounded
maintenance/rollback decision; verified tenant sampling; and a written policy
for failed Blob/provider deletes. No destructive schema rewrite or “reset to
fix it” is permitted on real beta data.

Rollback before real beta is: stop the new app release, discard the dedicated
disposable database and Blob namespace, rotate any test key, and recreate
fixtures. After beta, rollback is forward repair or restore from a rehearsed
backup—never an unreviewed reverse migration.

## Verification proof plan

### Automated gates and schema checks

1. Migration tests start from empty local and representative legacy fixtures;
   assert foreign keys enabled, all tenant tables have `user_id`/expected FKs,
   singleton checks are gone, indexes/unique constraints match this design, and
   duplicate Strava/gear values are accepted only across different owners.
2. Repository tests create users A/B with overlapping numeric IDs/external IDs
   where allowed. For every exported read/list/aggregate and every mutation,
   A sees only A, B sees only B, and cross-owner ID attempts neither read nor
   mutate. Include child tables, joins, cache keys, meta, thresholds, goals,
   blobs, sync dedupe, lazy detail/stream writes, and scripts.
3. Route/action negative tests run with missing, expired, tampered, revoked and
   A/B sessions. Cover pages, Server Actions, `/activity/[id]`, query-string
   race comparison, upload fetches, Strava connect/callback replay, and all
   guessed numeric IDs. Assert no response body, redirect, status distinction,
   cache, or log leaks another owner.
4. Session/recovery tests cover email-verification/reset token expiry,
   single-use/reset enumeration behavior, login rotation, current logout,
   logout-all, expiry/idle timeout, revocation after reset/deletion, and a
   library integration contract test using the chosen provider's supported test
   facility.
5. Encryption/redaction tests use deterministic test keys and canary values;
   assert DB stores ciphertext, old/new key versions decrypt during rotation,
   retired key handling fails closed, and telemetry/errors/serialized props do
   not include canary token, OAuth code/state, cookie, or client secret.
6. Lifecycle/reset drills test idempotent disconnect/delete retries, dependent
   cascades, Blob deletion failure repair, no sync after disconnect, and local/
   E2E reset refusal for remote configuration. Run the existing `npm run
   check:env` through `npm run verify` for every successor change.

### Two-account manual/E2E proof

Create two fixture accounts and separate browser contexts/storage state. Seed A
and B with deliberately similar activity IDs, gear names, goal dates, photo
keys, Strava IDs, metadata, and connections. For each context, capture desktop
and narrow-viewport evidence for log, review, activity detail, gear, performance,
races, settings, upload retrieval, connect/callback error, logout, and deletion
confirmation. Attempt A URLs/form payloads/object names using B's known IDs;
verify generic denial/not-found and unchanged B rows/blob. Repeat after session
expiry, explicit revocation, logout-all, and reconnect; inspect sanitized logs
for redaction. This is security/manual evidence, not an assertion that an
unavailable preview or a real Strava account was used.

## Granular successor sequencing

| Issue | Bounded responsibility / dependency |
| --- | --- |
| #22 | Accept D-012 after the Better Auth/Next 16/libSQL spike; implement real accounts and secure session primitives, including email/recovery design and server `requireCurrentUser`. No BYO UI. |
| #23 | Add owner relations and the core owner-scoped schema; perform the D-005 fresh local/E2E development reset. Depends #22. |
| #24 | Replace singleton identity in reads and Server Actions with identity derived from the server session. Depends #22/#23; no client-supplied owner identity. |
| #25 | Owner-scope activity, gear, journal, aggregate, and comparison queries. Depends #23/#24. |
| #26 | Add encrypted owner-scoped Strava connection storage and signed, owner-bound OAuth state. Depends #22/#23; no BYO UI, public scope, or retention promise. |
| #27 | Prove tenant isolation and session behavior with the automated and two-account evidence defined above. Depends #22–#26. |
| #28 | Remove or quarantine obsolete single-user paths after their tenant-aware replacements are accepted. Depends #24–#27. |
| #50 | Retire prototype generic Anthropic coach surfaces, including code, configuration, and persisted-state disposal under this document’s D-005 local/E2E reset posture. No obsolete coach state remains in a fresh schema. |

## Implementation checklist for the next builder

- [ ] D-012 provider/recovery decision recorded; chosen-library spike passes on exact Next 16/libSQL versions.
- [ ] All requests derive a server owner; no `id: 1`, global tenant query, or
      proxy-only authorization remains.
- [ ] Every table, foreign-key path, cache, query, blob, action, route, seed and
      script in the inventory has an owner-scoped implementation or explicit
      removal.
- [ ] D-005 fresh reset occurs only in disposable local/E2E/beta scope and is
      proven by environment guard.
- [ ] Encryption/key rotation/OAuth state/redaction tests pass.
- [ ] D-013 is accepted before any public scope, retention, disconnect, or
      deletion promise is merged.
- [ ] Automated and manual two-account evidence is attached to the successor PR.
