# R? — Task title

**Risk:** low | medium | high  
**Recommended builder:** model and effort  
**Deferred review focus:** model/risk focus before relevant live-risk actions  
**Depends on:** task IDs or none  
**Unlocks:** task IDs

## Outcome

One observable user or developer result. Avoid combining independent outcomes.

## Required context

List only files that every builder needs. Add conditional pointers for branch-
specific material.

## Current behavior and evidence

Describe what the current code does, including the exact implementation and
test files that prove it. State any confirmed bug mechanism.

## Locked decisions

Number each product, domain, interface, migration, and UI decision the builder
must implement rather than reinterpret.

## Protected invariants

List authorization, ownership, privacy, environment, data, contract, error,
responsive, and accessibility behavior that must remain true.

## Permitted scope

List files/modules that may change and the kinds of changes allowed. New files
should have proposed feature ownership.

## Non-goals

List adjacent work that must remain unchanged.

## Implementation sequence

Number the edits in dependency order. End every step with an observable
completion criterion.

## Required automated proof

Name test files, scenarios, exact assertions, and commands. Use disposable
SQLite or local provider doubles where required.

## Required manual or visual proof

Name route, authentication state, environment, viewport, interaction, expected
result, accessibility behavior, and artifact requirements.

## Migration, rollout, and rollback

State schema/data handling, compatibility lifetime, deployment boundary, and
how to return safely to the previous version. Use `not applicable` explicitly.

## Stop conditions

List missing decisions or unsafe states that end the task instead of inviting a
guess.

## Completion criteria

Use a checkable exhaustive list. The task is not done while any item is unknown
or supported only by a builder claim.
