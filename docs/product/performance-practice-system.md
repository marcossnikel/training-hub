# Performance Practice System

**Status:** provisional product-definition research, not an implementation
contract
**Product:** a new English-language mobile product derived from Training Hub
**Updated:** 2026-08-27
**Boundary:** this document does not supersede `PRODUCT.md`, `DECISIONS.md`, or
the current Training Hub roadmap. It does not authorize code, Figma, public
content, outreach, or a launch.

## Executive recommendation

Build a modular **Performance Practice System**, not a Race Fueling app and not
a universal performance analyzer.

The product helps an endurance athlete take a performance practice that already
fits their training, repeat it with intent, record what was planned and what
happened, and finish with a bounded personal Finding. Fueling, heat practice,
supplement routines, equipment, and future performance topics can use the same
learning loop, but each topic needs its own fields, evidence boundary, safety
contract, and publication rules.

The product promise is:

> Practice deliberately. Record what happened. Learn what may be worth trying
> next, without turning one athlete's experience into proof or advice.

The public layer should also be first-class. It should let athletes follow
people and topics, discover relevant coaches, sports dietitians and researchers,
and discuss structured performance objects. It should not copy the generic
activity-post, follower-status, and engagement-ranking model already occupied
by Strava, Share Aura, and emerging athlete social networks.

The critical product distinction is not the existence of experiments. Generic
self-experiment products already provide bounded trials, findings, publishing,
and replication. The narrower opportunity is this combination:

- endurance-specific Practice Packs;
- planned-versus-actual execution;
- context-aware comparison without causal claims;
- coach or practitioner authority that the app does not silently override;
- source-labelled conversation;
- structured Findings that preserve uncertainty; and
- social discovery that does not convert popularity into evidence.

## What the product is and is not

The product is a system for **practice and reflection**. It may compare an
athlete's own observations under similar-enough contexts. It may not say that a
practice caused a physiological adaptation or performance change.

It is:

- useful privately before another user exists;
- modular across performance topics;
- compatible with an existing coach and training plan;
- explicit about evidence, uncertainty, confounders, and commercial claims;
- social around structured performance objects; and
- designed to produce a next decision, not an endless dashboard.

It is not:

- an AI coach or training-plan generator;
- a medical, diagnostic, readiness, or return-to-sport product;
- a universal performance score;
- a causal-inference engine for uncontrolled training sessions;
- a supplement prescriber;
- a heat-safety monitor or acclimation certifier;
- a generic photo, workout, or motivational feed; or
- a place where a verified or popular account becomes evidence by status.

## Stable product loop

The reusable loop stays constant across domains:

```text
Choose one bounded question
-> identify one intended decision variable
-> record what should remain stable
-> plan a Try inside an existing training plan
-> capture planned versus actual execution
-> record context, observations, deviations, and confounders
-> repeat when the Practice Pack says comparison is meaningful
-> compare similar-enough Tries without erasing differences
-> choose Keep / Repeat / Change one thing / Stop / Not enough evidence
-> write a bounded Finding
-> keep private or publish a minimized, source-labelled version
-> discuss it or start a linked private Experiment
```

"One variable" means one **intended decision variable**, not a scientifically
isolated variable. A product change may also change carbohydrate, caffeine,
sodium, texture, timing, expectation, and effort. The app must expose these as
possible confounders rather than describe the Try as controlled.

The app should use `similar enough for this limited comparison`, not
`equivalent`, `matched`, or `controlled`, unless a future validated method
supports the stronger term.

## Core domain model

### Practice family

A broad area such as `Fueling`, `Heat`, `Performance supplementation`,
`Equipment`, or `Recovery`. A family is useful for discovery and moderation,
but it does not supply a protocol by itself.

### Practice Pack

A reviewed, versioned domain contract. It defines:

- the questions the product can support;
- required and optional context;
- observable outcomes;
- what the app may calculate;
- which authority owns the protocol;
- stop and escalation boundaries;
- allowed public language;
- sharing and moderation rules;
- research sources and last-review date; and
- what remains explicitly unsupported.

A topic can be discussed in the community before it has a Practice Pack. It
cannot become a guided or one-tap executable protocol until its pack is
reviewed.

### Practice Guide

The app-owned, source-backed explanation of a Practice Pack. A Guide explains
scope, evidence, limitations, questions worth discussing, and safety
boundaries. It does not become a personalized prescription.

### Protocol

The versioned plan the athlete intends to follow. Its authority is always
visible:

- `Athlete selected`;
- `Coach instruction`;
- `Sports dietitian instruction`;
- `Other qualified practitioner instruction`; or
- `Reviewed app template` where the Practice Pack permits one.

The app does not silently convert a public post, commercial label, or another
athlete's setup into the user's Protocol.

### Tested Item

A named product, supplement, food, piece of equipment, or other item used
inside a Practice. A Tested Item may have an item/topic page containing its
manufacturer claims, independent sources, disclosures, Open Questions, and
eligible public Findings. It is not a Practice family and does not inherit an
evidence claim from its brand or popularity.

### Experiment

A private bounded question, intended decision variable, stability assumptions,
planned horizon, and selected observations under one Practice Pack.

### Try

One planned opportunity to execute the Protocol. A Try is not a test result by
itself.

### Field Note

The private structured record of one Try. It contains planned versus actual
execution, context, deviations, observations, and optional short free text.

### Finding

The athlete's bounded synthesis across completed Field Notes. A Finding may be
`Keep`, `Repeat`, `Change one thing`, `Stop`, `Mixed`, or
`Not enough evidence`. It is always personal and revisable.

### Experiment Update

A minimized social object derived from an active Experiment. It may share the
question, progress, protocol authority, and selected non-sensitive context. It
does not expose a raw Field Note or imply an interim result.

### Linked Experiment

A new private Experiment inspired by another person's Finding or Protocol Note.
It preserves attribution and Practice Pack version. It requires the recipient
to rebuild targets, eligibility, authority, and safety context. It is not called
`replication`, because ordinary athlete contexts are not scientifically
equivalent.

## Epistemic model

Every substantive claim or observation has one visible label. Role badges,
followers, credentials, and moderation status never change this label.

| Label | Meaning | May support |
| --- | --- | --- |
| `Consensus or position statement` | Guidance from a named scientific or governing body | A reviewed Practice Guide within its stated population and limits |
| `Research evidence` | A cited peer-reviewed study or review | A bounded research note, never automatic personalization |
| `Preprint or emerging research` | Not yet peer reviewed or too early for a stable conclusion | An open question, never a product promise |
| `Coach or practitioner instruction` | A protocol from the athlete's chosen qualified person | The athlete's private plan, subject to app safety and publication rules |
| `Coach practice` | A practitioner's reported method, not necessarily research consensus | Structured discussion with scope and limitations |
| `Commercial claim` | A manufacturer or seller's claim | Product context only; it cannot be restated as established evidence |
| `Athlete observation` | What happened during one Try | A Field Note or Experiment Update |
| `App comparison` | A deterministic comparison of entered data | Descriptive differences with inputs and limitations |
| `Athlete interpretation` | What the athlete thinks the observations mean | A personal Finding |
| `Open question` | Something not yet supported or resolved | Discussion and future research |

The app should avoid the public terms `proof`, `validated for me`, `adaptation
detected`, `caused`, `worked`, `failed`, and `scientific result` unless the text
is quoting and critically labelling an external source.

## Authority model

The athlete's current training plan remains authoritative. The product attaches
a Practice to an existing session; it does not add intensity, volume, or a new
workout by itself.

A coach, sports dietitian, or other qualified practitioner's explicit
instruction overrides generic app guidance about that Practice setup. It does
not override:

- a stop or escalation rule;
- a prohibited content rule;
- data-integrity requirements;
- public-object publication eligibility; or
- the athlete's control over their own data.

An unsupported outside Protocol may be recorded privately as
`External instruction`. The app must not present it as app-reviewed or copy it
to another athlete.

## Practice Pack strategy

The platform can be broad without pretending every topic has equal evidence or
risk. Use three support levels.

| Support level | Product behavior | Public behavior |
| --- | --- | --- |
| `Guided Practice` | The reviewed pack may help structure a Protocol without writing the athlete's training plan | Finding and linked Experiment allowed after domain-specific checks |
| `External-Protocol Companion` | The athlete records a protocol received elsewhere; the app tracks execution and observations but does not prescribe exposure or dose | Higher-risk review; linked Experiment copies no target, dose, or eligibility |
| `Structured observation` | The athlete may define a bounded question and record a self-selected or externally owned exposure, context, and outcome; the app does not generate the exposure or interpret causality | Finding may be published only as a personal observation; a linked Experiment copies no exposure or target |

### Race Fueling: Guided Practice

Race Fueling remains the strongest first pack, but it is not the product's
identity. World Athletics' nutrition consensus describes event-specific
nutrition strategies and says strategies should be practiced and fine-tuned in
training; it also notes that the gut may be trainable, while nutritional needs
and risks vary by event and athlete ([World Athletics consensus](https://worldathletics.org/download/download?filename=23fb9de0-6699-4d5b-b075-42f5da5518f5.pdf&urlslug=Nutrition+for+Athletics+-+2019+IAAF+Consensus+Statement)).

The pack can support:

- an athlete-, coach-, or dietitian-owned intake target;
- product, amount, timing, carrying, and adherence;
- planned versus actual intake;
- duration, intensity context, conditions, and deviations;
- gut comfort, energy steadiness, practicality, and perceived effort; and
- a bounded decision about the next rehearsal.

It must not prescribe hydration or sodium, diagnose gastrointestinal symptoms,
optimize body weight, or recommend a commercial product.

### Heat Practice: External-Protocol Companion

Heat belongs in the product, but it cannot reuse the fueling contract. Heat
practice adds a material health risk and a different time horizon. Consensus
guidance describes repeated exposure, preparation for expected environmental
conditions, hydration and cooling, and emphasizes athlete health and event
safety ([2015 heat consensus](https://doi.org/10.1136/bjsports-2015-094915),
[2023 IOC heat consensus](https://pmc.ncbi.nlm.nih.gov/articles/PMC9811094/)).
A NATA position statement also recommends gradual progression and symptom
monitoring and treats exertional heat illness as a safety event, not adaptation
data ([NATA position statement](https://pmc.ncbi.nlm.nih.gov/articles/PMC4639891/)).

The pack can record:

- the external protocol owner and version;
- exposure method and environment;
- existing-session workload;
- planned versus actual exposure;
- perceived heat strain and effort;
- interruptions, recovery, and user-reported warning signs; and
- missing sensor or environmental context.

It must not:

- prescribe temperature, duration, dehydration, clothing, or core-temperature
  targets;
- infer body temperature from weather or heart rate;
- certify safe participation;
- diagnose heat illness;
- declare acclimation; or
- claim a performance adaptation.

Any warning sign, current illness, or unsafe external instruction stops the
Practice flow and directs the athlete outside the app. The app records the Try
as stopped; it does not provide return-to-practice clearance.

Heat-product competitors already track sensor-derived temperature, zones, and
acclimation trends. CORE, for example, markets live core/skin-temperature
metrics and heat-training zones ([CORE](https://corebodytemp.com/)); Garmin
displays heat and altitude acclimation estimates
([Garmin](https://www8.garmin.com/manuals/webhelp/GUID-D9E9CF32-5A89-4140-8B6A-0A61633E397F/EN-US/GUID-70386BCC-5682-4C5C-9A87-C32AF9B6473B.html)).
This product should compete on protocol provenance, reflection, and uncertainty,
not sensor certainty.

### Sodium bicarbonate: External-Protocol Companion

The ISSN position stand reports the clearest evidence for specific
high-intensity efforts, while also documenting protocol variability and common
gastrointestinal adverse effects that can erase a potential benefit
([ISSN position stand](https://jissn.biomedcentral.com/articles/10.1186/s12970-021-00458-w)).
The Australian Institute of Sport classifies sodium bicarbonate as a Group A
performance supplement for specific situations and recommends an individualized,
event-specific protocol under accredited sports-dietitian guidance
([AIS framework](https://www.ais.gov.au/nutrition/supplements/group_a)).

It should not be a low-friction public template. The complete-v1 pack requires:

- practitioner or coach authority;
- product and formulation identity;
- timing and amount recorded as received, not app-generated;
- gastrointestinal and other adverse-event capture;
- no copied dose in linked Experiments; and
- an explicit supplement and anti-doping boundary.

### NØMIO and similar emerging products: Structured observation

NØMIO is a `Tested Item` inside `Performance supplementation`, not a separate
Practice family or scientific methodology. Its official site describes a
broccoli-sprout-based sports formula and links its claims to isothiocyanate
research
([NØMIO product and science pages](https://drinknomio.com/en-no/pages/science)).

The evidence is early and indirect:

- a randomized crossover study involved nine healthy participants and a
  glucosinolate-rich broccoli-sprout preparation, not a broad athlete
  population; its authors disclose a related patent and commercial interests
  ([peer-reviewed study](https://pubmed.ncbi.nlm.nih.gov/37688976/));
- an acute study is a 2025 preprint with 15 participants and does not establish
  a performance benefit from the observed lactate changes
  ([preprint](https://www.biorxiv.org/content/10.1101/2025.04.15.648889v1.full));
  and
- another small broccoli-supplement study using a different preparation found
  no exercise-performance, lactate, oxidative-stress, or functional-recovery
  effect, so evidence from one preparation should not be generalized to another
  ([2026 study](https://pubmed.ncbi.nlm.nih.gov/41897523/)).

The Cologne List shows a tested NØMIO batch, but explicitly says listing reduces
contamination risk and does not guarantee freedom from prohibited substances or
recommend use ([Cologne List](https://www.koelnerliste.com/en/product/nomio)).

V1 may let the athlete create a structured-observation Experiment around a
self-selected Tested Item, record the product and batch, planned-versus-actual
use, training context, selected observable outcomes, adverse effects,
confounders, and a bounded personal Finding. It should not generate a NØMIO
Protocol or dose, state that it improves performance, turn a personal
association into impact or causality, or imply that one athlete's experience
validates the product. A linked Experiment starts blank for product, amount,
timing, and eligibility.

### Future candidate packs

Potential packs include caffeine routines, altitude preparation, cooling,
equipment changes, pre-race routines, sleep practices, creatine, and other
performance supplements. Each starts as a topic and Open Question. It becomes a
pack only after a source review, safety contract, field schema, publication
policy, and named owner are complete.

No `Custom public Protocol` escape hatch should bypass this process. A private
custom Experiment may use the generic loop, but unsupported topics remain
private and the app makes no domain-specific comparison.

## Complete v1 recommendation

V1 is a coherent, complete product released only after all accepted surfaces
below are finished. The build order later in this document is internal proof
sequencing, not a reduced public MVP.

### Account, onboarding, and profile

- English UI throughout.
- Passwordless email-code login and signup.
- Account lifecycle, export, scoped deletion, and account deletion.
- Progressive onboarding with four honest chapters:
  `Baseline -> Focus -> First Try -> Ready`.
- Current sports, training context, existing coach or practitioner authority,
  and areas of interest.
- Current practices, including fueling and heat exposure, with `I do not track
  this` and `I am not sure` options.
- Optional current supplementation baseline with caffeine, creatine,
  electrolytes, vitamins or minerals, bicarbonate, NØMIO or other, none, and
  prefer not to answer. It never asks for medical interpretation and never
  blocks Ready.
- Explicit creation of the first Experiment. Onboarding saves a draft and never
  silently activates a Protocol.
- Private/public profile controls.
- Public role and credential state where applicable.

Onboarding progress should assemble the actual first Experiment Card as the
athlete confirms information. It must not show a fake percentage,
`personalization complete`, an adaptation animation, or a universal performance
score. Motion fills only confirmed fields and leaves future Tries visibly open.

### Private practice system

- Versioned Practice Guides and Pack contracts.
- Experiments, Try planning, Field Notes, comparisons, and Findings.
- Race Fueling as a complete Guided Practice pack.
- Heat Practice as a complete External-Protocol Companion pack, only when the
  athlete already has an eligible external protocol.
- Performance Supplementation as a complete family with a sodium-bicarbonate
  External-Protocol Companion and structured observation for Tested Items such
  as NØMIO. Neither path generates a dose or copies another athlete's setup.
- Private generic Experiments for unsupported topics, with generic descriptive
  fields and no public or causal output.
- Practice-specific planned-versus-actual fields.
- Context and confounder capture.
- Honest mixed, stopped, incomparable, and insufficient Findings.
- Manual entry first. No metric is silently inferred from a wearable or
  weather source.
- Functional reminders, offline drafts, retry, accessibility, and reduced
  motion.

The home state should prioritize the next useful action, not a score or dense
dashboard. Recommended bottom navigation:

```text
Practice | Feed | Library | Profile
```

### First-class structured social system

The social graph is real, but the social object is constrained. Users may:

- follow people and Practice topics;
- see a chronological `Following` view;
- discover Practice Guides, Findings, Open Questions, researchers, coaches,
  sports dietitians, and other relevant practitioners;
- publish an approved Finding or minimized Experiment Update;
- publish a Research Note, Practitioner Protocol Note, or Open Question when
  their role and the domain policy allow it;
- save an object privately;
- discuss it through structured replies;
- report it; and
- start a linked private Experiment where an approved Practice Pack permits it.

Allowed public post types are:

| Post type | Required structure | Important boundary |
| --- | --- | --- |
| `Finding` | Pack version, completed Tries, context, observations, interpretation, limitations, revision | Personal and bounded; never advice |
| `Experiment Update` | Question, progress, authority, selected context | No interim conclusion or raw Field Note |
| `Research Note` | DOI or primary source, population, result, limits, conflicts | Author identity does not upgrade the paper |
| `Practitioner Protocol Note` | Role, scope, population, authority, sources, contraindication boundary | Not one-tap executable unless the Pack separately approves it |
| `Open Question` | Domain, precise question, what is known, what remains unknown | No disguised recommendation |

Discussion replies begin with one intent:

- `Ask about context`;
- `Add a source`;
- `Share a related observation`;
- `Practitioner perspective`;
- `Challenge the interpretation`; or
- `Report a safety issue`.

Free text remains available after the intent is chosen. A reply cannot silently
change the parent object's evidence label or revision.

The Feed has two explicit views:

- `Following`: approved posts from people the athlete deliberately follows,
  reverse chronological, with Pack and post-type filters; and
- `Packs`: official Guide and protocol updates plus approved posts and Open
  Questions from deliberately followed Practice Packs.

There is no opaque `For You` feed. Official Pack updates may be pinned inside
their Pack, but no content is ranked by followers, reactions, or commercial
relationships.

Every reply begins with an intent and is anchored to one revisioned public
object. Threads support at most two visible reply levels. Interactions are
`Reply`, `Follow discussion`, `Save`, and `Report`. A visible reply count may
help navigation; there are no generic status posts, workout-photo posts,
repost chains, public like counts, public save counts, upvotes, trending lists,
DMs, or engagement-based ranking in v1.

`Library` contains Practice Guides and Pack versions, followed topics, saved
objects, followed discussions, and the athlete's own published revisions.
Public profiles contain a Follow control, relevant Packs, literal role or
credential states, and approved contributions. Private Experiments and raw
Field Notes never appear there.

### Direct Finding handoff still matters

Every approved public Finding has a canonical revisioned URL. An athlete can
share it directly outside the app. A recipient may Save, Discuss, Report, or
Start a linked Experiment. Static share images are pointers to the canonical
page and carry no uncorrectable substantive conclusion.

## Following and popularity decision

Following is valuable for continuity and discovery. Public follower counts are
not.

Research on health and misinformation interfaces shows that social endorsement
cues can affect perceived credibility and consensus, although effects vary by
study and context
([health-message experiment](https://pubmed.ncbi.nlm.nih.gov/29601271/),
[misinformation experiments](https://pmc.ncbi.nlm.nih.gov/articles/PMC10879158/),
[health-credibility review](https://pmc.ncbi.nlm.nih.gov/articles/PMC7413282/)).
The product should not add a popularity heuristic next to performance and
health-adjacent claims.

| Choice | Benefits | Costs |
| --- | --- | --- |
| Public counts | Familiar, communicates network size, rewards creators, can help discovery | Creates status competition, makes a cold start look empty, invites gaming, and can make popularity look like evidence |
| Hidden counts | Keeps attention on sources and context, gives new contributors a fairer start, reduces growth gaming | Weaker creator reward, less visible social proof, and requires better topic/role discovery |

**Recommended v1 decision:** users can follow people and topics, but exact
follower and following counts and lists are hidden from public profiles and
never enter ranking. The account owner can see and manage their own counts,
following list, followers, removals, mutes, blocks, and follow requests in a
private Connections screen. The Follow control necessarily shows the current
user whether they follow that profile; this relationship is not displayed to
third parties. The product evaluates the decision through comprehension and
contribution quality, not growth alone.

Discovery uses topic relevance, Pack compatibility, evidence completeness,
recency, language, and explicit `Why you are seeing this` explanations. The
Following view is chronological. There is no `most successful`, `most followed`,
or `most discussed` ranking.

## Roles and credential verification

Every person is an athlete first. Optional public roles are:

- `Coach`;
- `Sports dietitian`;
- `Researcher`;
- `Other practitioner`; and
- `Commercial representative`.

A role has a literal status:

- `Self-described`;
- `Identity checked`;
- `Credential checked with <issuer> on <date>`;
- `Affiliation checked with <organization> on <date>`; or
- `Expired or could not be rechecked`.

Verification says what was checked. It never says `trusted expert`,
`authoritative`, or `science verified`. No playful or hierarchical labels such
as `Science God`, `Fuel Guru`, `Heat Master`, levels, points, or expertise scores
are allowed.

ORCID may help connect a researcher to works and affiliations, but ORCID
explicitly states that it is not an identity-verification system
([ORCID](https://support.orcid.org/hc/en-us/articles/360006972413-Does-an-ORCID-iD-assure-my-identity)).
A researcher badge therefore requires an authenticated ORCID connection plus an
independent identity or affiliation check. DOI metadata and post-publication
updates can be checked through Crossref; Crossref also exposes Retraction Watch
data
([Crossref REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/),
[retraction data](https://www.crossref.org/documentation/retrieve-metadata/retraction-watch/)).

Coach, dietitian, and practitioner verification needs an issuer-specific
workflow, expiry date, and human review. A credential from one jurisdiction is
not generalized globally. Commercial affiliation and product relationships are
mandatory disclosures on every relevant post.

A verified practitioner can still publish an athlete anecdote. An unverified
athlete can still cite strong research. The post label, source, scope, and
limitations remain independent of account status.

## Community cold start

The product must remain honest and useful with no public contributors. Explore
starts with reviewed Practice Guides, Practice topics, and the athlete's own
saved objects. Following can begin with topics before any relevant person is
available. Empty states explain that public Findings and verified people will
appear only when real contributions pass the relevant review.

Do not create fake users, synthetic Findings, inflated counts, or seeded
discussion attributed to people who did not write it. A first-party Guide can
teach the product; it must be labelled as app-owned editorial content.

## Safety, privacy, and moderation

### Data boundary

- Experiments and raw Field Notes are private by default.
- Public objects are separate minimized revisions, not privacy flags on raw
  records.
- Exact route, location, private dates, raw sensor streams, source screenshots,
  and unpublished notes are excluded from public objects.
- Supplement baseline is private unless the athlete deliberately includes a
  specific item in an approved public Finding.
- Authors can unpublish. Corrections create a new revision and preserve an audit
  event.

### Moderation model

Human review is mandatory for:

- Practice Guides and Pack versions;
- Practitioner Protocol Notes;
- public Findings in heat or performance-supplement domains;
- identity, credential, and affiliation status; and
- appealed safety decisions.

Complete v1 therefore also needs the operations surface behind the social
product: public-object and higher-risk reply queues, credential review,
commercial-conflict review, report triage, temporary hide, thread lock,
user mute or suspension, Pack-level publication pause, Pack-level discussion
pause, correction history, appeals, moderator assignment, and an audit log.
At least one primary and one backup moderator are required before public
community launch; credentials do not bypass the queues.

Automated checks may assist with missing fields, prohibited phrases, commercial
disclosures, source metadata, and duplicates. They may not approve
health-adjacent content alone.

The moderator sees the proposed public revision and deterministic eligibility
attestations. Raw private Field Notes remain unavailable unless the athlete
explicitly submits a specific excerpt for review. A moderator may request a
correction, label, reject, temporarily hide, or unpublish. They may not silently
rewrite an athlete's observation or interpretation.

### Prohibited content

- diagnosis, treatment, medical clearance, or return-to-sport advice;
- illness, pain, injury, disordered-eating, or body-composition protocols;
- medication, hormone, or doping protocols;
- dangerous heat targets or instructions to train through warning signs;
- app-generated supplement dose, deficiency, or treatment guidance;
- guaranteed performance or adaptation claims;
- universal statements derived from personal Findings;
- undisclosed affiliate, sponsored, or product-ranking content; and
- copied practitioner targets or another athlete's dose.

The IOC supplement consensus notes that only a limited set of supplements has
good evidence in specific scenarios, individual responses vary, expert
assistance is advisable, and supplement use can harm health, performance, or an
athlete's anti-doping status
([IOC supplement consensus](https://pubmed.ncbi.nlm.nih.gov/29540367/)).
This is why the app's supplementation baseline cannot become an automatic
recommendation engine.

## Premium mobile design direction

Use **Split Ledger with the Hold Line** as the primary system. It is specific to
planned-versus-actual practice and can span fueling, heat, and future packs
without looking clinical.

### Visual system

- Cool Paper `#F4F7F8` background.
- Ink `#172033` for primary text.
- Protocol Blue `#1E4DB7` for planned state and navigation.
- Deviation Vermilion `#B93815` for differences or safety attention, never for
  failure.
- Divider `#E5EBF2` for the ledger structure.
- Domain accents appear sparingly: Fueling Amber, Heat Magenta,
  Supplement Violet, and Recovery Teal. Color never encodes evidence strength
  or authority by itself.
- Instrument Sans for interface and headlines.
- IBM Plex Mono with tabular figures for time, intake, exposure, and compact
  data.

Each Try has a horizontal Hold Line. The plan sits on the line, actual execution
registers as marks, and deviations offset without disappearing. Comparison
aligns the lines while keeping unlike context visibly separated.

### Motion

- Onboarding assembles the real Experiment Card from confirmed inputs.
- The progress path moves through named chapters, not a fake percentage.
- Comparison animates Tries into alignment and leaves non-comparable Tries
  offset.
- A Finding brackets observations but never collapses them into a false single
  score.
- Social transitions preserve provenance: a Finding opens from its card into
  its full revision, and a linked Experiment visibly branches rather than
  copies.
- Reduced motion performs the same state changes instantly.

Avoid glassmorphism, neon gradients, test tubes, molecules, ECG motifs, generic
AI sparkles, Strava orange, celebratory success glows, and card-heavy biometric
dashboards. Premium should come from typography, hierarchy, tactile motion, and
one coherent visual grammar.

## Competitor map

| Category | Current product evidence | What is already occupied | Product response |
| --- | --- | --- | --- |
| Fuel planning and execution | [Fuelstate](https://fuelstate.app/) connects athlete, run, conditions, products, targets, packing, live prompts, and post-run review | Personalized plan, live execution, product handling, post-run observations | Compete on repeated Practice, provenance, cross-Try context, and bounded Findings |
| Personalized nutrition | [Saturday](https://saturday.fit/) produces individualized fuel, hydration, and electrolyte plans | Prescription and environmental personalization | Do not lead with calculated nutrition targets |
| Heat sensor and adaptation tracking | [CORE](https://corebodytemp.com/) markets live thermal metrics, heat zones, and adaptation tracking | Sensor-derived heat certainty and live monitoring | Track an externally owned Practice and uncertainty; do not mimic a sensor |
| Generic self-experiments | [HypoMe](https://hypome.com/) provides bounded experiments, inconclusive verdicts, a Findings ledger, and publish/fork behavior | The generic experiment-to-finding loop | Add domain contracts, athlete-session context, practitioner authority, and stricter public language |
| Randomized personal experiments | [ABMe](https://getabme.com/index.html) provides treatment/control units, wearable outcomes, result sharing, and one-tap replication | N-of-1 rigor, automation, shareable results, replication | Do not claim ordinary Practice is randomized or causal; use linked Experiments |
| Broad health correlations | [Bearable](https://bearable.app/support/tips/health-experiments-a-guide-to-learning-how-your-habits-impact-your-health/) supports habit experiments, outcomes, and correlation reports | Flexible tracking and correlation | Stay performance-practice-specific and narrower than health management |
| Activity social network | [Strava](https://support.strava.com/en-us/collections/19668897-feed-kudos-and-comments) centers feeds, kudos, and comments | Activity identity and broad athlete graph | Follow people, but center source-labelled performance objects |
| Social workout artwork | [Share Aura](https://play.google.com/store/apps/details?id=com.auramovement.aura) creates templates for sharing workouts to social media | Polished workout-stat stories | Share correctable Finding pointers, not prettier workout recaps |

The defensible claim is a product-quality thesis, not an empty market claim.
None of the individual features is unique.

## Internal build and proof gates

These gates order the work. They do not authorize a reduced public release. The
complete v1 ships together.

1. **Domain and safety contract**
   - Lock the object model, epistemic labels, authority rules, and Pack schema.
   - Review Race Fueling and Heat sources and publication language.
   - Define the unsupported/custom-topic boundary.

2. **Private cross-domain loop**
   - Complete a Race Fueling Experiment through Finding.
   - Log a coach-owned Heat Practice only if it already belongs in Marcos's
     training; do not add one for product testing.
   - Exercise one Performance Supplementation path only from an already chosen
     or externally owned setup; do not adopt a supplement to test the product.
   - Prove that the shared engine supports different schemas without turning
     them into one score.

3. **Premium mobile product**
   - Complete login/signup, onboarding, Practice, Feed, Library, Profile,
     history, offline/retry, accessibility, and reduced-motion states.
   - Keep setup around three minutes and a Field Note under 90 seconds.

4. **Identity, persistence, privacy**
   - Prove owner isolation, consent, export, scoped deletion, account deletion,
     public-revision separation, and unpublish behavior.

5. **Structured social graph**
   - Follow people/topics, chronological Following, topic Explore, structured
     post types, source metadata, direct handoff, and linked Experiments.
   - Prove follower counts do not leak into ranking or public UI.

6. **Roles and trust operations**
   - Build issuer-specific verification, expiry, disclosures, moderation,
     reports, corrections, appeals, and audit history.
   - Prove a role badge never upgrades a content evidence label.

7. **Release hardening**
   - Exercise empty community, no verified people, revoked credential,
     retracted paper, corrected Finding, unsupported domain, stopped heat Try,
     supplement adverse-event, and account-deletion paths.
   - Release only when all accepted v1 surfaces are coherent together.

## Personal-use and community validation criteria

Continue the product when:

- Marcos voluntarily completes one real Experiment and begins a second;
- a Field Note is faster and more useful than reconstructing Notes later;
- a Finding changes a Keep, Repeat, Change, or Stop decision;
- Race Fueling and Heat feel like two packs in one product, not two unrelated
  trackers;
- a reader can distinguish research, practitioner practice, commercial claim,
  athlete observation, and interpretation without explanation;
- a linked Experiment never copies another athlete's target or dose;
- following someone improves discovery without affecting perceived evidence;
- moderation can correct or unpublish a claim without exposing raw Field Notes;
  and
- the product remains useful with zero public posts.

Radically simplify or stop when:

- the generic loop cannot represent real practice without misleading causal
  language;
- setup regularly exceeds five minutes or Field Notes exceed two minutes;
- Findings do not change a decision;
- unsupported custom topics become the dominant behavior;
- users treat role verification or follower relationships as evidence despite
  the interface;
- social contribution becomes generic workout posting;
- moderation requires substantive rewriting of most posts; or
- Marcos prefers Notes plus existing fueling and heat products after two real
  Experiments.

The private system and social layer have separate kill decisions. A useful
private product does not justify an unsafe or unused community.

## Open decisions

1. **V1 pack boundary.** Recommended: complete Race Fueling, an
   external-protocol-only Heat pack, and Performance Supplementation with
   external-protocol bicarbonate plus structured observation for emerging
   Tested Items such as NØMIO. Confirm the exact other Tested Items available at
   launch; adding an item does not create a new scientific domain.
2. **Private custom Experiments.** Decide whether unsupported topics can use a
   generic private loop in v1 or remain Observation-only notes.
3. **Public Experiment Updates.** Decide whether active Experiments can publish
   progress, or whether only completed Findings should be public initially.
4. **Follow privacy.** Recommended: exact counts hidden and lists private by
   default. Decide whether users may make their following list public.
5. **Credential jurisdictions.** Select the first coach and sports-dietitian
   credential issuers that the founder can realistically verify and recheck.
6. **Researcher verification.** Define the independent identity or affiliation
   check paired with ORCID.
7. **Moderation capacity.** Decide who reviews Practice Packs, higher-risk
   Findings, Protocol Notes, credentials, and appeals before any public launch.
8. **Discussion breadth.** Decide which unsupported topics may host Open
   Questions without offering an executable Practice.
9. **Data import.** Manual entry is the recommended first contract. Any
   activity, weather, HealthKit, Garmin, CORE, or Strava integration needs a
   separate authority, privacy, licensing, and failure-mode decision.
10. **Product relationship.** Decide whether this is a separate mobile app,
    a new Training Hub product line, or a replacement thesis. This document
    intentionally does not alter the current Training Hub product decisions.
11. **Name.** The product needs a cross-domain name. `FuelFlow` is a competitor,
    not a candidate. Trademark, domain, handle, and App Store clearance have
    not been performed for any working name.
12. **Technology and Figma.** Mobile stack selection and high-fidelity design
    should use this artifact as input in separate tasks. Neither decision is
    made here.

## Final product thesis

> A premium mobile practice system where endurance athletes run structured,
> domain-aware performance Experiments inside their existing training, compare
> planned and actual Tries, produce bounded personal Findings, and learn through
> source-labelled conversation with athletes, coaches, dietitians, and
> researchers. The system makes uncertainty and authority visible and never
> turns popularity, commercial claims, or one athlete's experience into proof.
