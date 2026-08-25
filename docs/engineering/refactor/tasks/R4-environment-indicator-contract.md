# R4 — Select the creator environment-indicator contract

**Status:** done
**Delivery class:** documentation/plan
**Risk/model:** medium — Sol high
**Depends on:** R3
**Unlocks:** R5

## Outcome

One selected desktop/mobile visual and interaction contract tells an
implementation model exactly how the creator-only current-environment indicator
looks and behaves.

Selected contract: [Creator environment indicator](../../../design/ENVIRONMENT_INDICATOR.md).

## Required context

- user-provided environment-label sketch (direction only)
- approved Training Hub Figma proposal and concrete authenticated-shell frames
- `docs/design/FOUNDATION.md`, `docs/design/VISUAL_QA.md`
- `src/components/header.tsx`, `src/app/layout.tsx`, authenticated/guest root

## Current behavior and evidence

Authenticated desktop uses a left sidebar; mobile uses a sticky header. Guests
see the public landing header. There is no environment indicator. The supplied
sketch shows three stacked labels over a guest landing, but the requested
behavior is creator-only and the current root shows the landing only to guests.

## Locked decisions

1. Show exactly the current environment, not all environments.
2. It is an indicator, never a switch, link, menu, or cross-environment control.
3. Values are `LOCAL`, `PREVIEW`, `PRODUCTION`; disposable tests may use `E2E`.
4. Render only after server-confirmed creator capability.
5. Production receives the strongest salience; color is not the only signal.
6. Guest landing, login, signup, and member shells do not show it.
7. Desktop placement belongs to authenticated shell chrome near product/beta
   identity; mobile placement belongs in the compact header without hiding
   navigation/account/Strava status.
8. Respect semantic tokens, keyboard/focus expectations, 1440/390 layouts, and
   reduced motion. Static indicator needs no decorative animation.
9. The sketch supplies intent; the builder selects the exact contract from it,
   current shell evidence, and the design foundation.

## Protected invariants

- member/guest markup contains no creator-only indicator;
- no overlap with skip link, sticky mobile header, navigation, or content;
- text remains readable in light/dark themes and all locales;
- no hostname-derived or client-guessed environment.

## Permitted scope

- Figma proposal/variant and design documentation only;
- exact copy, placement, tokens, responsive behavior, and state matrix.

## Non-goals

- React/config/auth implementation;
- environment switching;
- a creator preview of the guest landing;
- redesigning the whole shell.

## Implementation sequence

1. Inspect exact authenticated desktop/mobile Figma frames. Completion: selected
   node IDs are recorded; page/root selection is insufficient.
2. Produce at least two compact placement alternatives within the existing
   shell. Completion: trade-offs cover visibility, clutter, and mobile space.
3. Select one direction and specify exact copy/tokens/states. Completion: no
   visual/product choice remains for R5.
4. Validate 1440 and 390, light/dark, long locale/account text, and production
   salience. Completion: proof is attached.
5. Select the strongest alternative against the locked constraints and record
   concrete frame/node IDs plus rationale. Completion: R5 has no remaining
   layout, copy, token, state, or responsive choice.

## Validation

- selected Figma frame IDs;
- 1440 desktop shell;
- 390 mobile shell;
- local/preview/production variants;
- member state with indicator absent;
- light and dark themes;
- named reference principles and no-copy boundary.

Inspect every referenced node/link, search the packet and roadmap for conflicting
placement/copy, run `git diff --check`, and review status. This documentation/
plan task does not run a runtime suite. If authenticated Figma access is absent,
use the supplied sketch, current shell code, design foundation, and disposable
browser captures to record the same complete contract without creating a gate.

## Migration, rollout, and rollback

No code/data change. The recorded selected contract is implementation authority
for R5 within the accepted product constraints.

## Stop conditions

Stop only if selecting a direction requires changing the accepted creator-only,
non-interactive product contract or an unavoidable external design asset is
inaccessible. Alternative generation, frame choice, responsive placement, and
documentation defects are owned by the builder.

## Completion criteria

- One concrete direction is selected and recorded.
- Exact desktop/mobile placement, copy, tokens, themes, and absence states are
  documented.
- R5 can implement without choosing design.
