# R21 — Add evidence-bound Training Analyst hypotheses

**Status:** queued
**Delivery class:** full stack
**Risk/model:** high — Terra high
**Depends on:** R20 done
**Unlocks:** none

## Outcome

An athlete can request or receive a small bounded set of Training Analyst
hypotheses, inspect every athlete/theory source, and confirm, edit, reject, or
defer each one without any autonomous training prescription or profile mutation.

## Current truth

The accepted [Training Analyst v1 contract](../../../product/training-analyst-contract.md)
defines the exact evidence/output schemas, theory cards, OpenAI/consent/privacy
boundary, persistence, UI states, fixtures, and release gate. R21 implements
that contract exactly; it does not reopen its decisions.

## Locked decisions

1. Implement exactly the R20 schemas and approved curated-library version.
2. Construct packets server-side from owner-scoped deterministic read models;
   never pass database/query tools to the model.
3. Validate structured output before persistence/render. Reject prohibited,
   uncited, cross-owner, invalid-unit, or schema-invalid output.
4. Hypotheses are proposals only. Confirm/edit/reject/defer is persisted as
   athlete feedback; applying a profile value is a separate explicit R19 action.
5. Generation has bounded item count, evidence size, timeout, retries, cost, and
   concurrency. No unbounded chat history or recursive agent loop.
6. Activity names/notes/theory text are untrusted content, never instructions.
7. Deterministic fallback remains usable through provider failure or opt-out.
8. Disconnect/account deletion removes or severs analyst artifacts exactly as
   accepted in R20; provider logs cannot retain more than the approved boundary.

## May change

R20-owned analyst feature modules, approved provider adapter, generation and
feedback persistence, activation/insight UI integration, i18n, synthetic fixtures,
and exact evaluation/integration/browser tests named by R20.

## Must remain true

- owner isolation and evidence links;
- no prescriptions, medical/readiness claims, or silent mutations;
- deterministic calculations remain authoritative;
- opt-out/failure does not remove core product value;
- no real athlete/provider data in automated proof.

## Non-goals

- open-ended chat;
- tool-using autonomous agent;
- workout generation or calendar changes;
- web search at runtime;
- replacing curated theory or deterministic modules.

## Implementation map

1. Add R21-owned additive migrations and repositories for the five analyst
   tables specified by the contract. Completion: owner-scoped consent,
   generation, hypothesis, feedback, and usage records have the required
   cascades and no raw packet/provider response is durable.
2. Build the checked-in typed theory-card catalog from exactly the accepted
   `training-theory-2026-08-25` documents and source registry. Completion: each
   selected card has validated source IDs, evidence weight, population, and
   limitation; arbitrary Markdown is never model input.
3. Build the owner-scoped packet constructor and redaction/digest boundary.
   Completion: canary names, tokens, activity titles, free text, raw IDs, and
   owner-B rows do not enter packet or logs; missing evidence bypasses provider.
4. Implement the allowlisted foreground OpenAI adapter, consent/limit
   reservation, strict response parsing, prohibition validator, and ambiguous
   retry reconciliation. Completion: no tools/history/fallback provider are
   possible, and only fully valid bounded output persists.
5. Add request/history/feedback UI to the named deterministic insight surfaces.
   Completion: consent, success, evidence disclosure, all four feedback actions,
   unavailable/fallback, opt-out, keyboard/focus, 1440px/390px, and reduced
   motion match the contract; feedback never applies a parameter.
6. Wire revocation, Strava disconnect, and account deletion cleanup. Completion:
   analyst records have the contract's deletion semantics and deterministic
   value remains after every removal/failure state.
7. Add the contract's deterministic-double golden/adversarial integration suite
   and run its exact command, then perform browser iteration at 1440px and
   390px. Completion: every zero-tolerance prohibition and owner canary passes.

## Acceptance

- Golden fixtures produce schema-valid, cited, bounded hypotheses.
- Adversarial fixtures never leak owners, follow injected instructions, prescribe,
  invent missing data, or bypass consent.
- Feedback never applies a profile value implicitly.
- Provider timeout/invalid output/budget/opt-out all show deterministic fallback.
- Browser surfaces expose sources, limitations, state, feedback, keyboard/focus,
  responsive behavior, and reduced motion.

## Validation

Focused integration tests for owner-scoped packet/generation/persistence/
feedback/deletion with an approved local deterministic model double, plus R20's
golden/adversarial evaluation command. Then iterate consent, success, evidence
disclosure, confirm/edit/reject/defer, failure/fallback, and opt-out in a real
browser at 1440/390. Any live provider smoke requires separate explicit
authorization and synthetic data.

## Stop only if

Any R20 planning output is missing, provider/consent/privacy authority is not
available, evaluation fails a prohibition/owner canary, or implementation would
require sending real athlete data without explicit approval.
