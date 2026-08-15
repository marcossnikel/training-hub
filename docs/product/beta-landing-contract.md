# Private-beta landing and access contract

**Owner:** #39 product specification
**Consumer:** #40 landing implementation
**Status:** implementation-ready; public promotion and public registration wait
for #60 invite enforcement

## 1. Decision and release boundary

The first Training Hub beta is **manual and invitation-only** (D-014). The
landing page can explain the product and the invitation boundary, but it does
not collect a visitor's details, create an account, send a message, open a
waitlist, start checkout, or claim broad availability. Existing developer/test
registration is not public-beta access.

Until #60 is delivered and independently reviewed, #40 must not link a public
visitor to `/sign-up`, collect access requests, or promote public acquisition.
It may present an invitation-only landing route whose only primary action
explains that boundary. A private invitation may later supply a registration
URL; that is #60's server-enforced responsibility, not a landing-page feature.

`Training Hub` remains the internal working name (D-011). The exact public
copy below uses `{Product name}`. A local/preview design review may substitute
`Training Hub`; a public domain, metadata, or release must wait for D-011.

## 2. User moment, route model, and outcome

A self-coached runner or cyclist arrives without an account. They should leave
with a clear answer to three questions: what the product helps them examine,
why the evidence is trustworthy, and why access is currently invitation-only.
The intended feeling is calm confidence, not urgency or a sales funnel.

The public route is guest `/`. The existing authenticated recent-training log
continues to render at `/`, including the D-017 first-sync location
`/?strava=connected`. The implementation resolves authentication on the
server **before** any product-domain data read: guests receive only landing
content and a private/no-store response; authenticated users retain the app
route. Do not duplicate a dashboard, redirect an authenticated athlete through
marketing, or expose a cached/data-bearing app shell to guests.

The only primary guest CTA is an in-page link to the invitation explanation.
The utility `Log in` link remains available for existing accounts. There is no
guest sign-up CTA until #60 is complete.

## 3. Information hierarchy and exact copy

Use a single readable primary column on narrow screens and a restrained
two-region layout at wide screens: the main reading column leads; a quiet
evidence note may sit beside it only when it repeats a boundary, not
promotional material. Do not use a card mosaic, gradient, hero illustration,
fake product screenshot, chart, testimonial, customer logo, metric, or AI-chat
chrome.

| Order | Element | Exact copy / content rule |
| --- | --- | --- |
| Utility navigation | Brand label and one secondary link | `{Product name}`; `Log in`. The brand is plain text/link, not a new logo decision. |
| H1 | Primary promise | `Understand the patterns in your own training history.` |
| Support | What it does | `{Product name} links its weekly training brief and comparable prior-activity observations to the activities, dates, metrics, and comparison window behind them.` |
| Primary CTA | Safe in-page action | `How beta access works` linking to `#beta-access`. It never starts account creation, a request, payment, or a message. |
| Evidence section | Evidence standard | Heading: `Evidence before advice`. Body: `The point is a specific observation you can inspect, not a score, prescription, or generic summary.` Supporting line: `When the history is incomplete or the comparison is weak, the limitation belongs beside the observation.` |
| Audience section | Fit and non-fit | Heading: `Built for self-coached runners and cyclists`. Body: `Use your own activity history to review what changed, what is comparable, and where the evidence is incomplete.` Non-fit line: `It is not coaching, a training-plan generator, medical or readiness guidance, or a social feed.` |
| Connection section | BYO boundary | Heading: `A transparent beta connection`. Body: `During this beta, you connect a Strava app that you create and control. {Product name} never falls back to the founder's Strava credentials.` Policy line: `Using your own app is a beta connection path. It does not settle Strava's commercial or API-policy requirements.` |
| Data-control note | Accurate lifecycle summary | `Your account has its own connection. Disconnecting removes the local connection material and Strava-imported and derived data for that connection.` Do not promise background revocation detection, an account-deletion surface, or a retention period beyond D-013. |
| Planned price | Deliberately limited future claim | Heading: `A small paid beta, when it is ready`. Body: `One monthly beta plan is planned at around US$5. There is no checkout or payment collection on this page.` |
| Beta-access section | Actual entry boundary | `Private beta` heading. Body: `{Product name} is currently invitation-only. An invitation includes the private registration link for that beta account.` Supporting line: `This page does not collect access requests or create accounts.` |
| Footer | No invented destinations | `{Product name} is a working product name.` Include only implemented, approved destinations. Do not fabricate privacy, contact, pricing, social, app-store, or legal links. |

The page may use the illustrative statement “A comparison can point back to
the activity dates, distance, moving time, and comparison window used.” It
must label it **Illustrative**, use no real activity history, and must not
imply every athlete will receive a useful result.

## 4. FAQ

Render these as semantic headings and content (not a hidden hover-only
accordion). A disclosure pattern is optional on narrow screens only if every
question remains a labelled button with `aria-expanded`, Enter/Space support,
visible focus, and static reduced-motion behavior.

### What is `{Product name}`?

`A personal training-intelligence product for examining patterns in your own activity history. Observations link back to their evidence.`

### Who is this beta for?

`Self-coached runners and cyclists who already record activities in Strava and are comfortable connecting an app they create themselves.`

### How does the Strava connection work?

`Each invited athlete uses credentials for their own Strava developer app. {Product name} does not use a shared or founder app by default. This beta path does not resolve Strava commercial or API-policy requirements.`

### Does it replace a coach or provide medical guidance?

`No. It does not prescribe training, assess readiness, diagnose health, or provide medical guidance.`

### Can I create an account from this page?

`No. This is a private, invitation-only beta. A valid invitation provides its own private registration link.`

### What will it cost?

`A single monthly beta plan around US$5 is planned when the product loop and billing are ready. This page does not take payment or promise an availability date.`

## 5. Components, states, interaction, and accessibility

Use existing page-shell, link/button, disclosure, status, and focus primitives
from the design foundation. The landing page is reading-first: it has one H1,
`header`, `main`, and `footer` landmarks; an in-page skip link; meaningful H2
sections; a visible `#beta-access` destination; WCAG AA contrast; no color-only
meaning; and no auto-playing/decorative motion.

| State | Required observable behavior |
| --- | --- |
| Guest default, 1440 px | Utility navigation, promise, evidence, audience, connection, planned-price boundary, invitation section, then footer appear in that reading order. Main column stays readable; any secondary rail contains only the connection/beta boundary. |
| Guest default, 390 px | One column preserves the same order. CTA and `Log in` remain readable/tappable; no horizontal page scroll, clipped wording, hover-only detail, or decorative replacement for copy. |
| Authenticated root | Existing authenticated recent-training route renders; it is not a landing-page success state and no guest marketing/data mix is permitted. `/?strava=connected` remains the D-017 post-sync location. |
| Hover, focus, and press | `How beta access works`, `Log in`, and any FAQ disclosure use nonessential 100–150 ms tone/opacity feedback, retain contrast, and show the shared focus ring. Activation acknowledges immediately; any visual transition is at most 150 ms. Enter activates links; Enter/Space activates disclosures. |
| In-page CTA result | The fragment navigates to `#beta-access`; the explanation becomes visible without a request, analytics event, account creation, or live-region success message. Keyboard focus remains on the link unless an intentional same-document focus move is implemented and proven. |
| Route loading | The route-level placeholder appears within 200 ms, keeps the headline/section hierarchy, contains no invented product metrics or testimonials, and is static with reduced motion. |
| Invite-boundary / empty | This is the normal public access state: the exact `Private beta` copy remains visible. There is no disabled pseudo-sign-up control. |
| Error and retry | The landing CTA has no request and therefore no CTA error/success/retry state. If a route/render failure is implemented, show a plain-language retry/back control, preserve safe context, announce the failure/result, and never leak configuration, auth, or data details. |
| Disabled | No primary CTA is disabled. Any future unavailable interactive control states its reason in visible text and accessible description; do not use a dead `Get started` control. |
| FAQ disclosure | If used, press acknowledges immediately, toggles the associated content within 200 ms, preserves logical focus, supports keyboard/touch, and updates `aria-expanded`. Under reduced motion the content changes immediately/static. |
| Reduced motion | Every feedback transition becomes immediate/static under `prefers-reduced-motion: reduce`; no understanding depends on movement. |

## 6. Reference translation

| Reference | Principle to adapt | Boundary |
| --- | --- | --- |
| Linear | Quiet hierarchy and predictable keyboard behavior | Do not copy dark theme, command UI, wording, iconography, or layouts. |
| Resend | Concise, technically credible explanation | Do not copy palette, marketing composition, illustrations, or brand voice. |
| Brex | Direct communication of consequential constraints | Do not copy financial-product patterns, claims, or identity. |
| Firecrawl | Demonstrate purpose only when it clarifies the product | Do not use AI spectacle, mascot framing, animated decoration, assets, copy, or code. |
| Beautiful UI | Intentional section rhythm and states | Do not copy snippets, components, page composition, tokens, or assets. |

## 7. #40 acceptance and visual-proof checklist

#40 is implementation-ready because #60 has a concrete enforcement packet. A
public promotion or public-registration release is blocked until #60 is
delivered and independently reviewed. The #40 PR must prove all of the
following, in addition to `npm run verify` and an independent review:

- [ ] Server-side guest/authenticated root separation happens before product
      data reads; guest documents/RSC responses are private/no-store and do
      not expose training data.
- [ ] Exact copy, hierarchy, CTA, FAQ, planned-price qualifier, BYO/no-founder
      statement, policy caveat, and exclusions match this contract.
- [ ] No public visitor can navigate from the landing page to account creation,
      waitlist submission, external message send, payment, analytics capture,
      or a founder/shared Strava connection.
- [ ] Route/component coverage verifies guest landing, authenticated root,
      CTA fragment, no public sign-up CTA, rendered FAQ semantics, and
      cookie-free privacy boundary.
- [ ] Keyboard-only checks cover skip link, logical Tab order, visible focus,
      CTA, `Log in`, FAQ disclosure (if present), and no focus trap. Check
      names/landmarks, contrast, 200% zoom, touch targets, and reduced motion.
- [ ] Visual proof records exact commit, browser, and disposable test state;
      captures `40-landing-default-1440.png`,
      `40-landing-default-390.png`,
      `40-landing-invite-boundary-1440.png`,
      `40-landing-loading-390.png`, and any implemented route error/retry or
      FAQ-focus state. A short recording is required only if a consequential
      transition exceeds the static screenshots; record the reduced-motion
      equivalent either way.
- [ ] No production deployment, domain decision, customer data, email,
      waitlist, analytics, billing, external publication, or live payment is
      included. Rollback restores the prior guest route only after confirming
      it cannot re-expose protected data; it never redirects to `/sign-up`.

## 8. Dependencies and follow-up

- D-002/D-003: BYO credentials are an athlete-controlled beta path, never a
  founder fallback or policy/commercial approval claim.
- D-007: US$5/month is planned only; no purchase action exists here.
- D-011: public name/domain remains unresolved.
- D-013/D-017: connection scope/lifecycle copy must stay synchronized with
  implementation.
- #60: server-enforced manual invitation access is the release gate before
  public promotion or any public registration CTA.
