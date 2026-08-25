# Training Hub

Training Hub is a pre-production personal training-intelligence product for
self-coached athletes. It has account-scoped Strava sync, activity review, gear
mileage, journals, performance analysis, weekly/comparable evidence, and a
private-beta foundation. Marcos is currently the only user. It is not yet a
hosted Strava integration or a released product.

Current product direction lives in [the product roadmap](docs/product/ROADMAP.md)
and accepted behavior in [the decision log](docs/product/DECISIONS.md). The
executable engineering queue lives in
[the implementation roadmap](docs/engineering/refactor/ROADMAP.md). GitHub
issues may track work but are not implementation authority.

## Current boundaries

- Each signed-in athlete owns their own encrypted Strava connection. BYO Strava
  onboarding is the current beta path; do not add a shared credential to local
  configuration or a deployment.
- The beta will use an athlete's own Strava developer app until a compliant
  standard connection model is available. Never use founder credentials as a
  product default.
- Billing is not implemented. Do not create live Stripe products or deploy a
  product change without a ready task and explicit approval.
- New beta registration is invitation-only and enforced by the server. Read
  [the private-invitation operator boundary](docs/engineering/BETA_INVITES.md)
  before using the local issuance command.
- The product is evidence-linked training analysis, not workout prescription,
  generic chat, or medical/readiness advice.

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
callback domain to `localhost`, then sign in and submit that app's credentials
in Settings when you need real sync. Leave `TURSO_*` empty locally: development uses
`data/app.db` and must never target a shared or production database.

To explore the UI without Strava:

```bash
npm run seed
npm run seed:clear
```

Write scripts reject remote database URLs by default. Do not override that
guard without an explicitly authorized task and environment.

After pulling the owner-schema cutover, reset only a disposable local or E2E
database with the explicit command below, then run `npm run seed`. The command
accepts only `data/app.db` or `data/e2e.db`, rejects `TURSO_DATABASE_URL`, and
will not run in preview or production. Never reset a remote, shared, preview,
or production database.

```bash
npm run db:reset
npm run seed
```

## Implementation and verification

`AGENTS.md` defines the repository operating rules. A ready task packet contains
scope, decisions, acceptance, and proof. The default invocation is simply
`Realize Rxx` in a fresh Codex task.

- API/backend changes use focused integration tests.
- Full-stack changes use focused integration tests plus real-browser iteration.
- Frontend changes use real-browser iteration at the named desktop/mobile
  widths and states.
- `npm run verify` is a release/milestone gate only when explicitly required.

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
relevant data-lifecycle task approves it.
