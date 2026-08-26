# R0 — Restore a trustworthy tooling baseline

> Historical task context: the former `src/lib/strava.ts` path was removed by
> the completed Strava refactor; current ownership is recorded in R11.

**Status:** done
**Risk:** medium
**Recommended builder:** Terra medium
**Depends on:** none
**Unlocks:** R1

## Outcome

The repository has one intentional lint/format setup and every non-E2E quality
check can run from a clean install. Tool failures are distinguishable from later
refactor regressions.

## Required context

- `package.json`, `package-lock.json`, `eslint.config.mjs`, `biome.json`
- `src/lib/retired-coach.test.ts`
- `knip.json`, `vitest.config.ts`, `tsconfig.json`
- relevant Next.js lint/build guidance under `node_modules/next/dist/docs/`

## Current behavior and evidence

At planning time the worktree contains an in-progress migration: tracked ESLint
configuration is deleted, `package.json` invokes `biome lint .`, and `biome.json`
is untracked. A prior baseline found `biome` unavailable in the installed
dependencies and the retired-coach test attempted to read the tracked-but-
deleted ESLint file. Treat the current worktree as authoritative when execution
starts; do not assume this snapshot is unchanged.

## Locked decisions

1. This task resolves only tooling baseline, not application architecture.
2. Finish the in-progress Biome lint replacement; do not restore ESLint as a
   competing lint path. If a material Next/React correctness gap cannot be
   covered, repair deterministic in-scope findings instead of accepting weaker
   lint.
3. Prettier remains the formatter; Biome must not silently become a second
   formatter or organize imports as an unrelated rewrite.
4. The task documents and configures coverage for React Hooks, JSX
   accessibility, and relevant Next/React correctness rules.
5. A config-absence guard reads only files that exist in the working tree; a
   tracked deletion is not a product failure.
6. Dependency and lockfile state must agree after `npm ci`; the current manifest
   names Biome while the lockfile still records direct ESLint dependencies, so
   lockfile regeneration is part of this task.
7. The user explicitly authorized repairing genuine baseline violations exposed
   by the recommended Biome preset. Keep those repairs behavior-preserving and
   limited to the exact files and diagnostics listed under **Permitted scope**;
   do not downgrade or suppress the rules to obtain green output.

## Protected invariants

- No lint or test rule is disabled to obtain green output.
- Retired coach/provider code remains absent.
- Existing unrelated source changes are preserved.
- No runtime dependency, route, schema, environment behavior, or product copy
  changes in this task.

## Permitted scope

- lint/format config, `package.json`, lockfile;
- tooling-only tests such as `retired-coach.test.ts`;
- `knip.json` only for dependency recognition needed by the chosen tool.
- behavior-preserving fixes for `noControlCharactersInRegex` and
  `noImplicitAnyLet` in `src/app/api/strava/callback/route.ts`,
  `src/lib/strava-byo.ts`, and `src/lib/strava.ts`;
- a behavior-preserving `noShadowRestrictedNames` fix in
  `src/components/totals-table.tsx`.

## Non-goals

- tightening broad dead-code ignores;
- reformatting the entire application;
- changing Server Actions, auth, invites, Strava, or E2E scheduling;
- adding the fast verification scripts from R1.

## Implementation sequence

1. Record git state and attribute the existing lint changes. Completion: every
   dirty file is classified as assigned or preserved.
2. Compare the proposed Biome rules with the deleted ESLint/Next configuration.
   Completion: the handoff names covered rules and any material gap.
3. Finish the Biome lint migration. Completion: installed dependencies,
   lockfile, config, and `npm run lint` agree, and there is no ESLint command or
   direct dependency left.
4. Make config-scanning tests robust to legitimate tracked deletions without
   weakening their retired-token assertions. Completion: the focused test
   passes with the selected config present.
5. Run the required proof and inspect the diff. Completion: no application file
   changed solely to satisfy a tooling migration unless it contained a genuine
   reported violation.

## Required automated proof

```sh
npm ci
npm run check:env
npm run typecheck
npm run lint
npm run format:check
npm run test:unit
npm run deadcode
npm run cycles
```

If formatting is red only because of unrelated pre-existing source work, record
the exact file and stop rather than formatting it without ownership.

## Required manual or visual proof

Not applicable.

## Migration, rollout, and rollback

No data migration or deployment. The rollback is the previous coherent ESLint
toolchain plus matching lockfile/config; do not leave a half-migrated state or
two active linters.

## Stop conditions

- the current dirty lint files are owned by another active implementation;
- Biome lacks a material correctness rule and no accepted substitute is named;
- `npm ci` would overwrite an unrelated lockfile change; or
- a baseline application failure reproduces outside the explicitly authorized
  source files above, or fixing one of those files would change observable
  route, authorization, Strava, data, or UI behavior.

## Completion criteria

- One lint command and one formatter are authoritative.
- Clean install exposes every referenced binary.
- All required commands pass or an unrelated failure is precisely isolated and
  the task is blocked.
- No product/runtime behavior changed.
- The handoff records Biome's Next/React coverage and any deliberately external
  checks that replace a former ESLint rule.
