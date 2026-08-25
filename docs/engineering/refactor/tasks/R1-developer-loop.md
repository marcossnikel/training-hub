# R1 — Establish the affordable developer loop

**Status:** ready
**Delivery class:** API/backend
**Risk:** medium
**Recommended builder:** Terra medium
**Depends on:** R0
**Unlocks:** R2, R10

## Outcome

A developer has a fast non-browser gate for ordinary edits and one explicit
command that builds and starts the real Next production server against only
disposable E2E resources.

## Required context

- `package.json`, `playwright.config.ts`, `vitest.config.ts`
- `scripts/check-environment-boundary.mjs`, `scripts/e2e-strava-provider.mjs`
- `e2e/auth.setup.ts`, `e2e/auth.spec.ts`, `e2e/private-beta-landing.spec.ts`
- `docs/environment-boundaries.md`
- Next.js build/start and Playwright guidance from installed packages

## Current behavior and evidence

`npm run verify` already runs environment, retired-config, type, lint, format,
unit, dead-code, cycles, and all E2E checks. `playwright.config.ts` supports
`E2E_PRODUCTION=1`, but no package script exposes it and
`reuseExistingServer: !process.env.CI` can reuse a development server, making a
claimed production-mode run ambiguous.

## Locked decisions

1. Add `verify:fast` as the current full gate minus Playwright E2E.
2. Keep `verify` as the release/milestone gate and compose it from maintained
   scripts rather than duplicating divergent command bodies.
3. Add a dedicated production smoke command that sets `E2E_PRODUCTION=1`, builds
   and starts Next, and runs a narrow Playwright project/spec.
4. Production-mode smoke always sets `reuseExistingServer` false.
5. The application runtime remains `TRAINING_HUB_ENV=e2e` with local SQLite,
   throwaway auth/encryption values, and the loopback Strava double. “Production
   mode” means Next build/start behavior, not production data/config.
6. The initial smoke proves guest landing, login render, and absence of browser
   runtime/console errors. Feature-specific authenticated stories stay in their
   tasks.

## Protected invariants

- `npm run verify` retains every existing check.
- No Turso credential, remote URL, production approval flag, live Stripe value,
  or real provider request is introduced.
- Existing Playwright mutation serialization remains intact.
- A passing smoke cannot come from a server started before the command.

## Permitted scope

- package scripts;
- Playwright web-server reuse selection and a dedicated smoke project/spec;
- developer documentation for the new commands.

The builder may make deterministic behavior-preserving repairs exposed by these
commands inside package scripts, Playwright server ownership, the dedicated
smoke spec/project, and their documentation. If a failure belongs to product
behavior outside that boundary, record it without absorbing the feature.

## Non-goals

- reorganizing the full E2E dependency graph;
- fixing the stopped prefetch stabilization work;
- typed runtime configuration (R2);
- changing feature behavior.

## Implementation sequence

1. Measure and record the existing non-E2E command sequence. Completion: the
   exact future `verify:fast` contents are known.
2. Add `verify:fast` and make `verify` call it before E2E. Completion: no check
   was dropped or reordered in a behavior-changing way.
3. Add a read-only production-smoke spec/project. Completion: it can run without
   saved auth state or database mutation beyond normal seed/startup.
4. Make server reuse conditional on neither CI nor production-smoke mode.
   Completion: the production command always owns its server process.
5. Document command purpose and resource boundary. Completion: “production
   build” cannot be confused with production environment/data.

## Required integration proof

```sh
npm run verify:fast
npm run test:e2e:production
```

The production command output must visibly include `next build` and `next
start`, use the disposable E2E database/provider, and prove the guest and login
HTTP/browser boundaries. Run the ordinary focused smoke once in dev-server mode
if a separate script is added. Do not run the full repository gate.

## Required manual or visual proof

Inspect the production-smoke trace/output and confirm:

- guest `/` renders the private-beta landing;
- `/login` renders the email/password form;
- no console/page errors occur; and
- the process is the command-owned production server.

No screenshot is required unless the smoke changes UI.

## Migration, rollout, and rollback

No schema or data change. Rollback removes the new scripts/spec/project and
restores the prior server-reuse expression.

## Stop conditions

- the build requires a remote resource or live secret;
- a safe command-owned port/process cannot be established without affecting an
  unowned process; or
- the smoke needs product mutation state outside its read-only contract.

## Completion criteria

- `verify:fast` is green and omits only E2E.
- `verify` still contains all previous checks plus E2E.
- production smoke builds, starts, and tests a command-owned server.
- disposable resource values are explicit and verified.
- docs state when each command should run.
