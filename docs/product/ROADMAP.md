# Productization roadmap

This roadmap is ordered by dependency, not by what is easiest to make visually impressive. It deliberately separates planning/platform work from feature implementation.

## Phase 0 — establish a safe delivery baseline

**Goal:** make changes reviewable and reproducible before the data model moves.

- Capture the current verification baseline and repair only toolchain/test failures needed to make it trustworthy.
- Define local, E2E, preview/staging, and production environment boundaries; document required secret names without committing values.
- Verify GitHub access, preview-deployment workflow, error/log inspection, and Stripe CLI test-mode capability.
- Publish this product foundation and maintain the active GitHub Issue backlog.

**Exit:** a builder can open a small PR, run the documented gate, obtain a preview, and hand back evidence. The Platform & Quality agent owns most of this phase.

## Phase 1 — multi-tenant foundation and real authentication

**Goal:** make it safe for two accounts to exist.

- Design the user, session, ownership, secret-storage, deletion, and reset/migration strategy.
- Replace singleton identity and password gate with real accounts and authenticated sessions.
- Scope every existing product record, file/reference, action, and query to its owner.
- Introduce owner-scoped Strava connection storage without yet exposing public BYO onboarding.
- Prove isolation and session behavior with automated tests and an end-to-end two-user scenario.

**Exit:** an authenticated user cannot read, modify, sync, or infer another user's activity, gear, notes, or credentials. This is the first implementation epic and is tracked in [GitHub Issues](https://github.com/marcossnikel/training-hub/issues?q=is%3Aissue%20is%3Aopen).

## Phase 2 — onboarding and BYO Strava connection

**Goal:** an invited athlete connects themselves and reaches first value.

- Build the onboarding journey, credential education, OAuth state validation, scoped sync, error recovery, and reconnect/disconnect controls.
- Add data-use, retention, and deletion communication that matches implementation.
- Make the empty/loading/sync states feel intentional, then route to a useful first review.

**Exit:** a test athlete can complete BYO setup from a clean account in a preview environment without a developer in the loop.

## Phase 3 — the intelligence loop

**Goal:** make Training Hub worth returning to weekly.

- Ship an explainable weekly training brief using existing activity/stream analysis where possible.
- Ship a comparable-workout or comparable-block experience with transparent similarity criteria.
- Improve period/block comparison so the observation links back to activities and metrics.
- Establish lightweight feedback capture: useful/not useful and a short note.

**Exit:** a user receives a small number of evidence-linked observations that are more useful than a raw activity list.

## Phase 4 — beta product surface and billing

**Goal:** support a small paid beta without building a billing company.

- Build a polished landing page and beta/invite path aligned with the product thesis.
- Add one monthly plan via Stripe Checkout, Customer Portal, webhook-backed entitlement, cancellation, and failure-state handling.
- Add account settings, disconnect/delete flows, basic support paths, and launch analytics that respect the privacy posture.

**Exit:** an invited user can understand, subscribe, use, manage, and leave the product without founder-side database intervention. Live billing requires an explicit go/no-go decision.

## Phase 5 — invited beta and public learning

**Goal:** learn with real athletes while building in public.

- Invite a small cohort, observe onboarding completion and insight usefulness, and address support friction.
- Share honest build artifacts: implementation decisions, demos, tests, observations, and product questions. The Publishing Studio adapts this for X and LinkedIn; Marcos approves every post.
- Decide whether to seek a standard Strava integration, change the connection model, expand the insight set, or pause.

**Exit:** a deliberate evidence-based decision about broader launch, not a launch driven only by a finished feature list.

## Critical path

```text
Verification baseline
        ↓
Tenant model + authentication
        ↓
Owner-scoped Strava credentials/data
        ↓
BYO onboarding + dependable sync
        ↓
Explainable recurring insight
        ↓
Landing + subscription + invited beta
```

Design exploration, brand work, and build-in-public content can run alongside the critical path. They must not block account isolation, nor should they invent promises the product cannot yet fulfill.
