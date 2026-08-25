# Training Hub environment boundaries

Training Hub is transitioning from a local single-user prototype to a product.
Every runtime must have a deliberately separate database and secret boundary;
a preview is disposable staging, never a read-only view of production.

## Current status

- **Validated now:** local and E2E use disposable file databases, the
  executable guard runs inside `npm run verify`, and production invitation
  issuance has a separate explicit Vercel/Turso approval boundary.
- **Blocked:** [#20](https://github.com/marcossnikel/training-hub/issues/20)
  records the Vercel CLI issuer-certificate failure and missing Stripe CLI
  test authentication. Do not bypass TLS, create credentials, or substitute a
  production environment to make either tool work.
- **Not implemented:** product billing, Stripe webhooks, and a dedicated
  preview deployment.

## Boundary matrix

| Environment | Database | Stripe | Credentials | Allowed work |
| --- | --- | --- | --- | --- |
| `local` | `file:data/app.db`; `TURSO_*` unset | Unset or test only | Local `.env.local` | Development, unit tests, local seed |
| `e2e` | `file:data/e2e.db`, seeded by Playwright | Unset | Throwaway E2E auth/encryption values and a loopback Strava double only | `npm run verify`, `npm run test:e2e:production` |
| `preview` / staging | Dedicated remote database whose host includes `preview` or `staging` | Test mode only | Preview-only values, separate Blob store and Strava app | Only after #20 is unblocked |
| `production` | Dedicated production database | Live mode only after explicit approval | Production-only Vercel values | Explicitly authorized human operations |

## Canonical variable catalog

The executable catalog in `src/server/config/catalog.ts` is the source of
truth. `.env.example` supplies blank placeholders for every deployable value;
this list records their owner rather than their values.

| Variable | Owner | Secret |
| --- | --- | --- |
| `TRAINING_HUB_ENV`, `VERCEL_ENV`, `STRIPE_MODE` | runtime boundary | no |
| `DATABASE_URL`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | database target | token only |
| `TRAINING_HUB_TURSO_DATABASE_URL`, `TRAINING_HUB_TURSO_AUTH_TOKEN`, `ALLOW_REMOTE_DB` | database target/operator scripts | token only |
| `TRAINING_HUB_PRODUCTION_APPROVED` | production approval | no |
| `STRAVA_CONNECTION_ENCRYPTION_KEY`, `TRAINING_HUB_PUBLIC_ORIGIN` | Strava credentials and callback | key only |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | authentication | secret only |
| `BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_ID` | storage | token only |
| `BETA_INVITE_REGISTRATION_ENABLED`, `TRAINING_HUB_PRODUCTION_INVITES_ENABLED` | invite registration | no |
| `TRAINING_HUB_INVITE_PRODUCTION_ORIGIN`, `TRAINING_HUB_INVITE_PREVIEW_ORIGIN`, `TRAINING_HUB_INVITE_TARGET`, `TRAINING_HUB_DISPOSABLE_DATA` | invite CLI | no |
| `TRAINING_HUB_OWNER_ID` | one-off owner-scoped scripts | no |
| `TRAINING_HUB_INSIGHT_FEEDBACK_ENABLED` | insight-feedback beta path | no |

Test harness controls (`E2E_*`, `TRAINING_HUB_E2E`, and the loopback Strava
provider origin) are composed only by Playwright and never copied into an
operator environment file.

## Executable guard

Run the guard directly, the fast ordinary-edit gate, or the release/milestone gate:

```bash
npm run check:env
npm run verify:fast
npm run verify
```

`verify:fast` runs every maintained non-browser check: environment and retired
configuration guards, type checking, linting, formatting, unit tests, dead-code,
and cycle checks. `verify` composes that command with the full Playwright suite.

For a command-owned production-server smoke, run:

```bash
npm run test:e2e:production
```

This command uses `next build` followed by `next start`, but it remains the
`e2e` runtime: it seeds only `file:data/e2e.db`, clears Turso credentials, uses
throwaway auth/encryption values, and starts the loopback-only Strava double.
It does not use production data, approval markers, Stripe values, or real
provider requests. The smoke refuses to reuse an already-running server and
checks the guest landing and `/login` email/password form for HTTP and browser
runtime/console errors.

## Disposable schema reset

The #23 fresh owner-schema cutover is intentionally local/E2E-only. A human may
explicitly reset the default disposable local database with `npm run db:reset`.
The reset command accepts only `file:data/app.db` or `file:data/e2e.db`, requires
its confirmation flag, and refuses `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`,
remote URLs, and `VERCEL_ENV=preview` or `production`. It must never be used for shared, preview, or
production data; those environments require a separately approved migration and
rollback plan after real beta data exists.

It defaults to `local`, never reads or prints secret values, and rejects:

- remote database URLs or `TURSO_*` in local/E2E;
- a preview without `VERCEL_ENV=preview`, a dedicated preview/staging host, or
  Stripe test mode;
- `ALLOW_REMOTE_DB=1` in preview;
- live Stripe mode or live-key-shaped values outside production; and
- a production check without a dedicated remote database, Vercel production
  metadata, and an explicit human approval marker.

Use only non-secret placeholders when validating preview policy:

```bash
TRAINING_HUB_ENV=preview \
VERCEL_ENV=preview \
TURSO_DATABASE_URL=libsql://training-hub-preview.example \
STRIPE_MODE=test \
npm run check:env
```

## Rules for local implementation agents

- Do not run a migration, seed override, backfill, or reset against a remote,
  shared, preview, or production database unless the operation is explicitly
  approved. The guarded `beta:invite` command is the sole exception for issuing
  or revoking one production invitation after its production target checks pass.
- Local and E2E data are disposable. Keep `.env.local`, `data/`, `.vercel/`,
  and Playwright auth state uncommitted.
- Do not run `vercel env pull` for production or deploy/promote production from
  autonomous work. #20 must document a working, safe preview/log workflow
  first.
- Do not run Stripe in live mode, create live objects, or use live keys. The
  product has no billing route yet; future test-mode work begins only in the
  billing issues.
- The existing seed/backfill scripts refuse remote databases unless a human sets
  `ALLOW_REMOTE_DB=1`. Autonomous local or preview work must not set it.

## Retired Strava credential decommission

After the source cleanup is deployed, the follow-up operator must verify the
deployed commit includes the passing `npm run check:retired-strava-config` gate,
then smoke the cookie-free connection entrypoint and the authenticated BYO
handoff without submitting credentials or touching imported data. Review the
deployed source and redacted logs for owner-bound connection handling; never
inspect, print, or paste secret values to establish this.

Only after that clean deployment and smoke result may an explicitly authorized
operator remove unused global Strava credential variables from Preview and
Production configuration. Remove configuration one environment at a time and
record only variable names and outcomes. The old configuration is not a
rollback mechanism: source rollback is the only permitted recovery for a
verified application regression.
