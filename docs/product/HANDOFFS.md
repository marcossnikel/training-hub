# Agent handoff brief

## Shared operating model

Training Hub is moving from a personal single-user app to a small multi-user paid beta. The immediate product boundary is a trustworthy BYO-Strava-app onboarding path, owner-isolated data, and explainable training insights. Do not build features that imply a standard hosted Strava integration, coaching, medical advice, or live billing before the relevant product decision and issue are approved.

Use the current codebase as technical truth. In particular: `src/lib/identity.ts` currently hard-codes one owner; `src/lib/auth.ts` is a password gate; Strava credentials are singleton state in `src/lib/db/client.ts`; pages and server actions make direct database assumptions. The analysis modules are worth preserving, but must operate through owner-scoped data.

Before coding, read `AGENTS.md` and the applicable Next.js documentation in `node_modules/next/dist/docs/`, as required by this repository. Work in small PRs. Do not edit another active agent's files without coordinating first.

## Platform & Quality agent

**Mission:** create the reliable delivery environment that lets feature builders validate their own work safely.

**Own now:**

- Run and document the actual baseline for `npm ci` and the project verification commands; distinguish failing code from missing local tooling/configuration.
- Establish the environment boundary plan: local, E2E, preview/staging, and production must never share databases or secrets.
- Validate GitHub, Vercel CLI/preview/log workflow, and Stripe CLI in test mode only. Do not create live prices, start live billing, or change the product database.
- Produce/update an engineering ship standard: required automated checks, manual checks, where logs/errors are inspected, evidence format, and how a builder records/fixes failures.
- Review [#21](https://github.com/marcossnikel/training-hub/issues/21)'s options for authentication, secrets, migration/reset, logging/redaction, and test isolation. Recommend; do not unilaterally choose product behavior.

**Do not own:** product copy, landing page implementation, multi-tenant feature changes, visual redesign, or external publishing.

**Required handback:** exact commands run and results, environment assumptions, issues/risks found, recommended next issue, and a concise builder-facing validation checklist.

## Future feature builders

**Mission:** implement exactly one assigned GitHub issue/PR at a time.

Every builder prompt must include the issue ID, this product pack, target files/area, acceptance criteria, non-goals, data/auth/billing impact, tests to add or update, manual validation steps, and stop conditions. The builder owns failures caused by their change: identify, fix, rerun, and report evidence before handoff.

For the tenant/auth epic, treat every query and route parameter as untrusted. Identity comes from the server-side session. Do not return or log secrets. Do not run migrations against a shared or production-like database without the named environment and reset/rollback plan.

## Product & Architecture agent

**Mission:** maintain the product thesis, decisions, roadmap sequencing, issue quality, and design/product review.

Own changes to this product pack, resolve scope questions, turn learning into small follow-ups, and review whether implementations meet user outcomes. Do not become the default large-feature implementation agent while other builders are active.

## Publishing Studio agent

**Mission:** help Marcos build in public as a software engineer who trains, not as a trainer or a fake startup spokesperson.

Own read-only profile audit, voice guide, content system, drafts, and a publishing decision log. Adapt work for [X](https://x.com/marcosnikel_) and [LinkedIn](https://www.linkedin.com/in/mnikel/). Never publish, change profiles, send messages, or claim a product capability without explicit Marcos approval and product confirmation.

## Handoff template

```md
Issue: TH-___ — [title]
Outcome: [user-visible result]
Scope / non-goals: [short]
Files and systems touched: [short]
Data/auth/billing impact: [short]
Validation run: [exact commands + outcome]
Manual proof: [environment, path, result]
Failures found and fixed: [or none]
Risks / follow-ups: [linked issue IDs]
Ready for: [reviewer or next issue]
```

## Coordination rule

Planning and research agents may work in parallel. Only one agent should make code changes in a shared area at a time. Product creates/clarifies the issue; a builder implements it; Platform & Quality independently reruns the agreed gate or reviews the evidence; Product accepts the outcome and sequences the next issue.
