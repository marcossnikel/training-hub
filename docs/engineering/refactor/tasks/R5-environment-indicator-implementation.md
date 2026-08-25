# R5 — Implement the creator environment indicator

**Status:** draft
**Risk:** medium
**Recommended builder:** Terra medium
**Depends on:** R4
**Unlocks:** creator operational context for R7

## Outcome

An authenticated creator sees one accurate current-environment label in the
approved desktop/mobile shell; members and guests do not receive it.

## Required context

- accepted R4 frame and design contract
- R2 runtime-environment resolver and R3 capability interface
- `src/app/layout.tsx`, `src/components/header.tsx`
- header/layout/component tests and E2E auth/tenant fixtures
- design foundation and visual QA docs

## Current behavior and evidence

The root layout already resolves the current server user and passes account
state into the client Header. Header has distinct guest, desktop-authenticated,
and mobile-authenticated branches. No environment value is currently passed.

## Locked decisions

1. Resolve role/capability and environment on the server.
2. Pass the smallest display model to UI, for example `{ label, tone } | null`;
   never pass the complete config or raw env object.
3. Render `null` for guest/member before client serialization.
4. The component has no click, hover-only information, menu, switch, or link.
5. Exact placement/tokens/copy come from R4; implementation does not improvise.
6. E2E may display `E2E`; `E2E_PRODUCTION=1` remains `E2E`, not `PRODUCTION`.

## Protected invariants

- session and capability are re-derived server-side on every dynamic layout;
- indicator cannot expose secrets or hostnames;
- guest/member output contains no creator marker;
- all existing shell controls and responsive navigation remain usable;
- no extra domain DB query for guest rendering.

## Permitted scope

- one environment-indicator component and focused tests;
- server layout display-model composition;
- Header props/rendering at approved locations;
- creator/member E2E assertions and i18n copy if required by R4.

## Non-goals

- creator invite navigation/UI;
- landing preview mode;
- environment switching or deployment links;
- shell redesign.

## Implementation sequence

1. Add/test pure environment-to-display mapping. Completion: every runtime enum
   has exact text/tone and unknown values fail closed.
2. Compose creator-only display model in server layout. Completion: member/guest
   receive null before Header serialization.
3. Implement approved desktop/mobile component. Completion: all existing Header
   states compile and controls remain present.
4. Add focused component/server tests and E2E visibility/absence proof.
   Completion: creator success plus member/guest absence are observable.
5. Capture visual proof and inspect HTML for forbidden config data.

## Required automated proof

- mapping tests for local/e2e/preview/production;
- creator/member/guest render tests;
- tenant isolation and auth tests;

```sh
npm run verify:fast
npx playwright test e2e/auth.spec.ts e2e/tenant-isolation.spec.ts
```

## Required manual or visual proof

At 1440 and 390, light/dark and reduced-motion:

- creator sees the approved current value;
- member shell has identical layout without the indicator;
- guest landing/login/signup contain no indicator;
- production variant remains readable without relying on color.

Use disposable local/E2E identities. Real production proof occurs only after a
separately authorized release.

## Migration, rollout, and rollback

No schema change beyond R3. Rollback removes display composition/component; role
data remains harmless. No deployment in this task.

## Stop conditions

- R4 lacks explicit frame approval;
- role/environment must be client-derived;
- mobile placement hides an existing control; or
- member/guest absence cannot be asserted before serialization.

## Completion criteria

- Exact current label appears only for creator.
- Approved 1440/390 contract is matched.
- No interactivity or secret/config leakage exists.
- Auth/tenant/shell tests pass.
- Existing Header capabilities remain present.
