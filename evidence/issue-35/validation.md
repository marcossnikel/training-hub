# Issue 35 final-route visual validation

- Final implementation commit: `6c4fc19c16d3181c8668feb98462189d645fde8a` (the evidence-tooling and record commit follows this capture).
- Environment: disposable local `data/e2e.db`, local Next 16.2.10 dev server, Playwright Chromium. No external connection, production data, credentials, request interception, preview route, or runtime delay/fault switch was used.
- Normal/default fixture: `npm run e2e:seed`, then the authenticated `e2e/auth.setup.ts` owner fixture. Route: final `/weekly-brief` at 1440×1000 and 390×844.
- Loading fixture: `DATABASE_URL=file:data/e2e.db npx --no-install tsx scripts/seed-weekly-brief-loading-proof.ts` adds exactly 10,000 owner-scoped confirmed summaries (2,000 in each of the completed target week and preceding four weeks). It accepts only a local `file:` database. The direct final-route HTML request avoids claiming an RSC-only client transition as server-streaming proof.
- Loading normal: `35-weekly-brief-loading-390.png` at 390×844. The real final route showed `Loading weekly brief` at 4,653 ms and completed at 5,187 ms.
- Loading reduced motion: `35-weekly-brief-loading-reduced-motion-390.png` at 390×844 with `prefers-reduced-motion: reduce`. The same final route showed the static skeleton at 4,381 ms and completed at 4,908 ms. `Skeleton` supplies `motion-reduce:animate-none`; no visual meaning depends on the pulse.
- Default desktop: `35-weekly-brief-default-1440.png` at 1440×1000. It shows evaluator copy, completed-week comparison, provenance links, and the method disclosure.
- Default narrow: `35-weekly-brief-default-390.png` shows Current-week evidence at 390×844. `35-weekly-brief-default-baseline-390.png` is a second 390×844 scroll capture that visibly shows the Baseline evidence semantic region, dates, durations, descriptive source links, and method disclosure. The route has no document-width overflow under the existing 375px E2E guard.
- Final error/retry: `35-weekly-brief-error-390.png` and `35-weekly-brief-error-focus-reduced-motion-390.png` at 390×844. The capture renames only `activities.started_at_local` in the disposable DB, so the route's owner-scoped weekly projection fails while root chrome remains intact. The final `error.tsx` boundary renders its level-one heading, alert copy, and **Try again** control; focus is placed on that control under reduced motion. The next `npm run e2e:seed` recreates the local DB. The component test invokes the actual `reset` callback; a retry remains an error while the intentionally broken local column exists.
- Keyboard/source path: `e2e/weekly-brief.spec.ts` verifies labelled Current-week and Baseline evidence regions, activates a descriptive evaluator source link, and lands on the owner-scoped `/activity/[id]` route. `src/app/weekly-brief/error.test.tsx` verifies the alert, semantic heading, safe copy, and retry callback.

## Commands and outcomes

- `npm run test:unit -- src/app/weekly-brief/page.test.tsx src/app/weekly-brief/error.test.tsx src/app/weekly-brief/weekly-brief-view.test.tsx` — passed (3 files, 4 tests).
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run format:check` — passed.
- `git diff --check` — passed before commit.
- `npm run verify` — passed: environment boundary local, type generation/typecheck, lint, formatting, 623 unit tests, dead-code/cycle checks, and 23 E2E tests.
