# Issue #37 visual validation

Environment: local Next 16 development server with the disposable `file:data/e2e.db` Playwright fixture. Browser: Chromium. Commit: pending builder handoff.

The captures are made by `CAPTURE_COMPARABLE_ACTIVITY_EVIDENCE=1 npm run test:e2e -- e2e/comparable-activity.spec.ts`; the test creates only owner-scoped disposable rows and restores the temporary local schema change used for the real read-error/retry proof.

| State | Desktop 1440 | Narrow 390 | Result |
| --- | --- | --- | --- |
| Reliable/default | `37-comparable-prior-activity-reliable-1440.png` | `37-comparable-prior-activity-reliable-390.png` | One deterministic prior result, owner-scoped links, values, signed deltas, thresholds, and limitation. |
| No match | `37-comparable-prior-activity-no-match-1440.png` | `37-comparable-prior-activity-no-match-390.png` | Exact no-match copy and source provenance, with no limited tier. |
| Unavailable safe no-card | `37-comparable-prior-activity-unavailable-1440.png` | `37-comparable-prior-activity-unavailable-390.png` | Pending source reaches the existing safe not-found path without comparison content. |
| Focus, hover, press, keyboard | `37-comparable-prior-activity-focus-press-1440.png` | `37-comparable-prior-activity-focus-press-390.png` | Source/prior links and the native method disclosure have visible focus and keyboard activation. |
| Error/retry | `37-comparable-prior-activity-error-focus-1440.png`, `37-comparable-prior-activity-retried-success-1440.png` | `37-comparable-prior-activity-error-focus-390.png`, `37-comparable-prior-activity-retried-success-390.png` | Real local read failure has safe copy and `unstable_retry` restores the final route after the local schema is restored. |
| Reduced motion | `37-comparable-prior-activity-reduced-motion-focus-1440.png` | `37-comparable-prior-activity-reduced-motion-focus-390.png` | `prefers-reduced-motion: reduce` changes the focus transition to the global immediate `1ms` fallback without changing meaning. |

## Loading note

`ComparableActivitySkeleton` is the segment loader and nested real route fallback; `page.test.tsx` verifies the request-time owner/data work remains behind it. On the disposable local route, the owner-scoped summary query completes before Chromium can observe the fallback, including a volume fixture attempt. No artificial delay hook, fake route, or request interception was added solely to manufacture a screenshot. This is a remaining visual-proof limitation for independent review, not a claim that loading was visually captured.
