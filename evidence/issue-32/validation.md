# Issue 32 validation

## Automated gate

- `npm run verify` — passed: local environment boundary check, Next type generation and TypeScript, ESLint, Prettier, 68 unit files / 690 tests, Knip, Madge (no circular dependencies), and 39 Playwright tests.
- `CAPTURE_BYO_CONNECTION_EVIDENCE=1 npm run test:e2e -- e2e/byo-connection.spec.ts` — passed: 12 Playwright tests, including confirmed provider deauthorization and a deliberate local mock `503` deauthorization failure.
- `git diff --check` — passed.

The full E2E run deliberately exercises the existing comparable-activity error boundary with a temporary schema fault; its expected recovery test passed. No connection lifecycle test uses a real Strava endpoint, account, credential, or deployment.

## Rendered state proof

| State | Evidence |
| --- | --- |
| Connected settings, desktop | `32-settings-connected-1440.png` |
| Confirmation dialog, mobile reduced motion | `32-settings-delete-confirmation-reduced-motion-390.png` |
| Confirmed local deletion, mobile reduced motion | `32-settings-local-delete-success-reduced-motion-390.png` |
| Provider revoke not confirmed but local deletion completed, mobile reduced motion | `32-settings-provider-revocation-failed-reduced-motion-390.png` |
| First completed sync lands in recent training, desktop | `32-recent-training-first-value-1440.png` |
| First completed sync lands in recent training, mobile reduced motion | `32-recent-training-first-value-reduced-motion-390.png` |

The Playwright flow verifies keyboard Enter to open, Cancel as the initial confirmation action, Escape dismissal with focus restored to the destructive trigger, duplicate-action prevention, the reduced-motion browser preference, and URL/state transitions after both provider outcomes. The browser assertions also ensure the fixed recovery copy contains no credential values.
