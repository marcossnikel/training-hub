# Creator environment indicator contract

**Status:** selected for R5 implementation

**Authority:** R4 design contract

**Figma file:** [Training Hub](https://www.figma.com/design/BzWOBhC4o5ZjOEuOc5IlTl/TrainingHub?node-id=55-2)

This contract selects one static, creator-only current-environment indicator.
It resolves placement, copy, tokens, themes, responsive behavior, accessibility,
and absence states so R5 does not make product or visual choices.

## Source evidence

The selected direction reconciles all three current sources:

- the supplied sketch contributes the need to make environment identity
  unmistakable, but its stacked labels and guest-landing placement are not
  copied;
- the approved authenticated shell contributes the calm identity rail and
  compact mobile brand treatment; and
- the current implementation contributes the real desktop sidebar, sticky
  mobile header, protected account/Strava/navigation controls, guest branch,
  and login/sign-up exception.

Exact inspected sources:

| Source | Figma/code authority |
| --- | --- |
| Approved desktop shell | [`11:4` — Weekly Brief / Desktop](https://www.figma.com/design/BzWOBhC4o5ZjOEuOc5IlTl/TrainingHub?node-id=11-4) |
| Approved mobile shell | [`14:18` — Weekly Brief / Mobile](https://www.figma.com/design/BzWOBhC4o5ZjOEuOc5IlTl/TrainingHub?node-id=14-18) |
| Catalogue desktop shell | [`26:2` — Training log / Desktop](https://www.figma.com/design/BzWOBhC4o5ZjOEuOc5IlTl/TrainingHub?node-id=26-2) |
| Current shell structure | `src/components/header.tsx` (`data-app-shell="wide"` and `data-app-shell="compact"`) |
| Server composition | `src/app/layout.tsx` |
| Authorization | `src/features/access/server.ts` (`viewOperationalEnvironment`) |
| Runtime identity | `src/server/config/runtime.ts` (`local`, `e2e`, `preview`, `production`) |

## Selected direction

Select **Alternative A: identity stack**.

- **Desktop:** place the indicator in the authenticated sidebar identity block,
  after `PRIVATE BETA` and before primary navigation.
- **Mobile:** make a non-interactive brand stack in the first sticky-header row:
  the existing Training Hub link first, then the indicator. The indicator is a
  sibling of the link, never inside it.

This placement makes the environment an attribute of the running product,
rather than of Strava, the account, a route, or an action. It remains visible
without competing with account, connection, sync, theme, language, logout, or
navigation controls.

[Desktop alternatives (`57:2`)](https://www.figma.com/design/BzWOBhC4o5ZjOEuOc5IlTl/TrainingHub?node-id=57-2)
compare the selected identity stack with an operational-stack placement above
Strava. The operational placement was rejected because it visually associates
the environment with connection state and is easier to miss.

[Mobile alternatives (`59:34`)](https://www.figma.com/design/BzWOBhC4o5ZjOEuOc5IlTl/TrainingHub?node-id=59-34)
compare the selected brand stack with a separate status row. The extra row was
rejected because it adds chrome and pushes the primary page moment down.

## Display model and exact copy

R5 composes only this display model on the server:

```ts
type EnvironmentIndicatorModel = Readonly<{
  label: "LOCAL" | "E2E" | "PREVIEW" | "PRODUCTION";
  tone: "neutral" | "test" | "info" | "caution";
}>;
```

The complete mapping is fixed:

| Runtime identity | `label` | `tone` | Visible copy |
| --- | --- | --- | --- |
| `local` | `LOCAL` | `neutral` | `ENV · LOCAL` |
| `e2e` | `E2E` | `test` | `ENV · E2E` |
| `preview` | `PREVIEW` | `info` | `ENV · PREVIEW` |
| `production` | `PRODUCTION` | `caution` | `ENV · PRODUCTION` |
| unknown/unsupported | — | — | render nothing |

`ENV`, the separator, and the runtime values are stable technical copy and do
not localize. The accessible name localizes only its explanatory prefix:

- English: `Current environment: {LABEL}`
- Portuguese: `Ambiente atual: {LABEL}`

The visible text is uppercase. Do not add `LIVE`, a hostname, deployment URL,
database target, role name, creator name, or environment list.

## Visual specification

[The state matrix (`56:2`)](https://www.figma.com/design/BzWOBhC4o5ZjOEuOc5IlTl/TrainingHub?node-id=56-2)
is the visual authority for all four values in light and dark themes.

### Common geometry and type

| Property | Desktop | Mobile |
| --- | --- | --- |
| Type | Geist Mono Medium, 10 px / 14 px, uppercase, 4% tracking | same |
| Production weight | Geist Mono SemiBold | same |
| Horizontal padding | `space/8` (8 px) | `space/8` (8 px) |
| Vertical padding | `space/4` (4 px) | `space/2` (2 px) |
| Resulting height | 22 px | 18 px |
| Radius | `radius/8` (8 px) | `radius/8` (8 px) |
| Width | hug exact copy; maximum shown is 118 px | same |
| Motion | none | none |

### Tone mapping

| Tone | Surface | Text | Border and non-color signal |
| --- | --- | --- | --- |
| `neutral` / LOCAL | `surface.inset` | `content.secondary` | 1 px `border.subtle`; exact `LOCAL` text |
| `test` / E2E | `surface.inset` | `content.muted` | 1 px dashed `border.strong` (`4 px / 3 px`); exact `E2E` text |
| `info` / PREVIEW | `status.info.surface` | `status.info` | 1 px `border.strong`; exact `PREVIEW` text |
| `caution` / PRODUCTION | `status.caution.surface` | `status.caution` | 2 px `border.strong`, SemiBold type, exact `PRODUCTION` text |

In the current CSS vocabulary, `status.info` maps to the existing state-blue
foreground/background pair and `status.caution` maps to the state-amber pair.
`surface.inset`, content, and border roles use the existing `.th-foundation`
semantic aliases. Production is the strongest state through copy, font weight,
and border weight as well as tone; color is never the only signal.

## Exact shell placement

### Desktop, `lg` and wider

Use the existing `data-app-shell="wide"` sidebar.

1. Keep the Training Hub link first.
2. Keep `PRIVATE BETA` 8 px below it.
3. For a non-null creator model only, place the indicator 8 px below
   `PRIVATE BETA`.
4. Place navigation 8 px below the indicator. With a null model, preserve the
   current member spacing and geometry exactly; do not reserve an indicator gap.
5. Keep Strava, account, sync, language, theme, and logout in the existing
   bottom operational block.

The indicator is left-aligned and content-width. It never moves into the
navigation or bottom operational card.

Selected proof:

- [`61:39` — desktop light, 1440 × 1024](https://www.figma.com/design/BzWOBhC4o5ZjOEuOc5IlTl/TrainingHub?node-id=61-39)
- [`61:112` — desktop dark, 1440 × 1024](https://www.figma.com/design/BzWOBhC4o5ZjOEuOc5IlTl/TrainingHub?node-id=61-112)

### Mobile, below `lg`

Use the existing `data-app-shell="compact"` sticky header.

1. Replace the brand link's direct row position with a left-aligned brand stack.
2. Keep the Training Hub link as the first, independent child.
3. For a non-null creator model only, place the indicator 4 px below the link.
4. Keep sync, theme, and logout as 40 px controls in their current order.
5. Do not change the account/Strava/language row or the horizontally scrollable
   navigation row.

The brand stack is at most 118 px wide and 38 px high, which fits the current
56 px action row with 8 px vertical padding. At 390 px it leaves the protected
three-control cluster unchanged.

Selected proof:

- [`61:206` — mobile light, 390 × 844](https://www.figma.com/design/BzWOBhC4o5ZjOEuOc5IlTl/TrainingHub?node-id=61-206)
- [`61:233` — mobile dark, 390 × 844](https://www.figma.com/design/BzWOBhC4o5ZjOEuOc5IlTl/TrainingHub?node-id=61-233)
- [`60:34` — current-header stress proof](https://www.figma.com/design/BzWOBhC4o5ZjOEuOc5IlTl/TrainingHub?node-id=60-34): 390 px, light/dark, PT-BR navigation labels, long account ellipsis, Strava state, language, sync, theme, and logout all remain present without overlap.

## Presence and absence matrix

| Request state | Indicator | Geometry |
| --- | --- | --- |
| Authenticated creator with supported runtime | exactly one current value | selected desktop/mobile placement |
| Authenticated member | absent from markup | baseline member shell; no placeholder or reserved gap |
| Guest landing | absent from markup | existing public header unchanged |
| Login | absent; authenticated header already returns `null` | auth shell unchanged |
| Sign up | absent; authenticated header already returns `null` | auth shell unchanged |
| Revoked/invalid session | absent from markup | guest/auth boundary behavior unchanged |
| Unknown display mapping | absent from markup | fail closed; baseline geometry |

The inspected baseline frames [`11:4`](https://www.figma.com/design/BzWOBhC4o5ZjOEuOc5IlTl/TrainingHub?node-id=11-4)
and [`14:18`](https://www.figma.com/design/BzWOBhC4o5ZjOEuOc5IlTl/TrainingHub?node-id=14-18)
contain no environment-indicator node and remain the member-absence geometry.

## Interaction and accessibility contract

The indicator is static server-derived text.

- Use a non-interactive inline element with the localized accessible name.
- Do not use a link, button, menu, tooltip, `role="status"`, `aria-live`,
  `tabIndex`, pointer cursor, hover treatment, focus style, press state, or
  keyboard handler.
- It creates no Tab stop and does not alter the order or focus behavior of
  adjacent controls.
- There is no loading, pending, empty, partial, error, success, disabled, or
  destructive visual state. Unsupported mapping renders `null` before UI
  serialization.
- There is no transition or animation. Reduced-motion behavior is therefore
  identical and immediate.
- Text and border remain the non-color signals. Light/dark token modes must
  retain WCAG AA text contrast.

## Security and implementation boundary

- Authorization and runtime resolution occur on the server on every dynamic
  layout render.
- Compose the display model only after `viewOperationalEnvironment` is
  server-confirmed.
- Pass `EnvironmentIndicatorModel | null` to the client Header; never pass the
  runtime config object, environment variables, database metadata, hostnames,
  deployment URLs, or role internals.
- Guest and member models become `null` before client serialization.
- `E2E_PRODUCTION=1` still maps to `E2E`.
- The environment indicator component owns presentation only and cannot infer
  from `window.location`, a hostname, or other client state.

## Reference principles and no-copy boundary

- **Linear:** adapt calm, compact hierarchy and predictable focus behavior.
- **Resend:** adapt concise operational clarity.
- **Brex:** adapt redundant clarity for consequential context.

Do not copy their colors, wording, icons, component implementation, layout, or
brand identity. The supplied sketch contributes intent only; do not copy its
stack of every environment or place creator information on a guest surface.

## R5 acceptance handoff

R5 matches this contract when:

1. exact model/copy/tone mapping is server-derived and unknown values fail
   closed;
2. the selected 1440 and 390 placements match the named frames;
3. light/dark, long account/locale, and production salience match the proof;
4. member/guest/login/sign-up markup contains no indicator and reserves no gap;
5. no existing shell control, navigation path, focus order, or Strava/account
   state is removed or obscured; and
6. the rendered element has no interaction or motion and exposes no raw config.
