# Product evolution roadmap

## Product outcome

Training Hub should turn an athlete's own history into evidence-linked facts,
calculations, and hypotheses they would be unlikely to notice alone. It is not a
second Strava view, a workout prescription engine, or a generic chat product.

Marcos is the only current account and the product is not in production. This
lets us improve the model deliberately, but it does not relax owner isolation,
secret handling, provider policy, or environment boundaries.

## Delivery principle

Build vertical product slices before structural cleanup of code those slices
will replace. Each implementation packet must be executable from `Realize Rxx`,
own its recoverable failures, and validate according to its delivery class.

## Stage 0 — make tasks cheap to execute

**Outcome:** a fresh builder needs only `AGENTS.md` and one ready packet.

- R0 tooling baseline is done.
- Use one builder, direct local-main commit, no per-task reviewer or evidence
  commit.
- Keep manual one-task sessions as the default. The optional batch runner starts
  a fresh sibling builder for each ready task and never duplicates validation.
- API tasks use focused integration tests; full-stack tasks use integration
  tests plus browser iteration; frontend tasks use browser iteration.

**Exit:** R1 is a valuable ready packet and no operating Markdown reintroduces
the old orchestrator/reviewer loop.

## Stage 1 — creator account and private access

**Outcome:** Marcos can operate the private beta from his authenticated account
without acquiring cross-athlete data authority.

- Add `creator` and `member` roles to application identity. Creator is an
  operational capability set, never a tenant superuser.
- Show exactly one server-derived `LOCAL`, `PREVIEW`, `PRODUCTION`, or `E2E`
  indicator only in creator-authenticated application chrome. It is a label,
  not an environment switch.
- Let creator enter an email, issue a one-time invite, and copy a ready-to-send
  message containing the link. Tokens remain recoverable only at issuance.
- Improve sign-in/sign-up continuation, invalid/used/expired invite errors, and
  the path into first-login onboarding.

**Exit:** member/guest isolation is proven, the creator can operate invites in
the browser at 1440/390, and no email is sent automatically.

## Stage 2 — correct and observable Strava ingestion

**Outcome:** connecting Strava produces usable history instead of an Inbox flood
or blank product.

- Persist one server-generated connection cutoff. Activities at or before it
  import as confirmed; only activities starting after it enter Review.
- Make initial pagination retryable and idempotent. A partial import must not
  move the cutoff or skip older pages.
- Persist real import progress: connection/authorization, pages fetched,
  activities classified, summary aggregation, gear materialization, completion,
  partial failure, and retry state.
- Expose actual counters by activity family and imported/confirmed/pending
  result. Do not invent percentages when the provider has not supplied a total.
- Materialize Strava shoes/bikes locally only after source, odometer baseline,
  rename/retirement, reconnect, and disconnect deletion semantics are locked.
- Fill Training Log, Totals, and Consistency immediately from confirmed summary
  fields. Treat stream/detail-dependent cards as a separate bounded enrichment
  stage with honest readiness copy.
- Preserve both Performance URL controls so changing Weeks/Months does not reset
  the curve window and vice versa.

**Exit:** a provider fixture proves historical log value, zero historical Review
items, one later pending activity, real progress/retry, imported gear, populated
summary performance, and owner isolation.

## Stage 3 — two separate activation moments

### First-login platform onboarding

Shown once to every account on its first authenticated journey. It provides a
short overview of Training Hub, the evidence-first product model, primary
surfaces, privacy boundary, and the Strava connection option. The user may skip
it. Completion and skip are persisted and neither state is inferred from Strava
connection.

If the athlete chooses Connect now, the welcome flow hands off to the normal
Strava connection path. If they skip connection, a resumable setup entry remains
available without replaying the welcome onboarding.

### Post-connection activation

Triggered once for each newly established connection after authorization. It is
separate from first-login onboarding and can happen immediately or much later.
The user may close/skip the interface, but that only dismisses presentation;
server import continues or resumes safely.

The UI uses purposeful motion and reduced-motion equivalents around real backend
stages and counters. Example truthful messages include importing activities,
grouping sports, calculating summaries, and preparing evidence. It must never
use a decorative fake progress percentage.

When enough summary data is ready, show an Activation Summary:

- activity counts by sport/family and date range;
- year-to-date distance, time, elevation, consistency, and recent frequency
  where calculable from imported summaries;
- imported gear count and mapping state;
- clear partial-data and enrichment-not-ready boundaries;
- calculated athlete metrics labeled as estimates;
- confirmable hypotheses and missing profile questions; and
- links into the populated Training Log, Performance, Gear, and Review.

Completion is persisted separately from dismissal. The summary does not replay
after completion, but the underlying facts remain available in normal product
surfaces.

**Exit:** both flows are independently skippable, resumable where meaningful,
keyboard/focus safe, responsive at 1440/390, reduced-motion safe, and covered by
the full-stack connection story.

## Stage 4 — athlete performance profile

**Outcome:** calculations use athlete-specific inputs without pretending that
unknown or inferred values are facts.

Candidate fields include resting heart rate, maximum heart rate, lactate
threshold heart rate, threshold pace, cycling FTP, measured VO2max, calculated
VDOT/VO2 estimates, units, observed/effective dates, and notes needed by a
specific formula.

Every value is nullable and carries provenance such as `athlete_entered`,
`provider`, `calculated`, or `analyst_hypothesis`, plus calculation version and
source evidence when derived. There are no founder-specific defaults.

The activation flow may ask the athlete to confirm or edit high-impact values,
but the form is skippable and remains editable later. Calculations degrade
honestly when inputs are missing.

**Exit:** deterministic calculations declare required inputs, units, formula
version, output limitations, and which athlete-provided or derived values they
used.

## Stage 5 — Training Analyst

**Outcome:** an evidence-bound analyst surfaces patterns and questions without
prescribing training.

The deterministic product layer prepares a bounded evidence packet containing
owner-scoped activity summaries, derived metrics, dates/windows, known profile
values, missing-data flags, and citations to the curated theory library. The
model interprets that packet; it does not receive unrestricted database access
or invent calculations that should be deterministic.

Allowed output is structured: observation, supporting athlete evidence,
applicable theory references, limitations/confidence, a confirmable hypothesis,
and an optional question. The athlete can confirm, edit, reject, or defer. No
model output silently changes profile values or analysis state.

Not allowed: workout plans, training prescriptions, medical/readiness claims,
certainty without evidence, generic motivational chat, or hidden autonomous
actions. The product still returns deterministic value when AI is unavailable.

Marcos will provide the curated theory library later. Before implementation,
R20 must lock provider/model boundary, consent and privacy, retention/redaction,
prompt/version audit, cost/rate limits, evaluation fixtures, and failure UI.

**Exit:** fixed owner-scoped fixtures prove grounded structured hypotheses,
evidence links, safe uncertainty, feedback persistence, and a deterministic
fallback without sending real athlete data to an unapproved provider.

## Stage 6 — structural convergence and cleanup

After the product slices establish real ownership boundaries:

- group server actions and data modules by feature;
- deepen Strava, onboarding, gear, performance, and insight interfaces around
  stable call patterns;
- split large pages/components by reason to change, not line count;
- remove dead files, stale scripts, compatibility exports, and historical
  operating documents only after import/entrypoint evidence; and
- retain framework routes as thin parsing, identity, composition, and response
  boundaries.

**Exit:** a new feature has one discoverable owning module, focused integration
boundary, and browser path without navigating global technical layers.

## Deferred until the core loop works

Billing, public launch, broad hosted Strava integration, multi-provider data,
and public self-serve registration remain later decisions. They must not lead
the architecture while first value, activation, and evidence quality are still
being proven.
