# Training Hub

Training Hub is becoming a focused personal training-intelligence product for
self-coached athletes. The repository currently contains a **single-user local
prototype** with Strava sync, activity review, gear mileage, journals,
performance analysis, and race/block comparison. It is not yet a multi-user
product or a hosted Strava integration.

The v0 direction and delivery queue live in the
[GitHub Project](https://github.com/users/marcossnikel/projects/2) and
[GitHub Issues](https://github.com/marcossnikel/training-hub/issues).

## Current boundaries

- The current app resolves one owner and one Strava connection. Multi-tenant
  accounts, secure per-user connections, and BYO Strava onboarding are planned
  work, not capabilities to promise today.
- The beta will use an athlete's own Strava developer app until a compliant
  standard connection model is available. Never use founder credentials as a
  product default.
- Billing is not implemented. Do not create live Stripe products or deploy a
  product change without the relevant issue and approval.
- The v0 direction is evidence and context, not generic AI coaching or
  medical/readiness advice.

## Stack

- Next.js 16, React 19, TypeScript, shadcn/ui, and Tailwind CSS
- SQLite/libSQL with plain SQL; no ORM
- Local file storage for development and Vercel Blob for uploaded photos when
  a deployment is configured

## Local development

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Create a Strava API application at
[strava.com/settings/api](https://www.strava.com/settings/api), set its local
callback domain to `localhost`, and add its credentials to `.env.local` when
you need real sync. Leave `TURSO_*` empty locally: development uses
`data/app.db` and must never target a shared or production database.

To explore the UI without Strava:

```bash
npm run seed
npm run seed:clear
```

Write scripts reject remote database URLs by default. Do not override that
guard unless the assigned GitHub issue explicitly requires it.

After pulling the owner-schema cutover, reset only a disposable local or E2E
database with the explicit command below, then run `npm run seed`. The command
accepts only `data/app.db` or `data/e2e.db`, rejects `TURSO_DATABASE_URL`, and
will not run in preview or production. Never reset a remote, shared, preview,
or production database.

```bash
npm run db:reset
npm run seed
```

## Verification

Run the full local gate before handing work back:

```bash
npm run verify
```

`AGENTS.md` defines the repository operating rules. GitHub Issues carry the
scope, acceptance criteria, dependencies, and delivery status; do not revive
historical plans from Git history as an active backlog.

## Environments and deployment

Read [the environment boundary policy](docs/environment-boundaries.md) before
using remote databases, Vercel, or Stripe tooling. Local and E2E work are
validated against disposable file databases. Preview/Vercel and Stripe CLI
authentication are explicitly tracked blockers, not setup steps agents may
work around.

## Data handling

`data/` (local SQLite and uploads) and `.env.local` are ignored by Git. The
only preserved founder data needed for productization—shoe mileage—has already
been exported; development/beta schema work can use a clean reset when the
relevant data-lifecycle issue approves it.
