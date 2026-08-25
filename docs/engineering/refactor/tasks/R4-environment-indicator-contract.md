# R4 — Approve the creator environment-indicator contract

**Risk:** medium  
**Recommended builder:** Terra high for product/design planning  
**Required approval:** Marcos approval of the selected Figma frame  
**Depends on:** R3  
**Unlocks:** R5

## Outcome

One approved desktop/mobile visual and interaction contract tells an
implementation model exactly how the creator-only current-environment indicator
looks and behaves.

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
9. The sketch supplies intent, not an approved visual contract.

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
5. Obtain Marcos's explicit approval of the concrete frame. Completion: R4 may
   become accepted.

## Required automated proof

Not applicable; design task.

## Required manual or visual proof

- selected Figma frame IDs;
- 1440 desktop shell;
- 390 mobile shell;
- local/preview/production variants;
- member state with indicator absent;
- light and dark themes;
- named reference principles and no-copy boundary.

## Migration, rollout, and rollback

No code/data change. Unapproved Figma work is a proposal, not implementation
authority.

## Stop conditions

- no concrete authenticated-shell frame is selected;
- placement requires redesigning unrelated shell capabilities;
- the indicator becomes interactive; or
- Marcos has not approved the selected direction.

## Completion criteria

- One concrete frame is explicitly approved.
- Exact desktop/mobile placement, copy, tokens, themes, and absence states are
  documented.
- R5 can implement without choosing design.
