# Issue 77 validation

## Gate and scope

- GitHub issue 77 was open and unblocked. Its self-contained implementation
  packet supplied the applicable user moment, scope/non-goals, state and proof
  contract, acceptance checks, prohibited actions, dependencies, cleanup, and
  rollback required by `ORCHESTRATION.md`; that packet completeness—not its
  `In Progress` project status—satisfied the Ready for Build gate.
- The branch started clean at draft PR 73 commit `3bb4e2b`. The change has no
  domain, comparison, auth, owner-scope, schema, production-data, or UI contract
  change. The route marker, `aria-busy="true"`, seven skeleton primitives, final
  result, and 1440x1000 / 390x844 coverage remain unchanged.

## Failure and lifecycle proof

- GitHub Actions run 32793887069 passed the comparable loading test in the normal
  Playwright lane, then failed the explicit production lane with the observer's
  exact value still `null`. Retries were disabled in the failing lane.
- Temporary browser, request, response, and DOM lifecycle instrumentation
  separated the observer from the route lifecycle. With the old 300,000-row
  workload, representative timings after activation were: navigation response
  headers about 48ms, marked `loading.tsx` DOM about 129ms, response completion
  about 868ms, inner unmarked page fallback about 947ms, and final result about
  1,250ms.
- With the artificial rows removed, the partial prefetch still completed in about
  6ms, but the navigation response headers arrived at about 51ms and the response
  completed at about 53ms. The Link portal appeared at about 107ms, the unmarked
  inner page fallback appeared at about 133ms, and the final result appeared at
  about 436ms. The route-only marker never appeared, and the exact observation
  remained `null` in two reproductions.
- This proves the observer was installed early enough and was not blind. The
  production RSC response sometimes won before React's first destination commit,
  so Next legitimately skipped the prefetched route state. Next 16.2.10 source
  confirms that prefetched RSC is shown only while dynamic RSC is pending and is
  dropped once the response has resolved to avoid a flash backward
  (`ppr-navigations.js:589-603`). The layout router otherwise switches from
  `prefetchRsc` to final `rsc` through `useDeferredValue`
  (`layout-router.js:315-319`).
- Installed Next 16.2.10 documentation also confirms that dynamic Links partially
  prefetch to the nearest `loading.tsx` boundary, `loading.tsx` automatically wraps
  the page in Suspense, `useLinkStatus` is secondary inline feedback, and
  Playwright should exercise a production build. The accepted route-boundary
  invariant is therefore valid only while the real page is pending; it is not an
  unconditional promise for fast navigation.

All temporary lifecycle instrumentation was removed after the cause was proven.

## Fix

- The production-only Playwright proof adds an opaque UUID header only after the
  original partial prefetch completes. The real page suspends above its existing
  inner Suspense boundary until the test confirms the gate is pending. That is the
  page seam automatically wrapped by the real `loading.tsx`; no fake skeleton or
  alternate route output is rendered.
- After the unchanged marker / busy / seven-skeleton assertion and visual capture,
  a disposable API releases the page. A `finally` block performs this release even
  if the assertion or capture fails. The test then requires the gate endpoint to
  report `409` (not pending), clears browser headers, verifies the navigation
  request carried the proof header only in production proof mode, and requires the
  real final comparison result.
- The gate can activate only when every local disposable guard is present:
  `TRAINING_HUB_COMPARABLE_LOADING_PROOF=1`, `TRAINING_HUB_E2E=1`,
  `TRAINING_HUB_ENV=e2e`, `TRAINING_HUB_DISPOSABLE_DATA=1`, a `file:` database,
  no Turso URL or token, and an absent/empty `VERCEL_ENV`. Any Vercel-managed
  environment, including preview, makes the seam inert. It also requires a UUIDv4
  request header. The Playwright server enables the extra guard only for
  `E2E_PRODUCTION=1`; the local production-build lane leaves `VERCEL_ENV` absent.
- Missing any guard makes both proof endpoint methods return a newly constructed
  404 response and makes the page wait inert. The ordinary dev target proves the
  endpoint is actually 404 and its navigation request contains no proof header.
- Release deletes the gate before resolving it and undefines the global map when
  the final gate is removed. Pending checks do not recreate the map. Unit and API
  tests prove the waiter resolves, repeat release fails, the post-release endpoint
  is `409`, and no global gate state remains.
- The 300,000 artificial activities, their dedicated fixture tracking, `test.slow`,
  and their cleanup path were removed. Normal owner-scoped fixture cleanup remains.

## Rejected hypotheses and failed attempts

- **A slow observer or wrong DOM scope:** rejected because the same temporary
  observer recorded the Link portal and unmarked inner fallback while never seeing
  the route-only marker.
- **Insufficient fixture volume:** rejected as the cause. More rows merely delayed
  dynamic RSC enough for the prefetched fallback to win; it did not establish a
  framework invariant and produced the CI timing race.
- **Request interception/backpressure:** rejected because intercepting the RSC
  request also withheld the stream React needed to activate the boundary. The
  marker remained `null`.
- **Gating inside `ComparableActivityContent`:** rejected after the API handshake
  proved that gate pending while the route marker remained `null`. That wait was
  caught by the page's inner unmarked Suspense boundary, so it could not prove
  `loading.tsx`.
- **Changing acceptance to Link pending or the page-local fallback:** rejected.
  Next documentation prefers the route fallback, and a deterministic suspension at
  the page seam proves the accepted real route boundary without changing the
  product UI contract.
- The first gate build found a TypeScript-only initializer inference error; typing
  the one-shot release callback as `() => void` fixed it. No compiler relaxation
  was introduced.

## Verification

- Focused gate, API, and page unit proof: 3 files / 8 tests passed.
- Ordinary development target with `CI=1` and `--retries=0`: 4 passed in 10.5s.
  It proved the API is 404 and the navigation request has no proof header.
- Focused production target after the final hardening: 4 passed in 10.3s and 4
  passed in 10.4s, with `--retries=0`.
- Required production stress command with `CI=1`, `--repeat-each=20`, and
  `--retries=0`: 23 passed in 35.4s (three project dependencies plus 20
  consecutive target executions; each target covered both required viewports).
- Three consecutive `CI=1 npm run verify` executions passed. Each included the
  environment boundary, retired-config check, typecheck, lint, formatting, 74
  unit files / 715 tests, knip, a 247-file cycle check, 50/50 normal Playwright
  tests, and the explicit production lane at 4/4 with zero retries. Normal
  Playwright completed in 40.1s, 41.9s, and 42.3s; the production lane completed
  in 11.4s, 11.4s, and 10.6s.
- After independent review hardened the Vercel boundary, the focused helper/API/
  page proof passed 3 files / 10 tests, ordinary development passed 4/4 in 10.4s,
  and the local production build passed 4/4 in 10.3s; both browser targets used
  `--retries=0`. The final `CI=1 npm run verify` repair gate passed 74 unit files /
  717 tests, the 50-test normal Playwright lane in 41.2s, and the 4-test production
  lane in 11.4s.
- The normal suite deliberately emits the expected missing-column errors for its
  real owner-scoped failure/recovery test. In two production setup phases, Better
  Auth also logged a non-failing `SQLITE_BUSY: database is locked`; setup still
  passed and all target executions passed without a retry.
- Post-run disposable database audit: zero comparable fixture or former loading
  volume rows remained; `moving_time_s` existed and
  `moving_time_s_proof_error` did not.
- `git diff --check` passed. Repository search found no issue 77 debug lifecycle
  hooks, 300,000-row loading volume, or loading-volume fixture name.

## Remote acceptance status

Local builder validation is complete. Remote acceptance remains pending the
Orchestrator-owned reviewed push and three fresh successful GitHub Actions runs.
No remote CI success is claimed by this local evidence.

## Cleanup and rollback

No request is held after the test releases or fails through its `finally` cleanup,
and the server process retains neither a pending promise nor an empty proof map.
The endpoint is inaccessible outside the fully guarded disposable E2E server. No
external account, shared database, credential, deployment, push, PR mutation, or
GitHub state was changed.

Rollback is a single revert of the issue 77 commit. It restores the historical
300,000-row proof from draft PR 73; there is no schema, auth, domain, or data
migration to reverse.
