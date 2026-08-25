# Training Hub design foundation

**Purpose:** a builder-facing contract for product surfaces. It translates the
product brief into decisions that can be implemented and reviewed without
inventing a visual direction. It is intentionally not a brand palette, a
component library, or permission to change the working name.

## 1. Product feel and evidence standard

Training Hub should feel like a calm, capable training notebook: editorial,
specific, and quickly legible to an athlete returning between sessions. One
screen serves one primary question. Supporting evidence is visible before a
conclusion; detail is available on demand rather than competing for attention.

### Voice boundaries

- State an observation with its comparison window, source activities, dates,
  and relevant metric. Example: “Easy-run time was 22% lower than the previous
  four weeks.”
- Mark incomplete, stale, missing, or low-confidence inputs in the same place
  as the observation. Use “Based on 3 comparable runs” rather than implying a
  complete history.
- Use peer-to-athlete language: direct, factual, and free of motivational
  filler. Do not use generic AI-summary framing such as “Here’s what I found,”
  “unlock insights,” or a conversational assistant chrome.
- Never prescribe a workout, diagnose health, assess readiness, or imply
  medical/coaching authority. Prefer “The data shows…” and “Consider reviewing
  this session” to “You should…” or “You need recovery.”
- A number is not evidence by itself. Link or name its provenance; never
  fabricate precision, causality, or certainty.

## 2. Semantic visual tokens

Implementations define concrete values in code later. Until then, use these
semantic names and relationships, not raw color or one-off spacing choices.

| Intent | Use | Do not use it for |
| --- | --- | --- |
| `surface.canvas` | page background and app shell | semantic status |
| `surface.raised` | grouped content/card | making every region float |
| `surface.inset` | quiet supporting groups and tables | destructive emphasis |
| `content.primary` / `content.secondary` / `content.muted` | reading hierarchy | conveying status without text/icon |
| `border.subtle` / `border.strong` | grouping and focus-adjacent structure | replacing focus indication |
| `action.primary` / `action.secondary` / `action.danger` | deliberate user actions | decoration or passive metrics |
| `status.positive` / `status.caution` / `status.negative` / `status.info` | status paired with text/icon | performance quality or health judgment |
| `focus.ring` | visible keyboard focus on every interactive target | hover-only feedback |

Keep contrast at WCAG AA or better for text and meaningful icons. Status always
has a written label; do not encode meaning in color, chart position, or motion
alone. Token changes belong in a single implementation layer once one exists.

## 3. Type, spacing, layout, surfaces, and density

- **Type:** establish a clear display, page-title, section-title, body, label,
  numeric-metric, and metadata role. Use tabular numerals for aligned metrics.
  Labels explain a number; metadata is quieter but remains readable.
- **Spacing:** use a small, repeatable scale. Dense evidence rows have the
  tightest gap; a card uses a consistent internal rhythm; section and page gaps
  are progressively larger. Never use arbitrary one-off gaps to solve a local
  alignment problem.
- **Layout:** cap readable text measure, align evidence to a stable content
  grid, and let one primary content column lead. A wide screen can add a
  contextual rail only when it contains useful evidence, not promotional
  filler. Narrow layouts become one column; content is reordered by importance,
  not merely squeezed.
- **Surfaces:** canvas → page sections → raised evidence groups is the normal
  depth sequence. Use borders, quiet tone shifts, and whitespace before shadow.
  Avoid dashboard-card mosaics, heavy gradients, glass effects, and decorative
  blobs.
- **Navigation:** use a predictable application shell with a persistent
  location cue. Navigation labels describe destinations, not marketing. Keep
  account, connection, and destructive controls clearly separate from analysis
  navigation.
- **Density:** show the decision, its supporting evidence, and one next
  evidence-seeking action. Progressive disclosure owns secondary metrics,
  methodology, and long lists. Empty space clarifies groups; it is not a
  substitute for hierarchy.

## 4. Reusable pattern contract

Use established primitives before introducing a new visual pattern. A product
issue names the primitive, its content, and each applicable state.

| Pattern | Required contents and behavior |
| --- | --- |
| Page shell | location title, one primary task, route-level loading/error, and narrow-screen navigation treatment |
| Evidence card | observation/heading, confidence or limitation when needed, source metrics, provenance link, and optional detail action |
| Evidence row | label, value, comparison/context, accessible status text, and a target size suitable for touch if interactive |
| Metric/comparison | metric name/unit, comparison basis, date/window, direction explained in words, and source route(s) |
| Form/control | persistent label, help/format guidance, error tied to the field, disabled reason, and success confirmation that does not rely on color |
| Call to action | action-specific label, consequences when meaningful, immediate press feedback, pending state, and safe retry or exit |
| Empty/first use | what is absent, why it matters, the smallest safe next step, and no claim that data has been analyzed |
| Partial/stale | what was used, what is missing or old, how it limits the result, and a non-deceptive refresh/retry route when supported |
| Error/retry | plain-language failure, preserved context where safe, retry intent, alternate recovery, and no raw secret/error leakage |
| Destructive confirmation | object/consequence, cancel as the safe default, focus management, keyboard escape when appropriate, and success/reset outcome |

### Minimum state and interaction matrix

Every interactive or data-backed pattern declares the applicable entries below;
“not applicable” needs a reason. Each applicable microinteraction records its
trigger, feedback, duration/intent, keyboard behavior, and reduced-motion
fallback. Use a bounded duration: hover/focus feedback is 100–150 ms; press or
pending acknowledgement is immediate and any visual transition is at most 150
ms; loading-to-content or route/state feedback is at most 200 ms. Longer
movement needs an issue-specific reason and a recording in review. “Short” is
not an executable duration.

| State | Contract |
| --- | --- |
| Desktop/default | explicit wide-screen layout, reading order, primary decision, and evidence/source access; it is not inferred from narrow behavior |
| Default | clear label, hierarchy, and evidence/source access |
| Hover/focus | trigger is pointer entry or keyboard focus; use 100–150 ms nonessential tone/opacity feedback, visible focus ring, and no loss of contrast; keyboard focus gets identical meaning and reduced motion is immediate/static |
| Press/pending | trigger is activation; acknowledge immediately, prevent duplicate submission, retain context, and limit any visual transition to 150 ms; Enter/Space follows the same path and reduced motion is immediate/static |
| Loading | trigger is a data/route request; show stable skeleton/placeholder within 200 ms that preserves hierarchy and never fakes metrics; keyboard remains operable where safe and reduced motion uses a static placeholder |
| Empty/first use | explain absence and one safe next action |
| Partial/stale | disclose limitation beside affected content, not in a hidden tooltip |
| Error/retry | specific recoverable message; retry does not discard safe input; error/result feedback appears immediately with at most 200 ms visual transition, is announced to keyboard/screen-reader users, and is static under reduced motion |
| Success | concise confirmation and resulting location/state; success feedback appears immediately with at most 200 ms visual transition, moves focus when the outcome changes context, and is static under reduced motion |
| Disabled | visible reason and an accessible explanation, not a dead unlabeled control |
| Narrow | content order, wrapping/scroll strategy, and touch targets remain usable |
| Keyboard | logical Tab order, Enter/Space activation, Escape for dismissible layers, focus return, and the same feedback meaning as pointer interaction |
| Reduced motion | equivalent immediate/static feedback; no essential meaning depends on animation |

## 5. Interaction, motion, responsiveness, and accessibility

- Motion is feedback, not decoration. Declare its trigger, affected element,
  purpose, completion state, bounded duration, keyboard path, and reduced-motion
  fallback. Apply the matrix timing standard unless the issue records a reason
  for a different bound. Never use autoplay, parallax, or looping decoration on
  product surfaces.
- Under `prefers-reduced-motion: reduce`, remove nonessential movement and use
  an immediate state change or static affordance. Never delay a result for an
  animation.
- Keyboard is a first-class path: semantic HTML first; visible focus; no focus
  trap outside intentional modal/dialog behavior; focus moves to an error
  summary, confirmation, or new route when that is the meaningful outcome.
- Touch targets must be comfortably operable without hover. Do not hide a
  necessary control or explanation behind hover-only UI.
- At narrow widths, preserve the primary decision, source links, and safe
  actions. Stack grids, move secondary material behind a labeled disclosure,
  and avoid horizontal page scrolling. Tables either reflow into labeled rows
  or expose an intentional, announced horizontal scroll region.
- Use semantic headings, landmarks, labels, and live announcements only for
  meaningful asynchronous status. Test zoom, text resizing, contrast, screen
  reader naming, and focus order as part of the issue’s validation.

## 6. Reference translation map

References are studied for a principle, not copied as a visual identity,
component implementation, wording, or proprietary asset.

| Source | Adapt | No-copy boundary |
| --- | --- | --- |
| [Linear](https://linear.app) | calm speed, dense-but-legible hierarchy, predictable keyboard/focus behavior | dark theme, command-menu treatment, wording, iconography, layouts, or code |
| [Resend](https://resend.com) | code-to-screenshot polish loop and concise technical clarity | brand colors, marketing composition, illustrations, or implementation |
| [Firecrawl](https://www.firecrawl.dev) | purposeful demonstrations and expressive state feedback only when it clarifies work | animated spectacle, mascot/AI framing, visuals, copy, or code |
| [Brex](https://www.brex.com) | confident clarity for consequential forms, confirmation, and recovery | financial-product flows, language, visual identity, or compliance claims |
| [Beautiful UI](https://beautifului.dev) | evidence-first cards, contextual detail, and intentional empty/error patterns | shipped snippets, page compositions, tokens, components, or brand assets |

## 7. Builder and reviewer workflow

Before code starts, the issue must contain the executable design contract in
`docs/engineering/ORCHESTRATION.md`: moment/outcome, hierarchy, exact copy or
rules, components, full state matrix, motion, responsive/a11y path, translated
references, acceptance checks, data/uncertainty meaning, visual proof, and
reset/rollback. If a material choice is open, keep the issue in planning and
name the decision/dependency rather than choosing silently.

Before review, use [VISUAL_QA.md](./VISUAL_QA.md). A product-facing PR includes
named desktop and narrow screenshots, plus a short recording when motion or a
multi-step state change is material. Visual proof is evidence, not a substitute
for automated and accessibility checks.
