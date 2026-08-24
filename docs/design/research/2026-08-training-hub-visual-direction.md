# Training Hub visual-direction research

**Status:** proposal input only — not an approved product decision or implementation spec.  
**Purpose:** use the next Figma file to make the already-shipped product feel coherent and emotionally memorable, while preserving its evidence, privacy, and beta boundaries.

## The opportunity

The current product is capable but visually accumulated: it has a dense app shell, Barlow/Barlow Condensed for product/display type, Geist Mono for code-like numerals, and individual cards/pages that work on their own. The shipped loop is real: private access and account setup, BYO Strava connection, recent activity/review, activity detail, weekly brief, comparable prior activity, performance, races, gear, settings, and private insight feedback. The design needs to turn that collection into one experience, not decorate each route.

The product brief is clear about the non-negotiable: Training Hub is personal training intelligence for self-coached runners and cyclists. It must be evidence-linked, calm, private, and factual — not a coaching product, medical/readiness product, or generic AI chat. The proposed north star is:

> **Calm, evidence-first training intelligence with periodic emotional peaks.**

Daily use should be quiet, fast, and legible. The weekly brief, a meaningful comparison, a first successful sync, and a race reflection can earn a more editorial, anticipatory reveal — the feeling of opening a personal training recap, not a decorative dashboard or an AI-generated summary.

## What the research supports

| Reference | First-party observation | Translation for Training Hub | Do not copy |
| --- | --- | --- | --- |
| [Linear’s redesign](https://linear.app/now/how-we-redesigned-the-linear-ui) | Linear reset sidebar, tabs, headers, panels, hierarchy, and visual noise together; it stress-tested environment, appearance, and hierarchy across real views before implementation. It also separates expressive headings (Inter Display) from product text (Inter). | Treat this as an application-wide reset: define the shell, hierarchy, semantic variables, and component behavior first; then prove the direction on a log, a detail, an insight, an onboarding state, and a billing state. Use a display role only where a moment warrants it. | Linear’s dark aesthetic, app chrome, shortcuts, language, iconography, or layouts. |
| [Resend’s design process](https://resend.com/handbook/design/what-is-our-design-process) and [light-mode work](https://resend.com/blog/introducing-light-mode) | Resend prefers iterating on product screenshots over pursuing a perfect library. Its light mode is a considered contrast/color system, not a simple inversion, and exists because users needed it. | Put real states and text in the Figma screens; judge them side-by-side at desktop and mobile. Keep light/dark semantic rather than brand-painting both. Use contrast and color to clarify status/evidence, not to imply performance quality. | Resend’s physical-material visual identity, colors, gradients, or marketing composition. |
| [Anthropic’s design-harness guidance](https://www.anthropic.com/engineering/harness-design-long-running-apps) and [Claude Design](https://www.anthropic.com/news/claude-design-anthropic-labs) | Anthropic describes design quality/coherence, originality/custom decisions, craft, and functional usability as separate evaluation dimensions; it also emphasizes exploration followed by system-consistent refinement. | Review the proposal against those four dimensions, including edge states and interaction, instead of accepting a handsome happy-path mockup. Figma should show a coherent system that can later become code, not a set of generated illustrations. | Claude/Anthropic chat conventions or an AI assistant persona. |
| [Motion reduced-motion guidance](https://motion.dev/docs/react-use-reduced-motion) and [layout animation docs](https://motion.dev/docs/react-layout-animations) | Motion supports layout continuity, but explicitly recommends reduced-motion alternatives such as opacity rather than x/y movement and disabling autoplay/parallax. | Motion may connect a selected week to its evidence, expand a comparison, or acknowledge a successful step. Every effect has a static/reduced-motion equivalent. No ambient chart motion, count-up theater, parallax, or loading theater. | Motion for decoration or meaning that only animation communicates. |
| [Bklit UI](https://bklit.com/docs) | Bklit is a shadcn-based chart/data-visualization library, appropriate as an implementation reference rather than a product identity. | Use it as a feasibility cue for a small, intentional chart vocabulary: trends, distribution, and comparison only when a question needs them. Charts must name the window, units, source, and limitation. | Adding chart varieties because they are available. |
| [Kokonut UI](https://kokonutui.com/docs) | Kokonut is a shadcn/Tailwind/Motion registry of owned components, including highly animated decorative treatments. | Study contained microinteraction and transition patterns for welcome, recap, or milestone moments only. It can inform a refined disclosure, tab, or button behavior. | Glass, particles, typewriter/AI-loading, or animated-card effects as the default product language. |
| [Refero](https://refero.design/how-it-works) | Refero is a discovery library of real screens and flows with pattern/tag search. | Use it to collect a labeled moodboard: *what problem is this reference solving?* Search dashboard, activity detail, timeline, report/recap, empty state, setup, subscription, and mobile navigation. Translate the principle and record the no-copy boundary. | Treating an inspiration screenshot as accessibility, product, or technical authority. |

## Typography recommendation to test in Figma

Replace the current sporty Barlow/Barlow Condensed pairing in the proposal with a quieter, more ownable two-role system:

- **Instrument Sans** for interface, evidence, navigation, body, labels, and metrics. It is an open-source variable sans with width/weight/italic axes, stylistic sets, and tabular figures; it supports the precision and density a log requires. [Instrument’s font source](https://github.com/Instrument/instrument-sans)
- **Instrument Serif** for only high-emotion editorial moments: the weekly-brief title, a recap pull quote, or a race reflection. It is explicitly a large-size display serif, so it must not appear in dense UI, metrics, forms, or long explanatory copy. [Instrument’s font source](https://github.com/Instrument/instrument-serif)
- Keep a neutral mono role only where alignment is genuinely useful (for example, dense tables and timestamps); it should not become a visual theme.

This is a proposal, not a claim that a serif automatically makes the product premium. The Figma file must test English and Brazilian Portuguese, tabular number alignment, long activity names, low-contrast metadata, and the narrow viewport. The important distinction is **editorial moments vs. utilitarian evidence**, not “serif vs. sans.”

## Proposed visual system

### 1. One resilient shell

Use a low-chrome, warm-neutral app canvas with a stable location cue and a deliberately secondary navigation area. The main content must visually own the screen; navigation, theme, language, sync, and account controls must not compete with the current question.

- Desktop: calm vertical rail or compact header+rail with the current location, a small sync/status indicator, and a clear evidence-first content column. Do not make a wall of floating cards.
- Mobile: a small top context bar plus a focused, thumb-reachable destination treatment. Do not horizontally squeeze a seven-item desktop nav as the final proposal.
- Surfaces: use one canvas, a quiet inset/group level, and a raised “evidence moment” level. Borders and spacing should establish hierarchy before shadow.
- Color: nearly neutral base; one intentional warm accent for direct actions/current selection; semantic status colors paired with text. Performance deltas are factual directions, never green=good/red=bad.

### 2. A narrative hierarchy for insights

An insight is not a card title plus a number. The repeated order should be:

1. **What changed** — one factual observation in athlete language.
2. **Why it is worth seeing** — the comparison window/criterion, source count, and limitation next to the claim.
3. **See the evidence** — dates, activities, metrics, and source links in a compact evidence rail or expandable layer.
4. **Keep or dismiss the question** — “review activities,” “open comparison,” or usefulness feedback; never a training prescription.

The visual peak is the reveal of the observation and its evidence — perhaps a short opacity/scale continuity when arriving from the log — not a rolling count-up or confetti. “Wrapped” energy comes from a legible, personal story with provenance, not from pretending every week is an achievement.

### 3. Deliberate density

Training data needs density, but every page should answer one question before exposing supporting metrics. A metric has a label/unit, time window, comparison basis, and provenance. Tables remain tables when that is more honest; on narrow screens they become labeled stacks or an intentional scroll region.

## Figma proposal scope

Build one file with pages for **00 / direction & tokens**, **01 / shipped experience**, **02 / planned experience**, and **03 / states & motion**. It should use representative but explicitly fictional athlete data and carry the product’s actual limitations in the mockups.

### Shipped experience to redesign

| Moment | Proposed screen/flow | Intentional emphasis |
| --- | --- | --- |
| Return to the log | Recent training log with one current context rail and review queue | “What needs my attention?” without turning the page into an analytics mosaic. |
| Open a session | Activity detail → comparable-prior entry → match and no-match | Current activity remains the anchor; comparison exposes dates, distance/time, criteria, source links, and the exact limitation. No “improved,” equivalent-workout, readiness, or AI language. |
| See the week in context | Weekly Brief: quiet teaser on log → full editorial recap | One observation, baseline/current windows, source activities, and limitation; sparse evidence is visibly sparse. This is the primary emotional peak. |
| Understand trajectory | Performance and race/race-comparison views | Make the chosen comparison/window explicit; use chart and table as evidence rather than dashboard decoration. |
| Keep the journal trustworthy | Review/confirm, gear, settings, sync and disconnect | Direct, consequence-aware forms; BYO connection and deletion data boundaries should feel intentional and safe. |
| Give feedback | Insight usefulness state | A tiny, private response that confirms the input without overstating what the product will do with it. |

### Planned experience to propose — without implying it already exists

| Pending product outcome | Proposed screen/flow | Mandatory honesty |
| --- | --- | --- |
| Clean-account BYO Strava onboarding proof | Invitation accepted → explain the athlete-owned app → callback/setup guide → credential validation → authorization → first-sync progress → land in recent log | This is a beta connection model; it is not a claim of standard Strava approval. Never render a secret back to the athlete. |
| Stripe test-mode monthly beta entitlement | Access/billing state → one monthly beta plan → Checkout handoff → pending verification → entitled/restricted result | Checkout return is not authoritative; show “we’re confirming your subscription” until verified. Preserve access to the athlete’s own data controls if payment is unavailable. |
| Customer Portal and lifecycle | Manage subscription → portal handoff → cancellation-scheduled / payment-problem / restricted states | Do not invent plans, trials, coupons, live pricing, or payment claims. State the paid-through date only if the verified data exists. |
| Invited cohort loop | New-athlete first insight → usefulness feedback → concise support/recovery state | The design should help learn where onboarding or value breaks; it should not add social feeds, public leaderboards, or coach workflows. |

## Prototype and review rules

The Figma file should include a short clickable path for each primary flow and static variants for every meaningful state:

- 1440 px and 390 px versions of the log, weekly brief, comparable match/no-match, BYO setup, billing pending/entitled/restricted, and destructive disconnect.
- Loading, empty, partial/stale, error/retry, disabled, keyboard focus, success, and reduced-motion specifications where applicable.
- Motion annotations: trigger, purpose, duration (the existing 100–200 ms bounds unless a new approved reason exists), keyboard path, and reduced-motion equivalent.
- A small source panel for each insight with actual product wording/limits. It is unacceptable to use mock copy that overclaims coaching, causality, health, readiness, AI, or payment status.

### Proposal acceptance rubric

Before this becomes implementation work, review the Figma file with five questions:

1. **Coherence:** could every shipped and planned screen plausibly belong to the same product?
2. **Specificity:** does the product feel like a training record with evidence, rather than a generic SaaS dashboard or AI coach?
3. **Emotional pacing:** are special moments memorable without making ordinary use noisy?
4. **Truthfulness:** are sparse history, no match, BYO constraints, privacy/deletion, and pending billing visibly honest?
5. **Buildability:** do tokens, components, responsive behavior, states, and motion make an executable design contract?

## Sources and inspection notes

- Current Training Hub product and scope: [`docs/product/PRODUCT.md`](../../product/PRODUCT.md), [`docs/product/ROADMAP.md`](../../product/ROADMAP.md), [`docs/product/DECISIONS.md`](../../product/DECISIONS.md), and [`docs/design/FOUNDATION.md`](../FOUNDATION.md), inspected on `origin/main` at `eb8f50e`.
- Current type loading: [`src/app/layout.tsx`](../../../src/app/layout.tsx); current semantic colors/motion: [`src/app/globals.css`](../../../src/app/globals.css). This brief recommends exploration only; it does not change either.
- The research sources above are first-party product, documentation, engineering, or type-designer sources. Refero is deliberately separated as a discovery tool, not authoritative evidence.
