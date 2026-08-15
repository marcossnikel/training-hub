# Issue 56 gear form validation

Environment: isolated Playwright database (`data/e2e.db`), disposable authenticated
athlete created by `e2e/auth.setup.ts`, local Next development server only.

## Visual proof

- `56-gear-success-1440.png`: authenticated desktop shoe submission after a real
  Server Action request; the dialog closed and the new owner-scoped shoe is visible.
- `56-gear-success-390.png`: the same Enter-key submission at 390 px; the new shoe
  is visible and the document has no horizontal overflow.

## Interaction and state checks

- Click: the gear E2E waits for an actual POST with the `Next-Action` header, then
  verifies the dialog closes and the created record renders.
- Keyboard: the shoe E2E uses Enter in the labelled Name input and verifies the same
  request/effect. The native Tab sequence follows the labelled form controls before
  the submit button; focus uses the shared visible `focus-visible` ring.
- Pending: `useActionState` supplies the existing immediate disabled submit control
  and spinner, preventing duplicate submission. The spinner has
  `motion-reduce:animate-none`, so reduced-motion feedback is static.
- Error: component coverage invokes each static shoe/bike action binding with a safe
  error result and verifies the dialog remains open. Native invalid input also keeps
  the form open without sending a request.
- Validation: the shoe retirement input now uses unit steps, making its existing
  700 km default browser-valid while preserving the server's positive-number check.

## Automated commands

- `npm run typecheck`
- `npm run test:unit -- src/components/gear-dialog.test.tsx`
- `npm run test:e2e -- e2e/gear.spec.ts --project=chromium --workers=1`
- `npm run verify`
- `git diff --check`
