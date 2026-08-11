# Visual QA and evidence convention

Use this checklist for every product-facing change. It is deliberately concrete
enough for an independent reviewer to repeat the relevant path.

## Capture convention

- Capture against the PR’s preview or local environment with the route, test
  account/data condition, viewport, browser, and commit recorded in the PR.
- Include one desktop screenshot (1440 px wide unless the issue specifies
  another width) and one narrow screenshot (390 px wide unless the issue
  specifies another width). Record the full viewport height used.
- Name files `<issue>-<route-slug>-<state>-<viewport>.png`, for example
  `35-weekly-brief-partial-1440.png` and `35-weekly-brief-empty-390.png`.
- Record a short clip only for consequential motion or a multi-step transition:
  `<issue>-<route-slug>-<interaction>-<viewport>.webm`. It starts before the
  trigger and ends with the stable result. State the reduced-motion equivalent
  in the PR even when a separate clip is unnecessary.
- Do not show production data, client secrets, tokens, or unrelated accounts.
  Use approved test data and redact only when redaction cannot conceal the
  behavior being reviewed.

## What the visual set must prove

For the primary path, capture default/success plus each visually distinct
loading, empty/first-use, partial-or-stale, error/retry, disabled, destructive,
or narrow-screen state that the issue declares. A state that has no visual
difference still needs a written behavior record. Include focus evidence when
the main control, error recovery, dialog, or custom interactive pattern is
in scope.

## Review checklist

### Contract and evidence

- [ ] The decisive user moment, primary question, supporting evidence, and
      de-emphasized information match the issue packet.
- [ ] Every observation names or links its source and comparison window.
- [ ] Missing, partial, stale, or low-confidence data is visible at the point
      of interpretation; the copy makes no coaching, medical, causal, or
      generic-AI claim.
- [ ] Exact copy or documented copy rules are followed; action labels describe
      the result rather than use generic verbs.

### Hierarchy and responsive behavior

- [ ] The primary decision is visible without a card-grid/dashboard overload.
- [ ] Type roles, spacing rhythm, semantic surfaces, metric alignment, and
      navigation match `FOUNDATION.md`.
- [ ] At the narrow viewport, order still reflects importance; labels do not
      truncate meaning; no unintended horizontal page scroll exists; touch
      targets remain practical.
- [ ] Tables, comparisons, and charts preserve labels, units, dates, and
      provenance after reflow or intentional horizontal scrolling.

### States, interaction, and accessibility

- [ ] Loading does not invent values; empty, partial/stale, error/retry,
      success, and disabled states match the declared matrix.
- [ ] Keyboard-only traversal has a visible focus indicator, logical order,
      expected activation, escape/dismiss behavior, and focus return.
- [ ] Semantic names/labels, heading landmarks, contrast, status text, and
      screen-reader announcements (when asynchronous) are verified.
- [ ] Hover-only information has a touch/keyboard equivalent.
- [ ] Motion has a stated trigger and purpose; reduced motion yields the same
      meaning without nonessential movement.

## PR evidence record

Add the following to the PR template, filling every applicable field:

```md
Visual proof
- Environment / commit:
- Route + test-data state:
- Desktop: [file or URL] — [state proven]
- Narrow: [file or URL] — [state proven]
- Recording (if material motion): [file or URL]
- Keyboard/focus and reduced-motion result:
```

When no UI changes exist, say `Not applicable — documentation-only change` and
link the Ready-for-Build checklist review. A Figma-only handoff or prose-only
claim is not visual proof for a product-surface implementation.
