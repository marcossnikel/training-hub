# Issue 35 local visual validation

- Environment: disposable `data/e2e.db`, local Next dev server, Chromium; no external connection or production data.
- Route and fixture: `/weekly-brief`, dynamic completed-week fixture in `scripts/seed.ts`; default evidence uses the authenticated disposable owner.
- Desktop: `35-weekly-brief-default-1440.png` at 1440×1000 — heading, completed-week range, evaluator copy, current/baseline evidence links, and method disclosure.
- Narrow: `35-weekly-brief-default-390.png` at 390×844 — evidence stacks date, moving time, and descriptive source link. DOM check: document/body widths were both 390 px.
- No insight: `35-weekly-brief-no-insight-1440.png` at 1440×1000 — exact no-material-change text and the `/` exit.
- Error: `35-weekly-brief-error-390.png` at 390×844 — actual route error component rendered through a temporary local-only preview, deleted before commit. Its alert is named and the visible `Try again` control uses the boundary `reset`; component test exercises the click.
- Loading: `35-weekly-brief-loading-390.png` at 390×844 — actual loading component rendered through a temporary local-only preview, deleted before commit. It is hierarchy-preserving and contains no metrics.
- Focus/reduced motion: error retry focus and loading skeleton reduced-motion captures are `35-weekly-brief-error-focus-reduced-motion-390.png` and `35-weekly-brief-loading-reduced-motion-390.png`. Browser inspection confirmed focus on `Try again`, `prefers-reduced-motion: reduce`, and every skeleton animation name was `none`.

The captures were made before the final commit; the delivery handoff records the final commit and validation rerun.
