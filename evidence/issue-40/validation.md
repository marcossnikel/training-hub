# Issue 40 validation record

Scope under review: the #40 delivery branch.

## Automated verification

- `npm run verify` — passed: environment boundary and retired-global-Strava
  checks, type generation/typecheck, ESLint, Prettier, 698 unit tests, Knip
  advisory hints only, circular-dependency check, and 48 Playwright tests.
- `CAPTURE_LANDING_EVIDENCE=1 npx playwright test e2e/private-beta-landing.spec.ts --project=private-beta-landing`
  — passed all 48 dependent Playwright tests and refreshed the landing proof
  using a disposable local SQLite fixture.
- A production-mode local `next start` smoke used cookie-free HTML and RSC
  requests to `/`: both returned `200` with
  `Cache-Control: private, no-store, max-age=0`, rendered the guest landing
  statement, and contained none of the seeded activity names.

## Visual and accessibility proof

- `40-landing-default-1440.png` — desktop guest landing and reading order.
- `40-landing-invite-boundary-1440.png` — the only beta entry boundary.
- `40-landing-default-390.png` — 390 px narrow layout, reduced motion.
- `40-landing-loading-390.png` — real authenticated client navigation with a
  disposable 800-activity local fixture; it captures the route loading shell,
  not a mocked network delay.

Manual local inspection used Chromium at 1440×1000 and 390×844. It confirmed
the header/main/footer landmarks, one H1, static FAQ headings, one utility
Log in link, visible skip-link focus that moves to the programmatically
focusable main landmark, in-page CTA fragment behavior, no horizontal page
overflow, and the reduced-motion static transitions. Guest HTML/RSC and the
hydrated guest page contain no Speed Insights script. No account creation,
waitlist, analytics, payment, external publish, or deployment was performed.
