# Training Hub product brief

**Status:** working product foundation
**Audience:** athletes who train consistently and want to understand the patterns in their own history.
**Product working name:** Training Hub (rename before public launch; no naming decision yet).

## Product thesis

Training Hub is personal training intelligence: it notices meaningful patterns in an athlete's activity history, adds context across weeks and training blocks, and helps them decide what to do next.

It is not another generic activity log, a coaching marketplace, or a black-box AI chat. Its value is the specific observation that an athlete would otherwise miss: how this week compares with the intended block, whether a session resembles a prior effort, and what changed between periods.

The initial audience is self-coached runners and cyclists who already record activities in Strava, care about progress, and are comfortable connecting their own data source. The founder is a software engineer who trains; product voice should be peer-to-athlete, precise and human, never positioned as coaching advice.

## What exists today

The current codebase is a useful analysis foundation, not a multi-user product:

- A Next.js App Router application with server-rendered pages, server actions, libSQL/Turso access, and shadcn-based UI components.
- Strava OAuth sync, activity review and confirmation, gear mileage, journals, activity stream analysis, performance/threshold views, race blocks, and race-block comparison.
- A single global database and singleton identity: `src/lib/identity.ts` always returns athlete `id: 1`; Strava credentials are global; core activity and gear records have no tenant owner.
- A password gate in `src/lib/auth.ts`, not account registration or user authentication.

The last point defines the first implementation priority. Existing user-facing analysis should be preserved where it remains valuable, but every read, write, and secret must become owner-scoped before real users are invited.

`docs/product/` is the source of truth for the productization plan. Older route maps and roadmap documents describe earlier versions of the personal app and should be treated as historical unless reconciled with the current code.

## v0 launch definition

v0 is a small paid beta that is complete end to end for a real individual athlete. A user can:

1. Understand the product from a public landing page and create an account.
2. Complete a clear onboarding flow, including an explanation of the connection model and privacy boundaries.
3. Connect Strava through **their own Strava developer application** (BYO Strava app), then sync activity history into only their account.
4. Review training context: current/recent week, selected blocks, performance trends, activity detail, and gear mileage.
5. Receive at least one useful, explainable insight: a weekly training brief and/or a comparable prior workout or block, with links to the evidence behind it.
6. Manage a beta subscription in Stripe test-to-live rollout, cancel it, disconnect Strava, and request/delete their account data.

The v0 objective is not broad market validation or maximum automation. It is a trustworthy, usable product loop that can be placed in the hands of a small set of invited athletes and iterated in public.

## Initial connection path: BYO Strava app

Until a standard hosted Strava application is approved and suitable for this product, a user must supply credentials for a Strava application that they created in their own Strava developer account. Training Hub must never silently default to the founder's personal application credentials.

The onboarding experience should make this feel deliberate rather than technical debt:

1. **Why this step exists.** Explain in plain language that the beta uses the athlete's own Strava developer app, that it is their connection, and that the app only reads the scopes Training Hub needs.
2. **Create the app.** Link to Strava's app-creation flow and show the exact callback URL to register for the current environment. Do not claim that BYO credentials remove Strava platform-policy obligations.
3. **Enter and validate credentials.** Collect Client ID and Client Secret over TLS; validate format and connection before continuing. Secrets must be encrypted at rest, never rendered back to the browser, and never logged.
4. **Authorize Strava.** Redirect through OAuth using the submitted client ID, validate signed state/callback ownership, exchange the code server-side, and show the granted scopes.
5. **Sync and first value.** Show progress, let the athlete choose an initial history window if needed, and route to a first useful review rather than a blank dashboard.
6. **Control the connection.** Let the athlete reconnect, revoke/disconnect, delete imported data, and see a concise data-use explanation.

This is a beta connection strategy, not a permanent substitute for commercial/API approval. Any ambiguity around Strava API policy, data use, paid functionality, or the operating model remains a launch risk to resolve in writing before broad public availability.

## Product principles

- **Evidence before advice.** An insight identifies the activities, dates, metrics, and comparison window that support it.
- **Useful before comprehensive.** Deliver a small number of high-confidence observations rather than a dense dashboard of every metric.
- **Athlete language.** Be direct and specific: “your easy volume fell 22% while threshold work rose,” not generic motivational copy.
- **Privacy by default.** Each account owns its data and connection. Least-privilege scopes, deletion, and disconnect are product features.
- **Human-designed calm.** Use shadcn as the component base; aim for the editorial, contextual clarity of the supplied Beautiful UI and Recent references without copying them or making the interface look AI-generated.
- **Make the builder visible.** Small, evidence-backed releases are suitable for a public GitHub and build-in-public narrative.

## Explicit non-goals for v0

- A default shared/founder Strava client or a claim that BYO credentials resolve licensing/policy questions.
- Training-plan authoring, workout prescription, automated coaching, or medical/readiness guidance.
- Recreating TrainingPeaks-style fitness, readiness, recovery, or health dashboards that were intentionally removed from this codebase.
- A social feed, coach marketplace, team management, or athlete-to-athlete sharing.
- Multi-provider integrations, mobile native apps, or broad device-data ingestion.
- Autonomous AI decisions about training. AI may help express an already-grounded observation later; deterministic and inspectable analysis is the launch core.
- Complex pricing, annual plans, trials, coupons, tax automation, or live billing before the account/data model and beta workflow are solid.

## v0 success signals

The first beta cohort should be measured qualitatively as well as quantitatively:

- An invited athlete completes BYO connection without founder intervention.
- Their imported activities never appear in another account.
- They can name one observation that changed how they understood a recent week, workout, or block.
- They can disconnect/delete without a support request.
- The founder can reproduce a reported issue from logs and a preview deployment without seeing raw secrets.

## Name and positioning

Do not force a name before the product has a sharper voice. For now, use “Training Hub” internally and evaluate candidates against: pronounceable, distinct enough for a domain and social handle, athletic but not limiting to running, intelligence/context over generic tracking, and credible as a small paid product. Naming is a separate, time-boxed product decision before public landing-page launch.
