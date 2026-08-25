# Issue 68 validation

## Failure and cause

- The original test queried the whole document, so the `useLinkStatus` portal under
  `body` could satisfy `Loading comparable prior activity` without the route
  `loading.tsx` rendering in `main`.
- Scoping that unchanged proof to `main` reproduced the baseline defect: Playwright
  reported `element(s) not found` for the loading label while the final comparable
  route rendered successfully.
- `prefetch={false}` prevented Next.js production partial prefetch from preparing the
  dynamic route shell. Warm production navigation could also finish the 100,000-row
  query before Playwright observed the real boundary.

## Fix

- Restore the Link's default production partial-prefetch behavior. The prefetched
  shell includes the real route loading boundary while dynamic data remains pending.
- Keep the existing `useLinkStatus` feedback for development and prefetch-pending
  navigation.
- In the production lane, wait for the real partial-prefetch response, install a
  `MutationObserver` on `main` before activation, and record the exact real boundary:
  `aria-busy="true"` and seven skeleton primitives. The final comparable result is
  still required at 1440x1000 and 390x844.
- Use 300,000 disposable confirmed activities. Production trials at 200,000 and
  250,000 were still sub-threshold; 300,000 was the smallest measured reliable
  workload. Cleanup remains owner-scoped and disposable.
- Request-level backpressure was rejected after failing 5/5: intercepting the RSC
  request blocked the response segment React needs to activate the boundary.

## Verification

- Focused production repeat, one worker: 8 passed in 1.0m (setup, invite
  dependencies, and five consecutive focused executions; both viewports per
  execution).
- Comparable project: 8 passed in 22.3s.
- Normal full Playwright order, three consecutive clean runs: 50 passed in 47.6s;
  50 passed in 48.2s; 50 passed in 51.0s as part of `npm run verify`.
- `npm run verify`: passed, including 72 unit files / 708 tests, the 50-test normal
  Playwright run, and the production comparable-loading lane (4 passed in 20.1s).
- `npm run typecheck`, `npm run lint`, `npm run format:check`, and
  `git diff --check`: passed.

No Playwright retry, blind sleep, fake loading state, weakened assertion, shared or
production database, external account, credential, deploy, schema, auth, owner
scope, or deterministic comparison behavior changed.

## Rollback

Revert the source/test/package-script commit. The E2E rows live only in the
disposable local database and require no schema or data rollback.
