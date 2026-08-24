# Issue 38 validation record

Scope under review: private, owner-scoped usefulness feedback for the delivered
Weekly Brief and a reliable Comparable Prior Activity result. Feedback is
enabled only for explicitly opted-in disposable local/E2E SQLite databases;
there is no remote migration, production collection, analytics endpoint, or
external transmission.

## Automated verification

- `npm run verify` — passed: environment and retired-global-Strava checks,
  generated route types/typecheck, ESLint, Prettier, 707 unit tests, Knip
  advisory hints only, circular-dependency check, and 50 Playwright tests.
- `npm run test:unit -- src/components/insight-feedback.test.tsx` — passed 4
  component tests, including the post-commit Remove response focus return.
- `CAPTURE_INSIGHT_FEEDBACK_EVIDENCE=1 npx playwright test
  e2e/insight-feedback.spec.ts --project=insight-feedback` — passed all 10
  dependency and feedback tests against the disposable local SQLite fixture.
  The weekly route is exercised at 1440×1000 and 390×844: keyboard Enter
  selection, Escape editor cancel, note save, response removal, and focus
  return to the native `Useful` button. The comparable-result route proves
  feedback is present only after a delivered reliable match.

## Visual and accessibility proof

| Evidence | Viewport/state | Observed result |
| --- | --- | --- |
| `38-weekly-brief-feedback-selected-1440.png` | 1440×1000, keyboard-selected response | The compact labelled group follows evidence and exposes semantic selected state without a score or generic-AI treatment. |
| `38-weekly-brief-feedback-selected-390.png` | 390×844, selected response | One-column narrow layout remains inside the viewport. |
| `38-weekly-brief-feedback-success-1440.png` | 1440×1000, saved note | Explicit save acknowledgement and secondary controls remain legible after the action commits. |
| `38-weekly-brief-feedback-success-390.png` | 390×844, saved note | The same successful state fits at narrow width with static reduced-motion-safe styling. |
| `38-weekly-brief-feedback-removed-1440.png` | 1440×1000, response cleared | Only the labelled response group remains with the concise removal acknowledgement. |
| `38-weekly-brief-feedback-removed-390.png` | 390×844, response cleared | Playwright verifies focus is on `Useful` after the disabled transition settles; no stale Remove control remains. |
| `38-comparable-feedback-selected-1440.png` | 1440×1000, reliable comparable result | The identical restrained control appears only after the evidence-linked result. |

The focus implementation is a client-side layout effect gated on the completed
remove transition. It focuses only after the removal commit and after the
native response button is enabled, avoiding a timeout, a browser-supplied
identifier, or a focus call on the removed control. No nonessential motion is
required for meaning; the existing 150 ms color transition uses the shared
reduced-motion fallback.

## Data and security boundaries

- Server actions derive the current owner and recompute every target reference
  from that owner’s currently delivered result; browser input is only a route
  discriminator and usefulness choice.
- Persistence uses owner predicates and a foreign-key cascade to `users`.
  Unit tests cover two owners, update/clear, redacted retrieval, and owner-only
  deletion. The stored reference excludes activity names, metrics, streams,
  insight body, browser owner ids, and credentials.
- The schema guard refuses non-local, Turso-configured, and non-opted-in
  environments. All browser evidence uses the disposable `data/e2e.db` file.
