# Issue #62 validation

## Environment

- Local Next.js 16.2.10 development server at `http://localhost:3100`.
- Disposable `data/e2e.db`; blank Turso configuration; loopback Strava test provider only.
- Deterministic E2E auth/encryption secrets from `playwright.config.ts`; no shared or production credentials.
- Desktop: Chromium at 1440 x 900. Narrow: Chromium at 390 x 844 (and the existing 375 x 667 mobile lane).
- Narrow state uses `prefers-reduced-motion: reduce`.

## Design contract proof

| Contract | Evidence |
| --- | --- |
| Wide authenticated rail, exact destination order, account and truthful Strava state, keyboard focus | `62-authenticated-shell-focus-1440.png` |
| Compact route shell, current Settings destination brought into view, reduced motion and no document overflow | `62-authenticated-shell-reduced-motion-390.png` |
| Wide sign-in hierarchy and private-beta boundary | `62-login-default-1440.png` |
| Narrow sign-in hierarchy and reduced motion | `62-login-default-reduced-motion-390.png` |
| Recoverable generic sign-in error with focused status and retained safe input | `62-login-error-focus-1440.png` |
| No-invite registration boundary, wide and narrow | `62-sign-up-boundary-1440.png`, `62-sign-up-boundary-reduced-motion-390.png` |
| Valid invitation state without rendering the token, wide and narrow | `62-sign-up-invited-default-1440.png`, `62-sign-up-invited-reduced-motion-390.png` |
| Duplicate-submit pending state and generic retry state | `62-sign-up-pending-1440.png`, `62-sign-up-invalid-retry-1440.png` |
| Successful invitation redemption enters the authenticated shell | `62-sign-up-success-shell-1440.png` |

## Automated proof

- `npm run test:unit -- src/components/auth-form.test.tsx src/lib/beta-invites.test.ts src/lib/actions.auth.test.ts`: 3 files, 10 tests passed.
- `CAPTURE_ISSUE_62_EVIDENCE=1 npx playwright test e2e/auth.spec.ts --project=chromium-guest --no-deps`: 4 passed.
- `CAPTURE_ISSUE_62_EVIDENCE=1 npx playwright test e2e/beta-invite.spec.ts --project=beta-invites --no-deps`: 2 passed.
- With one disposable owner session on the same local server, `CAPTURE_ISSUE_62_EVIDENCE=1 npx playwright test e2e/shell.spec.ts --project=chromium --no-deps`: 2 passed.
- With that session, `npx playwright test e2e/mobile.spec.ts --project=mobile --no-deps`: 10 passed across every authenticated destination at 375 px.
- `npx playwright test e2e/guest-data-boundary.spec.ts --project=guest-data-boundary --no-deps --grep "cookie-free HTTP"`: 1 passed, including cookie-free HTML/RSC owner-data and Speed Insights exclusions.
- `npx playwright test e2e/private-beta-landing.spec.ts --project=private-beta-landing --no-deps --grep "guest root|guest landing"`: 2 passed, proving the existing landing hierarchy, invitation boundary, keyboard path, and narrow reduced-motion presentation remain intact.

## Full gate note

All non-E2E stages of `npm run verify` passed on the final implementation: environment boundaries, retired Strava configuration, type generation/TypeScript, ESLint, Prettier, 73 unit files with 711 tests, dead-code analysis, and cycle analysis. The full E2E dependency chain is intermittently blocked by the pre-existing #37 loading proof: its 100,000-row query can complete during Next link prefetch, so Playwright sees the correct final comparison page before the loading skeleton assertion. The issue is preserved for the separate baseline-stabilization dependency; no #37 behavior or retry policy is changed in #62.

## Reset / rollback

- Screenshots contain only disposable E2E records and example.test accounts.
- The implementation adds no schema, migration, credential, deployment, or shared-data mutation.
- Rollback is the single #62 commit; the public landing stays outside the `.th-foundation` scope for issue #67.
