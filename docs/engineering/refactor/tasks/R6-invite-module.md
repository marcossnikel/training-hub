# R6 — Deepen beta invitation management

**Status:** draft
**Risk:** high
**Recommended builder:** Terra high
**Depends on:** R3 and R2M
**Unlocks:** R7

## Outcome

Creator-authorized issue/list/revoke behavior and registration validation sit
behind one feature-owned interface, while invitation tokens remain single-use,
email-bound, atomic, and unrecoverable after initial display.

## Required context

- D-014 in product decisions and `docs/engineering/BETA_INVITES.md`
- `src/lib/beta-invites.ts`, tests, Better Auth hooks in `src/lib/auth.ts`
- current CLI, E2E invite fixture/spec, migration framework from R2M
- R3 creator capability interface and R2 canonical origins

## Current behavior and evidence

One 300+ line module combines token/email policy, environment target policy,
schema creation, trigger installation, validation, issue/revoke persistence, and
URL construction. The schema is created dynamically only when registration is
enabled. Issuance/revocation is CLI-only; `issued_by` is arbitrary operator text;
revocation requires the plaintext token; there is no safe summary list.

## Locked decisions

1. Preserve token format, digest-only storage, normalized email binding,
   seven-day default expiry, generic registration failure, and same-transaction
   redemption with Better Auth user/account/session creation.
2. Move durable invitation schema/trigger ownership into additive migrations.
   The registration feature flag gates behavior, not whether the table exists.
3. Add `issued_by_user_id` referencing the application creator. Preserve legacy
   `issued_by` only through the named compatibility window needed by the CLI;
   remove it in R13 after cutover evidence.
4. Public module interface is limited to:
   - issue invitation for authenticated creator;
   - list redacted invitation summaries for authenticated creator;
   - revoke active invitation by opaque database ID for authenticated creator;
   - validate/consume registration through the existing auth integration.
5. A summary contains ID, intended email, creator-safe timestamps, and computed
   status only. It never contains token hash, plaintext token, auth subject, or
   redeemed account details.
6. The plaintext URL/token exists only in the immediate successful issue result,
   which returns `{ inviteUrl, intendedEmail, expiresAt }` for presentation.
   `intendedEmail` is the server-normalized bound email and `expiresAt` is the
   persisted UTC expiry; later reads return neither URL nor token.
7. Reissue creates a new invite; old tokens are never reconstructed.
8. Current exact environment/canonical-origin protections remain in the server
   composition. Browser input never chooses target/origin.
9. The CLI is a temporary second adapter using the same module during rollout;
   no duplicate issue/revoke SQL remains.
10. Invite management is deployment-scoped operational data: any authenticated
    creator may list or revoke invites issued by another creator in that same
    environment. `issued_by_user_id` is audit provenance, not an ownership
    boundary. Members and creators in a different deployment cannot access it.

## Protected invariants

- invite registration disabled means server sign-up denied;
- invalid/expired/revoked/redeemed/mismatched attempts are indistinguishable;
- concurrent use redeems at most once and failed account creation rolls back;
- member/guest cannot issue, list, or revoke even by direct action call;
- token/hash/secret absent from logs, list results, telemetry, and later reads;
- creator role does not reveal or mutate athlete data.

## Permitted scope

- `src/features/invites/` module/policy/persistence composition;
- additive invite schema migration and migration tests;
- auth-hook imports without changing Better Auth provider/session behavior;
- CLI adapter migration and invite tests/docs.

## Non-goals

- admin UI or visual design;
- email delivery;
- general user administration;
- public waitlist/self-service registration;
- running a remote migration.

## Implementation sequence

1. Characterize every existing invite invariant at the current external
   interfaces. Completion: behavior remains protected independent of file moves.
2. Add additive schema/trigger migration with legacy-row strategy. Completion:
   fresh and current-schema fixtures reach the same usable invite schema.
3. Define the small invite interface and redacted summary/status model.
   Completion: callers need no SQL/token-policy knowledge.
4. Move pure policy and persistence behind the interface. Completion: auth hook
   and CLI call the module; no duplicate implementation remains.
5. Add creator authorization before issue/list/revoke work. Completion: member
   denial occurs before target resolution or DB mutation.
6. Replace token-based creator revocation with ID-based module revocation while
   keeping registration token behavior unchanged. Completion: later management
   never needs plaintext token.
7. Update engineering documentation from CLI-only to temporary CLI + planned UI
   ownership. Completion: no contradictory “no admin UI” rule remains.

## Required automated proof

- existing invite tests preserved at the new interface;
- migration fresh/current/legacy coverage;
- creator success and member/guest denial before DB calls;
- immediate issue result returns exact normalized email, persisted expiry, and
  URL while every later read omits URL/token;
- list redaction and all statuses;
- ID revocation idempotence, second-creator operational access, and member denial;
- token canary absent from logs/summary serialization;
- concurrent redemption and failed-account rollback.

```sh
npm run verify:fast
npx playwright test e2e/beta-invite.spec.ts
```

## Required manual or visual proof

Use local CLI adapter once against disposable DB, capture only redacted success
metadata in evidence, and verify one link can register once. Never store the
printed URL in repository evidence. No UI proof.

## Migration, rollout, and rollback

Additive schema and trigger migration; production execution requires the R2M
operator gate and explicit authority. Old code compatibility must be stated.
Rollback uses previous CLI/auth code while retaining added columns/table; do not
drop invitation data. Legacy `issued_by` expires in R13 after R7 proof.

## Stop conditions

- atomic redemption would move out of the account transaction;
- creator authorization cannot be checked before operational reads/writes;
- migration strategy for existing invites is ambiguous;
- a list result needs token/hash/auth-subject data; or
- a remote migration/real invite is required.

## Completion criteria

- One deep invitation interface owns operational and registration behavior.
- Existing security/lifecycle invariants pass.
- Creator/member/guest authorization is proven.
- Summary and logs are token-secret free.
- CLI contains composition only and has an explicit expiry.
- no remote environment was touched.
