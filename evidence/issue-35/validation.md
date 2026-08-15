# Issue 35 local visual validation

- Reviewed repair commit: `1413f6d709ee2791920bcefb45cbbf6adfff8f4d`.
- Environment: disposable `data/e2e.db`, local Next dev server, Chromium; no external connection or production data.
- Route and fixture: authenticated disposable owner at `/weekly-brief`; `scripts/seed.ts` supplies a four-week baseline plus current-week evidence.
- Desktop: `35-weekly-brief-default-1440.png` at 1440×1000 — the repaired, labelled Current-week evidence and Baseline evidence regions, evaluator copy, source links, and method disclosure.
- Narrow: `35-weekly-brief-default-390.png` at 390×844 — both labelled evidence regions preserve date, moving time, and descriptive source links without document overflow.
- No insight: `35-weekly-brief-no-insight-1440.png` at 1440×1000 — a disposable equal-volume fixture produces the exact no-material-change state and `/` exit.
- Error/retry: the real `error.tsx` component is covered by `src/app/weekly-brief/error.test.tsx`, which asserts the `role="alert"`, semantic level-one heading, safe copy, and invokes the actual boundary `reset` callback. No production route switch or deleted preview route is claimed as final evidence.
- Loading/reduced motion: `loading.tsx` is the route file and its shared Skeleton carries `motion-reduce:animate-none`; focused/component and full-gate verification cover it without a production-only delay switch.
- Keyboard/source path: `e2e/weekly-brief.spec.ts` verifies both labelled evidence regions, activates a descriptive current-week evaluator source link, and arrives at the authenticated owner-scoped `/activity/[id]` route. `e2e/mobile.spec.ts` verifies the 375px route has no horizontal document overflow.

## Final route-boundary loading probe — 2026-08-15

- Final implementation SHA: `8ec71c60fc58860b7559bce5834f54249f21d9e5`. No product source was changed for this probe.
- Environment: disposable `data/e2e.db`, local Next 16.2.10 dev server, Playwright Chromium, authenticated real fixture session, `/weekly-brief` client navigation from the final application header at 390×844. The root header/auth queries remained normal; no network interception, preview route, request/header/query delay, or production fault switch was used.
- Fixture mechanism: `npm run e2e:seed`, then `DATABASE_URL=file:data/e2e.db tsx scripts/seed-weekly-brief-loading-proof.ts`. The helper refuses non-`file:` databases and inserts exactly 5,000 owner-scoped, confirmed `Run` summaries (1,000 in each of the completed target week and prior four weeks) with valid local stamps and positive moving time. It is disposable E2E data only.
- Normal motion: final route heading appeared at 30,551 ms; the existing final `app/weekly-brief/loading.tsx` landmark was not visible at any point in the first 30,537 ms.
- `prefers-reduced-motion: reduce`: final route heading appeared at 30,563 ms; the same final loading landmark was not visible in the first 30,548 ms.
- Result: this is a reproducible, genuinely slow final-route workload that does **not** render the existing segment loader. Therefore `35-weekly-brief-loading-390.png` and its reduced-motion counterpart are not claimed as final-route proof, and the required loading visual criterion remains unmet. No runtime workaround or product-layout refactor was added.
- The retained error/default captures remain historical evidence only: they must not be used to assert this final SHA's route-boundary proof. The final error/retry and mobile evidence-region requirements are still unaddressed in this bounded loading attempt.
