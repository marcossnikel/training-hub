# Beta billing entitlement contract

**Status:** accepted implementation contract for [#41](https://github.com/marcossnikel/training-hub/issues/41).
**Applies to:** the test-mode work in [#42](https://github.com/marcossnikel/training-hub/issues/42) and [#43](https://github.com/marcossnikel/training-hub/issues/43).
**Decision basis:** D-007, D-008, D-014, and D-018.

This contract turns the one-plan beta billing direction into an implementation
boundary. It does not add Stripe code, a migration, a Checkout page, a Portal
link, a deployed environment, or a Stripe account/object.

## Product boundary

The beta will have exactly one recurring monthly subscription, targeted around
US$5. There is no trial, annual option, tier, usage price, coupon, tax
automation, invoice UI, refund flow, or manual billing administration in the
product. Invitation eligibility and billing entitlement are different checks:
a valid private invite permits registration; it never grants paid access.

The product is training intelligence, not coaching or medical guidance. Billing
copy describes access and account control only. It never suggests that payment
changes training, health, readiness, or an athlete's results.

## Authority and ownership

| Concern | Authority | Explicitly not authoritative |
| --- | --- | --- |
| Local owner | Validated Better Auth server session and the local `user` record | Browser user ID, URL parameter, Stripe customer ID supplied by the client |
| Permission to create a Checkout session or Portal session | Server-derived local owner plus the current entitlement record | A client-side price, customer, return URL, or status flag |
| Payment/subscription fact | Signature-verified Stripe webhook followed by a canonical Stripe-object reconciliation where needed | Checkout success/cancel redirect, client polling, locally guessed timestamps |
| Paid capability | Owner-scoped local entitlement projected from verified/reconciled Stripe facts | “Payment succeeded” UI, a stale cached page, or an unverified event payload |
| Private data controls | Owner-scoped application authorization, regardless of entitlement | A billing state or an external provider response |

The application stores Stripe identifiers only as opaque server-side references.
It never stores a card number, CVC, bank details, payment method payload, raw
Checkout/Portal URL, or a webhook signing secret. Stripe's hosted surfaces
handle payment-entry data.

## Owner-scoped data model

The implementation may choose table names, but the following ownership and
uniqueness rules are required. No migration is part of this issue.

| Record | Required fields | Rules |
| --- | --- | --- |
| `billing_customer` | `owner_id`, Stripe customer ID, creation/update times | One local owner maps to at most one Stripe customer; a Stripe customer maps to exactly one owner. Both IDs are unique. The owner is resolved server-side before any lookup. |
| `billing_subscription` | `owner_id`, local customer reference, Stripe subscription ID, Stripe price ID/reference, canonical provider status, `cancel_at_period_end`, current-period end, last verified time, last reconciled provider timestamp | At most one current beta subscription per owner. The Stripe subscription ID is unique. Do not trust a client-provided ID or use the price amount as entitlement. |
| `billing_entitlement` | `owner_id`, access state, effective-at time, reason code, source subscription/event reference, last verified/reconciled time | One current entitlement per owner. It is a projection for authorization, not an independent payment system. Unknown/invalid records restrict paid capability. |
| `billing_event_ledger` | Stripe event ID, type, provider-created time, receipt time, verified-signature result, processing result, redacted payload digest/reference, subscription/customer references when safely present | Stripe event ID is unique. Retain enough redacted audit metadata to explain a transition without storing payment or athlete-training data. Duplicate delivery never repeats a side effect. |
| `billing_reconciliation_run` | opaque run ID, bounded scope, start/end, result, counts, redacted failure class | No secret, full payload, billing URL, or user training data in a run record or log. |

Every row that can affect an athlete is owner-scoped. The server must reject a
customer, subscription, or event whose verified provider object cannot be
matched safely to that owner; it must not create a cross-owner mapping to make a
webhook “work.”

## Entitlement state machine

`restricted` is an access mode, not a deletion state. It never deletes or
shares an athlete's data. It permits authenticated account settings, connection
disconnect, account/data deletion, and read-only access to that athlete's own
existing training records. It does **not** permit a new sync, insight/brief or
comparison generation, or any other paid product mutation. A future export
feature is outside this contract and must have its own owner-authorization
design.

| Local access state | Enter only from verified/reconciled facts | Paid capability | Required user-facing boundary |
| --- | --- | --- | --- |
| `none` | No known eligible subscription | Restricted | “You do not have an active beta subscription.” Offer Checkout only when the server can create one safely. |
| `checkout_pending` | Server created a test-mode Checkout session; no verified entitlement yet | Restricted | “We’re confirming your subscription. Access updates after billing is verified.” A return from Checkout does not change the state by itself. |
| `active` | Canonical subscription is `active` for the accepted plan and its authority is current under the implementation freshness policy | Full | “Your beta subscription is active.” |
| `cancellation_scheduled` | A previously verified canonical subscription was active, `cancel_at_period_end` is true, and its verified paid-through time is later than trusted server `now` | Full through the verified paid-through time | “Your subscription will end on {verified date}. You can keep using beta features until then.” Do not show a date when it is unavailable. |
| `past_due` | Canonical subscription is `past_due` | Restricted | “We could not verify your latest payment. Your training data has not changed.” Offer the Portal only when server creation succeeds. |
| `unpaid` | Canonical subscription is `unpaid` | Restricted | “Payment is unresolved. Your training data has not changed.” |
| `canceled_or_expired` | Canonical subscription is `canceled` or `incomplete_expired`, or a previously verified `cancellation_scheduled` subscription has reached its verified paid-through time | Restricted | “Beta access ended. Your training data has not changed.” |
| `unknown` | Provider object/status/plan mapping is missing, invalid, unsupported, stale beyond the implementation freshness policy, or a provider verification attempt fails. This includes an auto-renewing `active` subscription that is stale or unavailable at or after its prior verified paid-through time. | Restricted, fail closed | “Billing verification is unavailable. Your training data has not changed.” Do not speculate about payment success or failure. |

The webhook transport conditions below are processing states that resolve to one
of the access states above. They are visible in support/audit tooling; the
customer sees the associated safe boundary rather than internal event details.

| Transport condition | Required behavior |
| --- | --- |
| Webhook delayed after Checkout | Remain `checkout_pending` (or `unknown` if canonical verification fails); never grant from the return URL. |
| Duplicate event | Record/recognize the same Stripe event ID and perform no second transition, Customer creation, or notification. |
| Out-of-order event | Record each verified event. Reconcile against the canonical current subscription before changing entitlement; never let an older delivery overwrite newer canonical state. |
| Provider outage or invalid response | For a previously verified `cancellation_scheduled` subscription at or after its verified paid-through time, recompute `canceled_or_expired`. Otherwise mark/recompute `unknown`, restrict paid capability, retain data controls, and queue bounded reconciliation. |

There is intentionally no `trialing` access state: the beta has no trial. Any
unexpected plan, amount, currency, status, or subscription/customer mapping is
`unknown` until canonical reconciliation makes it safe.

Stripe `incomplete` is never active. Map it to `checkout_pending` only while a
verified, server-created current Checkout attempt for that same owner is still
within the implementation's bounded pending window; otherwise map it to
`unknown`. `incomplete_expired` is `canceled_or_expired`. The state mapper uses
trusted server time, never browser time. A previously verified
`cancellation_scheduled` subscription whose verified paid-through time is at
or before `now` transitions directly to `canceled_or_expired`, even if an
older provider payload still says active or Stripe is unavailable. In contrast,
an auto-renewing `active` subscription whose authority is stale or unavailable
at or after its prior verified paid-through time maps to `unknown` and remains
restricted until a webhook or reconciliation verifies renewal. The mapper must
not infer `canceled_or_expired` from elapsed paid-through time for that active
auto-renewing record.

## Verified webhook and reconciliation protocol

1. Receive the raw request body over the server webhook route. Verify its Stripe
   signature before parsing it as an authoritative event or doing any lookup.
   A missing/invalid signature is rejected, logged only as a redacted security
   outcome, and cannot create rows or alter entitlement.
2. In a transaction, persist the event identity and a redacted processing
   result. If the event ID already exists with a completed result, acknowledge
   without repeating side effects. If a prior attempt is incomplete, resume
   safely from its ledger state rather than assuming a fresh payment.
3. For relevant events, retrieve or expand the canonical subscription/customer
   through server-held test-mode credentials. Match only the existing
   owner-scoped mapping (or the server-created Checkout metadata/reference that
   was bound to that owner). Do not use client input to choose an owner.
4. Validate that the subscription belongs to the one configured beta price and
   test-mode environment. Project the canonical status into the entitlement
   table atomically with the ledger result. Treat incomplete/mismatched data as
   `unknown`, not active.
5. Acknowledge a verified event only after its duplicate-safe ledger outcome is
   durable. Transient failures return a retryable server failure so Stripe can
   retry; permanent mismatch/security failures are retained as redacted
   reviewable failures and do not become entitlement.

At minimum, the future webhook implementation must reason about
`checkout.session.completed`, `customer.subscription.created`,
`customer.subscription.updated`, `customer.subscription.deleted`,
`invoice.paid`, and `invoice.payment_failed`. The subscription object remains
the entitlement source; invoice and Checkout events trigger a canonical lookup
or reconciliation rather than independently granting access.

### Reconciliation and recovery

The future operator job is a bounded, test-mode-only reconciliation. It finds
owner-scoped subscriptions whose verification is delayed/failed or whose last
verified time exceeds the chosen freshness policy; it fetches the canonical
provider object, projects it with the same state mapper, and records a redacted
run result. It must be idempotent, rate-bounded, retry with bounded exponential
backoff, and surface failures to operator tooling after its retry budget.

There is no silent “best guess” restore. An auto-renewing active athlete moves
to `unknown` when current verification is stale or unavailable at or after the
prior verified paid-through time, with data controls retained; only
reconciliation or a webhook can verify renewal. A previously verified
`cancellation_scheduled` athlete instead remains entitled through that known
end and becomes `canceled_or_expired` when trusted server time reaches it. A
webhook event is not dead-lettered away: after bounded automatic retries it
remains in a redacted failed/pending queue for authenticated operator
reconciliation.

Support records may include the local owner ID, opaque Stripe object/event IDs,
timestamps, state/reason code, and redacted error class. They must not include
card/payment data, webhook signatures/secrets, raw event payloads, checkout or
portal URLs, Strava credentials/tokens, or activity/health/training content.

## Checkout and Portal behavior

Checkout and Portal sessions are created server-side only after resolving the
local owner. Their return/cancel URLs are fixed, canonical, allow-listed
application routes; the browser cannot submit an arbitrary redirect. A Checkout
session is associated with the owner through server-held metadata/reference and
the local customer mapping. The server reuses a safe current customer mapping
instead of accepting a browser-provided customer ID.

Only one unfinished Checkout attempt should be usable per owner at a time. A
repeat click must return/reuse the still-valid server-created attempt or report
an explicit safe error, not create an unbounded set of subscriptions. A Portal
session is available only to the matched owner with a server-known customer.
If Portal creation fails or no mapping exists, display a non-sensitive retry
state and retain data controls; do not expose a different athlete’s customer
or report whether one exists.

Cancellation scheduled in Portal does not reduce access before its verified
paid-through time. Cancellation, payment failures, and Portal redirect state
are all reconciled through verified provider data before changing entitlement.

## UX, accessibility, and visual contract

The billing boundary is calm, factual, and compact: one status heading, one
sentence explaining the consequence, and one primary next step when one is
safe. It is not a sales dashboard, coaching message, or payment-data form.
Use the existing foundation tokens and feedback patterns; adapt Linear’s
compact state hierarchy and Resend’s clear transactional status language, but
do not copy their layouts, wording, branding, gradients, or product claims.

| State | Primary action | Disabled/loading and success feedback |
| --- | --- | --- |
| `none` | “Continue to checkout” | On activation, disable only that control, expose “Opening secure checkout…” in a polite live region, and keep focus stable. Re-enable with an inline error if session creation fails. |
| `checkout_pending` | “Refresh billing status” when a safe server refresh exists | Never label a return “paid.” Show a static pending status; if polling is later added, announce only a real state change. |
| `active` / `cancellation_scheduled` | “Manage subscription” | Disable the trigger while creating Portal, then announce “Opening subscription management…”; on return, await verified state rather than celebratory payment copy. |
| restricted failure/unknown | “Retry billing status” or “Manage subscription” only when safe | Preserve disconnect/delete/data controls as separate secondary links. Do not trap keyboard focus in a blocking dialog. |

- The status heading is semantic and programmatically associated with its
  explanatory copy. Use `role="status"`/a polite live region only for dynamic
  result changes, not a repeating announcement during page load.
- Every control has a visible focus indicator and an accessible name that
  states its destination/action. Keyboard order is status, primary billing
  action, then data controls; Enter/Space invokes button actions once.
- The status must not rely only on color or Stripe branding. Error/restricted
  states meet the foundation contrast rules and include text. Maintain
  touch-target sizing and readable wrapping at a 390px viewport.
- Pending/disabled feedback may fade color/opacity over 100–150ms; it must not
  move surrounding layout. With reduced motion, render the final pending/error
  state immediately with no animated spinner or transition.
- Desktop proof is required at 1440px and narrow proof at 390px for no
  entitlement, Checkout pending, active, cancellation scheduled, payment
  failure, unknown/provider outage, and Portal creation failure. The proof
  must use disposable test data and redact all Stripe IDs/URLs and personal
  information. A keyboard recording or equivalent trace must cover focus,
  disabled state, and retry.

## Implementation, validation, and rollout gates

### #42 — Checkout and entitlement packet

Implement only test-mode Checkout, the signed webhook route, owner-scoped
customer/subscription/entitlement/ledger storage, authorization seam, and the
state mapper above. Read the installed Next.js documentation before touching
Next.js code. The precise configured test price is an environment/server
configuration value; never accept it from the browser and never infer it from
the approximate US$5 product copy.

Required tests include: no session/foreign owner can create or read another
owner’s billing mapping; invalid signature; duplicate event; delayed Checkout
return; out-of-order subscription events; subscription-status mapping;
unexpected plan/status fail-closed; webhook retry; provider outage/unknown;
paid capability restriction with account/disconnect/delete and own read-only
records retained; Checkout session repeat-click behavior; and an
already-ended cancellation-scheduled record transitioning to
`canceled_or_expired` from trusted server time. The state-mapper tests must
also prove that a canonical auto-renewing `active` record with stale or
unavailable verification at or after its prior verified paid-through time maps
to restricted `unknown`, not `canceled_or_expired` or `active`, until a webhook
or reconciliation verifies renewal; canonical `canceled` and
`incomplete_expired` remain `canceled_or_expired`. Use isolated local/E2E data
and test fixtures only. Run `npm run verify` plus focused tests.
Manual proof must show test-mode-only environment validation and desktop/narrow
screenshots of the state matrix, without a real payment method or any secret.

Do not create a Stripe account, product, price, customer, subscription, live
key, live event, production deployment, remote migration, or shared-data reset.
If Stripe test authentication, a configured test price, signature secret, or a
dedicated preview environment is not already provided, stop and document the
specific blocker rather than substituting production values or mocks for an
external proof.

### #43 — Customer Portal and lifecycle packet

Build on #42 only after its ownership, entitlement, webhook, and test-mode
contract have independent review evidence. Add an owner-bound server Portal
session creation path and lifecycle coverage, not manual billing administration
or a second source of entitlement. A Portal return, cancellation click, or
payment-method change remains advisory until the verified webhook/reconciliation
projection updates the state.

Required tests include: foreign/missing owner rejection; no customer mapping;
Portal provider failure; cancellation scheduled retains full access through the
verified period end and becomes `canceled_or_expired` when trusted server time
reaches that end; cancellation/expiry restrictions; failed payment;
duplicate/out-of-order lifecycle events; retry/reconciliation; and data-control
paths during every restricted state. Validate keyboard focus, accessible names,
focus restoration after external return, reduced-motion pending feedback, and
desktop/narrow visual proof for the lifecycle matrix. Use test mode and
disposable data only; redact IDs, URLs, and payment information.

Do not create live Stripe objects, configure live billing, deploy production,
change external accounts, or run a remote migration/reset. A live-mode launch,
including its price/customer migration, tax/legal review, support process, and
production readiness, is a separate founder-approved go/no-go issue.

## Rollback and support runbook

This documentation change is reversible by reverting the document and D-018;
that does not authorize changing the accepted implementation decision silently.
For future test-mode code, rollback must disable the billing entry points and
force paid capabilities into the restricted/fail-closed mode through a reviewed
deployment/configuration plan while keeping authenticated account, disconnect,
deletion, and owner data-control paths available. It must not restore paid
capability merely because Checkout or Portal entry points are disabled, and it
must not delete billing or athlete data to recover access.

When a beta athlete reports access trouble, support should: verify the local
owner identity through the normal authenticated support process; inspect the
redacted entitlement state and opaque event/subscription references; request a
bounded test-mode reconciliation when eligible; and explain the observed
boundary using the approved copy. Support must not ask for card data, secrets,
or Strava credentials, paste a Portal URL into a ticket, or change a local
entitlement manually to override unverified provider state.

Before live mode is considered, open a distinct readiness issue and obtain
explicit founder approval. It must cover live Stripe account access, approved
products/prices, tax/legal obligations, webhook endpoint and secret handling,
production database migration/rollback, monitoring/on-call, data retention,
support escalation, visual/accessibility proof, and a staged go/no-go plan.
