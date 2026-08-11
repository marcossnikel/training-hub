# Training Hub environment boundaries

Training Hub is transitioning from a local single-user prototype to a product.
Every runtime must have a deliberately separate database and secret boundary;
a preview is disposable staging, never a read-only view of production.

## Current status

- **Validated now:** local and E2E use disposable file databases and the
  executable guard runs inside `npm run verify`.
- **Blocked:** [#20](https://github.com/marcossnikel/training-hub/issues/20)
  records the Vercel CLI issuer-certificate failure and missing Stripe CLI
  test authentication. Do not bypass TLS, create credentials, or substitute a
  production environment to make either tool work.
- **Not implemented:** product billing, Stripe webhooks, a preview deployment,
  and a production multi-user environment.

## Boundary matrix

| Environment | Database | Stripe | Credentials | Allowed work |
| --- | --- | --- | --- | --- |
| `local` | `file:data/app.db`; `TURSO_*` unset | Unset or test only | Local `.env.local` | Development, unit tests, local seed |
| `e2e` | `file:data/e2e.db`, seeded by Playwright | Unset | Throwaway E2E auth values only | `npm run verify` |
| `preview` / staging | Dedicated remote database whose host includes `preview` or `staging` | Test mode only | Preview-only values, separate Blob store and Strava app | Only after #20 is unblocked |
| `production` | Dedicated production database | Live mode only after explicit approval | Production-only Vercel values | Explicitly authorized human operations |

## Executable guard

Run the guard directly or through the full gate:

```bash
npm run check:env
npm run verify
```

## Disposable schema reset

The #23 fresh owner-schema cutover is intentionally local/E2E-only. A human may
explicitly reset the default disposable local database with `npm run db:reset`.
The reset command accepts only `file:data/app.db` or `file:data/e2e.db`, requires
its confirmation flag, and refuses any `TURSO_DATABASE_URL`, remote URL, preview,
or production environment. It must never be used for shared, preview, or
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

## Rules for builders and the Orchestrator

- Do not run a migration, seed override, backfill, or reset against a remote,
  shared, preview, or production database unless the assigned issue explicitly
  defines the target and rollback.
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
