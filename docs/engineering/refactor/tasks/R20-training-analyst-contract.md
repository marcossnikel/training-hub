# R20 — Define the Training Analyst contract

**Status:** done
**Delivery class:** documentation/plan
**Risk/model:** high — Sol high
**Depends on:** R19 done and Marcos's curated theory library available
**Unlocks:** R21

## Outcome

A future low-cost builder can implement an evidence-bound Training Analyst
without choosing training theory, privacy policy, prompt behavior, output
schema, evaluation criteria, or fallback UX.

## Current truth

- Training Hub already has deterministic totals, consistency, weekly briefs,
  comparable activity, zones, benchmarks, and evidence handles.
- There is no runtime LLM provider, consent, prompt/version registry, generation
  persistence, cost limit, or analyst UI contract.
- Initial imported summaries lack complete streams/details, so the analyst must
  distinguish summary evidence from enriched evidence.
- The curated, versioned theory library is vendored at
  `docs/training-theory/`, with source IDs such as `[SRC-001]` and review
  metadata dated 2026-08-25.

## Locked decisions

1. Role is Training Analyst: surface evidence-linked observations and questions
   an athlete might miss. It does not prescribe workouts, diagnose, assess
   readiness, or act as a generic chat coach.
2. Deterministic code calculates totals, zones, benchmarks, dates, samples, and
   data-quality flags. The model interprets a bounded evidence packet; it never
   queries the database or performs authoritative arithmetic itself.
3. Theory comes only from the curated, versioned library approved by Marcos.
   Every applicable claim cites theory source IDs and athlete evidence IDs.
4. Output is structured and bounded: observation, athlete evidence references,
   theory references, limitations, confidence category with explicit rubric,
   confirmable hypothesis, optional question, and prohibited-action flags.
5. The athlete may confirm, edit, reject, or defer a hypothesis. No output
   changes an effective profile parameter or product state without a separate
   explicit action.
6. AI failure, timeout, rate/cost limit, invalid schema, missing consent, or
   insufficient evidence returns deterministic product value and honest status.
7. Store prompt/version, evidence-packet digest and safe references, model/provider
   ID, structured output, validation result, timestamps, feedback, and cost/token
   metadata needed for audit. Do not persist secrets or unnecessary raw payloads.
8. Owner isolation is enforced before packet construction, generation lookup,
   and feedback. Generation IDs are unguessable but never authorization.
9. No real athlete data may be sent until provider, consent, retention,
   redaction, data residency/terms, and deletion behavior are accepted.
10. First evaluation uses synthetic/disposable athlete fixtures and must include
    adversarial missing/contradictory data, prompt injection in activity names,
    unsupported theory, overconfidence, prescription, and cross-owner canaries.

## Marcos-approved product defaults

- Provider: OpenAI API; model: Terra with high reasoning; no automatic fallback.
- Send only the minimum redacted evidence packet. Do not send names, email
  addresses, tokens, or raw free-text activity names.
- Consent is explicit and versioned as `training-analyst-v1`; it is revocable,
  and generation is unavailable without current consent.
- Training Hub stores structured output, safe evidence references, and a packet
  digest; revocation or account deletion removes those records.
- The provider API is treated as not used for model training by default; the
  product does not assume zero-data-retention approval and must disclose the
  provider's applicable monitoring/retention terms.
- Initial limits are one generation per athlete per day, ten concurrent
  generations, and a US$20 monthly budget with a Marcos-owned kill switch.

## Required planning outputs

The accepted [Training Analyst v1 contract](../../../product/training-analyst-contract.md)
locks all nine required planning outputs: the exact library/citation contract,
field-minimized packet, strict response schema and rubric, static prompt
boundary, OpenAI/consent/retention policy, persistence/deletion lifecycle, UI
fallback, zero-tolerance fixtures and regression command, plus R21's exact
implementation/rollback contract.

## Acceptance

- No unresolved theory, privacy, provider, data, output, UI, or evaluation choice
  remains for R21; the accepted product contract is its single source of truth.
- Every allowed claim can point to athlete and theory evidence.
- Prescription/medical/readiness/generic-chat outputs are mechanically rejected
  or withheld.
- Athlete feedback and explicit application semantics are specified.
- Offline deterministic fallback is a first-class successful product state.
- Synthetic evaluation demonstrates owner and prompt-injection safety.

## Validation

Documentation/plan only: validate internal links and schemas, trace each decision
to accepted product boundaries, run contradiction searches, review fixture
coverage, and run `git diff --check`. Do not call an LLM provider or use real
athlete data during this task.

## Stop only if

The curated library is unavailable, provider/privacy/consent decisions require
Marcos, or the desired output would cross into workout prescription, medical, or
readiness behavior.
