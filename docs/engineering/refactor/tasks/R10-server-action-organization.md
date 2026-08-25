# R10 — Organize server actions by owning feature

**Ready gate note:** refresh caller inventory after R1 acceptance  
**Risk:** medium  
**Recommended builder:** Terra medium  
**Deferred review focus:** Terra medium; Server Action boundaries, owner resolution, redirects  
**Depends on:** R1  
**Unlocks:** R12 and R13

## Outcome

A developer looking for an activity, gear, goal, insight-feedback, account, or
sync mutation finds its Server Action beside the owning feature instead of in
the 746-line `src/lib/actions.ts`. The move preserves every current result,
redirect, revalidation, authorization check, and persisted effect.

## Required context

- installed Next.js Server Actions/forms/revalidation documentation under
  `node_modules/next/dist/docs/`;
- `src/lib/actions.ts` and its direct component/page importers;
- `src/lib/actions.auth.test.ts`, `actions.owner-scope.test.ts`, and
  `actions.threshold.test.ts`;
- existing dedicated seams `src/lib/byo-connection-actions.ts` and
  `src/lib/strava-lifecycle-actions.ts` as evidence, not mandatory templates;
- current auth/owner, validation, DB, cache/revalidation, and telemetry modules.

## Current behavior and evidence

`src/lib/actions.ts` currently exports language/logout, insight feedback, Strava
sync, activity confirmation/journal/splits/bike/race, thresholds, shoes, bikes,
manual activities, and goals from one `"use server"` module. UI callers import
that barrel directly. Some actions redirect, some revalidate paths, and most
resolve the authenticated owner before calling DB helpers. Existing tests
concentrate on auth, owner scope, and threshold behavior; several component
tests mock the broad module.

Before this task becomes ready, regenerate the exact export/import matrix with
`rg` and record it in this packet or the implementation handoff. Earlier tasks
may add creator/invite actions and must not be silently omitted.

## Locked decisions

1. Split by feature ownership, not by generic technical verbs or one file per
   function. Expected owners are `access/account`, `activities`, `gear`,
   `insights`, `goals`, and `strava`.
2. Every browser-callable action remains in a server-only module with the
   installed Next.js version's required directive and serialization contract.
3. Actions are thin entry points: parse/validate untrusted input, resolve
   identity, call a cohesive feature operation, then map/revalidate/redirect.
4. Domain/persistence behavior is not rewritten in this task. Extract a pure
   validator only when it removes real duplication and is covered first.
5. UI callers move to explicit feature-owned imports. A root compatibility
   barrel may exist only during the same task and is deleted before completion.
6. Preserve public action names and result shapes unless all in-repository
   callers/tests move atomically and no external contract exists.
7. Keep logout/language behavior close to account/preferences. Do not turn this
   into an authentication redesign.
8. Do not introduce an `ActionPort`, generic command bus, or repository facade.

## Protected invariants

- unauthenticated calls fail/redirect exactly as before and never mutate data;
- all activity, gear, threshold, feedback, and goal effects remain owner-scoped;
- validation messages/result discriminants remain compatible with UI callers;
- path revalidation and navigation occur only after the same successful effects;
- Strava sync errors remain redacted and do not expose credentials/provider data;
- no client bundle imports DB, secret, or server-only implementation code;
- current accessibility/loading behavior of submitting UI remains unchanged.

## Permitted scope

- create feature-owned action modules under `src/features/*/server/`;
- move existing action-focused tests beside the owning modules;
- update direct UI imports and narrow component mocks;
- delete `src/lib/actions.ts` after the last caller moves;
- small test helpers for authenticated owners and disposable DB setup.

## Non-goals

- changing product flows, copy, page layouts, role policy, DB schema, or routes;
- R11 Strava transport/sync restructuring;
- R12 activity page/chart/data refactor;
- replacing Server Actions with route handlers or an API client;
- broad validation/error framework standardization.

## Implementation sequence

1. Refresh the exported-function and caller matrix, classifying each action by
   owner and side effects. Completion: every current export has one destination
   and every importer/test is listed.
2. Add/locate characterization proof for auth failure, invalid input, success
   persistence, redirect/revalidation, and owner isolation per group.
   Completion: every action group has observable interface proof before moves.
3. Create the account/preferences and low-coupling feature action modules;
   update their exact callers. Completion: no caller for those functions uses
   the old module and focused tests pass.
4. Move activities, gear, insights, goals, and Strava sync one group at a time.
   Completion after each group: its imports/mocks/tests target the owning seam
   and no unrelated group changes behavior.
5. Search for old imports and dynamic references, then delete the compatibility
   module. Completion: repository search finds no old action import and the old
   file is absent.
6. Run focused and fast gates and inspect client/server build boundaries.
   Completion: build/type/test evidence catches no server-only client leak.

## Required automated proof

- existing auth, owner-scope, threshold, component, Strava lifecycle, and BYO
  action tests remain green at their new or current locations;
- add missing per-group invalid/success/unauthenticated tests when no current
  test demonstrates the interface;
- at least one two-owner mutation proof for every persistence-owning group;
- repository assertion/search shows no imports from `@/lib/actions` or
  `src/lib/actions`;
- production build or R1 production smoke proves server-only imports are valid.

```sh
npm run verify:fast
npm run test:e2e:production
```

Run only the focused Playwright specs for workflows whose wiring changed; do
not expand this task into a full visual regression pass.

## Required manual or visual proof

At desktop and narrow widths, smoke one representative existing action for each
UI-owning group: sync, Review confirmation, journal/splits, gear save, threshold
save, feedback, and goal create/delete. Confirm success/error feedback and
navigation remain unchanged. New screenshots are not required because visual
design is not changing; record route, viewport, action, and result.

## Migration, rollout, and rollback

No data migration. The source/import move is atomic in one release. Temporary
compatibility exports expire inside this task. Rollback is the previous code
revision; no stored data requires reversal.

## Stop conditions

- an action has an external consumer or runtime import that cannot be identified;
- installed Next.js docs contradict the proposed module/directive boundary;
- an earlier task is actively editing the same action/import files;
- preserving behavior requires an auth, schema, product, or Strava semantics
  decision; or
- the baseline cannot attribute a focused failure to this move.

## Completion criteria

- Every action has one discoverable feature owner and a narrow server entrypoint.
- No UI/test imports the old broad module; it and temporary exports are deleted.
- Results, validation, owner isolation, redirects, and revalidation are proven.
- No product, schema, environment, or provider behavior changed.
