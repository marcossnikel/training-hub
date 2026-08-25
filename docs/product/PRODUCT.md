# Training Hub product brief

**Status:** working product foundation
**Audience:** athletes who train consistently and want to understand the patterns in their own history.
**Product working name:** Training Hub (rename before public launch; no naming decision yet).

## Product thesis

Training Hub is personal training intelligence: it notices meaningful patterns
in an athlete's activity history, adds context across weeks and training blocks,
and gives the athlete evidence they can interpret and correct.

It is not another generic activity log, a coaching marketplace, or a black-box
AI chat. Its value is the specific observation that an athlete would otherwise
miss: how this week compares with prior evidence, whether a session resembles a
prior effort, and what changed between periods. A future Training Analyst may
interpret bounded evidence and ask confirmable questions, but it does not
prescribe training or silently change athlete data.

The initial audience is self-coached runners and cyclists who already record activities in Strava, care about progress, and are comfortable connecting their own data source. The founder is a software engineer who trains; product voice should be peer-to-athlete, precise and human, never positioned as coaching advice.

## What exists today

The codebase now has a private-beta foundation, not a broadly released product:

- A Next.js App Router application with server-rendered pages, server actions,
  libSQL/Turso access, and shadcn-based UI components.
- Better Auth `1.4.18` email/password accounts with database-backed server
  sessions; application ownership derives from the validated session rather
  than browser input.
- Owner-scoped product records and encrypted, owner-scoped BYO Strava
  connection material. The connection flow validates state, exact scopes, and
  callback ownership; disconnect deletes the local Strava-origin graph as
  specified in D-013/D-017.
- Activity review and confirmation, gear mileage, journals, activity stream
  analysis, performance/threshold views, race blocks, weekly briefs, and
  comparable prior-activity evidence.

The remaining launch work is deliberately operational and product-facing:
server-enforced beta invitations, truthful landing/access surfaces, the clean
external BYO preview proof, billing design and test-mode implementation, and
an explicit public name/domain decision. Existing developer/test sign-up does
not make the product publicly available.

`docs/product/` is the source of truth for the productization plan. Older route maps and roadmap documents describe earlier versions of the personal app and should be treated as historical unless reconciled with the current code.

## v0 launch definition

v0 is a small paid beta that is complete end to end for a real individual athlete. A user can:

1. Understand the product from a truthful landing page and, when deliberately
   invited, create an account through a private registration link.
2. Complete or skip a one-time platform onboarding that explains the product,
   privacy boundary, and optional Strava setup.
3. Connect Strava through **their own Strava developer application** (BYO Strava
   app), then see a separate skippable connection-progress and Activation Summary
   experience backed by real import state.
4. Start with confirmed historical Training Log, Totals, Consistency, and gear;
   only post-connection activities wait in Review.
5. Receive at least one useful, explainable fact or hypothesis with links to the
   athlete evidence behind it and a way to correct an assumption.
6. Manage a beta subscription in Stripe test-to-live rollout, cancel it, disconnect Strava, and request/delete their account data.

The v0 objective is not broad market validation or maximum automation. It is a trustworthy, usable product loop that can be placed in the hands of a small set of invited athletes and iterated in public.

### Initial beta access

The first cohort is manual and invitation-only. A landing page may explain the
product and the access boundary, but it does not operate an open waitlist,
public self-serve sign-up, payment collection, or an availability promise.
Existing developer/test registration is not public-beta access. Before any
public promotion, new registration must be enforced by a valid private invite;
an invitation is an access-control feature, not merely copy.

## Initial connection path: BYO Strava app

Until a standard hosted Strava application is approved and suitable for this product, a user must supply credentials for a Strava application that they created in their own Strava developer account. Training Hub must never silently default to the founder's personal application credentials.

The onboarding experience should make this feel deliberate rather than technical debt:

1. **Why this step exists.** Explain in plain language that the beta uses the athlete's own Strava developer app, that it is their connection, and that the app only reads the scopes Training Hub needs.
2. **Create the app.** Link to Strava's app-creation flow and show the exact callback URL to register for the current environment. Do not claim that BYO credentials remove Strava platform-policy obligations.
3. **Enter and validate credentials.** Collect Client ID and Client Secret over TLS; validate format and connection before continuing. Secrets must be encrypted at rest, never rendered back to the browser, and never logged.
4. **Authorize Strava.** Redirect through OAuth using the submitted client ID, validate signed state/callback ownership, exchange the code server-side, and show the granted scopes.
5. **Sync and first value.** Show truthful stages and counters while existing
   history imports as confirmed, then present an Activation Summary. Only new
   post-cutoff activities enter Review.
6. **Control the connection.** Let the athlete reconnect, revoke/disconnect, delete imported data, and see a concise data-use explanation.

This is a beta connection strategy, not a permanent substitute for commercial/API approval. Any ambiguity around Strava API policy, data use, paid functionality, or the operating model remains a launch risk to resolve in writing before broad public availability.

## Product principles

- **Evidence before interpretation.** An insight identifies the activities,
  dates, metrics, comparison window, assumptions, and limitations that support
  it.
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
- Workout prescription or autonomous AI decisions about training. A Training
  Analyst may later interpret bounded deterministic evidence, cite curated
  theory, and propose hypotheses the athlete can confirm, edit, or reject.
- Complex pricing, annual plans, trials, coupons, tax automation, or live billing before the account/data model and beta workflow are solid.
- An open waitlist or public self-serve registration before invite enforcement
  is implemented and validated.

## v0 success signals

The first beta cohort should be measured qualitatively as well as quantitatively:

- An invited athlete completes BYO connection without founder intervention.
- Their imported activities never appear in another account.
- They can name one observation that changed how they understood a recent week, workout, or block.
- They can disconnect/delete without a support request.
- The founder can reproduce a reported issue from logs and a preview deployment without seeing raw secrets.

## Name and positioning

Do not force a name before the product has a sharper voice. For now, use “Training Hub” internally and evaluate candidates against: pronounceable, distinct enough for a domain and social handle, athletic but not limiting to running, intelligence/context over generic tracking, and credible as a small paid product. Naming is a separate, time-boxed product decision before public landing-page launch.
