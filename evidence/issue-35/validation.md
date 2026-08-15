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
