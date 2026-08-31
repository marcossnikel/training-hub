# Performance Practice System: complete-v1 technical architecture

**Status:** final consolidated research handoff; proposed architecture pending the
explicit Gate 0 product, legal, safety, and operating decisions below

**Date:** 2026-08-31

**Product:** a separate, English-language premium mobile product
**Scope:** complete v1 architecture, internal proof order, and operating model; not an implementation plan for reusing Training Hub

## Executive decision

The recommended stack builds complete v1 as an **iOS-first release from a
cross-platform Expo/React Native codebase**, with:

- Expo SDK 57 development builds on React Native's New Architecture, starting
  from `expo@57.0.18` / React Native 0.86.3 or a later patched 57.x pair proven
  at Gate 1, with every native dependency tested on release-shaped iOS and
  Android artifacts; EAS Build/Submit remains the release pipeline and
  production over-the-air code updates stay disabled in v1;
- an encrypted, local-first SQLite database on the device;
- product-managed authenticated envelope encryption for optional Field Note free
  text before canonical server storage, using a dedicated single-Region
  symmetric AWS KMS key in the separate AWS account; do not create an
  unreplicated multi-Region key as a future option, and override this default
  only before the first production envelope if Gate 0 accepts a numeric
  cross-Region service target and its complete recovery path; this is
  purpose-limited server-side protection, not end-to-end encryption;
- Supabase Pro with Small compute and seven-day PITR for PostgreSQL,
  authentication, private object storage, and small server functions; normal
  mobile data and authentication calls remain behind the stable product API so
  a project-scoped Supabase URL or API key is not embedded in the app binary;
- one exact Gate 0 production-region tuple across Supabase PostgreSQL, every
  database-touching Vercel runtime, and the Field Note AWS KMS key. If Brazil is
  the accepted first data jurisdiction, the current tuple is Supabase
  `sa-east-1`, Vercel `gru1`, and AWS KMS `sa-east-1`; do not substitute the
  Supabase `Americas` general region or Vercel's default `iad1`;
- a separate, versioned AWS S3 backup boundary for encrypted logical database
  snapshots and non-regenerable private objects, pinned with its backup KMS key
  to a separately accepted Gate 0 recovery-storage tuple;
- a product-owned, narrow command/outbox and cursor-based change-feed protocol between encrypted SQLite and PostgreSQL;
- a small TypeScript web application for canonical public pages and a separately protected operations surface;
- PostgreSQL full-text search for complete-v1 search and discovery;
- RevenueCat behind an entitlement interface for App Store subscriptions;
- the mandatory complete-v1 no-Sentry diagnostics path: retained release
  archives and symbols, TestFlight/App Store crash reports, Xcode Organizer
  crash and hang evidence, App Store Connect crash-rate evidence when the
  opt-in sample is sufficient, provider dashboards, product-owned operational
  counters, uptime checks, and a user-initiated allowlisted local diagnostic
  export. Complete v1 includes neither product-owned MetricKit ingestion nor a
  Sentry SDK, project, upload credential, source-map upload, or event stream;
  third-party mobile error processing is a post-v1 decision after its
  cross-native data-control contract and processing boundary become provable.

The first public release is iOS, but Android must compile and pass smoke,
domain-contract, release-artifact, and 16 KB memory-page tests throughout the
build. Compile success alone does not prove that every bundled native library
will load on a 16 KB device. “iOS-first” is a release and operational-risk
choice, not permission to put iOS assumptions into the domain model. Every
product surface in the product brief—login/signup, onboarding, Profile, Feed,
Library, Practice, complete Packs, public revisions, discussions,
verification, moderation, privacy controls, export, and deletion—is in v1.
The proof gates below change implementation order, not product scope.

The sync recommendation is intentionally narrower than a general database replicator. This product has structured, mostly single-owner aggregates, explicit revisions, and server-authoritative public/moderation transitions. A small command protocol and owner-scoped change feed keep private-row processing inside the selected application/backend boundary, make every conflict rule visible, and avoid a second always-on sync vendor. It costs more focused engineering at the beginning, so it has an early proof gate and a small interface. PowerSync remains a contingency adapter only if measured custom-sync correctness or delivery risk is unacceptable after that proof.

## Architecture decision summary

| Concern | Complete-v1 decision | Do not do |
|---|---|---|
| Mobile | Expo SDK 57 development build, with `expo@57.0.18` / React Native 0.86.3 as the current Gate 1 start and `expo@57.0.17` / React Native 0.86.3 as the regression-fixed floor; pin the exact latest patched 57.x graph only after proof; mandatory New Architecture; iOS-first public release with embedded code/assets only; continuous Android smoke plus native-module compatibility, release-AAB static, and 16 KB-device proof | Expo SDK 56 with its documented Hermes V1 memory regression; Expo Go as the production constraint; a Legacy Architecture SDK pin or fallback; production OTA code in v1; permanent iOS assumptions in shared domain code; treating dependency-directory status or compile success as runtime/native-binary compatibility |
| Local data | SQLCipher-encrypted SQLite; device is the immediate write/read authority; exclude the live ledger and device-only key from OS cloud/device-transfer backup, with server bootstrap or an explicit encrypted recovery export | Remote-first screens that fail when connectivity fails; secrets or raw records in AsyncStorage; an automatically restored database without its key |
| Sensitive free text | Encrypt each non-null Field Note free-text revision at the server application boundary with an authenticated AWS Encryption SDK envelope and a dedicated single-Region symmetric KMS wrapping key; PostgreSQL, owner change events, and logical backups retain ciphertext, while only owner-authorized API/data-rights paths may decrypt | Plaintext canonical free text; Supabase Vault, `pgsodium`/Transparent Column Encryption, or `pgcrypto` as the row-encryption boundary; an unreplicated multi-Region key kept merely as an option; a KMS key in the database; an E2EE or zero-knowledge claim; treating a multi-Region key alone as service recovery |
| Server data | PostgreSQL as canonical multi-device state and relational integrity boundary | Reuse Training Hub's database merely because it exists; document-only storage for revision/audit relations |
| Database access | Separate least-privilege runtime roles over Supavisor transaction mode from Vercel Fluid Compute; direct TLS connections only for controlled migrations, backup, restore, and an explicitly accepted long-lived worker | Unpooled direct connections from autoscaling Functions; prepared statements or session state through a transaction pooler; one broad database role shared by web, ops, and jobs |
| Data/runtime region | Gate 0 selects one exact jurisdiction-approved Supabase/Vercel/KMS tuple and verifies it at runtime; the current conditional Brazil tuple is `sa-east-1` / `gru1` / `sa-east-1` | A general Supabase region, Vercel's default `iad1`, a merely “nearby” runtime described as colocated, treating a later Supabase move as a toggle, or adding compute regions without replicated data |
| Database recovery | Seven-day production PITR plus a daily, pre-upload-encrypted Supabase logical recovery bundle with explicit role, application-schema, pinned-CLI data scope verified to include required Auth rows and Storage metadata, migration-history, and reviewed managed-schema-change members; separate versioned object-byte backup and service-configuration inventory; dedicated backup KMS/S3 boundary; stable product API; forced reauthentication; measured scenario-specific whole-service recovery | Treating default `supabase db dump` output as a complete backup; relying on S3 server-side encryption; leaving CLI schema/table exclusions, Auth/Storage data, object bytes, service configuration, bucket/key Region, or replication implicit; treating a device cache, owner change log, read-only replica, or provider custom domain as failover/session portability; claiming a provider-backed service RTO |
| Sync | Product-owned typed commands + durable SQLite outbox + owner-scoped PostgreSQL change feed/checkpoint | Whole-database replication, opaque vendor conflict semantics, or custom CRDTs for every object |
| Authentication | Supabase Auth email one-time code behind narrow product-API request/verify/refresh/logout endpoints; Resend is the provisional custom-SMTP adapter only after its auth-only domain/team, US processing and 30-day message-data retention, quotas, signed delivery webhooks, suppression operations, least-privilege credential rotation, and manual provider-cutover proof are accepted; a device-only SecureStore refresh token with memory-only access JWTs and serialized rotation; forced OTP reauthentication after a recovered-project generation change; this company-owned flow is the only v1 primary-account login, while any later authorized ORCID OAuth is post-login account linking only; privileged operations require verified TOTP factors and server-enforced current Supabase `aal2` with TOTP in `amr` | Supabase's default SMTP in production; treating SMTP acceptance or `email.delivered` as inbox receipt; sharing auth mail reputation, suppression state, or rate quota with marketing; a project-scoped Supabase API key or direct provider-auth configuration in the mobile binary; a persisted full session/JWT blob or parallel refreshes; ORCID or another third party as primary-account login without reopening App Review Guideline 4.8; ORCID as identity proof; phone MFA or a route/UI guard as the privileged boundary; client-supplied owner IDs; service-role keys in a client |
| Billing identity and restore | RevenueCat `Transfer to new App User ID`; one server-issued opaque UUIDv4 provider reference per live product account; custom-only SDK configuration after product authentication; explicit user-triggered Restore Purchases; entitlement-only transfer to a new account after deletion | Email, handle, Auth subject, or anonymous RevenueCat ID as the provider identity; SDK `logOut()`; automatic `syncPurchases()` in the ordinary flow; `Keep with original`, `Transfer if there are no active subscriptions`, or legacy sharing/aliasing |
| Public/private | Separate immutable public revisions built from a minimized projection; raw practice records remain private | A visibility flag on a raw Field Note; public views that join through to private payloads |
| Feed | Fan-out on read, reverse chronological, keyset pagination, no engagement or follower-count score | “For You”, trending, popularity boosts, follower counts, reposts, or hidden ranking |
| Search | PostgreSQL FTS + `pg_trgm`; explicit eligibility and deterministic tie-breaks | Search index containing private raw text; popularity as relevance |
| Safety | Human review for safety-adjacent publication and Pack changes; scoped Pack pauses | Automated safety approval or silent protocol rewrites |
| Sources | Registration-agency-aware DOI metadata adapters for Crossref and DataCite, with Crossref/Retraction Watch monitoring; no production ORCID OAuth/API until the product organization has an applicable membership/license, has completed the required ORCID integration review, and has issued Production Member API credentials, after which authenticated iD and assertion provenance remain inputs to separate human decisions | Treating one provider as universal, merging provider records, DOI as an evidence label, Public API OAuth as a commercial-production shortcut, self-asserted ORCID data or a verified email domain as identity/credential/role proof, or copying publisher text by default |
| Media | Minimal media footprint, private Supabase buckets, short-lived delivery, and a pre-upload envelope-encrypted, versioned S3 backup for non-regenerable objects under the dedicated backup KMS key | Treat S3 server-side encryption, database/PITR, or Storage metadata as private-file recovery; public raw credential files; unnecessary Field Note photos/video |
| Analytics and diagnostics | Use Apple's distribution diagnostics with retained archives/symbols, TestFlight/App Store crash reports, versioned Xcode Organizer crash/hang evidence, and opt-in-sample App Store Connect crash rate, plus provider dashboards, product-owned operational counters, uptime checks, and a user-initiated allowlisted local diagnostic export with no practice content; product events remain allowlisted and exclude practice contents, search text, and advertising IDs; complete v1 includes neither product-owned MetricKit ingestion nor Sentry | Calling absent or insufficient Apple sample data `crash-free`; adding a native diagnostics SDK or MetricKit uploader before a measured post-v1 evidence gap and a separately accepted data-control contract; enabling replay, tracing/profiling, attachments, autocapture, cross-app tracking, or health-adjacent behavioral profiling |
| App Store privacy supply chain | Freeze an allowlisted native SDK inventory at Gate 0; inspect the generated iOS bundle, merged privacy report, required-reason declarations, and applicable SDK signatures from Gate 1 and after every native dependency change; reconcile the final signed IPA at Gate 6 | Waiting for App Store Connect warning email or assuming app configuration covers every SDK/bundle without inspecting the built artifact |
| Operations | Product-owned audit ledger, moderation queues, and PostgreSQL-canonical deletion/export/job state; short fenced leased workers use Supabase Queue/Cron only as wake-up hints; `apps/ops` is protected with Vercel Authentication over All Deployments, conservatively budgeted on Pro plus Advanced Deployment Protection or Enterprise until Gate 0 proves the selected account's exact production-domain entitlement | Assuming platform audit logs are a product moderation audit history; making one serverless invocation, Vercel Workflow run, or queue message the product's durable job/receipt state; relying on Standard Protection, ambiguous plan-summary wording, or the Vercel perimeter as product authorization |

## Product invariants

These are architecture constraints, not copy conventions:

1. **Athlete ownership:** the athlete owns the private practice record. Raw Field Notes, Try details, exact protocol parameters, private Experiments, and private Finding drafts are private by default.
2. **External authority remains external:** a coach, practitioner, dietitian, or Pack author can be the named protocol authority without becoming the athlete's data owner. The app records authority; it does not silently assume it.
3. **Pack-specific contracts:** every practice is governed by the exact immutable Pack version selected for it, including schema, units, validation, support level, stop rules, calculations, publication policy, and sources.
4. **No causal adaptation engine:** software may validate, calculate declared deterministic fields, organize observations, and show bounded comparisons. It must not infer causality, diagnose, prescribe, or automatically adapt a protocol.
5. **No automatic protocol copying:** linking an Experiment Update creates context and a blank draft, never copied doses, targets, eligibility, schedules, or stop rules.
6. **No popularity authority:** follower counts are not public and never contribute to ranking, credential states, evidence labels, moderation priority, or search score.
7. **Independent labels:** literal credential/affiliation states, Pack support level, source/evidence label, moderation status, and social popularity are separate fields with separate provenance.
8. **Revisioned public truth:** public Findings and other public objects are immutable revisions at stable canonical URLs. Private edits never mutate a published revision. Immutability means retained content is never edited in place; withdrawal and account deletion change availability and may purge the substantive payload under the disclosed deletion policy, leaving a content-free structural tombstone rather than a rewritten revision.
9. **Human safety moderation:** safety-adjacent guides, Packs, practitioner protocol notes, high-risk Findings, credential decisions, corrections, and appeals reach a human.
10. **Offline Practice:** Field Notes, Tries, Experiments, and private Findings can be captured and read without a network. Retry is durable and visible.

### Product prohibitions carried into architecture

The implementation has no escape hatch that turns this product into a
single-domain Race Fueling app, universal performance analyzer, AI coach,
training-plan generator, medical/diagnostic/readiness/return-to-sport product,
universal performance score, causal-inference engine, supplement prescriber,
heat-safety monitor, acclimation certifier, generic AI chat, or generic
workout/photo/motivation feed. The athlete's existing training plan remains
authoritative: the product attaches a Practice to a planned session and never
adds intensity, volume, or a workout on its own.

Pack contracts, copy, calculations, public projections, search, and moderation
must also enforce these prohibitions:

- no diagnosis, treatment, medical clearance, illness/pain/injury,
  disordered-eating, body-composition, medication, hormone, doping, or
  train-through-warning-sign protocol;
- no app-generated hydration, sodium, supplement dose, deficiency, commercial
  product, heat exposure, dehydration, clothing, temperature, or
  core-temperature target, no inferred heat safety or adaptation, and no claim
  that a Tested Item is prohibited-substance-free, anti-doping safe, or
  recommended merely because it appears in a third-party testing list;
- no claim that an uncontrolled Try was randomized, controlled, equivalent,
  matched, causal, proof, a scientific result, or validation that something
  worked or failed for the athlete, and no universal statement or guaranteed
  performance/adaptation claim derived from a personal Finding;
- no silent wearable/weather inference, personalized prescription, Protocol
  activation or rewrite, Pack migration, copying of another person's target,
  dose, eligibility, schedule, or stop rule, or one-tap execution of an
  unapproved public Protocol Note;
- no public raw Field Note, exact route or location, private date, raw sensor
  stream, source screenshot, unpublished note, or private supplementation
  baseline;
- no fake user, synthetic Finding, inflated count, attributed seed discussion,
  popularity/credential-as-evidence cue, trust/expertise score or gamified role
  badge, undisclosed affiliate/sponsored relationship or product ranking, or
  engagement ranking; and
- no moderator rewrite of an athlete's observation or interpretation and no
  automated approval of safety-adjacent content, credentials, corrections, or
  appeals.

Onboarding likewise cannot use a fake completion percentage, `personalization
complete` or causal-personalization claim, universal score, or adaptation
animation. UI and motion cannot encode evidence strength or authority through
color, celebrate deviations as success/failure, or use glassmorphism, neon
gradients, test tubes, molecules, ECG motifs, generic AI sparkles, Strava
orange, success glows, or card-heavy biometric dashboards. Unsupported topics
stay in the descriptive private contract and cannot publish or inherit
Pack-specific comparison logic. Product testing never authorizes adding a heat
or supplement practice that is absent from the athlete's existing plan.

## System context

```text
Athlete / practitioner / reader
              |
       Expo mobile application
       | encrypted SQLite |
       | local reminders  |
              |
       product API + sync upload
              |
  +-----------+-------------------------------+
  | PostgreSQL / Auth / Storage               |
  | canonical rows, RLS, audit, jobs, search  |
  +-----------+-------------------------------+
       ^              |              |
 typed sync API   background jobs    protected Next.js operations
 command/change   source/push/       moderation/verification/
 feed             email/export       appeals/deletion
       |
 Next.js canonical public web -> public revision/search projection only

External adapters: Apple/RevenueCat, direct APNs (future FCM), SMTP,
Crossref/DataCite, optional authorized ORCID, AWS KMS encryption/signing, and
versioned AWS S3 backup
```

Trust boundaries:

- The phone is an intermittently connected, user-controlled device. Its local store is trusted for immediate ownership and UX, but server authorization never trusts its owner ID, timestamps, credential state, Pack status, or public status.
- The product backend derives the authenticated app user from the verified auth subject. Request IDs are lookup hints, not authorization.
- PostgreSQL, database operators, and logical backups see only the versioned
  envelope for Field Note free text. The `apps/web` deployment necessarily
  contains the owner-API decrypt adapter, but public-page and search modules have
  no application interface to it; the separately deployed operations surface,
  ordinary moderators, and mobile code have no KMS grant. This separates a
  database-only compromise from plaintext; it does not protect a compromised
  `apps/web` runtime and is not an E2EE guarantee.
- The Next.js API derives identity, validates typed commands, and invokes owner-scoped database transactions. A mobile client never gets a generic table-replication query or an arbitrary change-subscription expression.
- The public-page and search modules receive only public projections. They
  cannot call the private practice/query/decrypt modules, and no browser receives
  a service-role credential; this module boundary is enforced and tested inside
  the broader `apps/web` deployment that also hosts the owner-authorized API.
- The operations application uses server-side credentials, explicit product roles, mandatory TOTP MFA with server-enforced current Supabase `aal2`, and a separate deployment/environment. No moderator power is encoded only in editable profile metadata or a route/UI guard.

### Complete-v1 application surface contract

The mobile shell is English throughout and has four stable signed-in destinations:

```text
Practice | Feed | Library | Profile
```

- **Account:** separate `Sign up` and `Log in` entry points use passwordless email codes. The server decides whether an account may be created; the login path does not silently sign up an unknown address. Both flows have resend cooldown, expiry, generic anti-enumeration responses, accessible code entry, and a recoverable “open this code on another device” path.
- **Onboarding:** `Baseline -> Focus -> First Try -> Ready` is a resumable private draft. It captures sports/training context, existing coach or practitioner authority, areas of interest, current practices, and optional supplementation baseline with `I do not track this`, `I am not sure`, `None`, and `Prefer not to answer` where applicable. It assembles the real first Experiment without a fake score, causal personalization claim, or silent Protocol activation.
- **Practice:** the default home/next-action surface plus Experiment, Try, offline Field Note, comparison, Finding, conflict/rejection recovery, and local reminder flows. Offline status is visible without blocking capture.
- **Feed:** explicit `Following` and `Packs` views, both chronological. Each preserves its cursor and filters independently and has useful cold-start, stale-cache, offline, retry, blocked-content, and end-of-feed states.
- **Library:** versioned Practice Guides and Packs, followed topics/Packs, saved public objects, followed discussions, and the athlete's own public revisions. Private Experiments stay in Practice, not a public-facing library projection.
- **Profile:** private/public profile controls, account/security sessions, role/credential/affiliation states, notifications, subscription restore, export, scoped deletion, and account deletion. Another person's public Profile exposes only approved public-profile revisions.

Every surface has explicit loading, empty, stale/offline, retryable error, permanent rejection, and permission-denied behavior. Navigation, forms, sheets, and conflict/review flows must pass VoiceOver, Dynamic Type, keyboard/focus, reduced-motion, contrast, and 390-point-width checks. Cached public content always displays its last successful refresh when freshness matters; private local work never masquerades as server-accepted publication.

## Mobile platform decision

### Expo/React Native recommendation

React Native renders native platform components, and its own documentation recommends using a framework such as Expo for new applications. Expo development builds support native libraries and custom native code, while Expo Go is explicitly a limited playground rather than the production architecture. Native dependencies or configuration changes require a rebuilt native binary. Expo can also deliver JavaScript and assets remotely, but complete-v1 production builds deliberately disable that capability as defined below. ([React Native](https://reactnative.dev/), [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/), [custom native code](https://docs.expo.dev/workflow/customizing/), [Expo Updates configuration](https://docs.expo.dev/versions/latest/config/app/))

The handoff baseline is **Expo SDK 57**, not the older generic instruction to
select whichever stable Expo line happens to be visible at implementation
time. Expo SDK 56 uses React Native 0.85 and inherited a Hermes V1 memory
regression affecting apps that import `react-native-worklets` or
`react-native-reanimated`. Expo's current changelog distinguishes the fixes:
`expo@57.0.9` / React Native 0.86.2 resolved that production-relevant memory
regression, while `expo@57.0.17` / React Native 0.86.3 resolved a separate
development-startup regression. React Native describes 0.86 as having no
user-facing breaking changes from 0.85. The regression-fixed floor is therefore
`expo@57.0.17` / React Native 0.86.3. The current fresh-project Gate 1 start is
`expo@57.0.18` / React Native 0.86.3; Gate 1 resolves the
latest compatible 57.x patches at spike kickoff and pins the exact dependency
and native-toolchain lock only after the complete artifact/lifecycle proof. A
later Expo major is an explicit re-baseline through the same proof, not an
automatic `latest` upgrade. ([Expo SDK 56](https://expo.dev/changelog/sdk-56),
[Expo SDK 57](https://expo.dev/changelog/sdk-57), [Expo SDK 57 package
changelog](https://raw.githubusercontent.com/expo/expo/sdk-57/packages/expo/CHANGELOG.md),
[React Native
0.86](https://reactnative.dev/blog/2026/06/11/react-native-0.86))

As of the handoff date, npm's stable `expo` tag remains
`57.0.18`; Expo's current SDK 57 default-template artifact is itself version
`57.0.20` but still declares `expo@~57.0.18`, React Native 0.86.3, and React
19.2.3. The package changelog reports no user-facing Expo-package change from
57.0.17, and Expo documents 57.0.17 as the patch that moves SDK 57 to React
Native 0.86.3 and clears the remaining documented Hermes development-startup
regression. Treat 57.0.17 as the documented-regression **minimum** and 57.0.18
as the fresh-project start, not as an unproved final lock: Expo's supported
upgrade flow selects the stable SDK 57 range, resolves the compatible module
graph with `expo install --fix`, and then checks it with Expo Doctor. Gate 1
starts explicitly from `default@sdk-57`, records that template's independently
versioned artifact plus the full resolved dependency graph, and pins the graph
only after the native lifecycle, SQLCipher, privacy-manifest, and
release-artifact proof. Do not infer React Native 0.87 from its global registry
tag, confuse a template artifact version with the `expo` dependency, rely on an
unrecorded interactive template choice, or substitute an SDK 58 canary or any
other prerelease merely because it is newer. SDK 57's documented toolchain floor
is Node.js 22.13.x, Android 7 with compile/target SDK 36, and iOS 16.4 with Xcode
26.4; Gate 1 may pin later compatible patch toolchains only through the same
proof. ([Expo npm registry latest metadata](https://registry.npmjs.org/expo/latest),
[Expo SDK 57 default template](https://raw.githubusercontent.com/expo/expo/sdk-57/templates/expo-template-default/package.json),
[Expo `create-expo-app`](https://docs.expo.dev/more/create-expo/),
[Expo package versions](https://www.npmjs.com/package/expo?activeTab=versions),
[Expo SDK reference](https://docs.expo.dev/versions/latest/), [Expo upgrade
guide](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/))

The supported release line must use React Native's **New Architecture**. Expo
SDK 55 and later always enable it, and React Native 0.82 made it the only
runtime architecture; later React Native releases have begun removing Legacy
Architecture classes. Expo reports that its own SDK modules support the New
Architecture, but explicitly warns that the interoperability layer is
incomplete for some third-party native libraries. Therefore the architecture
is not a configuration toggle and a Legacy Architecture pin is not a release
fallback. `expo-doctor` and React Native Directory are intake signals only;
SQLCipher/OpenSSL, notifications, SecureStore, and every added native
module must pass the product's exact iOS and Android lifecycle/artifact suite.
Prefer the Expo Modules API for any focused product-owned native escape hatch.
([Expo New Architecture guide](https://docs.expo.dev/guides/new-architecture/),
[React Native 0.82](https://reactnative.dev/blog/2025/10/08/react-native-0.82))

Why it fits this product and one developer:

- TypeScript/React is existing founder leverage, but the product still renders native controls and can escape to focused Swift/Kotlin modules.
- Expo supplies a coherent build, signing, submission, notification, and native-configuration path without making Expo Go or production OTA a constraint.
- Expo SQLite and the supported native SQLite ecosystem fit the offline Practice loop.
- A cross-platform domain and data layer preserves an Android path without paying the operational cost of two public platforms before moderation, support, and deletion operations are proven.

Requirements:

- Use a development build from the first persistence spike; SQLCipher and production push notification behavior are not Expo Go assumptions.
- At Gate 1, resolve the current stable SDK 57 graph from the
  `expo@57.0.18` / React Native 0.86.3 start, never dropping below the
  `expo@57.0.17` / React Native 0.86.3 regression-fixed floor; remove any
  ignored Legacy Architecture opt-out, inventory every native/transitive
  dependency with `expo-doctor`, and prove actual release behavior on both
  platforms before pinning the exact Expo/React Native/native-toolchain graph.
  An interop-layer build or directory listing is not acceptance.
- Pin the release Expo SDK, Android Gradle Plugin, NDK, vendored SQLCipher
  source, and every native dependency. Treat Android compatibility as a
  property of the generated AAB and its device behavior, not of the JavaScript
  package name or a successful Gradle build.
- Treat React Native/Expo SDK upgrades as deliberate release work. Keep native escape hatches local behind adapters.
- Keep shared code to domain contracts, validation, data access, and design tokens. Do not force mobile and web UI into a generic component framework.

### Production update boundary

Preview and internal builds may use EAS Update for same-runtime validation. Set `updates.enabled=false` in complete-v1 App Store builds so they run only code and assets embedded in the reviewed binary. EAS Build, Submit, TestFlight, and App Store phased releases remain the production release path. Remotely fetched Pack and Guide revisions are reviewed, immutable data: Pack rules and calculations use allowlisted declarative contracts evaluated by embedded versioned handlers, never downloaded JavaScript, `eval`, or remote executable handlers. A server-side Pack pause can stop new guided use or publication without changing the binary.

Signed staged OTA is the strongest alternative: Expo runtime versions constrain native compatibility, rollouts and rollback limit exposure, and end-to-end signing prevents Expo, a CDN, or a network intermediary from altering an update. Those controls prove compatibility, provenance, and deployment reach—not that changed behavior is safe or App-Review-compliant—and rollback cannot undo athlete records or publication decisions already processed by faulty code. Expo also limits its end-to-end signing feature to Production or Enterprise plans, while Apple currently prohibits downloaded code that introduces or changes app features or functionality. Complete v1 therefore sends every executable behavior change through a new binary. Reconsider narrowly scoped OTA bug fixes only after a separate App Review/policy decision, signed-update key custody, same-runtime staging, gradual rollout, rollback rehearsal, and a ban on changing Pack safety, sync, authorization, privacy, publication, or entitlement semantics. ([Expo runtime versions](https://docs.expo.dev/eas-update/runtime-versions/), [Expo code signing](https://docs.expo.dev/eas-update/code-signing/), [Expo rollouts](https://docs.expo.dev/eas-update/rollouts/), [Apple App Review Guideline 2.5.2](https://developer.apple.com/app-store/review/guidelines/#software-requirements))

### iOS-first versus cross-platform

The recommended combination is **cross-platform implementation, iOS-first operation**:

- ship one complete iOS v1;
- keep Android building in CI, run schema/sync tests against Android, and test at least one physical Android device at each hardening gate;
- defer public Android distribution until moderation load, support, subscription operations, privacy deletion, and production sync behavior are known.

This avoids two simultaneous store/support surfaces without converting a release-order decision into an Apple-only data model. If market research later makes permanent Apple exclusivity an accepted product decision, SwiftUI becomes more attractive; that is an explicit business decision, not a technical default.

### Rejected realistic alternatives

| Option | Strengths | Why not the recommendation |
|---|---|---|
| SwiftUI | Best direct access to Apple UI conventions, StoreKit, Keychain/Data Protection, and Apple-only APIs; excellent if the product is permanently Apple-only. Apple describes SwiftUI as a way to build across Apple platforms. ([SwiftUI](https://developer.apple.com/swiftui/)) | No Android implementation. A later Android release creates a second UI, persistence, sync, test, and accessibility implementation. It gives up the founder's TypeScript leverage before Apple-only product fit is established. |
| Bare React Native | Same native-component model and escape hatches as RN. | More direct Xcode/Gradle/build ownership with no identified complete-v1 benefit; Expo development builds already permit the required native modules. Eject only for a demonstrated native/build constraint. |
| Legacy React Native architecture / old Expo SDK pin | Could temporarily preserve an incompatible native dependency on SDK 54 or earlier. | React Native 0.82 and Expo SDK 55+ removed the opt-out, Legacy receives no new fixes, and pinning an unsupported release line would turn one dependency into a security, store-toolchain, and upgrade blocker. Replace or isolate the incompatible dependency instead. |
| Flutter | Natively compiled, supported for iOS and Android, cohesive tooling. ([Flutter supported platforms](https://docs.flutter.dev/reference/supported-platforms)) | Requires a Dart application and a separate web/domain sharing strategy. There is no demonstrated UX or local-first advantage here sufficient to offset lower founder leverage. |
| Kotlin Multiplatform / Compose Multiplatform | Can share Kotlin logic and Compose UI across iOS and Android; Compose Multiplatform for iOS is stable. ([Kotlin Multiplatform](https://kotlinlang.org/docs/multiplatform.html), [Compose Multiplatform stability](https://www.jetbrains.com/help/kotlin-multiplatform-dev/supported-platforms.html)) | Adds Kotlin, Gradle, Xcode, and compatibility-matrix operations for one developer, with less reusable product code than the chosen stack. Reconsider only with strong Kotlin expertise or a Kotlin-native backend/team. |
| Capacitor | A realistic web-first native container with plugin access. ([Capacitor](https://capacitorjs.com/docs)) | The core experience is a frequently edited, offline, native-feeling structured log. A WebView-first state and interaction model has less leverage here than it would for a content-heavy companion app. It remains reasonable for an internal operations UI, not the mobile Practice surface. |
| PWA only | Lowest store/build burden and strong linkability. | Does not meet the premium mobile, reliable local reminders, store subscription, background lifecycle, and native offline expectations. Public canonical pages should still be web pages. |

Also rejected: copying Training Hub's Next.js/browser/database architecture wholesale. Reuse its tested concepts—server-derived ownership, additive/fail-closed migrations, purpose-bound encryption, opaque storage keys, secret-free telemetry, and deep external adapters—not its delivery shape.

### Rejected data/backend alternatives

| Option | Why it is credible | Why it is rejected for the default |
|---|---|---|
| PowerSync Cloud | Purpose-built local SQLite replication, offline upload queue, checkpoints, and an official Expo/React Native SDK. | Adds a paid always-on private-data processor while product code still owns validation and high-value conflicts. Keep only as the `SyncGateway` contingency if the narrow protocol proof fails. |
| Supabase Realtime as sync | Already present with PostgreSQL change broadcasts. | Live change delivery is not a durable offline command, replay, conflict, bootstrap, or migration protocol. It may later provide a foreground wake-up hint; the cursor feed remains authoritative. |
| Firebase/Firestore | Managed mobile SDKs and offline document cache. | The revision, source, Pack, moderation, audit, credential, feed, and deletion graph is relational. Reconstructing integrity and public/private projections around documents is worse than PostgreSQL here. |
| CRDT/Automerge/Yjs everywhere | Excellent for multi-writer collaborative documents. | Most records have one athlete owner and explicit versions; safety/public/moderation transitions are server-authoritative. Generic CRDT semantics would obscure conflict/audit policy and expand data/migration cost. |
| Turso/SQLite remote primary | Strong SQLite affinity and emerging offline sync. | Expo's current guide notes that Turso Offline Sync is public beta and automatic conflict resolution is not available. It does not remove this product's relational policy work. ([Expo local-first guide](https://docs.expo.dev/guides/local-first/)) |
| Custom general replication engine | Complete control and no vendor. | Rejected. Build only the typed commands and owner change events required by the named aggregates, not subscriptions, arbitrary queries, merge languages, or database replication. |
| Vercel Workflows / Queues for v1 job orchestration | Workflow's stable TypeScript line is GA and provides durable steps, retries, encrypted event-log payloads, deployment-pinned runs, and managed observability. | The stable Vercel World stores workflow data in `iad1`; its multi-region v5 line remains beta, while direct Vercel Queues remains Beta and does not guarantee strict selected-region residency during failover. It also creates a second event log without replacing product-owned job status, receipts, audit, idempotency, or deletion state. Reconsider only through the bounded executor adapter and proof below. |
| Microservices | Independent deployment/scale. | One developer and one relational consistency boundary benefit more from a modular monolith. Split only a measured high-risk or high-load adapter later. |

## Deployment shape and codebase design

Use a **new repository and architecture** for this product. It does not share Training Hub authentication, tables, migrations, storage, secrets, or deployment. A practical modular-monolith shape is:

```text
apps/mobile       Expo application
apps/web          Next.js public pages, account pages, and versioned mobile API
apps/ops          separately deployed protected Next.js operations UI
apps/jobs         bounded leased queue workers and scheduled wake-up endpoints
packages/domain   dependency-light domain terms, transitions, and policies
packages/contracts Pack schemas, API schemas, public projections, sync mutations
packages/db        server schema, migrations, RLS policy tests, query modules
packages/adapters  Crossref, DataCite, ORCID, push, billing, email, storage, sync
```

`apps/web` is one Next.js App Router modular monolith for public canonical pages, authenticated account pages, and `/api/v1`; it has no operations routes or operations credential. `apps/ops` is a thin second Next.js presentation surface over the same domain/application modules, not a second domain implementation or microservice. Route Handlers are public HTTP endpoints, so every handler performs authentication/authorization and passes into application modules; it never contains inline policy. Next.js documents this Backend-for-Frontend shape while cautioning that its endpoints are a public API layer, not an excuse to treat the framework as the entire backend. ([Next.js](https://nextjs.org/docs), [Backend for Frontend guide](https://nextjs.org/docs/app/guides/backend-for-frontend))

Start with one Supabase PostgreSQL/Auth/Storage project per environment, one Expo app, and **three Vercel project boundaries** for `apps/web`, `apps/ops`, and `apps/jobs`, each with distinct deployments per environment. `apps/jobs` receives only narrowly scoped worker, queue, and provider capabilities required by its named job types; neither user-facing deployment can claim jobs or access backup/signing capabilities. They share a repository and versioned packages, but not deployment environment variables, database credentials/roles, or release approval. Vercel environment variables are project-scoped and readable by users with project access and by that project's build/functions; Deployment Protection is also configured per project. A shared public project would therefore put privileged operations secrets in the public/API runtime and cannot apply project-level protection to operations without also changing the public surface. ([Vercel environment variables](https://vercel.com/docs/environment-variables), [Vercel Deployment Protection](https://vercel.com/docs/deployment-protection))

Treat the production data/runtime region as a Gate 0 infrastructure contract,
not a deployment default to discover later. A Supabase project has one primary
region and is infrastructure-bound to it; changing regions requires a new
project and migration. If data residency requires a jurisdiction, select a
specific region rather than a general region whose actual placement may cross
that jurisdiction. Gate 0 records one exact tuple: Supabase project region,
Vercel region code, and Field Note KMS Region. Every database-touching Function
in `apps/web`, `apps/ops`, and `apps/jobs` uses the Vercel region whose reference
AWS Region exactly matches PostgreSQL; the deployment and application startup
verify the effective Vercel region and expected exact KMS key ARN before
database or free-text work is accepted. “Nearest” is a measured cross-region
exception, never described as colocation. New Vercel projects otherwise default
Functions to `iad1`.

At the 2026-08-30 handoff check, current official inventories still exposed a
complete conditional Brazil-first tuple: Supabase South America (São Paulo)
`sa-east-1`, Vercel São Paulo `gru1` (reference Region `sa-east-1`), and the AWS
KMS `sa-east-1` endpoint. Use that tuple if Gate 0 accepts Brazil as the first
data jurisdiction. Supabase's `Americas` general region currently maps to North
Virginia and its capacity-based general-region contract is not the
Brazil-residency choice.

Matching Region codes establish an explicit region-placement topology, not
same-facility or same-Availability-Zone colocation, a private provider path,
whole-system Brazilian residency, regulatory compliance, or recovery.
Supabase's statement covers primary project data; Vercel's table supplies a
Function reference Region while CDN, control-plane, support, processor, and any
configured failover paths require their own Gate 0 data-flow review. Pin every
database-touching Node.js Function to `gru1`, verify the effective Vercel Region
and exact `arn:aws:kms:sa-east-1:...` key before work, and do not enable a
cross-jurisdiction Function failover path. If a future launch jurisdiction has
no exact provider tuple, Gate 0 must either accept and benchmark the named
cross-region path or change a provider; it cannot leave placement implicit.

The database-touching v1 runtime stays single-region while PostgreSQL has one
primary region; adding function regions without a replicated data path adds
cross-region round trips rather than database resilience. The owner-controlled
product API is the mobile portability boundary. Complete v1 does not buy a
Supabase custom domain: it would not preserve project-scoped keys or sessions,
and every currently identified consumer, callback, and object-delivery flow can
use the product domain or a runtime-generated short-lived URL. Add the provider
domain later only if a concrete third-party endpoint needs its Supabase hostname
to remain stable. ([Supabase regions](https://supabase.com/docs/guides/platform/regions), [changing a Supabase project region](https://supabase.com/docs/guides/troubleshooting/change-project-region-eWJo5Z), [Vercel regions](https://vercel.com/docs/regions), [AWS KMS endpoints](https://docs.aws.amazon.com/general/latest/gr/kms.html), [Supabase custom domains](https://supabase.com/docs/guides/platform/custom-domains))

The split is blast-radius and secret isolation, not authorization. Vercel
Standard Protection is insufficient: its current scope excludes production
domains even though the migration note says it also restricts the generated
production deployment URL, so it does not establish protection for every
custom and generated production entry point. Complete v1 therefore protects
`apps/ops` with **Vercel Authentication over All Deployments**, which
requires Enterprise or the Advanced Deployment Protection add-on on Pro; the
current Pro add-on is $150/month on top of the $20/month Pro plan, and Vercel
currently requires at least 30 days of use before the add-on can be disabled.
Password Protection is a shared-secret alternative under the same plan
boundary and is not the human-access default.
Trusted IPs is an Enterprise-only alternative if the operator path later has a
stable controlled IPv4/CIDR boundary. Gate 0 verifies the purchased scope on
the production domain, limits Vercel project membership, and starts with no
Shareable Link, automation bypass secret, Deployment Protection Exception, or
OPTIONS Allowlist for `apps/ops`. Vercel makes Shareable Links, automation
bypass, and the OPTIONS Allowlist available on all plans; a valid automation
secret bypasses Vercel Authentication, Password Protection, Trusted IPs,
Vercel Firewall system mitigations, and Bot Protection for every deployment in
the project until revocation; it does not bypass active DDoS blocks,
attack-time rate limits, or attack-triggered challenges. A Shareable Link grants
its holder bearer access to the selected deployment or branch, an Exception
makes its selected preview domain public, and an OPTIONS allowlist bypasses
Deployment Protection only for prefix-matched preflight requests. If a named
release check later requires one of these,
use the narrowest project/path/branch scope, keep application authorization
mandatory on every substantive request, record an owner and expiry, and revoke
it after the check. This perimeter is defense in depth, not a product role or
second factor.
([Vercel Deployment Protection](https://vercel.com/docs/deployment-protection),
[protection methods](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments),
[protection bypasses](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection),
[automation bypass limits](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation))

At the 2026-08-31 09:51 -03 deadline check, current first-party Vercel
documentation still does **not** unambiguously grant this production boundary
to ordinary Pro. The Deployment Protection page says both that protecting
production domains needs a Pro or Enterprise plan and that `All Deployments`
is available on Pro and Enterprise, but its dedicated `All Deployments`
section says production-inclusive protection requires Enterprise or the
Advanced Deployment Protection add-on on Pro. The Vercel Authentication page
establishes that the authentication **method** is available on all plans and
documents an `all` API value; configuration syntax is not a plan-entitlement
promise. Ordinary Standard Protection does restrict the generated production
deployment URL, but explicitly leaves production domains public; that narrower
scope cannot prove the required boundary across every custom and generated
production URL. The current security page separately assigns Private
Production Deployments to Pro's $150 Advanced Deployment Protection option,
and the live pricing table still lists that add-on. Use the scope-specific
requirement, pricing, and private-production classification rather than the
conflicting overview, generic method availability, or accepted API value.
Retain the add-on in the conservative launch architecture and cost baseline.
Only the live account-level proof below may reduce the perimeter cost.

Gate 0 may remove it only after the selected account proves that
`All Deployments` plus Vercel Authentication denies an anonymous request to the
real production custom domain without the add-on and records the exact plan,
scope, and date; application TOTP/product authorization remains mandatory in
either case. ([Vercel pricing](https://vercel.com/pricing), [Vercel Enterprise
plan](https://vercel.com/docs/plans/enterprise), [Vercel
security](https://vercel.com/security), [Vercel private-production
launch](https://vercel.com/blog/protecting-deployments))

Vercel Authentication is not limited to one operator identity: authorized team
or project viewers, access-group members, individually granted Vercel users,
approved access requests, Shareable-Link holders, and automation-token clients
can all cross the perimeter. Re-enabling it also does not force a fresh login
for an otherwise authorized browser that retains the deployment URL's cookie.
Gate 0 therefore inventories those grants and cookies as perimeter access, not
as product roles. Omitting a custom domain is not a free private-production
workaround because Vercel always assigns a production domain, using a
`vercel.app` domain when no custom domain exists. Running the operations product
as a Pro Custom Environment is also rejected: Vercel defines Custom
Environments as pre-production, so that approach would misclassify production
secrets, releases, and operating evidence to evade the control. ([Vercel
Authentication](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication),
[generated URLs](https://vercel.com/docs/deployments/generated-urls), [system
environment variables](https://vercel.com/docs/environment-variables/system-environment-variables),
[Custom Environments](https://vercel.com/docs/deployments/environments))

Every operations read and mutation creates a request-scoped Auth client,
validates the session with the Auth server, and requires
`currentLevel = aal2`, `nextLevel = aal2`, TOTP in the JWT `amr`, and a
currently verified TOTP factor before checking the database-backed product role
and scope, case/target access, and dual-control rule in the
data-access/application layer. Missing `aal`, `aal1`, an expired or revoked
session, a disabled factor represented by stale `aal2`/next `aal1`, or an
`aal2` session without TOTP fails closed before a privileged database
transaction. Next.js recommends secure checks close to the data source rather
than relying on routes, layouts, or UI, and Supabase secret/service roles bypass
RLS; `apps/ops` therefore receives a narrowly granted operations role rather
than a generic service-role secret, while `apps/web` receives no operations
grants. ([Supabase MFA enforcement](https://supabase.com/docs/guides/auth/auth-mfa), [Supabase JWT claims](https://supabase.com/docs/guides/auth/jwt-fields), [Supabase AAL check](https://supabase.com/docs/reference/javascript/auth-mfa-getauthenticatorassurancelevel), [Supabase server-session guidance](https://supabase.com/docs/guides/auth/server-side/advanced-guide), [Next.js authentication and authorization](https://nextjs.org/docs/app/guides/authentication), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security))

PostgreSQL transactions and modules are the backend of record; Next.js is the HTTP/rendering surface. Supabase Edge Functions are optional adapters for provider webhooks or short regionally distributed work, not a second domain implementation. Supabase documents them as stateless TypeScript/Deno functions and recommends database functions for data-intensive operations. ([Supabase Edge Functions](https://supabase.com/docs/guides/functions), [function development guidance](https://supabase.com/docs/guides/functions/development-tips))

### Database connection topology

Run the database-touching `apps/web`, `apps/ops`, and bounded `apps/jobs`
handlers as Node.js Vercel Functions with Fluid Compute in the selected database
region. Give each deployment its own narrowly granted PostgreSQL role and
Supavisor transaction-mode connection string over TLS. Each runtime creates a
small, explicitly capped driver pool at module scope, attaches it to Vercel's
pool lifecycle, checks out one client for the whole database transaction, and
releases it in `finally`. The exact per-instance maximum is a Gate 1 load-test
result, not a library default; the combined web, operations, jobs, Auth,
Storage, and provider-reserved budget must leave measured headroom on Small
compute. ([Supabase connection methods](https://supabase.com/docs/guides/database/connecting-to-postgres), [Supabase connection management](https://supabase.com/docs/guides/database/connection-management), [Vercel connection pooling](https://vercel.com/kb/guide/connection-pooling-with-functions))

Transaction mode preserves an explicit transaction but does not preserve a
session. Disable prepared statements and do not depend on session-level `SET`,
`LISTEN/NOTIFY`, session-spanning temporary tables, or session advisory locks.
The current architecture's row locks, transaction-local sequence allocation,
and insert-only audit updates remain valid because each finishes in one short
transaction. Authorization remains an input to the transaction and a property
of the database role/query boundary; it never depends on mutable pooled-session
state. ([Supabase transaction-mode limits](https://supabase.com/docs/guides/self-hosting/accessing-postgres))

Use a direct TLS connection only from controlled migration, logical
backup/restore, and recovery tooling. If a future persistent worker genuinely
needs session semantics, give that worker a separate direct or session-mode
role, network path, connection budget, and proof rather than changing every
runtime. The colocated dedicated pooler is a reversible latency/capacity
optimization after measurement; v1 defaults to shared Supavisor transaction
mode because it is the provider's serverless path and avoids assuming direct
IPv6 reachability or buying the IPv4 add-on. Vercel's application pool reduces
per-instance churn; Supavisor remains the server-side boundary that prevents
autoscaling instances from each reserving a direct PostgreSQL session.

### Durable job execution boundary

PostgreSQL `operations_jobs` and each domain-specific task table are the
canonical state machines for exports, scoped/account deletion, object backup
and purge, source review, entitlement repair, audit checkpoints, and
notification delivery. A logged Supabase Queue holds wake-up messages, not the
only copy of job state, and Supabase Cron may wake a dispatcher or recover an
expired lease; neither primitive performs an entire saga inside one run.

This boundary is required even though current Fluid Compute permits longer
Vercel Functions. A Pro function still has a finite stable maximum duration,
and a timed-out invocation terminates with an error; the longer 30-minute mode
is currently beta. ([Vercel 30-minute beta](https://vercel.com/changelog/vercel-functions-can-now-run-up-to-30-minutes))
Supabase Queues guarantees one consumer only within the chosen visibility
window, leaves a message until it is explicitly archived or deleted, and makes
it visible again after the window. Supabase also recommends no more than eight
concurrent Cron jobs and no job longer than ten minutes.
Therefore provider duration, queue visibility, or one successful Cron
invocation is never completion evidence. ([Vercel Function limits](https://vercel.com/docs/functions/limitations), [Supabase Queues](https://supabase.com/docs/guides/queues), [Queues API](https://supabase.com/docs/guides/queues/api), [Supabase Cron](https://supabase.com/docs/guides/cron))

Every worker invocation:

1. claims one ready task in a short transaction using a new lease generation
   and deadline; a fencing check prevents a late worker from committing after
   another invocation takes over;
2. executes one bounded, idempotent step with an internal deadline below the
   configured function maximum, which is itself below the queue visibility
   window with shutdown and redelivery margin;
3. records the provider receipt/result and next durable checkpoint before
   advancing, then either schedules the next wake-up or marks the task
   terminal; and
4. archives the wake-up only after the database transition commits. A crash,
   deployment, overlap, or timeout leaves recoverable canonical state; expired
   leases are retried with backoff, and exhausted attempts enter a visible
   operator state rather than disappearing.

Exports and deletion are always multi-step sagas over their existing task
tables; backup and purge work is chunked by immutable object/version ID. Cron
is a non-authoritative nudge, so missed, overlapping, or duplicate invocations
are harmless. Provider calls use stable product idempotency keys where the
provider supports them and product-side receipt reconciliation otherwise.
After-response helpers such as `waitUntil` are never used for correctness-
critical work because their promises remain bounded by the same function
timeout. ([Vercel Functions API](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package))

The strongest current alternative is Vercel Workflows rather than hand-written
lease orchestration. Vercel made the stable TypeScript Workflow line generally
available on 2026-04-16. Its event log persists every step transition, retries
at durable step boundaries, pins an in-flight run to its originating
deployment, and encrypts workflow inputs, outputs, step data, hook payloads,
and streams before the event log sees them. That materially reduces custom
retry, replay, and run-observability work for one developer. The encryption
contract is not a content-free processor boundary: workflow/step names, entity
IDs, timestamps, and lifecycle states remain plaintext metadata, and an
authorized project user with environment-variable access can explicitly
decrypt run data through an audited dashboard or CLI path.

It still does not fit the complete-v1 regional and data-rights boundary. The
stable v4 Vercel World stores workflow data only in `iad1`, independently of
the application's runtime Region. Multi-region workflow storage begins on the
v5 beta line, not the accepted stable line. Direct Vercel Queues remains Beta;
its selected-region queue can temporarily store messages in a neighboring
Region during failover and does not support strict residency. Under the
conditional Brazil tuple, adopting stable Workflow would therefore introduce
an undeclared `gru1 -> iad1` workflow-data path, while adopting v5 or direct
Queues would make a beta orchestration surface correctness-critical.

More fundamentally, Workflow's event log cannot replace the product's
authoritative `operations_jobs`, privacy request, moderation, provider-receipt,
and appeal/audit rows. Those states need product authorization, athlete-visible
status, legal retention/deletion, database recovery, and idempotency even if an
executor is unavailable or replaced. Keep the PostgreSQL-canonical state
machines and fenced leased executor for complete v1. Reconsider managed
Workflow only behind a bounded `JobExecutor` adapter after the stable line
supports the accepted exact Region and after retention, deletion, DPA,
decryption access, deployment-version, failover, pricing, and exit contracts
pass a release-shaped fault drill. Even then, pass only opaque job IDs and typed
step keys through the workflow event log; fetch authorized current state inside
each idempotent step. ([Workflow GA](https://vercel.com/blog/a-new-programming-model-for-durable-execution), [Vercel World](https://workflow-sdk.dev/worlds/vercel), [Workflow encryption](https://workflow-sdk.dev/docs/how-it-works/encryption), [Workflow event sourcing](https://workflow-sdk.dev/docs/how-it-works/event-sourcing), [Vercel Queues](https://vercel.com/docs/queues))

### Deep modules and their interfaces

| Module | Small interface | Complexity hidden inside |
|---|---|---|
| `PackRegistry` | resolve exact version; validate plan/note/finding; evaluate declared stop rules | immutable schema versions, units, support level, safety contract, calculations, source review dates |
| `PracticeLedger` | plan Try; append/revise Field Note; draft/revise Finding; query timeline | local transactions, record revisions, free-text envelopes, tested-item links, provenance, tombstones, conflict creation |
| `SyncGateway` | enqueue command; push batch; pull after cursor; observe status; resolve/recover conflict | SQLite outbox/inbox, idempotency, ordering, server change log, typed rejections, encryption, schema migration |
| `PublicationBoundary` | preview minimized projection; submit; approve/reject; publish revision; unpublish | redaction, immutable snapshots, private linkage, policy checks, canonical URLs, corrections |
| `SocialGraph` | follow/unfollow; save/unsave; read chronological cursors | typed targets, blocks, hidden counts, membership conflicts, keyset pagination |
| `ModerationDesk` | open/triage/decide/appeal/pause | reports, evidence access, case assignment, audit chain, visibility projection, Pack scopes |
| `SourceRegistry` | resolve DOI; record metadata snapshot/update; show source status | registration-agency routing, Crossref/DataCite etiquette and backoff, DOI normalization, retractions/corrections, licensing boundaries |
| `IdentityTrust` | state literal credential/affiliation claim; submit evidence; decide/revoke | evidence documents, jurisdiction, expiry, reviewer provenance, ORCID boundary |
| `NotificationOutbox` | create intent; schedule local; deliver remote; record receipt | preferences, quiet hours, generic payloads, retries, device token lifecycle |
| `DataRights` | preview/export; scoped delete; account-delete saga; status receipt | dependency graph, public consequences, object deletion, retention, backup disclosure |
| `Entitlements` | current entitlement; restore; process verified event | StoreKit/App Store state, RevenueCat webhook idempotency, grace periods, refunds |

Each interface is also a focused test surface. Inject adapters only at true seams: sync transport/contingency, object storage, auth, mail, push, billing, source metadata, observability. Do not invent an abstract “provider framework” for every domain table.

## Domain model

### Ubiquitous language

| Term | Precise meaning |
|---|---|
| Practice Family | Stable top-level practice area such as race fueling or heat preparation. |
| Practice Pack | Stable identity for a reviewed practice contract. A Pack is not a social post or a copied protocol. |
| Pack Version | Immutable released schema, safety, calculation, evidence, and publication contract used by a practice record. |
| Practice Guide | App-owned, source-backed explanation of a Practice Pack. Its immutable versions explain scope, use, evidence, uncertainty, and stop boundaries without becoming an athlete Protocol. |
| Protocol | The athlete's bounded approach with a literal named authority and source. It can be authored externally. |
| Protocol Version | Immutable snapshot of the exact approach used; it is never silently replaced by a Pack or another user. |
| Tested Item | The exact product, equipment, environment, or other item observed in practice. It is not evidence and makes no causal claim. |
| Experiment | A private bounded question, intended decision variable, stability assumption, horizon, and selected Pack/Protocol versions. It is not a scientifically controlled experiment. |
| Try | A planned practice opportunity within an Experiment. |
| Field Note | Private, structured raw record of planned/actual context, deviations, observations, and optional free text. |
| Finding | Private, revisable bounded synthesis: Keep, Repeat, Change one thing, Stop, Mixed, or Not enough evidence. |
| Public Object | Stable public identity for an approved Finding, Experiment Update, Research Note, Practitioner Protocol Note, Open Question, or official Pack Update. |
| Public Revision | Immutable minimized published snapshot at a canonical object URL. |
| Evidence Label | The product's literal label for the support attached to a public claim. It is independent of credentials and popularity. |
| Credential State | Literal workflow state of a credential claim, such as unsubmitted, submitted, verified, expired, rejected, or revoked. |
| Affiliation State | Literal asserted/verified/expired/revoked state of an organization relationship, with its own source and dates. |
| Pack Pause | Operational, scoped restriction on new publication, discussion, or new guided use; it is not deletion or a Pack rewrite. |
| Sync Rejection | A permanent server rejection of one offline mutation, preserved for user recovery after the upload queue continues. |

### Aggregate boundaries and authority

- `PracticePack` owns immutable `PackVersion` contracts. Only authorized Pack editors propose versions; human reviewers activate safety-adjacent versions.
- `Protocol` owns its immutable versions, but the authority can be athlete, coach, practitioner, dietitian, or app template. The athlete controls whether it appears in their private practice.
- `Experiment` owns Try membership. A Try references, but does not own, a Protocol Version, Pack Version, and Tested Item Version.
- `FieldNote` owns its append-only revisions and structured values. It is always private.
- `Finding` owns private revisions and links to selected input Field Note revisions. Publication creates a separate `PublicObjectRevision`; it never flips a Finding to public.
- `PublicObject` owns immutable public revisions and one canonical identity. Discussion threads anchor to an exact public revision.
- `ModerationCase` owns reports, decisions, actions, and appeals. Product audit events are append-only and cannot be edited by moderators.

### State transitions

```text
PackVersion: draft -> in_review -> active -> superseded
                                  \-> withdrawn

Experiment: draft -> active -> concluded -> archived
Try: planned -> started -> completed | skipped | cancelled
FieldNoteRevision: local_pending -> synced -> superseded
                                  \-> rejected_recoverable | conflicted
Finding: draft -> privately_concluded -> archived

PublicationCandidate: draft -> submitted -> under_review
                      -> approved | changes_requested | rejected
PublicRevision: published -> corrected_by_new_revision
PublicAvailability: available -> hidden | author_withdrawn | account_deleted

CredentialClaim: unsubmitted -> submitted -> under_review
                  -> verified | rejected -> expired | revoked

ModerationCase: open -> triaged -> investigating -> decided -> closed
                                      \-> appealed -> appeal_decided
```

Pack lifecycle transitions change review/availability state only; after first
activation, the released Pack content and digest never change. Protocol and
public revision transitions likewise create successor records or separate
availability events instead of editing released content. No transition into a
causal, diagnosed, medically cleared, or automatically adapted state exists.

## Relational data model

PostgreSQL is the canonical relational store. Every tenant-private root row has `owner_id`; child authorization is enforced either directly or by an owner-scoped join through its root. IDs sent by clients never establish ownership. Use UUIDv7-compatible client-generated identifiers for offline-created private aggregates and commands, server `created_at`, monotonically increasing row `server_version`, and explicit tombstones where sync requires them.

Do not apply that identifier policy to canonical public URLs. UUIDv7 places a
48-bit Unix-millisecond timestamp first and therefore exposes creation time and
ordering; UUIDv4 provides 122 random bits, while the UUID specification warns
that no UUID is a security capability. PostgreSQL supports both algorithms.
The strongest alternative is UUIDv7 everywhere for one policy and better index
locality, but public objects are low-volume, already have explicit timestamps,
and do not justify the extra metadata disclosure. Generate `public_objects.id`
on the server as CSPRNG-backed UUIDv4 and use it as the stable public URL ID;
keep authorization and current availability checks independent of identifier
opacity. ([RFC 9562](https://www.rfc-editor.org/rfc/rfc9562.html), [PostgreSQL UUID functions](https://www.postgresql.org/docs/current/functions-uuid.html))

### Credentials, affiliations, and identity trust

- `app_users(id, auth_subject_id unique, status, locale, created_at, deletion_state)`
- `profiles(user_id pk, handle, display_name, bio, avatar_object_id, public_state, revision)`
- `onboarding_drafts(user_id pk, chapter, answers_jsonb, first_experiment_id nullable, updated_at, completed_at)`; private, resumable, and never treated as a public profile or inferred medical record
- `athlete_contexts(user_id pk, sports_jsonb, training_context, external_authority_summary, updated_at)` and `practice_baselines(user_id, baseline_key, literal_value, answer_state, updated_at)`; private and explicitly answered
- `public_role_claims(id, user_id, role, literal_state, disclosure, current_decision_id)` for Coach, Sports dietitian, Researcher, Other practitioner, or Commercial representative
- `product_roles(user_id, role, scope, granted_by, granted_at, revoked_at)` for internal moderator/admin capability only; never displayed as a credential
- `device_registrations(id, user_id, platform, app_version, push_token_ciphertext_or_ref, last_seen_at, revoked_at)`
- `credential_claims(id, user_id, credential_type, issuer, jurisdiction, literal_state, claimed_identifier, issued_on, expires_on, disclosure, current_decision_id)`
- `credential_evidence(id, claim_id, private_object_id, submitted_at, deleted_at)`
- `credential_decisions(id, claim_id, reviewer_id, decision, reason_code, decided_at, supersedes_id)`
- `affiliation_claims(id, user_id, organization_name, role_title, asserted_from, asserted_to, source_type, source_provider, source_record_id, source_assertion_origin, source_observed_at, literal_state, current_decision_id)`
- `affiliation_evidence(id, affiliation_claim_id, evidence_type, external_reference_or_private_object_id, observed_at, deleted_at)`; external provenance and privately submitted documents remain distinguishable
- `orcid_connections(user_id, orcid_id, oauth_state, access_scope, connected_at, disconnected_at)` only after the organization has the applicable ORCID membership/license, has completed the required integration review, and has issued Production Member API credentials; tokens live in an encrypted secret store, not this table in plaintext
- `blocks(blocker_id, blocked_id, created_at)` and private `mutes(user_id, muted_user_id, created_at)`

Credential and affiliation states are displayed literally with issuer,
jurisdiction, reviewer provenance, dates, expiry, and limitations. An
authenticated ORCID iD reduces mistyping and misattribution but ORCID explicitly
says an iD is not identity verification. Current ORCID record summaries separate
member-validated from self-asserted items and expose public verified professional
email domains. After authorized Member API access, an institution-asserted
current employment may seed evidence for a human `Affiliation checked with
<organization> on <date>` decision; a verified institutional email domain may
support only `Institutional domain association observed on <date>`. Neither
automatically establishes the person's identity, employment role, practitioner
credential, Researcher role, or any content evidence label, and self-asserted
affiliations remain self-described. ([ORCID on identity
assurance](https://support.orcid.org/hc/en-us/articles/360006972413-Does-an-ORCID-iD-assure-my-identity),
[authenticated iDs](https://info.orcid.org/documentation/integration-guide/orcid-oauth-sign-in-guidelines/),
[ORCID record summaries](https://info.orcid.org/documentation/integration-guide/summarizing-orcid-record-data/),
[current Trust Marker paths](https://info.orcid.org/the-trust-marker-advantage-how-validated-orcid-data-correlates-with-global-university-performance/))

### Packs, protocols, and tested items

- `practice_families(id, key unique, current_name, status)`
- `practice_packs(id, family_id, stable_key unique, owner_org_or_user_id, status)`
- `pack_versions(id, pack_id, version_number, schema_version, content_version, support_level, state, title, purpose, eligibility_text, schema_digest, safety_digest, released_at, review_due_at, supersedes_id)`
- `practice_guides(id, pack_id unique, canonical_slug, current_version_id)` and `practice_guide_versions(id, guide_id, version_number, pack_version_id, title, purpose, body_document, applicability, uncertainty, stop_boundary, source_digest, state, published_at, supersedes_id)`
- `pack_field_definitions(id, pack_version_id, field_key, section, value_type, unit_code, cardinality, required_when, allowed_values, sensitivity, public_eligible, comparison_role, display_order)`
- `pack_validation_rules(id, pack_version_id, rule_key, declarative_contract, handler_version, severity, user_message, blocks_save, blocks_publish)`
- `pack_safety_rules(id, pack_version_id, rule_key, trigger_contract, action, stop_text, escalation_text, requires_human_review)`
- `pack_calculations(id, pack_version_id, calculation_key, version, declarative_contract, handler_version, output_field_key)`
- `pack_publication_fields(pack_version_id, field_key, allowed, transformation, required_review)`
- `pack_source_links(pack_version_id, source_version_id, relation, reviewer_note)`
- `pack_operational_states(id, pack_id_or_version_id, scope, state, reason_code, starts_at, ends_at, set_by)`
- `protocols(id, owner_id, authority_type, authority_display_name, authority_user_id nullable, source_type, current_version_id)`
- `protocol_versions(id, protocol_id, version_number, pack_version_id nullable, exact_parameters_jsonb, authored_at, provenance, supersedes_id)`
- `tested_items(id, owner_id nullable, category, canonical_name, manufacturer, public_state)`
- `tested_item_versions(id, tested_item_id, version_label, product_identifier, manufacturer_claims_jsonb, captured_at, source)`
- `tested_item_batches(id, tested_item_version_id, owner_id, lot_or_batch, acquired_at, expires_at, private_notes)`

The Pack contract is relational for identity, types, units, sensitivity, publication, sources, and review. A canonical JSON Schema generated from these immutable rows is packaged with the mobile release/cache and retained by digest. The server and client validate against the same fixture corpus. `jsonb` is allowed only for exact protocol parameter payloads and deterministic rule/calculation contracts whose surrounding identity/version is relational; it is not a substitute for queryable ownership or provenance.

Every released Pack Version is immutable and content-addressed by canonical digest. Correcting it creates a new version. Existing Experiments remain pinned and readable. New guided use can be stopped by a scoped operational pause or withdrawn version, with a human-authored explanation; no background migration changes an athlete's records.

The complete-v1 Pack portfolio is fixed at the family level: Race Fueling as Guided Practice; Heat as an External-Protocol Companion; and Performance Supplementation with an external-protocol sodium-bicarbonate path plus structured observation for emerging Tested Items such as NØMIO. An internal `generic-private-observation` contract supports unsupported private Experiments with descriptive fields only, no generated protocol, no causal output, and no publication eligibility. Gate 0 still must approve exact fields, units, stop rules, Tested Item categories, sources, and public transformations for each released version.

Practice Guide Versions are reviewed and immutable alongside their compatible Pack Version. A correction creates a new Guide Version and an official Pack Update Public Revision; it never edits what an existing Experiment displayed or relied on. The canonical Guide page shows its compatible Pack version, source status, review date, and revision history.

### Private practice ledger

- `experiments(id, owner_id, pack_version_id, protocol_version_id nullable, question, intended_decision_variable, stability_assumption, horizon_text, status, linked_from_public_revision_id nullable, current_revision)`
- `experiment_tested_items(experiment_id, tested_item_version_id, tested_item_batch_id nullable, role)`
- `tries(id, owner_id, experiment_id, planned_for, status, opportunity_label, current_revision, deleted_at)`
- `try_plan_revisions(id, try_id, revision_number, base_revision, planned_context, protocol_version_id, created_at, device_id)`
- `field_notes(id, owner_id, try_id, current_revision, capture_started_at, status, deleted_at)`
- `field_note_revisions(id, field_note_id, revision_number, base_revision, planned_summary, actual_summary, deviation_summary, observation_summary, free_text_envelope nullable, free_text_envelope_version nullable, captured_at, device_id, server_state)`
- `field_note_values(id, field_note_revision_id, field_definition_id, value_number, value_text, value_boolean, value_choice, value_datetime, unit_code, value_source, position)` with a check constraint requiring exactly one typed value column
- `findings(id, owner_id, experiment_id, current_revision, status, deleted_at)`
- `finding_revisions(id, finding_id, revision_number, base_revision, conclusion, bounded_interpretation, limitations, next_action, created_at, device_id)`
- `finding_inputs(finding_revision_id, field_note_revision_id, relation)`
- `private_record_conflicts(id, owner_id, record_type, record_id, base_revision, server_revision, submitted_payload, detected_at, resolved_at, resolution)`

`free_text` is never required. Complete v1 encrypts every non-null Field Note
free-text revision at the server application boundary before its canonical
PostgreSQL transaction. Local capture and the local outbox keep the value only
inside SQLCipher; TLS carries it to the narrow owner-authorized API, which uses
the current AWS Encryption SDK for JavaScript/Node defaults with key commitment,
one unique data key per immutable revision, and no data-key cache at v1 volume.
The complete portable encrypted message and an explicit application-envelope
version are the stored value. The symmetric customer-managed KMS wrapping key is
dedicated to this purpose and separate from backup encryption and asymmetric
audit-signing keys. ([AWS Encryption SDK concepts](https://docs.aws.amazon.com/encryption-sdk/latest/developer-guide/concepts.html), [best practices](https://docs.aws.amazon.com/encryption-sdk/latest/developer-guide/best-practices.html))

Authenticated context binds environment, purpose, opaque owner scope, Field Note
ID, and revision ID, and the application verifies the expected values before
returning plaintext. AWS records encryption context in plaintext in the
encrypted message and may record it in CloudTrail, so context contains no note
content, email, handle, Pack, Protocol, Tested Item, or other descriptive data;
opaque identifiers have bounded audit retention. PostgreSQL rows, owner change
events, queues, and logical snapshots contain only the envelope. Only an
authenticated owner read/sync, a scoped data-rights export, or an explicitly
athlete-selected case attachment may decrypt after server-derived authorization.
Public/search/moderation/ordinary operations roles have no decrypt capability,
and there is no field-level server search. A KMS failure is a retryable remote
free-text read/sync/export failure: it never causes a plaintext write or blocks
offline capture of the local note. ([AWS KMS encryption context](https://docs.aws.amazon.com/kms/latest/developerguide/encrypt_context.html), [least privilege](https://docs.aws.amazon.com/kms/latest/developerguide/least-privilege.html))

Complete v1 uses a single-Region KMS key in the accepted data/runtime Region.
AWS says single-Region keys are the best fit for most needs and recommends a
multi-Region key only for an actual cross-Region workload. Do not create an
unreplicated multi-Region primary merely to preserve an option: key regionality
cannot be changed after creation, and related keys expand the locations where
ciphertext can be decrypted while policies, grants, aliases, enabled state,
and audit activity remain independent per Region.

A multi-Region exception is justified only if Gate 0 accepts a numeric
cross-Region free-text service target and names the recovered database,
product API, identity, and runtime path that can use it before the first
production envelope. Then create the primary and named replica, use a strict
multi-Region-aware AWS Encryption SDK keyring, constrain replication to the
accepted Region, reconcile policy and CloudTrail evidence in both Regions,
and prove whole-path regional recovery. Otherwise the runtime and recovery
administration boundaries deny `kms:ReplicateKey` and deny creation or use of
Field Note keys where `kms:MultiRegion` is true. A later change requires a new
key plus a checkpointed re-encryption migration; a replica alone restores only
the decrypt primitive and is never described as service recovery. ([AWS
multi-Region key security](https://docs.aws.amazon.com/kms/latest/developerguide/mrk-when-to-use.html),
[multi-Region key properties](https://docs.aws.amazon.com/kms/latest/developerguide/multi-region-keys-overview.html),
[multi-Region key authorization](https://docs.aws.amazon.com/kms/latest/developerguide/multi-region-keys-auth.html),
[AWS Encryption SDK multi-Region keyrings](https://docs.aws.amazon.com/encryption-sdk/latest/developer-guide/configure.html))

Provider disk encryption remains defense in depth, but it does not create the
same database-role/dump boundary. Do not use Supabase Vault for athlete rows or
Supabase `pgsodium`/Transparent Column Encryption: Vault is a database secret
store with a decrypted SQL view, while Supabase now marks `pgsodium` pending
deprecation and does not recommend its server key management or transparent
column encryption because of operational complexity and misconfiguration risk.
PostgreSQL likewise notes that server-side column decryption briefly exposes the
key and plaintext to a database-system administrator. The selected envelope
protects database-only access and off-provider logical copies, not a compromise
of both the authorized application runtime and its KMS permission. It is not
client-held E2EE or zero knowledge. ([Supabase `pgsodium`](https://supabase.com/docs/guides/database/extensions/pgsodium), [Supabase Vault](https://supabase.com/docs/guides/database/vault), [PostgreSQL encryption options](https://www.postgresql.org/docs/18/encryption-options.html)) Exact health-adjacent notes remain excluded from analytics, logs, public search, remote push, and public publication projections.

### Public revisions and social graph

- `publication_candidates(id, owner_id, public_object_id nullable, object_type, pack_version_id nullable, frozen_projection, projection_digest, state, submitted_at)` in a private review schema; the projection is schema-validated, minimized, and frozen on submission
- `public_objects(id uuid-v4 server-generated, object_type, author_id, canonical_slug, current_revision_id, current_availability, created_at)`
- `public_object_revisions(id, public_object_id, revision_number, pack_version_id nullable, title, evidence_label, limitations, disclosure, published_at, supersedes_id)`; inserted only on approval and never updated
- `public_finding_revisions(public_revision_id pk, conclusion, bounded_question, observation_summary, interpretation, next_action)`
- `public_experiment_update_revisions(public_revision_id pk, bounded_question, update_stage, protocol_authority, selected_context, progress_summary, next_question)`; it contains no raw Field Note or interim conclusion, and no dose, target, eligibility, schedule, stop rule, or protocol payload is copied into a linked Experiment
- `public_research_note_revisions(public_revision_id pk, research_question, summary, applicability_boundary, uncertainty)`
- `public_practitioner_protocol_note_revisions(public_revision_id pk, authority_text, purpose, eligibility_text, protocol_summary, safety_boundary)`
- `public_open_question_revisions(public_revision_id pk, question, context, known_unknowns)`
- `public_pack_update_revisions(public_revision_id pk, guide_version_id nullable, update_kind, change_summary, applicability, action_required)`; official and human-reviewed, never an athlete protocol mutation
- `private_public_links(public_revision_id, private_owner_id, private_source_type, private_source_id, private_source_revision, projection_digest)` in a server-only schema unavailable to public/sync roles
- `public_revision_sources(public_revision_id, source_version_id, relation, evidence_label_at_publication)`
- `publication_reviews(id, publication_candidate_id, reviewer_id, decision, reason_code, notes_private, decided_at)`
- `public_revision_availability_events(id, public_revision_id, state, reason_code, actor_id, occurred_at, supersedes_id)`; availability changes without mutating revision content
- `public_profile_revisions(id, user_id, revision_number, display_name, bio, credential_summary_projection, affiliation_summary_projection, published_at)`
- `topics(id, stable_key unique, display_name, description, state)`
- `public_revision_topics(public_revision_id, topic_id)`
- `follows_people(follower_id, followed_user_id, created_at, removed_at)`
- `follows_topics(follower_id, topic_id, created_at, removed_at)`
- `follows_packs(follower_id, pack_id, created_at, removed_at)`
- `saves(user_id, target_type, target_id, created_at, removed_at)` limited by a database/application allowlist to public objects, Practice Guides, and Pack Versions
- `feed_entries(id, public_revision_id, author_id, pack_id nullable, published_at, availability)`
- `feed_entry_topics(feed_entry_id, topic_id)`
- `discussion_threads(id, public_revision_id, state, created_at)`
- `discussion_replies(id, thread_id, author_id, parent_reply_id nullable, depth, intent, current_revision_id, state, created_at)` with `depth in (0,1)`
- `reply_revisions(id, reply_id, revision_number, body, created_at)`
- `thread_follows(user_id, thread_id, created_at, removed_at)`

Follower and save counts may exist as private abuse/operations signals, but do not expose them or feed them into public ranking. Blocks remove the relevant people/content from both readers' projections where policy requires; private mutes affect only the muting reader.

### Moderation and operations

- `reports(id, reporter_id, target_type, target_id, category, description, created_at, status)`
- `moderation_cases(id, case_type, severity, state, assignee_id, opened_at, decided_at)`
- `moderation_case_targets(case_id, target_type, target_id)`
- `moderation_case_reports(case_id, report_id)`
- `moderation_actions(id, case_id, actor_id, action_type, scope, reason_code, starts_at, ends_at, supersedes_id)`
- `appeals(id, case_id, appellant_id, grounds, state, submitted_at, decided_at)`
- `appeal_decisions(id, appeal_id, reviewer_id, decision, reason_code, decided_at)`; reviewer cannot be the original decider for safety/credential appeals
- `audit_stream_heads(stream_key primary key, next_sequence, head_hash, updated_at)`
- `audit_events(id, stream_key, stream_sequence, occurred_at, actor_type, actor_id nullable, action, target_type, target_id, case_id nullable, reason_code, request_id, prev_hash nullable, event_hash)` with a unique constraint on `(stream_key, stream_sequence)`
- `audit_checkpoints(id, stream_key, through_sequence, event_count, head_hash, previous_checkpoint_digest, cutoff_at, signing_key_id, signing_algorithm, signature, storage_version_id, verified_at)`
- `operations_jobs(id, job_type, subject_type, subject_id, state, attempt, available_at, lease_generation, lease_until, checkpoint, last_error_code, idempotency_key)` and `operations_job_attempts(job_id, lease_generation, started_at, finished_at, outcome, error_code)`; checkpoints and attempt rows contain references/outcomes, never copied private payloads
- `sync_devices(id, owner_id, installation_public_id, platform, app_version, protocol_version, registered_at, last_seen_at, revoked_at)`
- `sync_commands(owner_id, device_id, command_id, command_type, command_schema_version, aggregate_type, aggregate_id, base_revision, payload_digest, state, result_sequence, rejection_code, received_at, completed_at)` with primary key `(owner_id, device_id, command_id)`
- `owner_sync_sequences(owner_id primary key, next_sequence)`
- `owner_change_events(owner_id, owner_sequence, entity_type, entity_id, entity_revision, operation, payload_schema_version, payload, occurred_at)` with primary key `(owner_id, owner_sequence)`
- `device_sync_cursors(owner_id, device_id, last_pulled_sequence, last_acked_sequence, updated_at)`
- `sync_protocol_versions(version primary key, minimum_app_version, read_compatible_until, released_at, retired_at)`

### Remaining relational operations inventory

These tables complete the cross-cutting v1 model; detailed behavior appears in later sections:

- `sources`, `source_versions`, `source_contributors`, `source_updates`, `source_statuses`, and `source_review_jobs` for DOI/provider snapshots and retraction/correction history;
- `storage_objects(id, owner_id nullable, purpose, bucket, opaque_key, observed_media_type, byte_size, checksum, backup_required, state, created_at, deleted_at)`, `storage_scan_results(object_id, scanner, result, scanned_at)`, and `storage_object_backups(object_id, provider, backup_key, provider_version_id, checksum, state, copied_at, verified_at, deletion_due_at, purged_at)`;
- `notification_preferences`, `notification_intents`, `notification_deliveries`, and `inbox_items` for local/remote policy and provider receipts;
- `billing_customer_refs(user_id, provider, provider_customer_id unique, state, created_at, deletion_requested_at nullable)` for one opaque provider identity per live product account; `entitlements(user_id, product_key, state, starts_at, expires_at, source, last_event_id)` and `billing_events(provider_event_id pk, user_id, event_type, occurred_at, processed_at, payload_digest)`;
- `data_rights_requests(id, user_id, request_type, scope, state, requested_at, completed_at, expires_at)`, `data_rights_tasks(request_id, task_type, target_type, target_id, state, attempt, last_error_code)`, and `export_artifacts(request_id, storage_object_id, manifest_digest, expires_at)`;
- `user_consents(id, user_id, consent_type, policy_version, decision, occurred_at, source)` and `privacy_policy_versions(version pk, effective_at, content_digest)`;
- `search_documents(document_type, document_id, public_revision_id nullable, language, weighted_vector, normalized_title, eligibility_state, updated_at)` with primary key `(document_type, document_id)`, plus normalized topic/Pack relations; it indexes only approved public projections, public profiles, Guides, Packs, and permitted source metadata;
- `moderation_sla_events(case_id, state, due_at, satisfied_at)` and `pack_pause_deliveries(pack_operational_state_id, channel, delivered_at, status)` for operations evidence;
- `analytics_daily_aggregates(day, environment, event_name, dimension_key, dimension_value, count, duration_bucket)` only after thresholding; no raw practice-content event table.

The append-only audit ledger is product data. Each authoritative action appends its canonical identifier/reason-code event and advances the stream head under one row lock in the same transaction. Runtime application and operations roles can append only through the narrow application boundary: they cannot update, delete, truncate, or own these tables. Supabase platform logs remain supporting operational evidence, not the appeal-readable history. Audit events contain identifiers and reason codes, never copied raw practice text or credential files.

An in-database hash chain is not independently tamper-evident against a database owner or superuser: PostgreSQL documents that superusers bypass all permission checks and that table owners normally bypass RLS. Before external moderation begins, a dedicated checkpoint job—not the public or operations runtime—must recompute the chain and produce a daily payload-free manifest containing only the stream, cutoff, event range/count, prior checkpoint digest, and head hash. It signs the canonical manifest digest with an asymmetric AWS KMS key in the separate AWS account, writes the manifest/signature to a dedicated versioned S3 bucket with Object Lock enabled, and applies governance-mode retention to that exact checkpoint version for the accepted finite period. The checkpoint writer can put a new version but cannot delete versions or bypass governance retention; application and operations roles have no signing or checkpoint-bucket access. A separate verifier checks chain continuity, the exact S3 version, and the signature every day and after a restore. ([PostgreSQL role attributes](https://www.postgresql.org/docs/current/role-attributes.html), [AWS KMS signing](https://docs.aws.amazon.com/kms/latest/APIReference/API_Sign.html), [S3 Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html))

This proves only that an authorized key signed an unchanged checkpoint and makes later database-history rewriting detectable within the stated checkpoint window; it does not prove that the original human decision was correct or resist a recovery-account principal deliberately granted governance-bypass permission. Describe the v1 guarantee as externally anchored tamper evidence, not immutability. Do not use compliance-mode Object Lock until a finite audit-retention schedule is accepted: AWS documents that even the root user cannot shorten or delete a compliance-locked version before expiry, which can conflict with the product's unresolved retention and deletion obligations. Checkpoints contain no actor, target, case, or raw-content payload.

## Local-first storage and conflict-aware sync

### Device store

Use Expo development builds with `expo-sqlite`, WAL, and SQLCipher enabled through native build configuration. Expo documents persisted SQLite storage, WAL, exclusive transactions, full-text search support, and SQLCipher for native iOS/Android builds; SQLCipher is not available in Expo Go. Expo's local-first guide also says SQLite is flexible but must be combined with other tools or product-owned tooling for a complete local-first solution. That responsibility is accepted here and bounded to the protocol below. ([Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/), [Expo local-first guide](https://docs.expo.dev/guides/local-first/))

Android's current compatibility contract requires every 64-bit native library
in an app targeting Android 15 or later to support 16 KB memory pages; Google
Play currently says non-compatible updates targeting API 35 or later cannot be
released from 2027-02-01. Correct AAB ZIP alignment, ELF segment alignment, and
runtime behavior are separate checks. SDK 57's current native-module map
resolves `expo-sqlite ~57.0.2`.
Expo's own changelog records generic Android 16 KB support in 15.2.13 and a
SQLCipher-specific fix in 16.0.9, both inherited by that line. The SDK 57 source
compiles its vendored SQLite/SQLCipher target with
`ANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON` and links the separately packaged
`openssl::crypto` native dependency. The fix replaced the OpenSSL dependency
with a 16 KB build, but the accepted pull request says no tests were run. This
materially strengthens the default adapter over the SDK 53 artifact report that
failed Play analysis on `libcrypto.so`; it does not certify the final app bundle
or every transitive library. The 57.0.2 changelog fixes an unrelated first-run
migration race, and neither it nor the SDK 57 release notes supplies a release
AAB plus SQLCipher lifecycle result on a 16 KB runtime. Zetetic likewise states
that modern SQLCipher for Android has supported 16 KB pages since 4.6.1, but
upstream capability does not certify Expo's packaging. Android still requires
inspection of the built bundle's ZIP alignment, every shared library's ELF
segments, and runtime testing in a 16 KB environment. ([Android 16 KB guidance](https://developer.android.com/guide/practices/page-sizes), [SDK 57 native-module map](https://github.com/expo/expo/blob/sdk-57/packages/expo/bundledNativeModules.json), [Expo `expo-sqlite` changelog](https://github.com/expo/expo/blob/sdk-57/packages/expo-sqlite/CHANGELOG.md), [Expo SDK 57 release notes](https://expo.dev/changelog/sdk-57), [SDK 57 Android build configuration](https://github.com/expo/expo/blob/sdk-57/packages/expo-sqlite/android/build.gradle), [SQLCipher-specific OpenSSL fix](https://github.com/expo/expo/pull/40781), [Expo SQLCipher artifact report](https://github.com/expo/expo/issues/39792), [Zetetic Android support boundary](https://www.zetetic.net/blog/2025/06/26/sqlcipher-for-android-16kb-page-size-support/))

The adapter also has a separate current lifecycle risk. Expo issue `#48999`
reproduces an Android teardown path in which multiple JavaScript wrappers can
share one cached native database binding and runtime release can close that
binding repeatedly. The SDK 57 and current `main` `NativeDatabase` sources
still call `ref.close()` unconditionally from `sharedObjectDidRelease()`, so a
later runtime can fail to reopen the same database and leave the local outbox
unavailable.

At the 2026-08-31 10:50 -03 final deadline source check, the issue remained
open and labelled `needs review`; it is assigned to maintainer Kudo. The
maintainer fix in `#49152` remains open, unmerged, Draft, and without a review,
with only a proposed E2E test in its test plan. Maintainer ownership and passing
bot/fingerprint checks increase the likelihood of an upstream fix, but do not
exercise release-runtime teardown, encrypted reopen, WAL continuity, or
exactly-once outbox continuation. The SDK 57 module map still resolves
`expo-sqlite ~57.0.2`, its package manifest identifies version 57.0.2, and the
current `main`
implementation still closes the shared native binding unconditionally. The
SDK 57 changelog says 57.0.2 contains only the unrelated first-run
`SQLiteStorage` migration-race fix, and the current `main` changelog has no
`#49152` lifecycle-fix entry. There is therefore no merged, released SDK 57
lifecycle fix to accept by version number or unreleased source state. This is
not evidence that the 16 KB build is wrong or that a different adapter is
already safer, but it makes a package version, unreviewed draft patch,
reporter-described workaround, or cold-start check insufficient release
evidence. The issue reporter's `useNewConnection: true` workaround recovered an
already poisoned process in 12 of 12 reported attempts, which is useful as a
fault-recovery test but does not prove that repeated release-runtime teardown
preserves one live database
binding or exactly-once outbox processing. Expo's SDK 57 reference documents
only that the option creates a new connection instead of reusing the cached
same-name connection; it does not document teardown safety, durable recovery,
or outbox continuity.
Expo also states that SQLCipher is unavailable in Expo Go and that standalone
apps run in production mode, which it specifically recommends for catching
production-only bugs. Those boundaries strengthen, rather than relax, the
release-shaped Gate 1 teardown/reopen/outbox proof; documented persistence
across restarts and `useNewConnection` behavior do not specify same-process
JavaScript-runtime teardown or exactly-once outbox continuity.
Gate 1 must repeatedly destroy and recreate the JavaScript runtime, reopen the
encrypted database, recover duplicate/stale native handles without replacing
the file, and continue WAL/outbox work exactly once. ([Android handle-lifecycle
defect](https://github.com/expo/expo/issues/48999), [draft maintainer
fix](https://github.com/expo/expo/pull/49152), [SDK 57 `NativeDatabase`
source](https://raw.githubusercontent.com/expo/expo/sdk-57/packages/expo-sqlite/android/src/main/java/expo/modules/sqlite/NativeDatabase.kt),
[current `main` `NativeDatabase`
source](https://raw.githubusercontent.com/expo/expo/main/packages/expo-sqlite/android/src/main/java/expo/modules/sqlite/NativeDatabase.kt),
[SDK 57 native-module
map](https://github.com/expo/expo/blob/sdk-57/packages/expo/bundledNativeModules.json),
[SDK 57 package
manifest](https://raw.githubusercontent.com/expo/expo/sdk-57/packages/expo-sqlite/package.json),
[SDK 57 `expo-sqlite`
changelog](https://github.com/expo/expo/blob/sdk-57/packages/expo-sqlite/CHANGELOG.md),
[current `main` changelog](https://raw.githubusercontent.com/expo/expo/main/packages/expo-sqlite/CHANGELOG.md),
[SDK 57 SQLite reference](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/),
[Expo development and production modes](https://docs.expo.dev/workflow/development-mode/))

Freeze the `PracticeLedger`/`SyncGateway` seam and this proof contract at
handoff, not the concrete `expo-sqlite` adapter or package version.

Gate 1 therefore builds the exact release-shaped Android AAB, verifies
`PAGE_ALIGNMENT_16K`, generates the release APK set from that same AAB, checks
every `arm64-v8a`/`x86_64` ELF load segment, and runs the encrypted
`PRAGMA cipher_version`, open/WAL/write/restart/wrong-key/migration, and repeated
runtime-teardown/reopen/outbox suite on a device or emulator where
`getconf PAGE_SIZE` returns `16384` and compatibility mode is not masking a
failure. Repeat the static and runtime proof after every Expo, NDK, SQLCipher,
OpenSSL, or other native dependency change. Keep `expo-sqlite` plus SQLCipher as
the provisional default; if the pinned path fails or no compatible upstream
lifecycle fix is available at the implementation freeze, first move to a
supported compatible Expo release and otherwise replace only the local
persistence adapter with a maintained, 16 KB-compatible SQLCipher build behind
the same `PracticeLedger`/`SyncGateway` contracts.
Never fall back to plaintext SQLite, silently drop Android encryption, or call
Android maintained/releasable while the artifact proof is failing.

Store the database encryption key in iOS Keychain/Android Keystore through SecureStore; SecureStore is for small encrypted key-value material, not the database itself. On iOS use the non-migrating `WHEN_UNLOCKED_THIS_DEVICE_ONLY` accessibility class and do not bind the database key to mutable biometric enrollment. This accepts foreground/unlocked access because correctness never depends on background sync. ([Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/), [Apple Keychain accessibility](https://developer.apple.com/documentation/security/restricting-keychain-item-accessibility)) Enable WAL after keying the database. Do not put Field Notes, refresh tokens, or credential evidence in AsyncStorage.

Do not treat platform backup as recovery for the live SQLite ledger. Android Auto Backup includes app databases by default, while Expo SecureStore excludes its Android values because the Keystore material is deleted on uninstall and restored values cannot be decrypted. On iOS, Keychain values may persist across reinstall and migratable accessibility classes can move to a new device, while app-container files are normally eligible for backup. That creates an asymmetric database-without-key restore on Android and an undeclared extra copy of private raw data on iOS. ([Android Auto Backup](https://developer.android.com/identity/data/autobackup), [Expo SecureStore persistence and backup](https://docs.expo.dev/versions/latest/sdk/securestore/), [Apple iCloud Backup guidance](https://developer.apple.com/documentation/foundation/optimizing-your-app-s-data-for-icloud-backup))

Complete v1 therefore configures and tests explicit native backup rules: exclude the SQLCipher database, `-wal`/`-shm` sidecars, local recovery staging, cached public data, session material, and SecureStore values from cloud backup, device-to-device transfer, and cross-platform transfer. On iOS, set and recheck `isExcludedFromBackup` on the dedicated application-support directory whenever it is created or moved; Apple documents this as guidance rather than a guarantee, so the privacy inventory must disclose the residual platform boundary. On Android, generate both current `data-extraction-rules` and legacy backup XML because `allowBackup=false` alone can still permit manufacturer device transfer. A fresh install authenticates and bootstraps synced canonical data from the server. A user-initiated encrypted local recovery export is the only supported transfer for pending unsynced work; it is stored only at the destination the athlete chooses and is never silently uploaded by the app.

That recovery artifact is a freshly encrypted SQLCipher snapshot, never a raw
copy of the live database and WAL/SHM files or a plaintext JSON/CSV staging
archive. During the explicit export action, the local write coordinator briefly
quiesces all local database writes, then creates a new destination database
under a distinct
random 256-bit recovery key, attaches it with an explicit SQLCipher `KEY`, and
uses `sqlcipher_export()` to copy schema and data. The exporter explicitly sets
and records `user_version`, because SQLCipher documents that
`sqlcipher_export()` does not transfer it; it then closes and reopens the
destination with the recovery key, runs cipher integrity and manifest/schema
checks, and computes a checksum before making the file shareable. Expo now
exposes SQLite's Online Backup API, which guarantees a consistent completed
snapshot, but its generic contract does not define the separate-key SQLCipher
artifact this privacy boundary needs; use it only after the encrypted-to-
encrypted key/cipher behavior passes the same artifact proof. ([Expo SQLite
backup API](https://docs.expo.dev/versions/latest/sdk/sqlite/), [SQLite Online
Backup API](https://www.sqlite.org/backup.html), [SQLCipher keyed export and
integrity API](https://www.zetetic.net/sqlcipher/sqlcipher-api/))

The recovery key is delivered separately to the athlete and is never embedded
in the archive, uploaded, logged, or retained by the product. Partial exports
stay in excluded recovery staging and are wiped after failure, cancellation, or
handoff. Import opens the artifact in quarantine, verifies key, checksum,
format, schema, owner binding, and supported migration path, and then merges
pending work through the ordinary local ledger and `SyncGateway`; it never
replaces a live database or bypasses server ownership, Pack, transition, or
conflict validation.

Local tables include:

- the current owner's complete private Practice/Library ledger and the exact Pack/Protocol/Tested Item versions it references;
- recent/cached public feed, saved items, canonical revisions, and source-status projections;
- sync mutations, rejections, conflicts, checkpoints, and local-only draft/recovery state;
- local reminder definitions derived from Try plans.

Never sync credential evidence files, private moderator notes, operations audit payloads, deletion jobs, server secrets, or another owner's raw records into the normal mobile database.

At startup, treat key/database mismatches as a recovery state, not a cue to generate a new key over an existing file. A stale key with no database is destroyed before a fresh ledger is created. A database that cannot be opened with the installed key is quarantined until the athlete chooses to discard it and bootstrap synced state; the app never claims it can recover unreadable unsynced rows. Sync Status visibly says that pending work exists only on this device and offers the encrypted recovery export without requiring sign-out.

On successful sign-out, wipe the local database and sidecars, local recovery staging, cached files, scheduled notifications, sessions, and the device key. If unsynced mutations exist, block the destructive sign-out until the athlete chooses one of: reconnect and sync, create an encrypted local recovery export, or explicitly discard the listed unsynced drafts. Never silently lose offline Field Notes.

### Online/offline capability contract

| Capability | Offline behavior |
|---|---|
| Create/edit Experiment, Try, Field Note, private Finding | Fully local, immediate, durable mutation state |
| Read Practice and Library | Complete owner cache; pinned Pack/Protocol versions retained |
| Local reminders | Scheduled and fired on device; rescheduled when Try changes |
| Read Feed/saves/public pages in app | Cached content only, clearly stale; canonical web naturally needs network |
| Save/follow | May queue as membership mutation; UI shows pending state |
| Publish, reply, report, credential submission, appeal | Draft can be local where useful, but submission is an explicit remote action with queued/sending/accepted/rejected state |
| Pack update/source retraction | Last known state is shown with “checked” timestamp; safety-dependent new guided use can require a fresh server check |
| Export/account deletion | Online only, reauthentication required, durable server job with status receipt |

### Narrow command/outbox protocol

The protocol has three endpoints in the versioned Next.js API surface:

- `POST /api/v1/sync/commands` accepts a bounded ordered batch of typed commands and returns one accepted, duplicate, conflicted, permanently rejected, or retryable result per command;
- `GET /api/v1/sync/changes?after={owner_sequence}&limit={n}` returns only the authenticated owner's canonical versioned change events and the next cursor;
- `POST /api/v1/sync/ack` records the device's durably applied sequence for operations visibility and later compaction, but acknowledgement does not authorize deletion of canonical practice history.

Every private local write is one SQLite transaction that changes the local read model and appends `local_outbox(command_id, command_type, schema_version, aggregate_type, aggregate_id, base_revision, payload, dependency_id, state, attempt, next_attempt_at)`. UUIDv7-compatible aggregate/command IDs are generated locally. The UI reads SQLite only; it never waits for a round trip to “make” a Field Note.

For a command containing Field Note free text, the plaintext remains inside the
SQLCipher transaction/outbox until upload. The server encrypts it before the
canonical row and owner change event are committed; the change event retains the
envelope, and the authenticated pull path decrypts only after deriving the owner.
Neither an encryption-provider outage nor an unknown envelope version may fall
back to a plaintext canonical event.

Upload path:

1. `SyncGateway` selects ready commands in creation order, preserving same-aggregate and explicit dependency order while batching independent aggregates.
2. The Next.js Route Handler verifies the Supabase session, derives `app_user_id`, validates the command envelope, and passes it to the application module. Submitted owner IDs have no authority.
3. One PostgreSQL transaction claims/reads the idempotency row, validates the exact Pack Version, row base version, transition, entitlement where applicable, and operational pause.
4. The transaction changes canonical relational rows, allocates the next owner-local sequence under the owner's `owner_sync_sequences` row lock, inserts one or more versioned `owner_change_events`, records product audit/notification job rows, and stores the command result.
5. A retry of `(owner_id, device_id, command_id)` returns the stored result without repeating effects. A transient failure leaves the local command ready for exponential retry with jitter.
6. A permanent validation rejection moves the local command to `rejected_recoverable` with its original payload and a stable user-facing reason; the scheduler continues with independent work. Dependent commands become `blocked_by_rejection` until the athlete edits/retries/discards the chain.

Download path:

1. The device requests events after its durable owner-local cursor. The API derives the owner and applies a fixed page limit; callers cannot select tables, columns, users, or arbitrary filters.
2. The client validates event and payload schema versions, applies the whole page to SQLite, updates local canonical/read rows, reconciles matching optimistic rows, and advances its cursor in one transaction.
3. Replaying a page is harmless because `(owner_id, owner_sequence)` and entity revision are idempotent. A gap, unknown required schema, or digest mismatch stops application and triggers a recoverable resync instead of skipping data.
4. The client acknowledges only after commit. Push and pull repeat on app foreground, connectivity restoration, explicit refresh, and bounded background opportunities; correctness never depends on background execution.

Keep owner change events for complete v1 rather than prematurely compacting them. The expected one-athlete structured record is small, the log simplifies new-device bootstrap and deletion/export evidence, and retaining it avoids an inconsistent multi-page snapshot protocol. Event payloads use the same private retention and deletion policy as their source record and are purged during account deletion. Add compaction/snapshot manifests only after measured row/transfer evidence, behind the unchanged cursor interface.

Public feed/search content is not mixed into this private owner log. It uses separately versioned cache endpoints with ETags/keyset cursors; saves/follows still return the owner's canonical membership change through the private log.

### Conflict policy by data type

Do not apply one generic “last write wins” rule:

- **Independent inserts:** Experiments, Tries, new Field Notes, and new Finding revisions created on different devices merge naturally by client ID.
- **Edits to the same private record:** submit `base_revision`. If it differs from the server current revision, preserve both and create `private_record_conflicts`; the athlete selects/merges. Never discard free text or safety-relevant deviation data.
- **Append-only versions:** released Pack Versions, Protocol Versions already used, public revisions, credential decisions, moderation actions, replies' revisions, and audit events are never edited in place.
- **Membership sets:** follows, saves, thread follows, and mutes use idempotent add/remove operations with a server sequence/tombstone; a retry has the same result.
- **Deletes:** a server tombstone prevents resurrection. An unsynced edit discovered after deletion is retained as a local recovery copy and requires an explicit athlete decision.
- **Publication/moderation:** the server is authoritative. A private Finding can change offline, but an already submitted public projection is immutable; the athlete submits a new revision.
- **Pack/Protocol upgrades:** never a merge. The athlete explicitly creates/selects a new Protocol Version or clones an Experiment against a new Pack Version after reviewing differences.

Use server sequence/version counters, not device wall clocks, for conflict decisions. Test every policy with two devices, reordered uploads, retries, partial failure, long offline periods, schema upgrades, and deleted accounts.

### Sync proof gate

Before feature construction, prove on two physical/simulated devices:

1. SQLCipher reports a supported `PRAGMA cipher_version`, opens across app and
   JavaScript-runtime restarts, fails with the wrong key, handles missing/stale
   key and database combinations without overwriting a potentially recoverable
   file, and repeatedly recovers duplicate/stale native handles while preserving
   WAL and outbox continuity.
2. An offline Field Note survives termination, upgrades, and a delayed retry.
3. Two devices editing the same note preserve both variants and resolve deterministically.
4. A permanently invalid mutation becomes a visible rejection without blocking later uploads.
5. Owner-scoped commands/change-feed requests cannot write or read another user's rows through guessed IDs, cursors, device IDs, or changed request parameters.
6. The change serializer's allowlist excludes credential evidence, moderator notes, report text, deletion internals, secrets, and raw data from any other owner.
7. Pack schema migration leaves records pinned to old versions and permits the new version side by side.
8. iOS and Android cloud/device-transfer restore fixtures contain no database, WAL/SHM sidecar, recovery staging, session, or key; wipe/logout/account deletion removes those same local artifacts and scheduled notifications.
9. The release-shaped Android AAB requests 16 KB ZIP alignment, every bundled
   64-bit native library has compatible ELF load-segment alignment, and the
   SQLCipher lifecycle suite passes on a 16 KB Android runtime with page-size
   backcompat explicitly disabled and no plaintext fallback. On Android 17,
   use the documented fatal backcompat-off setting so an incompatible binary
   aborts instead of producing a false pass; on earlier test images, disable
   backcompat and verify that the package is not running under it.

The product-owned protocol is accepted only if this proof includes crash/retry fault injection, schema-compatibility fixtures, and an independent privacy review of every change serializer. The strongest contingency is PowerSync owning managed SQLite, source-to-client bootstrap/checkpoints, and network retry while the product backend keeps typed write authorization and validation. Current official documentation strengthens that read-side case: PowerSync snapshots an allowlisted source publication into durable bucket storage, streams later changes by CDC, resumes interrupted initial or incremental transfer, validates checkpoints/checksums, and applies only complete checkpoints; its React Native/Expo adapter supports SQLCipher. That would remove real sequence, resume, checksum, and initial-snapshot engineering. ([PowerSync Service](https://docs.powersync.com/architecture/powersync-service), [protocol](https://docs.powersync.com/architecture/powersync-protocol), [client encryption](https://docs.powersync.com/client-sdks/advanced/data-encryption))

It does not replace this product's command semantics. PowerSync queues generic
`PUT`/`PATCH`/`DELETE` operations and calls developer-owned `uploadData`; the
queue is blocking FIFO, and the client does not advance to a new downloaded
checkpoint until every queued mutation is acknowledged. An acknowledged
permanent rejection defaults to rolling the optimistic row back to server
state. PowerSync now documents server-side conflict recording and syncing both
variants back for human resolution, which proves the preservation model is
possible but also confirms that the backend, recovery record, and UI remain
application work. Its current error guidance makes the tradeoff explicit: leave
an unexpected mutation unacknowledged to preserve order and the FIFO plus
checkpoint stop, or persist it in a server-side dead-letter/conflict record and
acknowledge it, accepting that later independent writes may arrive out of
order. It discourages a client-only dead-letter queue because the retained
operation is not readily inspectable or necessarily sufficient for useful
recovery. Continuing independent work after a permanent rejection therefore
still requires the product to preserve the original typed payload, command
identity, and stable rejection reason in the same synchronous server
transaction that acknowledges it, sync that rejection/conflict record back,
and prove that the client can apply the later checkpoint without hiding or
discarding the athlete's recoverable copy.
Idempotency, Pack validation, base-revision conflicts, tombstones, and
server-authoritative transitions remain product code. PowerSync's local store
also retains JSON-backed row state plus operation history for checkpoints, so
device storage, encrypted recovery, wipe, and private-data inventory proof must
cover its managed internal tables rather than only application-facing views.
([PowerSync client architecture](https://docs.powersync.com/architecture/client-architecture),
[PowerSync consistency](https://docs.powersync.com/architecture/consistency),
[validation errors](https://docs.powersync.com/handling-writes/handling-write-validation-errors),
[custom conflicts](https://docs.powersync.com/handling-writes/custom-conflict-resolution))

Neither current checkpoint escape hatch changes that decision. Priority `0`
lets selected **download** buckets apply despite pending uploads, but PowerSync
warns that this can expose out-of-order updates, flicker, stale deletes, and
weaker full-consistency boundaries; it is not an upload-priority or selective
acknowledgment mechanism for mutable Field Notes or Pack-governed transitions.
Checkpoint Requests can prove that requested source state has reached a client,
and the current source-built React Native API reference now exposes alpha
`requestCheckpoint()`, request-mode, and custom checkpoint-request surfaces.
That strengthens explicit catch-up observability, but current official release
material still lists published React Native SDK v2.1.0 without released
checkpoint-request support; its added feature is attachment transport, while
official Checkpoint Requests support remains opt-in, Swift-first, and in
progress for JavaScript. The live React Native integration still exposes the
same developer-owned `uploadData()`
queue, and the current error guidance still retries a thrown error from the
queue head indefinitely. Its source-built `getCrudTransactions()` iterator can
expose multiple queued transactions for batching, but completing a later
transaction marks it **and every prior emitted transaction** complete; it is
not selective acknowledgement of a rejected head item. The backend can
acknowledge a permanent failure and preserve it in a synchronously committed
recovery/dead-letter row, but that is the product's typed recovery protocol
and may allow later operations to arrive out of order; it is not a
vendor-supplied selective-acknowledgement path. Checkpoint Requests also
explicitly retain the rule that no checkpoint is applied while local
writes await upload. It is therefore not a complete-v1 React Native
rejection-recovery control. ([PowerSync React Native SDK](https://docs.powersync.com/client-sdks/reference/react-native-and-expo),
[client upload behavior](https://docs.powersync.com/configuration/app-backend/client-side-integration),
[write-validation errors](https://docs.powersync.com/handling-writes/handling-write-validation-errors),
[current product updates](https://releases.powersync.com/), [PowerSync
prioritized sync](https://docs.powersync.com/sync/advanced/prioritized-sync),
[Checkpoint Requests alpha](https://releases.powersync.com/announcements/sync-catch-up-with-checkpoint-requests-alpha),
and [React Native source-built API](https://powersync-ja.github.io/powersync-js/react-native-sdk/globals))

PowerSync Cloud materially strengthens the contingency's region and exit story,
but not enough to select it before Gate 1. A Cloud instance can be placed in
Brazil, and PowerSync identifies that deployment as AWS `sa-east-1`. That is a
real hosted-compute choice, not an exclusive-residency guarantee: the current
DPA authorizes cross-border transfer and processing where listed subprocessors
operate for service continuity and optimization, and the subprocessor list says
every listed processor may be granted Customer Data while listing US-based
product-analytics processors. The DPA also covers synchronization, replication,
hosting, transient caching/logging, support, debugging, and service improvement.
([Cloud regions](https://docs.powersync.com/configuration/powersync-service/cloud-instances),
[AWS region map](https://docs.powersync.com/configuration/source-db/private-endpoints),
[DPA](https://powersync.com/legal/powersync-data-processing-addendum-dpa-gdpr.pdf),
[subprocessors](https://powersync.com/legal/subprocessors))

Cloud bucket storage holds a current replicated copy, parameter lookup data,
and an accumulating operation history. The DPA requires return or deletion on
termination at the customer's instruction, but expressly excludes archival and
backup files except under unpublished internal deletion practices or applicable
law; the public contract therefore still supplies no time-bounded bucket,
archive, or backup purge schedule for this private ledger. PostgreSQL access
also requires logical replication; the documented role bypasses RLS and reads
every update in the publication even when a row is absent from Sync Streams.
Explicit per-table publication and matching `SELECT` grants narrow the boundary
but create a second authorization and private-data allowlist that must be
reviewed independently. ([hosted data](https://docs.powersync.com/resources/usage-and-billing/usage-and-billing-faq),
[source access](https://docs.powersync.com/configuration/source-db/setup),
[DPA](https://powersync.com/legal/powersync-data-processing-addendum-dpa-gdpr.pdf))

The tier and exit contracts also argue against selecting by convenience. Pro
starts at $49/month but has no uptime guarantee or service-version locking;
Team starts at $599/month and adds a 99.9% uptime commitment, version locking,
customer-provided bucket storage, private endpoints, and longer log retention.
The commercial terms allow subscription termination on written notice unless
an Order Form says otherwise, but use rights end immediately. PowerSync does
document a credible technical exit from Cloud to self-hosting: keep the source
database and equivalent configuration, resolve the endpoint through the
product API, switch endpoints, and let clients atomically perform a full
resync while existing local reads remain available. That avoids a proprietary
data export, but still requires a release-shaped endpoint-switch/full-resync
drill and a production self-hosted service before termination. ([pricing](https://powersync.com/pricing),
[commercial terms](https://powersync.com/legal/commercial-license-and-services-agreement),
[instance migration](https://docs.powersync.com/maintenance-ops/self-hosting/migrating-instances))

Decision: retain the product-owned protocol as the default and make the
contingency acceptance test narrower, not easier. Invoke a PowerSync spike only
if the custom adapter fails the Gate 1 fault proof. The spike must use the same
synchronous typed backend boundary, encrypted-device and sign-out rules,
owner-isolation/conflict/rejection fixtures, and explicit publication/role
allowlist; it must also pass processor, region and cross-border processing,
retention/subprocessor/deletion, chosen-tier, and pre-termination exit review.
Select it only if it materially outperforms the custom adapter and that
additional private-data boundary is accepted. Self-hosting avoids the Cloud
processor boundary but adds a stateful sync service, bucket storage,
high-availability deployment, compaction, migration, and monitoring burden
without removing product-owned conflict policy. ([self-hosting deployment](https://docs.powersync.com/maintenance-ops/self-hosting/deployment-architecture))

## Authentication, sessions, and entitlements

### Authentication

Use Supabase Auth with email one-time codes for consumer login/signup. Supabase supports email OTP/magic-link flows and JWTs integrated with RLS. Its default SMTP service is explicitly best-effort and not for production, so complete v1 uses custom SMTP. Resend is the provisional adapter because both providers document the integration, but entering `smtp.resend.com` credentials is not the production acceptance test. ([Supabase Auth](https://supabase.com/docs/guides/auth), [email passwordless login](https://supabase.com/docs/guides/auth/auth-email-passwordless), [production SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Resend Supabase SMTP](https://resend.com/docs/send-with-supabase-smtp))

Before any external account depends on email OTP, create a dedicated
authentication sending subdomain and From address in an auth-only Resend team,
verify SPF and DKIM, add DMARC, and keep open/link tracking disabled. The OTP
template contains only the short-lived code and fixed account-access copy: no
profile, Practice, Pack, health-adjacent, Field Note, or other user content and
no marketing. A sending subdomain isolates reputation from the root domain but
does not isolate Resend's team-wide suppression list or per-team rate pool; any
future marketing or other product mail uses a separate provider/team boundary.
Record and load-test the actual intersection of Supabase's configurable Auth
email/OTP/resend limits and Resend's current team quota/rate limit rather than
copying provider defaults into product logic. Keep CAPTCHA and the product's
generic anti-enumeration response, per-address/IP abuse controls, and visible
resend cooldown in front of that provider capacity. ([Resend domain
verification](https://resend.com/docs/dashboard/domains/introduction), [Supabase
Auth-email deliverability](https://resend.com/docs/knowledge-base/how-do-i-maximize-deliverability-for-supabase-auth-emails), [Supabase SMTP and abuse
controls](https://supabase.com/docs/guides/auth/auth-smtp), [Resend quotas and
limits](https://resend.com/docs/knowledge-base/account-quotas-and-limits))

SMTP handoff and mailbox delivery are different states. A successful Auth
request means at most that the configured SMTP path accepted the message;
Resend's `email.sent` means it will attempt delivery, and `email.delivered`
means the recipient mail server accepted it, not that the code reached the
inbox or the person. Ingest `email.delivered`, `email.delivery_delayed`,
`email.failed`, `email.bounced`, `email.complained`, and `email.suppressed`
through a raw-body-signature-verified webhook. Deduplicate on `svix-id`, allow
retry/replay and out-of-order delivery, and retain only provider event/email ID,
event type/time, environment, and a keyed recipient lookup for the accepted
operational-retention period; discard recipient plaintext after lookup and do
not retain subject, body, OTP, or open/click data. These events drive support,
suppression state, deliverability counters, and alerts only; they never create
an account, verify a code, reveal account existence, or authorize a session.
Do not automatically unsuppress an address until the hard-bounce or complaint
cause has been resolved. ([Resend event
types](https://resend.com/docs/webhooks/event-types), [webhook
verification](https://resend.com/docs/webhooks/verify-webhooks-requests),
[webhook retries](https://resend.com/docs/webhooks/retries-and-replays), and
[suppressions](https://resend.com/docs/dashboard/emails/email-suppressions))

The production SMTP password is a Resend API key. Use a separate
`sending_access`, domain-restricted key per environment, store it only in the
Supabase Auth configuration and encrypted recovery-configuration inventory,
and rotate by overlapping old/new keys, proving the new key, then revoking the
old one. Resend keys have no automatic expiry. A separate signed-webhook secret
belongs only to the webhook runtime; neither secret enters mobile, source
control, logs, or a general Vercel environment. ([Resend API-key
permissions](https://resend.com/docs/dashboard/api-keys/introduction), [key
rotation](https://resend.com/docs/knowledge-base/how-to-handle-api-keys))

Selecting Resend's São Paulo sending Region controls routing, not data
residency. Resend currently stores account data, email metadata, logs, API
records, message content, delivery events, and metrics in the United States;
Free, Pro, and Scale retain email data for 30 days. Its DPA treats recipient
address, metadata, and message content as processed personal data and provides
deletion within 90 days after account termination. Turning off message-content
storage is a paid add-on with account-age, website, volume, and bounce-rate
prerequisites, so it is not an initial-v1 assumption. Gate 0 must accept and
document that US processor, DPA/subprocessor, transfer, 30-day message-data,
and termination-deletion boundary or reject Resend before production. ([Resend
Regions](https://resend.com/docs/dashboard/domains/regions), [data
retention](https://resend.com/docs/knowledge-base/account-quotas-and-limits),
[DPA](https://resend.com/legal/dpa), [message-storage
control](https://resend.com/docs/knowledge-base/how-do-i-ensure-sensitive-data-isnt-stored-on-resend))

Complete v1 keeps SMTP plus a rehearsed manual standby-provider switch as the
smaller failure boundary. A timeout, bad credential, unverified domain, quota,
provider pause, suppression, or downstream mailbox failure returns only a
generic retryable state and non-email-dependent support path; it never triggers
an unbounded client retry or disables confirmation. Supabase recommends a
standby SMTP service and exposes the Send Email Auth Hook for provider API,
queue, or automatic multi-provider control. That is a real stronger option for
a numeric access RTO, but Supabase's current feature inventory still labels
Auth Hooks Beta; enabling the Send Email Hook replaces SMTP rather than wrapping
it in a managed fallback. Its HTTP request must complete within five seconds and
propagates errors or timeouts into Auth, while its payload gives the
product-controlled function the user and live token/hash material. Secure Email
Change can require two messages, and the documented backward-compatible
`token_hash_new`/`token_hash` mapping is intentionally opposite the apparent
recipient naming. Complete v1 therefore does not widen the authentication-secret
and correctness boundary merely to automate standby delivery. Delay the hook
until a numeric access RTO justifies it; then prove signed-hook verification,
stable provider idempotency, five-second and cold-start behavior, timeout
ambiguity, exact action/template and dual-email mapping, payload/log
minimization, and failover without sending multiple live codes. ([Supabase SMTP
failure guidance](https://supabase.com/docs/guides/auth/auth-smtp), [Auth Hooks
stage](https://supabase.com/features/auth-hooks), [Auth Hook runtime
contract](https://supabase.com/docs/guides/auth/auth-hooks), [Send Email Auth
Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook))

Keep the provider's consumer request-code, verify-code, refresh, and logout
operations behind narrow versioned `apps/web` endpoints. The server uses the
current environment's Supabase URL and publishable key and never uses an admin
credential to impersonate the athlete. The mobile binary therefore calls the
stable owner-controlled product API and does not embed a project-scoped
Supabase URL, publishable key, or direct Auth client configuration. Supabase
still owns the Auth subject and session, while the product façade owns explicit
signup versus login semantics, anti-enumeration behavior, and provider
portability.

Persist only the current refresh token in a device-only, unlocked SecureStore
item. Keep the short-lived access JWT and expanded session object in process
memory; they do not need to survive a restart because private offline work reads
SQLCipher without an online session. When authenticated server work is needed
without a valid in-memory access token, the app sends the refresh token only to
a non-cacheable product refresh endpoint. That handler creates a request-scoped,
non-persistent Supabase client, exchanges the token, and returns the new pair.
The app permits one refresh in flight per installation, durably replaces the
SecureStore refresh token before releasing waiting authenticated requests, and
then discards the prior token. Tokens never enter SQLite, an outbox, a URL,
logs, crash reports, or analytics. A SecureStore write failure leaves the app
offline/authentication-required rather than continuing with ambiguous state.

Supabase refresh tokens are normally single-use, but the service documents a
default ten-second reuse interval and a parent-token recovery path for a client
that did not receive or persist the preceding response. Those exceptions make a
lost response or process death recoverable; they do not authorize parallel
refresh calls or indefinite retries. An invalid token outside that documented
recovery path clears only session material and requires a fresh email code—the
encrypted Practice ledger remains intact. Expo warns that large SecureStore
values may be rejected and that iOS Keychain items can survive app uninstall,
so v1 never stores the full serialized session there and clears any inherited
refresh token when the application container/installation marker is new or the
local ledger is absent. ([Supabase sessions](https://supabase.com/docs/guides/auth/sessions), [Supabase server-session guidance](https://supabase.com/docs/guides/auth/server-side/advanced-guide), [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/))

Every environment exposes a monotonically increasing provider generation from
the unauthenticated product bootstrap endpoint. A replacement-project cutover
increments it. The app preserves its encrypted offline Practice ledger but
discards the old provider access/refresh session and requires a new email code
before sync or other authenticated server work. Do not import or escrow a JWT
signing private key merely to preserve sessions across disaster recovery; a
forced reauthentication is the smaller and safer v1 contract.

Passkeys are the strongest current alternative to routine email-code sign-in.
Apple describes them as relying-party-bound public-key credentials that resist
phishing, while FIDO classifies email OTP as phishable and warns that an
email-OTP fallback or recovery path can bypass passkey protection. As of the
handoff date, Supabase's current implementation
materially strengthens the future path: discoverable WebAuthn sign-in, user
list/rename/delete, administrative revocation, and two-step native ceremony
endpoints are documented across current JavaScript, Flutter, and Swift clients.
However, Supabase still labels the platform release Beta and the live guide and
client references Experimental, require explicit opt-in, and say the API may
change without notice. The Auth changelog records post-launch request/response
shape changes, CAPTCHA, and later AAL-enforcement and soft-deletion fixes, while
the current entries reviewed through 2.195.0 contain no GA promotion. Those are
welcome hardening changes, not a stable complete-v1 contract. Registration also
requires an already confirmed user, and changing the relying-party ID
invalidates every enrolled credential. ([Apple
passkeys](https://developer.apple.com/passkeys/), [FIDO passkey deployment
risks](https://fidoalliance.org/wp-content/uploads/2025/03/Passkeys-The-Journey-to-Prevent-Phishing-Pt2.pdf),
[Supabase passkey
Beta](https://supabase.com/changelog/46458-passkeys-for-supabase-auth-beta),
[Supabase passkeys](https://supabase.com/docs/guides/auth/passkeys), [Supabase
Auth changelog](https://github.com/supabase/auth/blob/master/CHANGELOG.md))

Supabase's native two-step API only supplies and verifies WebAuthn ceremony data; the Expo app must provide the platform integration in a development build. iOS requires Authentication Services plus a `webcredentials` associated-domain entitlement and matching `apple-app-site-association` file. Android requires Credential Manager plus a matching Digital Asset Links file tied to the package and signing-certificate fingerprint, while Supabase must allow the corresponding `android:apk-key-hash` origin. These release identities and an owner-controlled relying-party domain—not a provider project host or preview domain—therefore become long-lived authentication infrastructure. ([Supabase native ceremony](https://supabase.com/docs/guides/auth/passkeys#two-step-api), [Expo native-code boundary](https://docs.expo.dev/workflow/customizing/), [Apple passkey configuration](https://developer.apple.com/documentation/authenticationservices/connecting-to-a-service-with-passkeys), [Android Credential Manager prerequisites](https://developer.android.com/identity/credential-manager/prerequisites))

Decision: retain email OTP as the explicit complete-v1 signup, login, and recovery contract; do not enable Supabase's experimental passkey support in production or describe the account as phishing-resistant. Keep product identity stable in `app_users` rather than binding ownership to one authentication method. Reconsider passkey-primary authentication only after the provider contract is stable; release-shaped Expo builds prove iOS and Android registration, sign-in, cancellation, cross-device, and reinstall ceremonies; the permanent relying-party domain, native associations, origins, package, and signing identities are accepted; at least two independent credentials can be enrolled, listed, renamed, and selectively revoked; and lost-all-credentials recovery plus sensitive-action reauthentication cannot silently downgrade an enrolled account to email OTP. If passkeys are later added while email remains an unrestricted fallback, describe them only as a stronger routine sign-in option, not end-to-end phishing resistance.

Complete v1 does not add Sign in with Apple merely because the app has an
account. Apple's current Guideline 4.8 requires an equivalent privacy-preserving
login when a third-party or social service establishes or authenticates the
user's primary app account, but expressly exempts an app that exclusively uses
its own account setup and sign-in system. Email OTP through the product-owned
account flow remains that sole primary login. ORCID documents separate sign-in
and local-account-linking uses; if authorized later, this product permits only a
user-initiated connection after recent product-account authentication, and an
ORCID callback can neither create an `app_user` nor mint a product session. If
ORCID, Google, Apple, or any other provider is later allowed to establish or
authenticate the primary account, reopen the Guideline 4.8, recovery, account-
merging, deletion, privacy, and cross-platform decision before implementation.
([Apple App Review Guideline 4.8](https://developer.apple.com/app-store/review/guidelines/#login-services), [ORCID OAuth sign-in and account-linking guidance](https://info.orcid.org/documentation/integration-guide/orcid-oauth-sign-in-guidelines/))

Controls:

- present explicit Sign up and Log in routes: Sign up permits account creation only after the user chooses it and accepts current terms; Log in uses the provider's no-auto-create option (for Supabase email OTP, `shouldCreateUser: false`) so an unknown email cannot create an account by accident;
- generic login response, rate limits and abuse controls, short OTP lifetime, resend cooldown, and no account-existence disclosure;
- one current refresh token in device-only SecureStore, memory-only access JWTs, serialized rotation, `private, no-store` auth responses, and explicit stale-token cleanup on reinstall/provider-generation change; never persist a full session blob;
- `auth.users` is an authentication subject store; product `app_users` supplies stable lifecycle/ownership identity;
- server derives ownership from the verified subject; RLS is defense in depth, not the only check;
- device/session list with revoke, token refresh rotation, and immediate revoke on account deletion or moderator suspension;
- recent reauthentication for email change, credential evidence access, export, scoped destructive deletion, and account deletion;
- mandatory shorter administrative sessions for every moderator, Pack reviewer, credential/affiliation reviewer, appeal reviewer, and operator who can inspect or execute a privacy job.

Privileged operations standardize on Supabase App Authenticator TOTP as the
only eligible complete-v1 second factor. Phone MFA remains disabled for the
operations population, so a factor-agnostic `aal2` claim cannot be satisfied
through that weaker fallback. Experimental passkeys remain outside the v1
operator contract under the consumer-authentication decision above.
Before a `product_roles` grant becomes active, the operator enrolls and verifies
a primary TOTP factor plus a separately held backup TOTP factor; Supabase does
not provide recovery codes but supports multiple factors. Phone MFA is not a
recovery path: Supabase warns about SIM-swap exposure, NIST classifies PSTN
out-of-band authentication as restricted, and the provider currently charges a
separate add-on plus messaging cost. ([Supabase TOTP](https://supabase.com/docs/guides/auth/auth-mfa/totp), [Supabase MFA factor support](https://supabase.com/docs/reference/javascript/auth-mfa), [Supabase phone MFA security](https://supabase.com/docs/guides/auth/auth-mfa/phone), [Supabase phone MFA cost](https://supabase.com/docs/guides/platform/manage-your-usage/advanced-mfa-phone), [NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html))

The operations UI may redirect an `aal1` session into the TOTP challenge, but
that is recovery UX, not enforcement. Each protected server request validates
the user with the Auth server rather than trusting `getSession()` or decoding an
unverified token, asks Supabase for the current and next AAL, verifies that an
active TOTP factor still exists, requires a `totp` JWT `amr` entry, and passes
the resulting actor/auth context to the application transaction. The low-volume
operations boundary accepts this network check. Restrictive `aal2` RLS policies
protect any directly exposed operations table/function as defense in depth;
the narrow server database role still performs the same application check
because privileged/service roles can bypass RLS. Product roles, case scope,
dual control, and audit provenance remain independent product data and never
come from editable Auth metadata.

Supabase `aal2` means a conventional login plus an MFA factor; it is not
credential verification, external identity assurance, or proof that the factor
was presented for the current action. TOTP and other manually entered OTPs are
not phishing-resistant under NIST guidance. Complete v1 therefore makes no
formal NIST AAL2 or phishing-resistance claim, keeps shorter operations
sessions and the existing recent-reauthentication requirements, and leaves a
future stable WebAuthn/passkey migration open rather than weakening the TOTP
floor. ([Supabase JWT claims](https://supabase.com/docs/guides/auth/jwt-fields), [NIST authentication assurance levels](https://pages.nist.gov/800-63-4/sp800-63b/aal/), [NIST phishing-resistance boundary](https://pages.nist.gov/800-63-4/sp800-63b.html#phishing-resistance))

ORCID is not a complete-v1 primary login or credential-verification mechanism.
Although ORCID OAuth can support either sign-in or account linking, this
architecture allows only the post-login linking flow described above. Its
Public API terms restrict it to non-commercial use; a revenue-generating
premium product must obtain and document the applicable ORCID membership/license,
required integration review, and issued Production Member API credentials before
OAuth/API integration. Until then, an ORCID iD can be
shown only as an unverified user-supplied claim if product/legal policy allows,
clearly labeled as such. ([ORCID Public API terms](https://info.orcid.org/public-client-terms-of-service/), [ORCID API features](https://info.orcid.org/documentation/features/public-api/))

### Premium entitlement

Use App Store auto-renewable subscriptions and model access as server-canonical `entitlements(user_id, product, state, starts_at, expires_at, source, last_event_id)`. Apple requires in-app purchase for unlocking digital app functionality under its review guidelines. ([App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/))

Put RevenueCat behind `Entitlements` to handle StoreKit receipt/event complexity and restoration across later platforms. Entitlement is a service-capability boundary, not an athlete-data custody boundary. Store literal server states `active`, `grace`, `billing_retry`, `expired`, `revoked`, and `unknown`; only `active` and `grace` authorize a new paid capability. This matches Apple's StoreKit contract: `subscribed` and `inGracePeriod` are entitled, while `inBillingRetryPeriod`, `expired`, and `revoked` are not. ([Apple renewal states](https://developer.apple.com/documentation/storekit/product/subscriptioninfo/renewalstate), [Apple subscriptions](https://developer.apple.com/app-store/subscriptions/))

Freeze the RevenueCat project to **Transfer to new App User ID** for production
and its release-test sandbox. The setting is project-wide and also governs a
new purchase when the device receipt is already attached to another identified
customer. `Keep with original App User ID` would strand an active Apple
subscription after its deleted product account can no longer sign in;
`Transfer if there are no active subscriptions` rejects that exact case; and
legacy sharing merges identities and purchase history. A transfer changes only
which live provider identity receives the store entitlement. It never transfers
or reconstructs an Experiment, Field Note, Finding, profile, public revision,
or other product record. ([RevenueCat restore
behavior](https://www.revenuecat.com/docs/projects/restore-behavior))

The server creates a separate CSPRNG-backed UUIDv4
`billing_customer_refs.provider_customer_id` for each live product account.
Never use email, handle, Supabase Auth subject, a deleted-account identifier, or
another guessable/business identifier. Configure the SDK only after product
authentication and always with that custom ID; v1 has no anonymous RevenueCat
customer or pre-account purchase path. Do not call RevenueCat `logOut()`, which
creates an anonymous identity. After product sign-out or while account deletion
runs, the app accepts no SDK-derived entitlement and exposes no purchase or
restore call. When another authenticated product account becomes current,
switch directly with `logIn(new_custom_id)` before reading `CustomerInfo`.
RevenueCat documents that non-anonymous-to-non-anonymous login switches rather
than merges identities. ([RevenueCat customer
identity](https://www.revenuecat.com/docs/customers/identifying-customers))

Expose Restore Purchases only as an athlete-triggered action. Do not call
`syncPurchases()` automatically in the ordinary launch/login flow: RevenueCat
warns that it can transfer or alias a purchase without the user's explicit
restore action. After restore, refresh provider-canonical state and require the
new provider reference to hold the entitlement; provider events remain hints,
not authorization transitions. ([RevenueCat restoring
purchases](https://www.revenuecat.com/docs/getting-started/restoring-purchases))

Apple's Billing Grace Period is one app-wide configuration, not a per-product
setting. The complete-v1 default catalog therefore uses monthly and/or yearly
products, not weekly or monthly-with-12-month-commitment products. Gate 0 still
freezes the exact product IDs, which of those terms ship, free or introductory
offer transitions, and one app-wide tuple: 3, 16, or 28 days; `All Renewals` or
`Only Paid to Paid Renewals`; and sandbox-only before production plus sandbox.
The production mapping is 3 days for a weekly subscription when 3 is selected
and only 6 days when 16 or 28 is selected, while monthly and yearly products
receive the selected 3, 16, or 28 days. `All Renewals` includes a free-to-paid
renewal, while `Only Paid to Paid Renewals` excludes a subscription currently
in a free period. A weekly product is a Gate 0 exception only after its
commercial rationale, shorter 3/6/6-day production grace, and additional test
matrix are accepted; Apple does not prohibit it, but RevenueCat cannot turn it
into the longer app-wide grace selected for monthly/yearly products. If a
free-to-paid transition needs grace, Gate 0 must select `All Renewals` rather
than expect a later per-product override.
([Apple grace-period implementation](https://developer.apple.com/documentation/storekit/reducing-involuntary-subscriber-churn), [Apple grace-period configuration](https://developer.apple.com/help/app-store-connect/manage-subscriptions/enable-billing-grace-period-for-auto-renewable-subscriptions), [Apple subscription durations](https://developer.apple.com/help/app-store-connect/reference/in-app-purchases-and-subscriptions/auto-renewable-subscription-information))

The selected setting is not entitlement arithmetic. Apple says configuration
changes can take up to 24 hours, affect only upcoming renewals, and do not end
grace already assigned to a subscriber. StoreKit exposes the actual
`gracePeriodExpirationDate`, and RevenueCat keeps a subscription active through
grace and exposes its actual grace expiration. Persist and authorize from
refreshed provider state and expiration, never by adding configured days to a
renewal date; provide full paid service until that actual grace expires.
([Apple grace-period expiration](https://developer.apple.com/documentation/storekit/product/subscriptioninfo/renewalinfo/graceperiodexpirationdate), [Apple grace-period configuration](https://developer.apple.com/help/app-store-connect/manage-subscriptions/enable-billing-grace-period-for-auto-renewable-subscriptions), [RevenueCat billing issues and grace periods](https://www.revenuecat.com/docs/subscription-guidance/how-grace-periods-work))

Apple platform sandbox is the required integration proof; RevenueCat's Test
Store does not simulate Apple billing retry or grace. Sandbox timing is not the
production-day mapping: the sandbox tester's renewal-speed setting determines
the accelerated retry and grace intervals. Record that setting, actual
provider-reported state and expiration, access retention, recovery, and
post-grace loss for every launch duration and eligible offer transition before
moving the app-wide configuration to production. Do not treat an accelerated
sandbox minute count as proof of a production duration. ([Apple sandbox
account settings](https://developer.apple.com/help/app-store-connect/test-in-app-purchases/manage-sandbox-apple-account-settings/), [Apple failed-renewal
testing](https://developer.apple.com/documentation/storekit/testing-failing-subscription-renewals-and-in-app-purchases), [RevenueCat sandbox
testing](https://www.revenuecat.com/docs/test-and-launch/sandbox))

RevenueCat caches `CustomerInfo` across app launches and documents that an entitlement active when the athlete goes offline remains active for up to three days. The official client may use that literal SDK state to start new paid private work during that bounded window and should request refreshed `CustomerInfo` whenever connectivity permits. After the window, it blocks only new gated roots or Pack activation with a reconnect/restore path. Reading existing records, completing a Field Note for an already planned Try, resolving or syncing existing private work, restoring purchases, export, scoped deletion, and account deletion remain available after lapse. A later entitlement change never discards or permanently rejects an already durable private mutation. ([RevenueCat caching](https://www.revenuecat.com/docs/test-and-launch/debugging/caching), [RevenueCat CustomerInfo](https://www.revenuecat.com/docs/customers/customer-info))

Enable HMAC signing on the production RevenueCat webhook integration. The
handler must read the exact raw request bytes before JSON parsing, verify the
timestamp-and-body signature with a constant-time comparison and a five-minute
freshness tolerance, verify the separately configured authorization header, and
reject the wrong configured app or environment. In one short transaction it
then inserts the unique provider event ID and payload digest plus a refresh job
before acknowledging. RevenueCat retries recompute the signature timestamp but
reuse the event ID, so timestamp freshness limits a captured-request replay
while the unique receipt prevents a valid retry or manual resend from repeating
effects.

Treat an authenticated webhook as a refresh hint, not as the entitlement
transition itself. RevenueCat event types have different fields; delivery is
best-effort at-least-once, may be duplicated or delayed, and stops after five
automatic retries. RevenueCat therefore recommends retrieving current
subscriber state after a webhook. Process that provider-canonical response
idempotently, refresh after purchase/restore and before a paid online operation
when canonical state is stale, and run a staggered low-frequency reconciliation
job for stale `active`, `grace`, `billing_retry`, and `unknown` rows so a missed
webhook is not permanent authorization state. That job is a repair path with
rate limits, checkpoints, and alerts, not a faster entitlement poller. A
`BILLING_ISSUE` or `CANCELLATION` event received while provider-canonical state
is still grace never maps directly to `expired` or `revoked`.

Directly mutating access from each event body would save one provider read, but
makes duplicate, delayed, partial, and future event shapes part of the
authorization state machine. Private owner sync is not rejected solely because
an entitlement lapsed, while ownership, Pack schema/safety, and transition
checks remain mandatory. This deliberately rejects both strongest failure
modes: an online-only entitlement check that can strand offline Field Notes,
and indefinite trust in cached active state. Do not add a second custom offline
lease or parallel StoreKit entitlement engine in v1. ([RevenueCat webhooks](https://www.revenuecat.com/docs/integrations/webhooks), [event types and fields](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields))

RevenueCat currently starts free through $2,500 monthly tracked revenue, then charges 1% of tracked revenue; recheck at launch. ([RevenueCat pricing](https://www.revenuecat.com/pricing/))

## Privacy and publication boundary

### Data classification

| Class | Examples | Device | Server | Public/search |
|---|---|---|---|---|
| Private raw practice | Field Notes, Try actuals/deviations, free text, exact protocols, private Findings | encrypted owner cache | owner-scoped canonical rows; Field Note free text is an application-layer envelope | never |
| Private trust/operations | credential evidence, reviewer notes, reports, appeals, deletion evidence | normally absent | isolated private schema/bucket | never |
| Private social | saves, mutes, follow lists, notification preferences | selected cache | owner-scoped | counts/lists not public |
| Public candidate | minimized submission draft | local preview/remote draft | private review row | not until approved |
| Public immutable | approved Public Revision, public profile subset, source-status annotation | cacheable | public projection | canonical/indexable |
| Operational telemetry | allowlisted outcome/duration/version/error code | bounded buffer | time-limited observability | never |

### Publication transaction

1. `PublicationBoundary.preview` reads one explicit private revision and the pinned Pack publication contract.
2. It constructs a fresh allowlisted projection. It starts empty and copies only fields explicitly permitted by that Pack Version; it never “redacts” a copy of the entire raw record.
3. The athlete reviews exact output, limitations, authority, disclosure, source metadata, evidence label, and permanent-public implications.
4. Submission freezes that projection and digest. Later private edits have no effect.
5. Required human review records a decision. Approval inserts an immutable Public Revision, updates `public_objects.current_revision_id`, emits feed/search/outbox rows in one transaction, and records audit events.
6. A correction creates a successor revision. Hide/withdraw changes availability and annotates the canonical object; it does not rewrite history.

Canonical URLs use opaque stable public IDs with optional slugs, for example `/findings/{public_id}/{slug}`. Slug changes redirect to the same ID. The default URL resolves the current available revision and shows its revision number/history; `/findings/{public_id}/revisions/{n}` is permanent where policy permits. Search engines receive only approved projections and explicit withdrawal/correction status.

“Make public” is never a column on `field_notes`, `experiments`, `tries`, or private `findings`.

### Canonical Finding pages

Every approved public Finding has one canonical object URL and immutable,
addressable revisions. The page renders only the approved minimized projection:
author/public-profile revision, Pack and Pack Version, bounded question,
completed-Try count, selected non-sensitive context, observations, athlete
interpretation, conclusion, limitations, next action, protocol-authority label,
evidence/source labels, disclosures, publication/review dates, correction or
withdrawal state, and revision history. It never joins through to the private
Finding, Experiment, Try, Field Note, exact Protocol payload, or private-public
linkage.

The canonical page is the authority for Save, Discuss, Report, and Start a
linked Experiment. A linked Experiment preserves attribution and Pack Version
but starts private and blank for targets, dose, eligibility, schedule, and stop
rules. Open Graph metadata and any generated share image are minimized pointers
to the availability-gated page; they carry no uncorrectable substantive
conclusion and are purged as derivatives when the page is no longer available.

### Public availability and cache revocation

An immutable Public Revision payload is cacheable data, but its availability is mutable. Every canonical object page, exact revision URL, public API response, metadata/OG response, and generated share-image request must first read current object/revision availability, moderator hide, applicable Pack pause, and author/account-deletion state from a non-stale server boundary. Substantive user-content responses are dynamic and `no-store`; an immutable payload may be cached only below that fresh gate and must never be emitted when the gate returns hidden, withdrawn, paused for that surface, or deleted. This preserves stable URLs without letting route, browser, or CDN caches become a second public authority.

Hide, withdrawal, Pack-pause, and account-deletion transactions update canonical availability plus feed/search eligibility and enqueue deletion of every known object/revision/metadata/share-image cache tag or derivative. Purge completion is monitored, but correctness does not depend on it. Next.js documents that `revalidateTag(tag, "max")` serves stale content while refreshing, and Vercel's ordinary tag invalidation does the same; those eventual-refresh paths are acceptable for corrections where the prior revision may remain available, not for revocation. Even Vercel's foreground-delete API is only defense in depth because it can briefly revalidate in the background before its configured deletion deadline. ([Next.js `revalidateTag`](https://nextjs.org/docs/app/api-reference/functions/revalidateTag), [Vercel CDN cache](https://vercel.com/docs/caching/cdn-cache), [Vercel cache-tag APIs](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package))

### Export, scoped deletion, and account deletion

`DataRights` maintains an executable data inventory and dependency graph. Export is an authenticated asynchronous job producing:

- human-readable CSV for Experiments, Tries, Field Notes, typed values, Findings, protocols, Tested Items, social relations, and notification preferences;
- versioned JSON preserving Pack field keys, units, source/provenance, revisions, timestamps, and conflict/rejection state;
- referenced private files the athlete is entitled to receive;
- public revisions and moderation/credential decision summaries that can legally be disclosed;
- a manifest with schema versions, checksums, omissions, and creation/expiry dates.

Deliver exports through a short-lived authenticated download, not an emailed attachment or long-lived URL.

The data-rights worker decrypts a Field Note free-text envelope only after
recent reauthentication, owner/request authorization, and expected-context
verification; plaintext exists only in the bounded export stream/artifact and is
never written back into a database, queue, checkpoint, or log.

Scoped deletion previews consequences before confirmation:

- deleting a Try/Field Note removes it from future private synthesis but never silently rewrites an already published revision;
- for a scoped deletion while the account remains active, if a public revision derives from the private source being deleted, the athlete must choose the available policy action—withdraw public content, retain the already-minimized public revision with the private linkage severed, or cancel—subject to the accepted retention policy; this choice does not apply to account deletion;
- deletion uses tombstones long enough to sync to all devices, then purges private payloads and object files according to the disclosed schedule;
- security/moderation records retain only the minimum pseudonymous fields for the documented, legally supported retention period.

Immediately before account-deletion confirmation, refresh provider-canonical
subscription status. If an Apple auto-renewable subscription is active, say
plainly that deleting the product account does not cancel Apple billing,
request that the athlete cancel before continuing, and open StoreKit's
subscription-management sheet or Apple's subscription-management URL. The app,
backend, and RevenueCat cannot cancel that Apple subscription. Complete v1
still offers immediate deletion after this handoff and never makes cancellation
or expiration a precondition; a future scheduled-at-expiration option may be
additional, never the only deletion route. ([Apple account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/), [RevenueCat subscription management](https://www.revenuecat.com/docs/subscription-guidance/managing-subscriptions))

Account deletion is a durable, idempotent saga: recent reauthentication; freeze
new writes; revoke sessions and push tokens; mark the opaque RevenueCat customer
reference as deleting, erase that provider customer and its purchase history,
then purge the owner-scoped entitlement and provider-reference rows without
representing any step as an Apple cancellation; remove the user's substantive
public revision and reply payloads, attribution, feed/search entries, and
private-public links; delete credential/media objects; tombstone/sync deletion;
purge owner rows and auth subject last; cancel scheduled jobs/reminders; produce
a deletion status receipt; and complete eventual backup expiry. While the saga
runs, the account lifecycle blocks access independently of the literal provider
subscription state; it never manufactures `revoked` for a subscription that
Apple still reports as active. The receipt records only that the billing warning
and management handoff occurred plus provider-data-erasure progress, not
retained purchase history or a durable deleted-account mapping. A later provider
event with no live owner must not recreate the account.

If the athlete later creates a new product account, it receives a new opaque
RevenueCat UUIDv4. Its explicit Restore Purchases action may resynchronize a
still-valid Apple purchase and grant the entitlement to that new provider
identity under `Transfer to new App User ID`; it never restores or aliases the
deleted provider customer, product account, or product data. If the prior
provider erasure has completed, do not require a `TRANSFER` event that the
provider does not document for the erased-customer case; require current
provider-canonical entitlement under the new reference, no alias to any deleted
reference, and no recovered product record. RevenueCat confirms that deleting
its customer data does not cancel an Apple subscription, while its restore
behavior makes only one identified customer hold a transferred purchase.

Apple requires apps with account creation to offer in-app account deletion and
says all associated user-generated content, expressly including shared text
posts and reviews, must also be deleted unless local law or regulation requires
retention. Severing the private link while preserving an authored public
revision is therefore not the v1 account-deletion policy. Revision and thread
integrity use a content-free, unattributed structural tombstone at the canonical
location; no substantive title, body, observation, interpretation, disclosure,
profile projection, or deleted-author identifier remains publicly served or
searchable. Other users' replies may remain anchored to that tombstone, but
replies authored by the deleted account receive the same payload-and-attribution
deletion. Any law-required exception is minimized, disclosed before deletion,
access-restricted outside public/feed/search projections, and deleted when its
legal retention ends; product moderation or historical convenience alone is
not a retention basis. ([Apple account
deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/),
[RevenueCat customer
deletion](https://www.revenuecat.com/docs/dashboard-and-metrics/customer-profile),
[RevenueCat restore
behavior](https://www.revenuecat.com/docs/projects/restore-behavior), [App
Review Guidelines
5.1.1](https://developer.apple.com/app-store/review/guidelines/#privacy))

Field Note envelopes use one shared purpose-specific KMS wrapping key, so scoped
or account deletion deletes live ciphertext and follows the same disclosed
database/S3 backup-expiry purge; it never deletes the shared key or claims
per-athlete cryptographic erasure. Opaque KMS/CloudTrail access records follow
the accepted security-log retention and contain no note text or descriptive
context.

Do not promise instantaneous backup erasure. Supabase database backups contain Storage metadata but not object bytes, and restoring an older database backup cannot recover a Storage object deleted after that backup. Supabase Storage also does not support S3 versioning: its deleted objects are permanently removed. Database/PITR recovery and object recovery are therefore separate operations. ([Supabase database backups](https://supabase.com/docs/guides/platform/backups), [Supabase S3 compatibility](https://supabase.com/docs/guides/storage/s3/compatibility))

The deletion saga revokes primary access and deletes through the Supabase Storage API first, then records the disclosed backup-retention deadline. At that deadline a separately authorized job must enumerate and permanently delete every AWS backup version and delete marker, verify absence, and reconcile the object inventory before closing the task. A simple delete in a versioned S3 bucket adds a delete marker but retains prior versions, so a 404 is not proof of erasure. ([AWS version deletion](https://docs.aws.amazon.com/AmazonS3/latest/userguide/DeletingObjectVersions.html), [Supabase Storage schema](https://supabase.com/docs/guides/storage/schema/design))

### Canonical database recovery

Daily Supabase backups are not sufficient as the sole production recovery contract for athlete-owned canonical records. Supabase says a daily restore can lose up to a day of data; its PITR service supports point selection with seconds of granularity and publishes a worst-case two-minute RPO. PITR replaces daily backups, currently requires at least Small compute, and makes the project inaccessible during an in-place restore for a duration that depends on database size. ([Supabase database backups](https://supabase.com/docs/guides/platform/backups), [Supabase backup RPO](https://supabase.com/features/database-backups))

Enable seven-day PITR on production before external accounts are accepted. Treat two minutes as the provider's ordinary-failure RPO ceiling, not a product RTO promise. Supabase does not publish a numeric PITR recovery-time ceiling: it says duration is not fixed and depends on the age of the latest full backup, WAL volume, and database size, while the project is inaccessible during the restore. Gate 0 must therefore set separate business RTOs for ordinary in-place PITR and full project loss while Supabase project creation remains available; Gate 6 measures the actual recovery-time capability for each scenario and blocks launch unless repeated whole-service drills at representative production size and WAL age meet the accepted target with an explicit operating margin. ([Supabase PITR duration](https://supabase.com/docs/guides/troubleshooting/how-long-does-it-take-to-restore-a-database-from-a-point-in-time-backup-pitr-qO8gOG), [AWS recovery-objective guidance](https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_planning_for_recovery_objective_defined_recovery.html))

Do not buy or describe a Supabase Read Replica as complete-v1 disaster
recovery. Current replicas are asynchronous, may lag, accept reads only, and
cannot serve Auth, Storage, Realtime, or primary writes. Data restoration also
requires replicas to be removed and recreated. Restore-to-new-project remains
a database-only, same-region operation with manual service reconfiguration, so
neither a replica nor that restore supplies a cross-Region writable product
runtime. Supabase's February 2026 regional-incident report says explicitly that
the hosted platform does not offer automatic cross-Region failover for customer
PostgreSQL; the incident simultaneously made PostgreSQL, Auth, Data APIs, Edge
Functions, Storage, Realtime, and the other Region-bound services unavailable.
Regional Edge Function invocation is not a substitute: an explicitly selected
Region is not automatically rerouted during an outage and it does not promote a
database, recover dependent services, or cut over the product's jobs and
clients. Supabase Queues stores messages in PostgreSQL and Supabase Cron stores
schedules and run history in PostgreSQL, so neither is an independent regional
job-control plane. Supabase's current automatic-failover direction is Multigres
v0.1,
which is open-source-only, is not yet on the hosted platform, and is explicitly
alpha and not ready for production workloads.
Reconsider a managed failover product only after it is production-supported and
release-shaped drills prove write routing, Auth, Storage, jobs, KMS, DNS,
provider generation, session invalidation, and the accepted RPO/RTO; do not
infer readiness from database redundancy or independently regional function
execution. ([Supabase February 2026 regional incident](https://supabase.com/blog/supabase-incident-on-february-12-2026), [Supabase Read Replicas](https://supabase.com/docs/guides/platform/read-replicas), [Read Replica operations](https://supabase.com/docs/guides/platform/read-replicas/getting-started), [Supabase Queues](https://supabase.com/docs/guides/queues), [Supabase Cron](https://supabase.com/docs/guides/cron), [restore to a new project](https://supabase.com/docs/guides/platform/clone-project), [regional Edge Function invocation](https://supabase.com/docs/guides/functions/regional-invocation), [Multigres v0.1 alpha](https://supabase.com/blog/multigres-v0-1-alpha))

Current first-party Supabase sources reinforce that boundary. The load
balancer can route eligible `GET` requests to asynchronous read
replicas, but non-`GET` requests and Auth still use the single writable
primary; Auth, Realtime, and Storage do not gain cross-region geo-routing.
Regional Edge Function execution is a placement control, and an explicitly
selected Region is not automatically rerouted during an outage. Restore to a
new project remains a Beta, same-Region database copy that leaves Storage
objects/settings, Edge Functions, Auth settings/API keys, Realtime settings,
extensions, and replicas for manual reconstruction. Cron schedules/runs and
Queue messages remain PostgreSQL-backed. Multigres v0.1 does contain database
HA primitives, but Supabase still labels it open-source-only, alpha, and not
production-ready; the hosted product is future work. These partial capabilities
do not supply managed failover for the complete project surface or a
provider-backed whole-service RTO, so cross-region read replicas remain a later
latency/read-redundancy option rather than the v1 recovery architecture.

The timed drill starts at incident declaration and restore-point selection, not at the provider's restore submission. It ends only when the existing mobile build can reauthenticate and bootstrap, push a command and pull its change, canonical public pages and search are correct, protected moderation operations work, and background jobs resume without duplicating external effects. The runbook restores or recreates roles, schema, data, migration history, Auth subjects and configuration, custom-role passwords and narrow grants, RLS, extensions, publications, API keys, SMTP, queues/cron/functions, web/ops/jobs bindings, Storage buckets/policies and required objects, recovery keys, DNS, webhooks, push, and billing bindings before cutover. Proof also covers owner isolation, immutable Pack/Protocol/public revisions, sync-sequence continuity and idempotency, audit-checkpoint verification, representative private-object reads, and safe export/deletion jobs. Supabase's new-project restore is database-only and leaves Storage objects/settings, Edge Functions, Auth settings/API keys, Realtime settings, extensions/settings, and replicas for manual reconstruction. ([Supabase restore to a new project](https://supabase.com/docs/guides/platform/clone-project), [Supabase CLI backup and restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore))

Do not treat an owner-controlled Supabase custom domain by itself as proof that
an existing mobile binary can use a replacement project. Supabase describes
custom domains as endpoint-portability aids, but a new-project restore is a
database-only copy that leaves Auth settings and API keys for manual
reconfiguration; its region-migration guidance likewise requires changing the
API URL and keys, and current publishable keys are project-scoped values shipped
inside direct mobile clients. ([Supabase custom domains](https://supabase.com/docs/guides/platform/custom-domains), [new-project restore](https://supabase.com/docs/guides/platform/clone-project), [region migration](https://supabase.com/docs/guides/troubleshooting/change-project-region-eWJo5Z), [publishable-key migration](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys))

Complete v1 therefore keeps Supabase project URL/key configuration server-side
behind the stable owner-controlled product API façade defined under
`Authentication` and does not pay for a Supabase custom domain. A project-loss
cutover restores Auth rows, reconfigures SMTP/Auth settings and API keys,
increments the product bootstrap's provider generation, and forces email-code
reauthentication without deleting pending offline Practice work. Include
server configuration rotation, rejection of old sessions, fresh OTP login,
new short-lived object URLs, and client bootstrap/sync in the measured cutover.
Supabase sessions comprise both a JWT access token and a one-time-use refresh
token, so session continuity is not inferred from restoring Auth rows.
([Supabase sessions](https://supabase.com/docs/guides/auth/sessions))

PITR is not an independent backup: Supabase states that deleting a project
permanently removes its associated backups. The daily off-provider copy is an
explicit **logical recovery bundle**, not the default output of
`supabase db dump`. The current CLI reference says a default schema dump omits
managed schemas including `auth` and `storage` and contains neither data nor
custom roles unless the corresponding flags are selected. The pinned bundle
therefore contains all of these independently checksummed members:

1. a role-only dump;
2. the application/user-schema dump;
3. one unscoped `--use-copy --data-only` dump over the pinned CLI's effective
   data scope, with its source-confirmed inclusion of `auth` and `storage`,
   plus the provider-documented exclusions for `storage.buckets_vectors` and
   `storage.vector_indexes`; never add `--schema` to this member;
4. separate schema and data dumps for `supabase_migrations`; and
5. a reviewed diff for every product-owned trigger, policy, or other change to
   the managed `auth` and `storage` schemas.

The checked v2.115.0 source deliberately leaves `auth` and `storage` out of its
built-in excluded-schema list, selects `--schema '*'`, and runs `pg_dump` as
the `postgres` role. Its data script still excludes internal and
extension-managed schemas plus the provider bookkeeping tables
`auth.schema_migrations`, `storage.migrations`, and
`supabase_functions.migrations`; the recipe's two vector-table exclusions are
additional. This is therefore not a literal all-database export. Taken
together, the implementation, Supabase's Auth migration guidance, and the
Storage schema documentation support the narrower conclusion that the member
contains required Auth rows such as users and authentication records and the
`storage.buckets`/`storage.objects` metadata. They do not make Auth
configuration, project API keys, SMTP/provider settings, Storage object bytes,
or provider-side service configuration part of that logical member; restored
bucket metadata is not proof that the bucket, policy, and service settings are
operationally correct. Keep those settings in the separately encrypted
recovery-configuration inventory, keep required object bytes under the
independent object-backup contract, and force a fresh email-code login after
cutover. The forced reauthentication remains correct even when Auth rows are
restored because a new project has a different signing boundary. ([Supabase
CLI v2.115.0 data-scope source](https://github.com/supabase/cli/blob/v2.115.0/apps/cli-go/pkg/migration/dump.go),
[Supabase CLI v2.115.0 data-dump script](https://github.com/supabase/cli/blob/v2.115.0/apps/cli-go/pkg/migration/scripts/dump_data.sh),
[Supabase CLI backup and
restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore),
[Supabase CLI dump boundary](https://supabase.com/docs/reference/cli/init#supabase-db-dump),
[platform restore boundary](https://supabase.com/docs/guides/self-hosting/restore-from-platform),
[migrating Auth users](https://supabase.com/docs/guides/troubleshooting/migrating-auth-users-between-projects),
[Storage file/metadata boundary](https://supabase.com/docs/guides/storage/management/download-objects),
[PostgreSQL `pg_dump`](https://www.postgresql.org/docs/current/app-pgdump.html))

Pin the Supabase CLI, PostgreSQL client, source database, Auth, and Storage
versions in the manifest. Fence migrations, role changes, and managed-schema
customization across the multi-command capture. Ordinary application writes may
continue during the data-only member because `pg_dump` produces a consistent
export while the database is in use, but the job fails on any dump warning,
member/checksum omission, or concurrent schema fence violation. Each member is
streamed directly into a versioned, authenticated AWS Encryption SDK envelope
under the exact ARN of the dedicated symmetric backup KMS key before any bytes
reach S3; no plaintext dump is staged. The encrypt-only backup role may
transiently process source plaintext and has `kms:GenerateDataKey` but not
`kms:Decrypt`; only the short-lived recovery role may decrypt a stored backup.
Store the encrypted bundle plus a manifest with its member list, envelope
version, exact wrapping-key ARN, source/tool versions, checksums, returned S3
version ID, archived `--dry-run` command, effective CLI schema/table exclusions,
and a source schema/table inventory with an explicit include-or-ignore decision.
Every CLI upgrade diffs that scope; capture and restore proofs reconcile every
required `auth` and `storage` table by table identity and row count, so a newly
managed table or changed default cannot disappear behind a successful command.
The excluded `auth.schema_migrations` and `storage.migrations` ledgers remain
owned by the compatible target services; they are distinct from the separately
preserved product migration history in `supabase_migrations`.
S3's automatic SSE-S3 encrypts that ciphertext again as storage-layer defense
in depth; neither SSE-S3 nor SSE-KMS replaces the pre-upload envelope because
S3 performs SSE-KMS decryption for an authorized object read. ([PostgreSQL
`pg_dump`](https://www.postgresql.org/docs/current/app-pgdump.html),
[S3 client-side encryption](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingClientSideEncryption.html),
[S3 encryption options](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingEncryption.html),
[SSE-KMS workflow](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingKMSEncryption.html),
[AWS KMS keyrings](https://docs.aws.amazon.com/encryption-sdk/latest/developer-guide/use-kms-keyring.html))

Supabase also documents that source/target PostgreSQL, Auth, or Storage version
drift can make a `COPY` reference a setting, table, or column that the target
does not have. The disposable rehearsal therefore uses the exact captured
source/tool/service versions, a target compatible with them, and the final
single-transaction restore. Do not turn a failed restore green by dropping an
Auth or Storage row group: resolve the target/version mismatch or approve and
test an explicit data migration that proves no required identity, object, or
policy data was discarded.

Restore into a newly configured disposable Supabase project with the pinned
toolchain and rehearsed order. Apply the role, schema, and data members in a
single `psql` transaction with `ON_ERROR_STOP` and the provider-documented
trigger suppression; restore migration history and reviewed managed-schema
changes; reset custom login-role passwords; then re-create extensions,
publications, Auth/SMTP settings, API keys, queues, Cron, and other provider
configuration from the recovery inventory. Restore required object bytes
through the Storage API and reconcile them to the restored database metadata by
immutable object ID and checksum. A SQL restore, successful row count, or
visible Storage metadata alone is not whole-service recovery evidence.

Gate 0 records a separate exact recovery-storage tuple: the versioned S3
bucket's account and Region, the dedicated backup wrapping key's exact ARN and
Region, and whether replication exists. This is not implied by the online
Supabase/Vercel/Field Note KMS tuple. S3 creates a bucket in the selected Region
and keeps its objects there unless they are explicitly transferred. If Brazil
is selected and no separate cross-Region recovery target is accepted, use the
separate-account S3 bucket and a single-Region backup KMS key in `sa-east-1`,
with cross-Region replication disabled. A second bucket Region, cross-Region
replication, or multi-Region backup key requires a separate jurisdiction,
processor, residency, RPO/RTO, policy, audit, and restore decision; none creates
the missing alternate writable runtime or changes the no provider/Region-wide
RTO claim. ([S3 bucket Regions](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingBucket.html), [S3 endpoints](https://docs.aws.amazon.com/general/latest/gr/s3.html), [AWS KMS multi-Region boundary](https://docs.aws.amazon.com/kms/latest/developerguide/mrk-when-to-use.html))

Retain the recovery set only for the disclosed backup window and exercise restoration to a disposable project. Pin exact S3 version IDs and checksums, prohibit lifecycle expiration before the accepted retention deadline, and keep the recovery set needed to meet the accepted launch RTO in S3 Standard rather than an asynchronous archive tier. This off-provider copy has a 24-hour target RPO and supports project-loss recovery while Supabase is available; it is provider-independent data custody, not hot failover, point-in-time rollback, or a provider/region-wide service-recovery guarantee. A provider/region-wide outage has no numeric v1 RTO. If that is unacceptable, add and drill an alternate full runtime or continuously replicated second PostgreSQL provider before launch, accepting the additional private-data processor, replication/failover correctness, and one-developer on-call burden. ([Supabase CLI backup and restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [AWS S3 archive retrieval](https://docs.aws.amazon.com/AmazonS3/latest/userguide/glacier-storage-classes.html), [AWS S3 lifecycle rules](https://docs.aws.amazon.com/AmazonS3/latest/userguide/intro-lifecycle-rules.html))

The logical recovery set retains each free-text encrypted message byte-for-byte,
its envelope version, and exact KMS key ARN. The separate recovery inventory
retains key regionality, primary/replica identity where applicable, policy, role
grants, rotation state, and the account-recovery runbook outside PostgreSQL. A
restore is incomplete until representative old and new envelopes decrypt under
their expected context in the disposable project. A multi-Region replica can
remove one regional KMS dependency only when the restored application has a
tested multi-Region-aware decrypt path and matching regional authorization; it
does not alter the no-provider/region-wide-service-RTO conclusion above.
Automatic symmetric-key rotation keeps prior key material available and AWS KMS
selects it for old ciphertext, but it does not rotate data keys or repair a
compromised data key. Manual key replacement writes only with the new exact key,
keeps the old key enabled, and uses a checkpointed decrypt/re-encrypt/verify job
before the old key may be disabled. Deleting a symmetric KMS key makes remaining
ciphertext unrecoverable after the mandatory waiting period, so runtime roles
cannot disable it, change its policy, or schedule deletion; alarms cover disabled
or pending-deletion state and decrypt failures. ([AWS KMS rotation](https://docs.aws.amazon.com/kms/latest/developerguide/rotate-keys.html), [AWS KMS deletion](https://docs.aws.amazon.com/kms/latest/developerguide/deleting-keys.html))

## Social, feed, search, discussion, and discovery architecture

### Feed generation

Create one immutable `feed_entries` row when a Public Revision is approved. The Following feed is a fan-out-on-read query:

```sql
published public entries
where author is followed
order by published_at desc, feed_entry_id desc
limit :page_size
```

The Packs feed instead selects official Pack/Guide updates plus approved
Pack-linked posts and Open Questions for followed Packs. Topic follows support
Library organization, deterministic discovery, and explicit search filters;
they do not inject authors into either chronological feed. Use a composite
keyset cursor `(published_at, feed_entry_id)`, never offsets. Enforce blocks,
visibility, Pack pauses, and moderator hides in the eligibility projection
before pagination. A newly corrected revision generates a new chronological
entry explicitly labeled as a correction/update; it does not rewrite the older
cursor.

Why fan-out on read: v1 has no need for a per-follower materialized inbox, avoids a large mutation fan-out, and makes policy removal immediate. Add precomputed inboxes only after measured query/latency evidence. Official Pack announcements may be pinned in a clearly separate Pack-owned slot, not smuggled into chronological ordering.

No likes, public counts, reposts, DMs, trending, “For You”, follower suggestions ranked by popularity, or engagement-derived notification nudges. Follows and saves are utility relationships, not evidence.

### Discussions

- A thread is anchored to one exact Public Revision so later corrections cannot change what replies addressed.
- A reply declares its intent from the product vocabulary and permits one parent plus one reply level (`depth <= 1`).
- Editing a reply creates a revision; moderators see history. Deletion leaves a minimal tombstone when needed for thread structure or audit.
- Thread state can be open, locked, hidden, or Pack-paused. Reports target an exact revision/reply.
- Blocks and mutes affect rendering and reply eligibility. Rate limits and account-age/verification signals may drive abuse review, never public authority.

### Search and discovery

Use PostgreSQL generated `tsvector` documents with a GIN index for public profiles, Packs, public revision titles/summaries, topics, and allowed source metadata. PostgreSQL supports weighted fields, `websearch_to_tsquery`, ranking, and GIN indexes; `pg_trgm` adds bounded typo/similarity matching. ([PostgreSQL full-text search](https://www.postgresql.org/docs/current/textsearch.html), [preferred text-search indexes](https://www.postgresql.org/docs/current/textsearch-indexes.html), [`pg_trgm`](https://www.postgresql.org/docs/current/pgtrgm.html))

Eligibility is more important than relevance:

1. current published/available projection only;
2. no blocked actor, hidden content, paused scope, or private data;
3. correct object type and Pack/topic filters;
4. then deterministic text relevance, exact match, declared topic/Pack compatibility, recency, and stable ID tie-break;
5. never followers, saves, clicks, credential status, or engagement.

Show “why this matched” using matched title/topic/Pack/source fields. Keep search query text out of analytics and crash reports. Start with Postgres: it is transactional with publication and adequate for complete v1. A dedicated engine is reversible later behind `PublicSearch` only if measured corpus/latency/language needs justify its privacy and operating cost.

Discovery pages are editorial and deterministic: recent public revisions, Pack directory, topic directory, source-status/correction pages, and literal credential filters where appropriate. Editorial placement is labeled and audited.

## Sources, DOI, ORCID, and retractions

### Source metadata model

- `sources(id, source_type, normalized_doi nullable unique, canonical_url, registration_agency nullable, title_current, publisher_current)`
- `source_versions(id, source_id, provider, provider_record_id, work_type, title, container_title, publisher, issued_on, resource_version nullable, provider_schema_version nullable, provider_created_at, provider_updated_at, retrieved_at, projection_digest)`
- `source_contributors(source_version_id, sequence, display_name, orcid_id nullable, role)`
- `source_version_relations(source_version_id, relation_type, related_identifier_type, related_identifier)`; v1 persists only allowlisted DOI-to-DOI relations
- `source_version_licenses(source_version_id, rights_identifier nullable, license_url nullable, applies_to nullable, starts_at nullable)`
- `source_updates(id, source_id, update_type, related_source_id nullable, provider, provider_event_date, observed_at, raw_reference)`
- `source_statuses(source_id, status, monitoring_coverage, effective_date, source_update_id, checked_at)`
- `source_review_jobs(id, source_id, trigger, state, last_attempt_at, next_attempt_at)`

Normalize DOIs as lowercase identifiers without `https://doi.org/`, while rendering DOI links through `https://doi.org/{doi}`. Store versioned, allowlisted provider projections and retrieval time; do not overwrite history or persist an open-ended provider response. DOI presence, journal venue, citation count, author credential, and ORCID are metadata—not evidence labels.

### Registration-agency routing

Crossref and DataCite are separate DOI registration agencies with distinct
metadata corpora; DataCite covers research data and other research outputs that
are not necessarily present in Crossref. Normalize the DOI, keep
`https://doi.org/{doi}` as its canonical resolver, determine the holding agency,
and dispatch to exactly one provider adapter. Crossref's documented
`/works/{doi}/agency` endpoint can identify Crossref or DataCite ownership, and
DOI.org content negotiation can route a request across participating agencies.
Do not query both providers and merge or choose the richer result: adding
DataCite broadens correct source coverage but is not an accuracy fallback or
outage-redundancy path for a Crossref record. An unimplemented agency remains a
literal `unsupported_registration_agency` source that can use a reviewed manual
canonical URL; it is never guessed from metadata. ([DOI registration agencies](https://www.doi.org/the-community/existing-registration-agencies), [Crossref REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/), [DOI content negotiation](https://www.crossref.org/documentation/retrieve-metadata/content-negotiation/))

Do not use cross-agency content negotiation as the stored metadata contract.
Its common formats are useful for one-record citation display, but Crossref
documents that mappings between registration-agency schemas are not always
direct. Provider-specific REST projections preserve agency, version, relation,
and status provenance. ([DOI content negotiation](https://www.crossref.org/documentation/retrieve-metadata/content-negotiation/))

### Crossref boundary

Use the public Crossref REST API through `SourceRegistry` for Crossref-owned DOI metadata and refresh. Crossref asks clients to identify themselves with a `mailto` parameter or user agent for the polite pool; use caching, conditional refresh, exponential backoff, and a low concurrency budget. Do not fetch on every public page request. ([Crossref REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/))

Crossref states that bibliographic metadata, including references, is factual and reusable without restriction and that Crossref-generated and Retraction Watch data is CC0, but deposited abstracts retain publisher or author copyright. Its license records can apply separately to the version of record, accepted manuscript, or text-and-data-mining copy, may begin on different dates, and are not consistently deposited. A license URL therefore remains literal metadata; it is never interpreted as blanket permission to store or display an abstract. ([Crossref metadata licensing](https://www.crossref.org/documentation/retrieve-metadata/), [Crossref license information](https://www.crossref.org/documentation/schema-library/markup-guide-metadata-segments/license-information/))

The strongest alternative is retaining the complete REST JSON response for auditability and future fields. Reject it for v1: it can silently capture copyrighted abstracts and newly added provider fields, while making a later schema allowlist meaningless. Request selected fields where the endpoint supports `select`, then immediately project every response before persistence. The Crossref v1 allowlist is normalized DOI, work type, title, container title, publisher, issued/provider dates, contributor name/role/deposited ORCID, relation/update identifiers, and literal license URL/scope/start date; store a digest of that projection, not the raw response. Abstracts, full text, unstructured references, and unused fields are discarded before database, queue, log, or error storage. A product-authored summary may link to the canonical work but may not be copied from a discarded abstract. ([Crossref field selection](https://www.crossref.org/documentation/retrieve-metadata/rest-api/tips-for-using-the-crossref-rest-api/))

### DataCite boundary

For a DataCite-owned DOI, use the unauthenticated DataCite Public REST API with
an identified user agent, current rate-limit handling, caching, and exponential
backoff. The Public API returns only Findable DataCite records. Request selected
fields where supported and immediately project the response to: normalized DOI,
provider record ID and registration agency; resource type; title; publisher;
issued/publication and provider dates; contributor name, literal role, and
deposited ORCID; version; selected DOI-to-DOI version, correction, supplement,
and container relations; literal rights/license identifiers; provider schema or
metadata version; retrieval time; and projection digest. ORCID remains metadata,
and a rights identifier is not interpreted as permission beyond its literal
scope. Discard descriptions/abstracts, content or full-text URLs, raw JSON/XML,
geolocation, affiliations, subjects, usage/citation counts, and unused fields
before persistence, queues, logs, or errors. ([DataCite REST API](https://support.datacite.org/docs/rest-api), [field selection](https://support.datacite.org/docs/api-queries), [rate limits](https://support.datacite.org/docs/rate-limit), [metadata reuse boundary](https://support.datacite.org/docs/datacite-data-file-use-policy))

DataCite does not supply the same public Retraction Watch monitoring contract.
Its documentation says a mistaken or retracted Findable record may move to
Registered and disappear from the Public API, while detecting that state
directly requires authenticated member access. A previously stored DataCite
record returning not found after bounded retries therefore preserves the last
projection, changes its monitoring coverage to `provider_record_unavailable`,
and opens human review; it is not automatic proof of retraction. The UI shows
the provider, coverage limitation, and last successful check. Complete v1 does
not create a DataCite member account merely to close that gap. ([DataCite DOI states](https://support.datacite.org/docs/doi-states), [removed record and retraction detection](https://support.datacite.org/docs/how-do-i-detect-removed-records-or-retractions-with-the-rest-api))

Crossref exposes updates including Retraction Watch data through work relations/update metadata. The service can identify retractions, corrections, expressions of concern, and reinstatements, but metadata can be late or incomplete. Treat it as a trigger for human review, display source and last-checked time, and permit a moderator to record publisher/manual evidence. ([Crossref Retraction Watch data](https://www.crossref.org/documentation/retrieve-metadata/retraction-watch/), [Crossref updates and corrections](https://www.crossref.org/documentation/retrieve-metadata/rest-api/rest-api-filters/))

When a retraction/correction arrives:

1. append the source update/status;
2. find dependent active Pack Versions and Public Revisions;
3. display a prominent source-status annotation immediately where the match is reliable;
4. open human review cases for affected safety/evidence claims;
5. optionally impose a narrow Pack publication/discussion/new-guided-use pause according to predeclared policy;
6. publish corrections or withdraw content through new audit/revision events.

Never automatically rewrite a Finding's evidence label, copy a replacement protocol, or infer that all personal observations are invalid.

Do not copy abstracts or publisher full text by default. Adding a field or a provider beyond the decided Crossref/DataCite routes requires a named storage/display purpose, terms and licensing review, and a schema migration; it cannot use an open-ended `metadata_jsonb` escape hatch. DOI integration is metadata retrieval, not literature-access authorization.

### ORCID boundary

If and only if the product organization has accepted the applicable ORCID
membership/license, ORCID has reviewed the integration, and ORCID has issued
Production Member API credentials for it:

- expose OAuth only from a recently authenticated product-account settings or
  researcher-verification flow; the callback links to that existing account and
  cannot create a primary account, log a user in, or mint a product session;
- collect authenticated iDs through ORCID OAuth rather than manual text entry;
- retain granted scopes and source assertion provenance;
- for that authenticated iD, read the member-only `/summary` projection of
  public data and preserve its validated/self-asserted distinction,
  assertion source, public verified-domain verification date, retrieval time,
  and record status rather than copying an open-ended ORCID record;
- display the iD according to ORCID brand guidance;
- separate ORCID connection, identity/credential decisions, and affiliation claims;
- never promote an ORCID record into “verified practitioner” automatically.

This production gate is stricter than deciding to pursue membership. ORCID's
Public API can technically collect an authenticated iD, but its current terms
exclude use in connection with a revenue-generating product; Production Member
API credentials are member-only and require integration review. The annual
public data file's separate commercial-reuse permission does not authorize
Public API OAuth, and it is not a substitute for current account linking or the
member-only `/summary` endpoint. Complete v1 therefore has no production ORCID
OAuth or API path until the exact license and issued credentials are recorded.
([ORCID Public API terms](https://info.orcid.org/public-client-terms-of-service/),
[Production Member API registration](https://info.orcid.org/documentation/integration-guide/registering-a-member-api-client/),
[ORCID Registry and public-data-file terms](https://info.orcid.org/terms-of-use/))

ORCID's `/summary` endpoint is available to member integrators and includes only
public information; its payload distinguishes validated and self-asserted
items, so “summary” never means every assertion is validated. A missing marker
may reflect privacy or incomplete participation, not an adverse fact.
Member-validated employment can reduce documentary effort only after a human
confirms the exact organization, source, dates, currentness,
and claim scope. A verified professional email domain proves access to an
institutional domain at a recorded date, not a job title or continuing
employment. ORCID records can also include self-asserted affiliations, so show
the exact assertion origin and date rather than collapsing any marker into
identity, credential, role, or product trust. ([ORCID record
summaries](https://info.orcid.org/documentation/integration-guide/summarizing-orcid-record-data/),
[ORCID Member API](https://info.orcid.org/what-is-orcid/services/member-api/),
[ORCID affiliations](https://support.orcid.org/hc/en-us/articles/360006971293-Add-an-affiliation-to-your-ORCID-record),
[ORCID display guidelines](https://info.orcid.org/brand-guidelines/))

## Files and media

Keep complete-v1 media deliberately small:

- public profile avatar;
- private credential/affiliation evidence documents;
- Pack editorial assets and small public diagrams owned/licensed by the product;
- generated export archives;
- optional public-object share image generated only from an approved public revision.

Field Notes do not need arbitrary photo/video/audio attachment in v1 unless Pack-by-Pack product research proves a safety or comprehension need. Text and typed values are the durable record. This avoids offline queue pressure, hidden location metadata, moderation expansion, storage/backup cost, and accidental health-adjacent capture.

Use separate private buckets/prefixes for credential evidence, exports, and owner media; public assets get a distinct allowlisted path. Supabase Storage access control uses RLS, private buckets, and signed URLs, but service keys bypass RLS and must never be shipped to clients. Signed URLs are bearer grants until expiry, so use very short expiries and object rotation/deletion for high-risk delivery. ([Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [serving downloads](https://supabase.com/docs/guides/storage/serving/downloads))

For every upload:

- create an opaque server-owned object key; never use email, handle, DOI, or original path;
- cap bytes/dimensions/pages by purpose; stream rather than buffering large files;
- inspect magic bytes and decode/re-encode images; do not trust client MIME or extension;
- strip image metadata; checksum and record declared/observed media type;
- quarantine credential documents until malware/content checks complete;
- never sync credential evidence to ordinary mobile/public databases;
- classify backup eligibility by purpose and maintain an independent object inventory.

Complete v1 keeps Supabase Storage as the primary delivery and RLS boundary and uses a versioning-enabled AWS S3 bucket in a separate owner-controlled AWS account as the independent backup target. Supabase's current S3 compatibility and object-migration tools are transfer mechanisms, not retained-version recovery: bucket versioning and Object Lock are unsupported, deleted objects are unrecoverable, and database/PITR recovery restores Storage metadata rather than object bytes. A successful database restore or S3-compatible copy therefore cannot replace the independent object backup. ([Supabase S3 compatibility](https://supabase.com/docs/guides/storage/s3/compatibility), [database backups](https://supabase.com/docs/guides/platform/backups), [object downloads and migration](https://supabase.com/docs/guides/storage/management/download-objects)) The object set is deliberately small: back up non-regenerable user-supplied private objects, including credential or affiliation evidence and retained owner media; do not back up regenerable export archives, share images, or product assets that have another canonical source. A required-backup object is not marked durable/accepted until the backup job has streamed the primary plaintext through the same pre-upload AWS Encryption SDK boundary used for logical snapshots, completed the encrypted S3 version without plaintext staging, retained the version ID and envelope/key metadata, and verified byte count and checksums. The encrypt-only job necessarily handles source plaintext inside that bounded process but has no `kms:Decrypt`, cannot recover stored backup plaintext, and cannot delete versions; restore and permanent-delete roles are separate, short-lived operational capabilities. The dedicated backup key and recovery instructions remain outside the bucket and inside the owner-controlled recovery inventory.

Recovery restores the database to a disposable project, matches each eligible `storage_objects` row to the S3 manifest by immutable object ID and checksum, decrypts through the recovery role, and uploads through the Supabase Storage API so bytes and metadata are rebuilt together. It verifies counts/checksums and exercises representative credential and owner-media reads before cutover. Direct SQL writes to `storage.objects` are forbidden because Supabase documents the storage schema as metadata-only and read-only for application operations. ([Supabase database backups](https://supabase.com/docs/guides/platform/backups), [Supabase Storage schema](https://supabase.com/docs/guides/storage/schema/design), [downloading Storage objects](https://supabase.com/docs/guides/storage/management/download-objects))

AWS S3 as the primary is the strongest credible alternative because versioning preserves overwritten or ordinarily deleted versions. It is not the v1 choice: same-account versioning is a recovery feature, not an independent backup—an authorized version-specific delete is permanent—and moving primary delivery to S3 would replace Supabase's RLS-integrated object boundary while still requiring a separate failure domain. Do not apply S3 Object Lock compliance mode to personal-object backups by default: it prevents every user, including the root user, from deleting a protected version before retention expiry and could make the disclosed deletion contract impossible. If law later requires immutable retention, scope it to a separately classified object class and an accepted retention policy rather than all athlete objects. ([AWS S3 Versioning](https://docs.aws.amazon.com/AmazonS3/latest/userguide/versioning-workflows.html), [AWS S3 Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html))

## Moderation and administrative operations

### Human workflows

The protected operations app supports:

- Pack/Guide/Practitioner Protocol Note review with exact version diff, sources, stop rules, reviewer checklist, and dual control for high-risk Pack activation;
- credential and affiliation evidence review with jurisdiction, expiry, decision reason, and revocation;
- report triage and consolidation into a case without losing individual reporter context;
- hide/restore content, lock/unlock discussion, warn, mute, suspend, and revoke literal credential state;
- scoped Pack pauses for `publication`, `discussion`, and `new_guided_use`; private existing records remain readable and exportable;
- correction/withdrawal workflows that create new revision/status events rather than overwriting public history;
- appeals assigned to a different qualified reviewer, with outcome and reason;
- deletion/export job inspection that reveals state/error codes without casually exposing payloads;
- append-only audit search by actor, target, case, reason, and time.

Human moderation is required for safety-adjacent approval and appeal. Automation may deduplicate reports, rate-limit abuse, detect malformed files, identify possible source retractions, and prioritize an inbox. It cannot decide that advice is medically safe, verify a credential from a name match, or silently adapt/approve a protocol.

The operations surface shows the frozen public candidate, deterministic
eligibility attestations, and case-specific evidence. Its roles and queries
cannot join through to an athlete's private Experiment, Try, Finding, or raw
Field Note. If more context is required, the moderator may ask the athlete to
submit one explicitly selected excerpt as a separate case attachment; the
athlete can decline, and the system never grants blanket private-ledger access.

### Pack-level pause semantics

A Pack pause is an operational record with reason, scope, effective time, reviewer, and review deadline. It can:

- prevent new public submissions or approvals tied to a Pack;
- lock new discussion while preserving readable history;
- prevent starting new “Guided” use until reviewed;
- display an explicit warning on dependent public revisions and cached Pack pages.

It does not delete or mutate private Field Notes, cancel an externally owned protocol, erase public history, or imply causality. Mobile receives pause state as a high-priority sync projection. For a safety-critical new guided action, require a recent server state rather than trusting an indefinitely stale cache.

### Abuse and safety controls

- rate limit login, follow/save churn, replies, reports, submissions, file uploads, DOI lookup, and credential submissions;
- use blocks and moderator suspensions at query and write boundaries, not client filtering alone;
- store exact reason codes and human notes separately; public notices reveal only policy-appropriate detail;
- publish reporting contact information and a content policy. Apple's UGC guideline requires filtering, reporting, blocking abusive users, and published contact information. ([App Review Guidelines 1.2](https://developer.apple.com/app-store/review/guidelines/#user-generated-content))
- define moderator on-call coverage, safety escalation, response targets, and a backup human before launch. One developer cannot be the sole unavailable safety reviewer indefinitely.

## Notifications

Use two channels with different privacy behavior:

### Local reminders

Schedule Try reminders on the device from the private Try plan. The server does not need exact protocol content to make a local notification. Use generic lock-screen text by default (“You have a planned practice”) with a user-controlled preview setting. Reschedule/cancel transactionally when a Try changes, when the owner logs out, or when account deletion begins. Ask permission only when the user creates/enables a reminder, not during generic onboarding.

### Remote notifications and in-app inbox

Remote notifications cover moderation decisions, replies/thread follows, Pack/source safety updates, credential decisions, export completion, and account/security events. Model:

- `notification_preferences(user_id, kind, push_enabled, inbox_enabled, quiet_hours, updated_at)`
- `notification_intents(id, user_id, kind, subject_type, subject_id, dedupe_key, not_before, state)`
- `notification_deliveries(id, intent_id, device_id, provider, provider_message_id, provider_state, attempt, last_error_code)`
- `inbox_items(id, user_id, kind, subject_type, subject_id, created_at, read_at)`

Insert the intent in the same database transaction as the triggering canonical change. A durable logged Supabase Queue wakes delivery; the `notification_intents`/`notification_deliveries` rows remain authoritative and the queue is not exposed to clients. Delivery follows the checkpointed lease contract above. Supabase Queues is PostgreSQL-backed `pgmq`, with logged durable queues and explicit archive/delete behavior. Supabase Cron can run SQL/functions or invoke an Edge Function and records job runs; here it only wakes or reconciles bounded idempotent work. ([Supabase Queues](https://supabase.com/docs/guides/queues), [Supabase Cron](https://supabase.com/docs/guides/cron))

For the iOS-first release, send directly from the product backend to APNs with an HTTP/2 connection and a **Production-environment, topic-specific token-authentication key restricted to the release app's bundle ID**. Do not use a legacy cross-environment key or a team-scoped key that can send for every app: Apple now supports environment-restricted and topic-specific keys, while existing broader keys remain valid and therefore retain a larger compromise blast radius. Keep a separate Sandbox topic-specific key, connection pool, device-token table, queue, and delivery record. Use the related key that Apple permits in the same environment for an observed cutover, then revoke the old key and close/recreate its connections; an unrelated key, a key from another environment, or a newly associated topic is not valid on the existing connection. `expo-notifications` remains the client API, but it returns the native device token; Expo documents direct APNs/FCM delivery as supported, so the Expo Push Service is not required. Register with APNs at every launch and replace the server token because Apple says device tokens can change. ([Expo notification-service options](https://docs.expo.dev/guides/using-push-notifications-services/), [Apple APNs registration](https://developer.apple.com/documentation/usernotifications/registering-your-app-with-apns), [Apple token-based APNs connection](https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns), [Apple APNs key update](https://developer.apple.com/news/?id=wy4tb0uo))

The provider signs ES256 tokens only inside the delivery runtime from a `.p8`
key held in its server secret store, rotates the JWT on Apple's documented
20-to-60-minute cadence, and never writes the key or token to a database,
queue, or log. The first authenticated push binds an HTTP/2 connection
to its team, environment, key relationship, and topic set. Sandbox and
Production therefore never share a connection pool, and rotation proof must
show both paths: a related same-environment key continues on the existing
connection, while an unrelated, differently scoped, or cross-environment key
is rejected until a fresh connection is opened. Classify APNs response reasons
such as `ExpiredProviderToken`, `BadEnvironmentKeyIdInToken`,
`UnrelatedKeyIdInToken`, `DeviceTokenNotForTopic`, and `Unregistered`; only the
documented retryable transport/server responses are retried. Provider
acceptance remains a delivery attempt, not device-display or user-read proof.
([Apple token-based APNs connection](https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns),
[APNs responses](https://developer.apple.com/documentation/usernotifications/handling-notification-responses-from-apns),
[notification requests](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns))

The strongest alternative is Expo's relay: it removes APNs provider code and gives a cross-platform receipt abstraction. Do not use it for complete-v1 iOS. Expo says relay payloads may be visible to staff during active debugging and that handoff is best-effort, at-least-once, and can duplicate or omit delivery. Direct APNs removes that additional message processor while the launch is iOS-only. It does **not** make delivery authoritative: Apple also does not guarantee notification delivery. Keep `NotificationDelivery` provider-neutral and add direct FCM only when Android distribution is approved. ([Expo push FAQ](https://docs.expo.dev/push-notifications/faq/), [Apple User Notifications](https://developer.apple.com/documentation/usernotifications))

Permission and privacy are explicit:

- do not request notification permission during generic onboarding and do not use provisional authorization in v1;
- all remote categories—`account_security`, `data_rights`, `review_decision`, `pack_source_safety`, and `discussion`—start push-off and require an in-app category choice before the contextual system prompt; enabling a local Try reminder does not enable any remote category;
- every applicable account event still creates a canonical inbox item, so denial, revocation, provider failure, or a disabled category cannot hide product state;
- lock-screen copy is a fixed generic phrase such as `You have a Performance Practice update`; the payload contains only an opaque notification-intent ID and non-sensitive category key, never an actor, Pack, source, credential, report, Field Note, protocol, Tested Item, or outcome;
- tapping authenticates and fetches the canonical inbox item before routing. The payload is not a durable deep link or source of state; and
- do not use silent/background push for sync, Pack pauses, source status, deletion, or safety correctness. It may only be a disposable refresh hint after a later review because Apple says background delivery can be throttled, coalesced, or omitted. ([Apple notification permission](https://developer.apple.com/documentation/usernotifications/asking-permission-to-use-notifications), [App Review Guidelines 4.5.4](https://developer.apple.com/app-store/review/guidelines/#apple-sites-and-services), [Apple payload guidance](https://developer.apple.com/documentation/usernotifications/generating-a-remote-notification), [Apple background notifications](https://developer.apple.com/documentation/usernotifications/pushing-background-updates-to-your-app))

Therefore:

- use an idempotent `dedupe_key`, exponential backoff with jitter, bounded attempts, and dead-letter/operator visibility;
- record the APNs `apns-id` and response, retry only retryable failures, and invalidate rejected device tokens without treating provider acceptance as device display;
- keep the in-app inbox canonical so push loss does not lose an important safety/moderation notice;
- suppress social growth nudges, streak pressure, follower-count updates, and health-adjacent inference.

## Analytics without invasive tracking

Use a product-owned allowlist. Permitted events are limited to information needed to operate and improve the product, such as:

- app version/platform, release/update ID, coarse screen identifier, and coarse success/failure outcome;
- duration buckets for cold start, database open, sync checkpoint, search response, export job, and notification delivery;
- counts/buckets for pending sync mutations, rejections, conflicts, and cached rows;
- onboarding or feature-step completion without answer content;
- accessibility/reduced-motion setting only when needed to render, not as a profile attribute.

Prohibited event fields include Experiment questions, Try details, Pack responses, Field Note values/free text, Finding text, Tested Items, protocol authority/parameters, source/search queries, DOI lookups tied to a person, credentials, affiliations, moderation/report text, notification content, location, contacts, advertising IDs, precise device fingerprint, and third-party cross-app identifiers.

Do not install session replay, tracing, profiling, attachments, user feedback,
advertising attribution, or “autocapture.” Complete v1 sends no mobile event
stream to Sentry or another third-party diagnostics processor. Prefer
server-derived operational counters over client behavioral exhaust. Document
every third-party SDK in the data inventory and App Store privacy answers.

## Secrets and environment boundaries

Maintain physically distinct local/test, preview, and production Supabase projects/databases, sync API configuration/protocol registrations, RevenueCat apps/keys, push credentials, SMTP identities, AWS KMS keys, storage buckets, Vercel deployments, and EAS channels. Preview must never point at production or provide a production-data viewer.

Rules:

- only public identifiers and intentionally public API keys may enter the app bundle; Expo warns that `EXPO_PUBLIC_` values are visible in the compiled app;
- the production product-API domain and its DNS zone stay in an
  owner-controlled account with restricted change access, low documented
  recovery TTLs, renewal monitoring, and no preview reuse;
- each production deployment carries the reviewed Supabase/Vercel/KMS region
  tuple as non-secret configuration, fails closed on a mismatched effective
  database-touching runtime or Field Note key ARN, and emits only the expected
  region codes—not request or athlete data—as deployment evidence;
- Supabase service-role, database, Crossref administrative contact, SMTP, RevenueCat secret/webhook, push, signing, storage, and encryption-master credentials stay in server/EAS secret stores with least privilege; the Resend SMTP API key is sending-only and domain-scoped in Supabase Auth configuration, while its independently rotated webhook secret exists only in the receiving runtime;
- separate build-time public configuration from runtime server secrets; rotate and audit access;
- bind authenticated encryption to owner ID, purpose, record ID, and key version where application encryption is used;
- use one exact, allowlisted Field Note wrapping-key set per environment,
  separate from backup and audit keys: one single-Region symmetric AWS KMS key;
  deny Field Note multi-Region key creation/use and `kms:ReplicateKey` unless
  Gate 0 accepts the documented numeric cross-Region service exception before
  the first production envelope; the mobile app receives no AWS/KMS capability,
  runtime roles cannot administer/delete or replicate the key set, and
  encryption context contains only non-secret opaque bindings;
- use one dedicated symmetric backup KMS wrapping key per environment in the
  separate backup account, identified by exact key ARN and never reused for
  Field Notes, audit signing, or S3 server-side encryption; the backup writer
  receives only `kms:GenerateDataKey`, the short-lived recovery role receives
  `kms:Decrypt`, and neither role can administer, disable, or schedule deletion
  of the key;
- version every envelope and record its exact wrapping-key identity; enable
  automatic rotation, retain old key material while any live/backup envelope
  needs it, and never use alias movement as proof of historical decryptability;
- never log tokens, OTPs, signed URLs, raw mutation payloads, credential files, Field Note contents, or encryption keys;
- local/E2E migrations may auto-apply on disposable databases; preview/production schema deployment is explicit, additive/expand-contract, backed up, observed, and fails closed on mismatch.

Expo supports named development/preview/production EAS environments and notes that client-visible variables are not secrets. ([EAS environment variables](https://docs.expo.dev/eas/environment-variables/), [Expo environment variables](https://docs.expo.dev/guides/environment-variables/))

## Testing strategy

### Domain and contract tests

- Pack Version golden fixtures for every complete-v1 Pack: valid/invalid Field Notes, units, conditional fields, stop rules, publication allowlists, and deterministic calculations.
- Property tests for conclusion/status transitions, exactly-one typed Field Note value, immutable revision numbering, and no automatic Pack/Protocol migration.
- Public projection tests start from sensitive canary-filled private records and prove every raw/sensitive field is absent.
- Evidence label, credential state, affiliation state, support level, moderation state, and popularity remain separate types and mappings.

### Persistence and sync tests

- migration tests from every supported local database version and representative old Pack Versions;
- SQLCipher version/key, key/database mismatch, wipe, logout,
  cloud/device-transfer exclusion, low-disk, process kill, JavaScript-runtime
  teardown/duplicate-handle reopen, OS upgrade, and corrupted-cache recovery
  tests on both platforms; recovery export/import proof quiesces writes,
  preserves explicit format/`user_version`, creates no plaintext staging, uses
  a key distinct from the device key, withholds interrupted artifacts, rejects
  a wrong key or owner, and merges through normal sync without replacing the
  live ledger;
- two-device offline tests for independent inserts, same-note conflict, tombstone/edit collision, reordered/replayed command, permanent rejection, delayed cursor pull, expired auth, and Pack pause;
- Field Note free-text envelope fixtures prove round-trip on every supported
  version; unique messages/data keys; ciphertext-only PostgreSQL, change event,
  queue, log, and logical backup; wrong owner/context/key/version and tamper
  rejection; KMS-outage fail-closed retry with no plaintext fallback; rotation
  across old/new material; restored-snapshot decryption before cutover; and, if
  the multi-Region exception is selected, strict primary/replica interoperability,
  regional failover, independent-policy/grant denial, and cross-Region audit
  reconciliation;
- idempotency and partial-transaction tests at the upload endpoint;
- protocol contract fixtures shared by mobile and Next.js for every command/event version, plus a deterministic `SyncGateway` fake for component/domain tests;
- compatibility tests proving current server accepts the supported older command schemas and current mobile either applies or explicitly refuses every supported event schema;
- a PowerSync contract suite is required only if the contingency is selected after the proof gate.

### Server authorization and privacy tests

- disposable PostgreSQL integration tests covering each RLS/owner join and each role: owner A, owner B, anonymous reader, moderator scope, worker, and the narrowly granted sync API database role;
- privileged-operations integration tests reject `aal1` or missing-AAL sessions, expired/revoked sessions, phone-only or unverified factors, `aal2` without a TOTP `amr`, stale `currentLevel = aal2`/`nextLevel = aal1` sessions, a verified TOTP session without the required product role/scope, and a route/UI bypass; they prove a current verified TOTP plus server-validated `currentLevel = nextLevel = aal2`, TOTP `amr`, role/scope, target access, and dual-control are all required before the privileged transaction;
- guessed-ID and owner-ID-substitution tests for every private root and nested child;
- proof that public/search/feed views cannot reach `private_public_links` or raw tables;
- audit tests prove parallel appends produce one gap-free sequence, runtime roles cannot update/delete/truncate or own the ledger, altered events/gaps/checkpoints fail verification, restore re-verifies the exact S3 version, and public/operations roles cannot sign checkpoints or bypass retention;
- backup-envelope tests for both logical snapshots and required private objects prove no plaintext staging and no plaintext S3 object version, exact key ARN/context/envelope version, unique data keys, ciphertext checksum/version capture, an encrypt-only writer denied `kms:Decrypt`, S3 reads that remain ciphertext, wrong-key/context/tamper rejection, and successful checksum-verified disposable recovery only through the short-lived decrypt role;
- storage object tests for bucket/prefix, signed-link expiry, service-role isolation, content sniffing, required-copy acceptance only after the backup-envelope proof, disposable restore, and deletion of all S3 versions/delete markers;
- public revocation tests prewarm every object/revision/metadata/share-image cache surface, then hide, withdraw, Pack-pause, or account-delete while forcing purge failure and prove the next anonymous request returns no substantive payload and feed/search eligibility changed atomically;
- database recovery tests for PITR target selection; a migration-fenced,
  version-pinned off-provider bundle containing roles, application schema, the
  inventoried effective CLI data scope including required Auth rows and Storage
  metadata, migration history, and reviewed `auth`/`storage` changes; archived
  and diffed CLI exclusions plus required-table row-count parity; pre-upload
  envelope/member/checksum proof; interrupted-upload cleanup; disposable
  decrypt/transactional restore; Auth-user and product-user reconciliation;
  restored Storage metadata-to-byte checksum reconciliation; provider-role,
  extension, publication, Auth/SMTP/API-key, queue/Cron, and bucket
  configuration reconstruction; provider-generation increment, old-session
  rejection, fresh OTP reauthentication without a mobile binary change, and
  post-restore owner/sync/audit integrity;
- region-topology tests prove every production-shaped database-touching
  deployment executes in the Gate 0 Vercel region, reaches the matching
  Supabase project region and exact Field Note KMS key ARN, and fails closed on
  the `iad1`, general-region, wrong-key-Region, or unreviewed cross-region
  fixtures;
- export/deletion tests with retries, interruption, public dependencies, primary
  and backup object storage, scheduled notifications, sessions, an active Apple
  subscription management handoff plus immediate deletion, RevenueCat customer
  erasure without a false cancellation/`revoked` transition, retention
  deadlines, and the backup-disclosure ledger;
- durable-job fault tests terminate a worker before checkpoint, after an external effect, and before queue archive; expire and redeliver a lease, overlap/omit a Cron wake-up, deploy during a lease, and exhaust a poison task, proving resumable progress, fenced late commits, no duplicate canonical transition, required deletion ordering, and operator-visible failure.

### Adapter tests

- recorded, license-safe fixtures for registration-agency routing; Crossref resolution, missing metadata, correction, retraction, reinstatement, rate limit, and timeout; and DataCite Findable resolution, field projection, disappearing-record review, rate limit, and timeout;
- ORCID disabled-by-default test and OAuth tests only after the applicable
  membership/license, required integration review, and Production Member API
  credentials are recorded;
  those tests prove a callback cannot create an `app_user`, authenticate a
  primary account, mint a product session, or link without a recent product
  session and one-time callback binding; Summary fixtures separately prove that
  self-asserted employment cannot become a checked affiliation, a verified
  institutional domain cannot supply a job title or identity decision, a
  member-validated employment only opens a human decision with exact
  organization/source/dates, and missing/private/locked/deprecated data fails
  to an unknown or review state rather than a negative inference;
- Apple-platform sandbox entitlement tests for every exact launch product ID,
  standard duration, and eligible free/introductory transition, with the
  tester renewal speed recorded; prove grace entry, uninterrupted entitlement,
  provider-reported expiration, recovery and non-recovery exits, and do not
  substitute RevenueCat Test Store timing for StoreKit billing retry/grace;
- direct APNs device-token refresh; 20-to-60-minute provider-token rotation;
  Sandbox/Production pool isolation; related-key live rotation and
  unrelated/cross-environment-key connection rejection/recreation; typed APNs
  response, duplicate delivery, invalid-token, retry/dead-letter, category
  opt-in, and generic-payload checks;
- RevenueCat raw-body HMAC, signature-age/replay, signing-secret rotation,
  duplicate/manual-retry event ID, app/environment mismatch, canonical-state
  refresh, bounded webhook retry exhaustion, missed-webhook reconciliation,
  grace, refund, restore, and provider outage;
- RevenueCat identity/restore tests freeze `Transfer to new App User ID` in
  production and the release-test sandbox; prove the SDK is never configured
  anonymously and `logOut()`/automatic `syncPurchases()` are absent; exercise
  direct identified-account switching; verify an explicit restore transfers an
  active purchase between two retained test customers with one `TRANSFER` event
  and removes the old entitlement; then separately delete the old product and
  provider customer, create a new product account/reference, restore explicitly,
  and prove provider-canonical entitlement without an alias or any recovered
  product record. Negative fixtures for `Keep with original`, `Transfer if there
  are no active subscriptions`, legacy sharing, and sandbox/production setting
  drift must fail the release gate;
- SMTP integration tests prove SPF/DKIM/DMARC and tracking-off configuration,
  the actual Supabase/Resend quota intersection, generic no-account-disclosure,
  code expiry and resend cooldown, signature/replay-safe delivery webhooks,
  delayed/failed/bounced/complained/suppressed paths, no automatic
  unsuppression, least-privilege key rotation, provider timeout ambiguity, and
  a manual standby-provider cutover without weakening confirmation or sending
  multiple current codes;
- consumer-session tests for one refresh in flight, lost-response/parent-token
  recovery, SecureStore replacement failure, stale-ancestor rejection, explicit
  logout/revoke, iOS reinstall cleanup, provider-generation reset, and proof
  that access JWTs/full sessions never enter persistent storage, caches, or
  telemetry.

### Product and release tests

- React Native Testing Library for components and accessibility semantics; black-box mobile flows on real/simulated iPhone and Android across login, onboarding, Profile, Feed, Library, Practice, offline capture, conflict resolution, publication, report, export, and deletion;
- retain the archive/dSYM for every distributed iOS build and prove one
  controlled native crash from an internal TestFlight build arrives fully
  symbolicated in Xcode Organizer; on physical TestFlight devices prove one
  controlled hang through on-device Hang Detection, inspect launch/termination
  evidence including watchdog and Jetsam paths outside Crashes Organizer, and
  rehearse the user-mediated original `.ips`/device-log support path without
  adding practice content to the product diagnostic export;
- freeze the release Expo/React Native pair on the New Architecture, fail on an
  attempted Legacy opt-out, review `expo-doctor`/React Native Directory results
  without treating them as proof, and run the native lifecycle suite for every
  first- and third-party native module on release-shaped iOS and Android builds;
- inspect production artifacts to prove `expo-updates` is disabled, only the embedded bundle can run, and no project-scoped Supabase URL or API key is embedded; CI has no production EAS Update publication path, and Pack fixtures reject unknown declarative operations or handler versions;
- inspect every release-shaped Android AAB with `bundletool` and Android's ELF
  alignment check, reject any non-compatible 64-bit native library, and run the
  encrypted database lifecycle—including repeated JavaScript-runtime teardown,
  duplicate-handle recovery, and continued exactly-once outbox processing—on a
  16 KB Android runtime after every native dependency change;
- inspect the generated iOS application bundle and Xcode privacy report from the first native dependency baseline and after every native dependency addition or upgrade; fail the release build on a missing/invalid `PrivacyInfo.xcprivacy`, undeclared required-reason API, unexpected tracking declaration/domain, absent required manifest content for an Apple-listed or repackaged SDK in the correct bundle or aggregate, or missing applicable binary SDK signature;
- diff the native dependency lock/inventory and the merged privacy report against the reviewed allowlist so an Expo/React Native transitive change cannot silently alter App Store disclosures or required-reason use;
- Playwright for canonical URLs, revision history, search eligibility, public withdrawal/correction, and operations workflows;
- VoiceOver, Dynamic Type, reduced motion, contrast, keyboard/focus, screen-reader labels, localization fallback, network loss, background/foreground, and push permission states;
- manual real-device TestFlight rehearsal with production-like but non-production accounts/data;
- moderation tabletop for a high-risk report, credential revocation, source retraction, appeal, Pack pause, and developer unavailability.

The release gate is not a single broad test command. It is an evidence packet for each risk boundary: domain/safety, owner isolation, public minimization, offline durability, sync conflicts, moderation, deletion/export, billing, observability, and store review.

## Observability and operations

The complete-v1 contract is the no-Sentry diagnostics path. For every
TestFlight or App Store build, retain the Xcode archive and debug symbols, upload
symbols with the distribution build, and prove that an intentionally crashing
internal TestFlight build arrives symbolicated in Xcode Organizer before the
release candidate is accepted. Apple says TestFlight users automatically share
crash reports, while App Store crash reports and usage metrics represent users
who consent to share diagnostics with developers; absent reports or
`Insufficient usage data available` is therefore missing evidence, never
`crash-free`. ([Apple crash-report acquisition](https://developer.apple.com/documentation/xcode/acquiring-crash-reports-and-diagnostic-logs),
[debug information and archive retention](https://developer.apple.com/documentation/xcode/building-your-app-to-include-debugging-information),
[shipping-app performance](https://developer.apple.com/documentation/xcode/analyzing-the-performance-of-your-shipping-app))

The Crashes organizer is not the complete termination surface: Apple excludes
watchdog events such as slow launch, invalid-code-signature crashes, thermal
events, and Jetsam memory terminations. Keep termination/launch metrics in the
release review and a documented support path for an athlete to share the
original `.ips` crash, Jetsam, or device log when Organizer lacks the incident;
redact it before external sharing. For the bounded TestFlight cohort, also
enable Apple's on-device Hang Detection on a physical device and prove that a
known test-build hang can be retrieved and analyzed. ([Apple crash-report
acquisition](https://developer.apple.com/documentation/xcode/acquiring-crash-reports-and-diagnostic-logs),
[app responsiveness](https://developer.apple.com/documentation/xcode/improving-app-responsiveness))

Launch stability uses Apple-defined, versioned measures rather than the prior
undefined `crash-free regression`: App Store Connect defines crash rate as
crashes divided by sessions, and Xcode Organizer defines hang rate as seconds
unresponsive per hour for hangs longer than 250 ms, with median and 90th
percentile views. Main-thread hangs of at least one second can produce grouped
anonymous stack reports from consenting users. Record the contributing sample,
app version/build, device/OS filters, comparison window, crash rate, median/p90
hang rate, and top symbolicated crash/hang signatures. During TestFlight and the
first phased-release window, the operator reviews those surfaces daily and
triages every new signature affecting login, offline capture/sync, publication,
or data rights before widening release. The App Crashes and App Sessions
analytics reports are opt-in aggregates, suppress rows below five contributing
users, and can take up to five days to complete, so their computed crash rate is
lagging population evidence rather than the small-cohort release gate. Xcode's
built-in high-impact regression notification is supplementary: Apple currently
defines it as at least 75% worse than the average of the previous four App Store
versions, emits it only while Xcode is running, and excludes
diagnostic-signature notifications.
([Apple crash-rate definition](https://developer.apple.com/help/app-store-connect-analytics/benchmarks/peer-group-benchmarks),
[App Crashes report](https://developer.apple.com/documentation/analytics-reports/app-crashes),
[App Sessions report](https://developer.apple.com/documentation/analytics-reports/app-sessions),
[responsiveness and hang evidence](https://developer.apple.com/documentation/xcode/analyzing-responsiveness-issues-in-your-shipping-app),
[Organizer regression notifications](https://developer.apple.com/documentation/xcode/analyzing-the-performance-of-your-shipping-app))

Complete v1 does **not** add product-owned MetricKit ingestion. Apple already
exposes shipping metrics and diagnostics in Xcode Organizer and exposes power
and performance metrics and diagnostic logs through the App Store Connect API.
The current read-only API covers app- and build-scoped `HANG`, `LAUNCH`,
`MEMORY`, `DISK`, `BATTERY`, `TERMINATION`, `ANIMATION`, and `STORAGE` metrics,
plus recurring diagnostic signatures and downloadable anonymized backtrace
logs. That is a real owned polling/export path, but not a small-cohort release
oracle: Apple's current sample documentation says to allow a few days after
release and requires significant usage before each metric's separate threshold
is met. Retain the API key and downloaded diagnostics inside the release-
operations boundary, record empty or delayed results as unavailable evidence,
and do not add app-side collection merely to manufacture a launch pass.
MetricKit can deliver per-device daily metric reports and event-based
crash/hang diagnostics to the app for upload to owned infrastructure, but that
would add a native
collector, transport, diagnostic-data retention/deletion/access policy, and a
second aggregation path before a measured evidence gap exists. It is also an
unstable compatibility target for this app's iOS 16.4 floor: Apple has
deprecated `MXMetricManager`, while its replacement `MetricManager` and report
types are beta and documented for iOS 27 and later. Reconsider a product-owned
collector only if post-launch Apple sample size, latency, or diagnostic detail
repeatedly blocks incident resolution; then Gate 0 must approve the diagnostic
data boundary and Gates 1 and 6 must prove both supported API generations,
offline retry/deduplication, symbolication, retention, export/deletion, and the
final App Privacy disclosure. ([Apple MetricKit](https://developer.apple.com/documentation/metrickit),
[legacy `MXMetricManager`](https://developer.apple.com/documentation/metrickit/mxmetricmanager),
[MetricKit updates](https://developer.apple.com/documentation/updates/metrickit),
[App Store Connect retrieval and availability](https://developer.apple.com/documentation/appstoreconnectapi/retrieve-power-and-performance-metrics-and-log-insights),
[App Store Connect power/performance API](https://developer.apple.com/documentation/appstoreconnectapi/power-and-performance-metrics-and-logs))

Complete-v1 observability combines those Apple surfaces with provider
dashboards, product-owned counters, a user-initiated allowlisted local
diagnostic export with no practice content, and uptime checks. The Sentry SDK,
project, event stream, source-map upload, and upload credentials are absent from
every v1 environment and release artifact.

The current Sentry React Native/native contract is not stable enough to reopen
that boundary for complete v1. On the 2026-08-28 23:20 -03 official check,
8.24.0 is the `Latest`, not `Stable`, React Native release; 8.7.0 remains the
current Stable line. Sentry describes `Latest` as quality-gated and suitable for
most teams, so the release label alone is not the blocker; `Stable` additionally
means field use at time and scale. Version 8.24.0 bundles Android 8.53.0, Cocoa
9.24.0, and JavaScript 10.71.0. Its current `ReactNativeOptions` source
deliberately omits the fine-grained `dataCollection` option because the native
SDKs and React-Native-specific gates do not yet honor it. The option task and
both Android and iOS bridge tasks remain open, unassigned, and without a linked
branch or pull request; each native bridge is explicitly blocked on its native
SDK adopting the specification. ([React Native release-channel
contract](https://github.com/getsentry/sentry-react-native#releases), [React Native SDK
release](https://github.com/getsentry/sentry-react-native/releases/tag/8.24.0),
[version
matrix](https://github.com/getsentry/sentry-react-native/blob/main/SDK-VERSIONS.md),
[current React Native options
source](https://github.com/getsentry/sentry-react-native/blob/8.24.0/packages/core/src/js/options.ts),
[`dataCollection` option work](https://github.com/getsentry/sentry-react-native/issues/5996),
[Android bridge work](https://github.com/getsentry/sentry-react-native/issues/5999),
and [iOS bridge work](https://github.com/getsentry/sentry-react-native/issues/6000))

The strongest challenge is that an exact pin plus a JavaScript
`beforeSend`/`beforeBreadcrumb` allowlist and intercepted JavaScript envelopes
could appear to make the opt-in bounded. Sentry's own support contract says
those JavaScript filters do not filter Java, iOS, or native events; doing so
requires disabling automatic native initialization and separately initializing
each native SDK with platform-specific filters. The current SDK enables native
transport, native crash handling, Android NDK, and iOS app-hang tracking by
default, so the unshared filter boundary is not theoretical. A v1 opt-in would
therefore create a three-layer JavaScript/iOS/Android privacy subsystem plus a
four-SDK upgrade matrix for one developer, while Apple's accepted path already
supplies the release gate. ([Sentry native-event filtering
boundary](https://sentry.zendesk.com/hc/en-us/articles/26323481356443-How-to-filter-native-events-in-React-Native-SDK),
[8.24.0 options
source](https://github.com/getsentry/sentry-react-native/blob/8.24.0/packages/core/src/js/options.ts),
and [8.7.0 Stable
release](https://github.com/getsentry/sentry-react-native/releases/tag/8.7.0))

This is a v1 release constraint, not a permanent rejection. Reconsider a
third-party mobile error processor only after measured incidents repeatedly
defeat the Apple, provider, uptime, operational-counter, and user-export paths;
the selected released SDK must expose and document one fine-grained policy that
is honored across JavaScript, Android, and iOS; and release-shaped tests must
prove every serialized path, processor region/retention/deletion/access term,
App Privacy answer, native dependency, and uninstall rollback. Until then,
absence from the dependency lock, generated native projects, signed IPA/AAB,
environment inventory, and network allowlist is the proof. ([Sentry API
regions](https://docs.sentry.io/api/), [Sentry pricing and
retention](https://sentry.io/pricing/), [Sentry security and
deletion](https://sentry.io/security/))

Combine it with:

- Supabase database/auth/function/storage dashboards and logs;
- Supavisor client/backend connection utilization, PostgreSQL direct/reserved
  headroom, pool-acquire latency/timeouts, and idle-in-transaction sessions,
  separated by runtime role and environment;
- custom sync API latency/error rate, oldest local command age reported in bounded buckets, server command retry/duplicate/rejection rate, device cursor lag, and unknown-schema count;
- APNs request/response records and invalid-token lifecycle;
- KMS encrypt/decrypt latency and typed failure rate, envelope-version mismatch,
  disabled/pending-deletion/rotation state, and restored-envelope verification,
  without logging encryption context or athlete identifiers;
- RevenueCat/App Store entitlement events;
- product-owned `operations_jobs`, `sync_rejections`, moderation queues, audit events, and privacy-operation ledgers;
- public uptime checks for login bootstrap, sync upload, canonical Finding, search, and operations authentication.

Alert on actionable symptoms:

- owner-isolation or RLS test failure: block release;
- sync rejection spike, oldest pending command age, device cursor lag, unknown schema, or blocked dependency chain;
- queue oldest age/dead letter, push receipt errors, source-refresh failures, and stale retraction checks;
- worker soft-deadline abort/function timeout, expired or fenced lease, redelivery count, checkpoint age, poison-task state, and stalled privacy/source/notification job;
- moderation/report/appeal age beyond policy, unassigned safety case, or Pack pause not reaching clients;
- incomplete export/deletion saga, orphaned storage object, failed session revoke;
- auth OTP abuse, delayed/failed/bounce/complaint/suppression or quota spike,
  signed-webhook disablement/lag, SMTP credential/domain failure, billing webhook lag, stale entitlement-reconciliation
  age, repeated provider refresh failure, Apple crash-rate increase by
  version/build when the contributing opt-in sample is sufficient, a new or
  widening symbolicated crash signature, median/p90 hang-rate regression or
  top one-second hang signature, and public 5xx/latency; insufficient Apple
  usage data raises an evidence-gap status during a monitored release rather
  than a false stability pass;
- pooler-client or PostgreSQL-backend saturation, acquisition timeout, unexpected
  direct application connection, or idle-in-transaction leak.
- Field Note KMS key disabled/pending deletion, unexpected key ARN/Region/context
  or multi-Region policy/grant drift where applicable, decrypt-failure or latency
  spike, envelope-version mismatch, or restored-snapshot verification failure.

Logs use request/operation/case IDs and typed error codes, not payload dumps. Retention and access are per environment and data class. Supabase log drains are an optional paid scale step, not required at initial v1 traffic; product audit remains independent.

## App Store release and privacy readiness

Before submission:

- enroll with the appropriate Apple developer entity; membership is currently USD 99/year and the seller name/entity choice is difficult to reverse; ([Apple Developer Program](https://developer.apple.com/programs/))
- create production signing/push/IAP records through least-privilege owner-controlled accounts; EAS may automate mechanics but does not own the legal account;
- provide in-app subscription terms, restore purchases, entitlement recovery, support, and privacy policy;
- provide in-app account deletion and a reachable support/contact path;
- document for App Review that the company-owned email-OTP flow is the sole
  primary-account login and any authorized ORCID OAuth is post-login account
  linking only; recheck Guideline 4.8 before adding any third-party primary
  login rather than assuming this v1 exemption survives a future auth change;
- prepare reviewer credentials/content and a written explanation of the bounded practice/reflection model, human moderation, reporting/blocking, and non-medical positioning;
- complete App Privacy answers from the actual data/SDK inventory, including Health & Fitness, user content, identifiers, diagnostics, and third-party processing where applicable; Apple requires disclosure of first- and third-party collection and a privacy policy URL. ([App Privacy details](https://developer.apple.com/app-store/app-privacy-details/))
- reconcile the final signed IPA's native dependency inventory, SDK signatures, bundled manifests, Xcode privacy report, required-reason API declarations, tracking domains, and data-use declarations with the reviewed Gate 0 allowlist and App Privacy answers;
- exercise TestFlight internal/external groups, sandbox subscription states, push receipts, export/deletion, and restore purchase;
- use EAS Submit as a transport tool, not as the review/compliance process. ([EAS Submit](https://docs.expo.dev/submit/introduction/))
- release updates with Apple's phased release after a small monitored manual release where appropriate; phased release rolls an update over seven days and can be paused. ([Apple phased release](https://developer.apple.com/help/app-store-connect/update-your-app/release-a-version-update-in-phases/))

Apple’s review guidelines also require UGC reporting/blocking/contact controls and restrict using health/fitness data for advertising or use-based data mining. The product should avoid HealthKit entirely in v1 unless a Pack proves the need and a separate privacy/review architecture is approved. ([App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/))

Privacy-manifest proof begins with the first release-shaped native build, not
with final submission. Apple requires a manifest for every listed SDK version
and for SDKs that repackage a listed SDK, plus a signature when a listed SDK is
used as a binary dependency. Required-reason declarations belong to the bundle
that uses the API; a separately bundled SDK cannot rely on the app's manifest.
Expo SDK 57's build-properties source and default Podfile enable CocoaPods
privacy-manifest aggregation by default. That setting can aggregate only the
declarations present in the resolved native graph; it does not prove that every
dependency supplied a valid manifest, that each manifest reached the required
bundle, or that listed/repackaged SDK and binary-signature requirements are
satisfied. Expo's current guide also warns that Apple does not correctly parse
every manifest in static CocoaPods dependencies and may require those reasons
in the app-root manifest. Treat aggregation and Xcode's combined report as
build and review mechanisms, not supply-chain or compliance proof: retain
reviewed app-root declarations for app and statically linked code, require
SDK-local manifests and applicable signatures for separately bundled listed or
repackaged SDKs, generate and archive the Xcode privacy report from the
release-shaped build, and inspect the generated bundle and dependency
inventory.
React Native maintainers also record Apple's clarification that the listed
`hermes` SDK is Imgur's package, not Meta's React Native engine, so a name match
is not dependency evidence. Therefore Gate 0 freezes the initial
native SDK/data-use allowlist, Gate 1 inspects the generated bundle and merged
report, every dependency change repeats that proof, and Gate 6 reconciles the
final signed IPA and App Privacy answers. App Store Connect warning email is a
last external check, not the discovery mechanism. ([Apple third-party SDK requirements](https://developer.apple.com/support/third-party-SDK-requirements/),
[required-reason APIs](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api),
[Expo privacy manifests](https://docs.expo.dev/guides/apple-privacy/),
[Expo BuildProperties](https://docs.expo.dev/versions/v57.0.0/sdk/build-properties/),
[SDK 57 aggregation source](https://raw.githubusercontent.com/expo/expo/sdk-57/packages/expo-build-properties/src/ios.ts), [SDK 57 default Podfile](https://raw.githubusercontent.com/expo/expo/sdk-57/templates/expo-template-bare-minimum/ios/Podfile),
and [React Native privacy-manifest clarification](https://github.com/react-native-community/discussions-and-proposals/discussions/776))

## Internal build sequence and proof gates

This is implementation order for one complete release, not an MVP roadmap.

### Gate 0 — accepted contracts and irreversible boundaries

- accept glossary, product invariants, data classes, Pack/Protocol authority,
  public/private split, deletion/public-retention policy, target region,
  processor list, and the server-decryptable—not E2EE—Field Note free-text
  threat model plus the single-Region KMS decision and account/recovery
  boundary; override it before the first production envelope only for an
  accepted numeric cross-Region service target with a named and tested complete
  recovery path;
- define complete schemas/safety/publication contracts for every v1 Pack;
- decide Apple entity, credential jurisdictions, moderation staffing, and the
  exact subscription product IDs, standard durations, free/introductory
  transitions, and one app-wide 3/16/28-day plus renewal-eligibility grace
  tuple; default the catalog to monthly and/or yearly products, authorize a
  weekly product only as a recorded exception accepting its 3/6/6-day grace and
  additional proof matrix, and use `All Renewals` when a free-to-paid transition
  requires grace; freeze RevenueCat production and release-test sandbox to
  `Transfer to new App User ID`, a custom-only server-issued UUIDv4 identity
  lifecycle, authenticated purchase/restore access, and no SDK `logOut()` or
  automatic `syncPurchases()` path; decide whether to pursue the applicable ORCID
  membership/license and required production integration review; keep every ORCID
  OAuth/API path absent until Production Member API credentials are issued;
  conservatively budget and accept Pro plus Advanced Deployment
  Protection or Enterprise for `apps/ops`, then verify Vercel Authentication
  over All Deployments on the production domain and freeze project
  membership/bypass policy. Remove the add-on only if the selected plain-Pro
  account proves the same anonymous-denial boundary despite the current
  first-party documentation contradiction;
  freeze the initial primary-login/account-linking contract and native SDK,
  required-reason, data-use, and processor allowlist; record the mandatory
  no-Sentry Apple diagnostics release path, including archive/symbol
  custody, TestFlight crash/hang and device-log proof, App Store
  sample/latency limitations, release-review ownership, and no product-owned
  MetricKit ingestion; freeze Sentry and every other mobile diagnostics SDK,
  project, upload credential, source-map upload, and event destination out of
  the complete-v1 dependency, environment, and network allowlists;
- accept or reject Resend's US processing and 30-day email-content/metadata/log
  retention plus DPA/subprocessors and account-termination deletion boundary;
  if accepted, freeze an auth-only team/subdomain/From address, SPF/DKIM/DMARC,
  tracking-off template, current Supabase/Resend quotas, signed event set and
  retention, sending-only/domain-scoped key rotation, and manual standby SMTP
  runbook; if not accepted, select and prove another custom SMTP provider before
  external accounts;
- record the exact Supabase/Vercel/Field Note KMS region tuple and whether the
  evidence establishes only region-code alignment or a separately benchmarked
  provider/network path; never infer facility or Availability-Zone colocation;
  for a Brazil-first decision, use the current `sa-east-1` / `gru1` /
  `sa-east-1` tuple rather than a general region; separately record the recovery
  S3 account/Region and the backup KMS key ARN/Region and replication decision;
  for Brazil without an accepted cross-Region recovery target, use `sa-east-1`
  and no replication;
- proof: decision record, data map, threat model, Pack fixtures, region-tuple
  deployment assertion and mismatch fixture, native
  SDK/privacy inventory, recorded Vercel plan/add-on entitlement and anonymous
  denial on the real production `apps/ops` domain and every assigned/generated
  production URL plus project-membership, access-group, individual grant,
  approved-access-request, authenticated-cookie, Shareable-Link,
  automation-secret, Exception, and OPTIONS-allowlist inventory with no
  unowned or unexpired bypass, and
  moderation/deletion tabletop.

### Gate 1 — local-first and sync risk spike

- Expo SDK 57 development build scaffolded explicitly from `default@sdk-57`,
  resolving from the current `expo@57.0.18` / React Native 0.86.3 stable start
  and never below the `expo@57.0.17` / React Native 0.86.3
  regression-fixed floor, and the documented Node.js 22.13.x, Android SDK 36,
  and Xcode 26.4 floors; resolve the current stable 57.x module graph through
  the official SDK-range/install-fix flow, then pin the exact graph and
  compatible native toolchain only after proof; SQLCipher, migrations, local
  Practice ledger, typed command/outbox API, owner change feed, two-device
  conflicts/rejections, Field Note free-text
  envelope/rotation/outage proof including regional failover if Gate 0 selected
  a multi-Region key, logout wipe;
- proof: all nine sync proof-gate scenarios on iOS and Android with a
  disposable backend, including `PAGE_ALIGNMENT_16K` on the release AAB,
  every 64-bit ELF in the APK set generated from that AAB, and SQLCipher
  lifecycle execution with a supported `PRAGMA cipher_version`, repeated
  JavaScript-runtime teardown/duplicate-handle recovery, and exactly-once outbox
  continuation without compatibility mode on an Android runtime that reports a
  16 KB page size; generated iOS
  bundle/privacy-report inspection against the Gate 0 native SDK allowlist,
  including proof that Sentry is absent from the dependency lock, generated
  native projects, release artifacts, build secrets, and network allowlist;
  New Architecture release-build and lifecycle proof for every native module,
  with no Legacy opt-out or unreviewed compatibility exception;
  and concurrent web/ops/jobs burst tests that verify transaction-pool
  compatibility, role isolation, bounded client/backend connections, headroom,
  rollback, no idle-in-transaction leak, and execution in the accepted region
  tuple;
- decision: accept the product-owned protocol after correctness/privacy review,
  or invoke the PowerSync contingency through the same `SyncGateway` interface.
  PowerSync is acceptable only if a release-shaped rejection test preserves the
  original typed mutation, acknowledges the queue item, delivers the recovery
  record, advances to the next checkpoint, and continues independent work
  without exposing managed internal tables outside the encrypted
  recovery/wipe/data-inventory boundary.

### Gate 2 — private complete Practice system

- auth/onboarding/Profile; all complete-v1 Packs; Experiment/Try/Field Note/Finding/Tested Item/Protocol versions; Library; local reminders; accessibility; recovery/export foundation;
- proof: each Pack contract corpus, offline lifecycle tests, owner isolation, full private loop on real iPhone and Android smoke.

### Gate 3 — identity, public boundary, and premium

- credential/affiliation claims, evidence storage, literal states; RevenueCat
  customer references and entitlements; minimized submissions and canonical
  public revisions/pages; source metadata/retraction adapter;
- proof: sensitive-canary publication tests, credential object isolation,
  billing state plus identity/restore/account-deletion matrices with no
  anonymous alias or product-data recovery, DOI/retraction fixtures, permanent
  URL/revision behavior.

### Gate 4 — complete social and discovery

- people/topics/Packs follows, chronological feeds, saves, search, discovery directories, revision-anchored threads, blocks/mutes, remote notifications/inbox;
- proof: deterministic keyset feeds, zero popularity ranking, search eligibility, push retry/privacy, discussion depth/edit/report behavior.

### Gate 5 — trust and operational control

- protected Next.js operations surface, moderation cases/actions, verification, reports, appeals, audit, Pack pauses, source-review cases, correction/withdrawal, job dashboards;
- proof: least-privilege role matrix, TOTP enrollment/backup/revocation and stale-AAL fault matrix, server/data-boundary denial independent of route/UI state, and end-to-end table-top cases with a second human acting as appeal reviewer/backup moderator.

### Gate 6 — privacy, observability, and release hardening

- complete export/scoped deletion/account deletion; database/object backup and restore inventory; telemetry allowlist; alerts/runbooks; store privacy manifest/answers; TestFlight and subscription restore;
- proof: interrupted/retried privacy sagas plus the worker
  timeout/redelivery/deployment/poison-task matrix, device wipe, repeated PITR and
  project-loss whole-service drills within the accepted scenario-specific RTOs
  and margin, complete logical-bundle member/tool-version/fence proof with
  archived/diffed CLI scope and required-table row-count parity,
  transactional Auth/product/Storage-metadata restore plus separately verified
  object bytes and provider configuration, off-provider database/object
  integrity and restore proof,
  restored free-text envelope decryption plus KMS key-state recovery,
  canary-free logs/events/push, retained archive/dSYM plus symbolicated
  TestFlight crash proof, physical-device hang/termination/log-retrieval proof,
  revalidated production `apps/ops` plan/scope, anonymous-denial and complete
  access/bypass inventory,
  a versioned stability-review packet that marks insufficient Apple data as an
  evidence gap, final proof that no Sentry SDK/configuration/upload path entered
  the signed build or release environment, final signed-IPA SDK
  manifest/signature and App Privacy
  reconciliation, production-like release rehearsal, and the App Store
  evidence packet.

Only after Gate 6 does the complete v1 release. No gate authorizes pushing, deploying, account creation, provider enrollment, or live-service changes in this research task.

## One-developer cost model

Prices and pricing rules reflect the latest source checks performed from
2026-08-27 through 2026-08-30 and must be rechecked before purchase. Usage,
tax, exchange rate, regional compute, human review, legal review, support, and
incident labor are excluded.

| Service | Recommended v1 tier | Approximate fixed cost | Notes/source |
|---|---:|---:|---|
| Apple Developer Program | membership | $99/year (~$8.25/month) | Required to distribute; [Apple](https://developer.apple.com/programs/whats-included/) |
| Expo EAS | Starter | $19/month | Includes build credit; free tier can support the proof stage, but low-priority/limited capacity is not a release-operation plan. [Expo pricing](https://expo.dev/pricing) |
| Supabase | Pro + Small compute + seven-day production PITR | ~$130/month | Current example: $25 Pro + $15 Small compute + $100 PITR - $10 compute credit; pricing and recovery behavior need launch verification. [Supabase PITR usage](https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery) |
| AWS S3 backup | versioned private recovery bucket | usage-based; no fixed estimate | Encrypted logical database snapshots and non-regenerable private objects; storage, requests, transfer, key management, and restore traffic vary. [AWS S3 pricing](https://aws.amazon.com/s3/pricing/) |
| AWS KMS keys | one symmetric Field Note key, one symmetric backup-encryption key, plus one asymmetric audit-signing key | at least $3/month plus requests/retained rotations | All three purposes use distinct keys. The backup key is required for pre-upload logical/object envelopes; a selected multi-Region replica adds another key/request line. Recheck current pricing. [AWS KMS pricing](https://aws.amazon.com/kms/pricing/) |
| Vercel | Pro + Advanced Deployment Protection, conservatively pending account proof | $170/month before usage | Pro is $20/month; the specific `All Deployments` documentation requires Enterprise or the $150/month Pro add-on even though its scope summary says `All Deployments` is available on Pro. The live pricing table lists the add-on separately; the generic Security and authentication-method pages do not establish ordinary-Pro production entitlement. Retain the add-on until the selected account proves otherwise; Vercel currently requires at least 30 days before it can be disabled. [Vercel pricing](https://vercel.com/pricing), [Deployment Protection](https://vercel.com/docs/deployment-protection), [Vercel Enterprise plan](https://vercel.com/docs/plans/enterprise) |
| Sentry | excluded from complete v1 | $0 | No SDK, project, upload credential, source-map upload, or event stream. A post-v1 reconsideration requires measured diagnostic need plus a stable cross-native data-control contract and separately accepted processor cost/terms. |
| Transactional email | Resend Free only for a bounded accepted cohort; Pro when daily or support needs exceed it | $0 initially; Pro $20/month at scale; optional message-content-storage disablement adds $50/month after eligibility | Free is production-enabled but capped at 100 emails/day and 3,000/month; all ordinary tiers retain message content/metadata/events/logs for 30 days, and no Free/Pro SLA is claimed. The storage-off add-on cannot be assumed at launch because it requires one paid month, an active site, more than 3,000 sent emails, and a low bounce rate. [Resend quotas](https://resend.com/docs/knowledge-base/account-quotas-and-limits), [pricing](https://resend.com/pricing), [storage control](https://resend.com/docs/knowledge-base/how-do-i-ensure-sensitive-data-isnt-stored-on-resend) |
| RevenueCat | free below threshold | $0 until $2,500 monthly tracked revenue, then 1% | Recheck threshold and definition; [RevenueCat pricing](https://www.revenuecat.com/pricing/) |

Baseline fixed infrastructure is therefore conservatively about **$330/month** including the Field Note, backup-encryption, and audit-signing KMS keys, Vercel's production-protection add-on, and amortized Apple membership and excluding paid email; about **$350/month** with Resend Pro. If Gate 0 proves that the selected ordinary-Pro account supplies the same production-domain Vercel Authentication boundary, remove $150/month from both estimates and record the proof rather than silently changing the security contract. AWS backup usage, KMS requests/retained rotations, a selected multi-Region KMS replica, key management, and recovery transfer are additional variable costs. Do not add a Supabase Read Replica to this baseline as a recovery line: each replica adds mirrored compute, disk, and related usage while remaining an asynchronous read-only database, not writable service failover. ([Supabase Read Replica usage](https://supabase.com/docs/guides/platform/manage-your-usage/read-replicas)) The custom sync protocol consumes the existing Vercel/PostgreSQL quotas but adds engineering and observability cost rather than a fixed vendor line. The baseline includes no Vercel Workflow storage or step usage because complete v1 keeps the PostgreSQL-canonical leased executor; a later accepted managed executor adds usage-based Workflow storage, steps, and ordinary function compute. ([Vercel limits and pricing](https://vercel.com/docs/limits)) If the PowerSync contingency is selected, Pro currently adds at least $49/month; Team starts at $599/month and may be required if Gate 1 accepts service-version locking, uptime/support commitments, customer-provided bucket storage, private endpoints, or asynchronous custom checkpoints as launch controls. Do not budget Pro until the processor/DPA/region/retention/deletion and tier review is complete. ([PowerSync pricing](https://www.powersync.com/pricing)) Domain registration, tax, overages, and exchange rate add modest but variable cost. App Store commission is revenue-dependent; eligible Small Business Program participants may receive a 15% commission rate, subject to Apple's current terms. ([Apple Small Business Program](https://developer.apple.com/app-store/small-business-program/))

That fixed baseline excludes regional Vercel compute and transfer. Current
Vercel Fluid Compute rates vary by region, and São Paulo is priced differently
from the default Washington, D.C. region; Gate 0 budgets from the accepted
tuple rather than moving database-touching compute to a cheaper region and
creating an undeclared cross-region data path. ([Vercel Fluid Compute pricing](https://vercel.com/docs/functions/usage-and-pricing))

The baseline assumes the pinned Expo SQLCipher path passes the Android 16 KB
artifact gate. A focused native persistence adapter, maintained SQLCipher
package, or commercial support needed to close a failure would add engineering
or license cost that is not priced here; Gate 1 must resolve it before Android
is described as maintained or release-ready.

Avoid initially:

- Supabase PITR on non-production projects and log-drain add-ons until risk/volume justify them; production PITR is part of the release durability boundary;
- a separate search vendor, analytics warehouse, feature-flag platform, media transcoder, Redis, Kafka, or Kubernetes;
- dual public iOS/Android support before operations are stable.

The largest operational cost is not listed SaaS: qualified human moderation, credential verification across jurisdictions, appeals independence, privacy/legal review, user support, and incident coverage. The architecture is unsafe if “one developer” means no backup human for safety-adjacent queues. Establish low publishing volume, explicit response targets, and a trained backup reviewer before public launch.

## Risks and architectural challenges

| Risk | Why it matters | Control / exit |
|---|---|---|
| Custom sync correctness | Retry, crash, schema drift, or cursor bugs can lose or indefinitely hide athlete-owned work. | Tiny typed protocol, transactional outbox/change event, idempotency, retained log, compatibility matrix, two-device fault injection, contingency adapter. |
| New Architecture native-module incompatibility | Current Expo/React Native releases cannot fall back to Legacy Architecture; an interop-layer build can still hide runtime failure in a native dependency. | Pin the supported SDK pair and dependency inventory; use `expo-doctor` as triage; prove every native module on release-shaped iOS/Android artifacts; replace or isolate failures behind the existing adapter rather than pinning an obsolete SDK. |
| Android encrypted-store artifact or lifecycle incompatibility | Expo/SQLCipher can compile while one vendored or transitive native library remains 4 KB-aligned, and the current open Android handle-teardown defect can prevent a new JavaScript runtime from reopening the database and strand the outbox. | Pin the full native toolchain; inspect AAB ZIP and every 64-bit ELF; run SQLCipher version/key/WAL/migration plus repeated runtime-teardown/duplicate-handle/outbox recovery on a 16 KB runtime at Gate 1 and after native changes; use a compatible upstream fix or isolate the persistence adapter, never disable encryption. |
| Rejected-command dependency poisoning | One permanent invalid offline write can delay later commands that depend on it. | Typed recoverable rejection, continue independent work, expose dependency chain, backlog-age alert, two-device tests. |
| Durable-job truncation or duplicate effects | Function timeouts, deployment, expired visibility, or overlapping Cron wakes can interrupt a privacy/safety operation or repeat an external call. | PostgreSQL-canonical task state, short fenced leases, bounded checkpoints, idempotency/reconciliation, poison-task visibility, and kill/redelivery proof. |
| PowerSync contingency adds a private-data processor, blocking checkpoint semantics, and tier dependency | If selected later, replicated private rows/history cross another vendor boundary, the replication role reads every published update, an unacknowledged FIFO mutation prevents a newer checkpoint from applying, and version locking or stronger operational controls may require Team rather than Pro. | Explicit publication/grants, mirrored authorization review, typed rejection preservation plus checkpoint-advance proof, managed-local-table inventory/wipe tests, DPA/region/retention/deletion/tier acceptance, endpoint-switch/full-resync exit drill, and proof inspection; do not select by convenience alone. |
| Pack contract drift | A schema/safety edit could reinterpret old practice. | Immutable Pack Versions/digests, pinned records, explicit clone/migration, shared fixtures. |
| Public/private join leakage | A visibility flag or convenience query could expose raw notes. | Separate tables/schema/roles, allowlist projection, private canaries, public-role integration tests. |
| Free-text envelope key loss, regional outage, or decrypt-path compromise | A disabled/deleted or unavailable single-Region KMS key can make retained notes unreadable, while compromise of the authorized API plus KMS grant defeats this database-only separation; a multi-Region replica narrows only the KMS outage and expands decryption geography plus policy/audit surface. | Dedicated non-admin runtime grants, exact key/context allowlists, ciphertext-only persistence, no plaintext fallback or data-key cache, rotation/restore fixtures, key-state alarms, destructive-key dual control, a single-Region default with multi-Region creation/replication denied, whole-path proof for any pre-envelope exception, and an explicit non-E2EE/no-service-failover claim. |
| Privileged-session downgrade or UI-only MFA | A moderator or privacy operator can retain a stale `aal2` token after factor removal, satisfy factor-agnostic AAL through a weaker fallback, or reach an API that was protected only in navigation. | TOTP-only operations configuration, two separately held factors, request-scoped Auth-server validation, current/next `aal2` plus TOTP `amr` and verified-factor checks at every privileged transaction, restrictive RLS where applicable, short sessions, and denial-matrix tests. |
| Operations-perimeter or plan drift | Vercel Standard Protection leaves production domains public; current first-party plan summaries conflict about plain-Pro `All Deployments`; and a Shareable Link, project-wide automation bypass secret, preview-domain Exception, prefix-matched OPTIONS Allowlist, or over-broad project membership can bypass some or all of the selected perimeter. | Conservatively budget the add-on, record the exact plan/add-on entitlement, prove anonymous denial on the real production domain, keep least project membership and no default bypass path, inventory/revoke exceptions, and enforce server-side TOTP/product authorization regardless of perimeter outcome. |
| Audit-history tampering | A privileged database actor can rewrite an in-database hash chain, while a signature over an already false head does not make the event true. | Non-owner append-only runtime roles, serialized hashes, daily payload-free KMS-signed checkpoints in a separate-account versioned bucket with governance-mode Object Lock retention, independent verification/alerts, and no claim of global immutability. |
| Human moderation bottleneck | Complete v1 includes safety, credentials, reports, and appeals. | Narrow eligible publication, severity queues, response policy, backup reviewer, scoped Pack pauses. |
| Retraction metadata is incomplete/late | Public evidence can become outdated without a definitive machine feed. | Multiple source provenance, checked-at display, human review, corrections, never overclaim completeness. |
| ORCID terms/semantics | Public API OAuth is not a revenue-generating production path, `/summary` is member-only, and an authenticated iD is not identity proof. | Keep integration absent until applicable membership/license, required integration review, and Production Member API credentials exist; keep connection, assertion provenance, credential, affiliation, role, and evidence label separate. |
| Canonical database or service recovery failure | Default Supabase CLI dumps omit managed schema definitions and, without explicit flags, data and roles; its data dump also has explicit schema/table exclusions, while a logical database restore still omits Storage bytes and service configuration. Daily provider backups can lose up to a day, the owner change log is co-located, PITR is not independent, Read Replicas cannot accept writes or serve Auth/Storage/Realtime, and provider docs supply no service RTO. | Production PITR; a migration-fenced, version-pinned, pre-upload-encrypted recovery bundle with roles, application schema, inventoried pinned-scope data including required Auth rows and Storage metadata, migration history, reviewed managed-schema changes, separate object bytes, and configuration inventory; archive/diff effective CLI scope and reconcile required tables; stable product API; forced reauthentication; freshness alerts; repeated whole-service drills; no replica/provider-wide RTO claim without an alternate writable runtime. |
| Backup envelope or key failure | S3 server-side encryption returns plaintext to an authorized reader and does not protect a copied artifact; pre-upload encryption adds transient plaintext handling, format/key compatibility, and the risk that a disabled, deleted, or inaccessible backup KMS key makes every retained recovery copy unreadable. | Stream plaintext only inside the bounded encrypt-only worker with no plaintext staging or fallback; use an exact-ARN dedicated backup key and split write/decrypt/delete/admin roles; retain S3 SSE-S3 only as defense in depth; alarm on key/policy drift and prove old/new envelope restoration before accepting recovery capability. |
| Object deletion/backup mismatch | Database restore recovers only metadata; Supabase deletion is permanent, while an S3 delete marker can hide retained versions. | Purpose-scoped inventory, verified separate-account copy, disposable restore, all-version purge, deletion reconciliation and alert. |
| RevenueCat identity or restore drift | A project-wide restore-setting change or anonymous App User ID can strand an active Apple purchase, transfer it to a logged-out device identity, or alias deleted and new provider histories. | Custom-only opaque UUIDv4 references after product authentication, `Transfer to new App User ID`, no SDK `logOut()` or automatic `syncPurchases()`, entitlement-only explicit restore, configuration drift checks, and deletion/restore tests. |
| Store policy/review | Premium UGC and health-adjacent wording increase review/operations obligations. | IAP, report/block/contact/delete, privacy inventory, non-medical bounded copy, reviewer packet. |
| Native SDK privacy-manifest drift | Expo/React Native transitive dependencies can add required-reason use or an Apple-listed/repackaged SDK; static dependency manifests may not aggregate into the app as expected, making late submission the first failure signal. | Gate 0 allowlist, first-native-build bundle/report proof, dependency-lock and merged-report diffs, per-upgrade checks, final signed-IPA reconciliation. |
| Diagnostic telemetry leaks private context | The current Sentry React Native SDK omits the cross-native `dataCollection` contract, JavaScript filters do not cover native events, and hosted processing adds a separate region/retention/deletion boundary. | Make no-Sentry mandatory for complete v1; prove absence from dependencies, generated projects, signed artifacts, build secrets, and network destinations. Reconsider post-v1 only after repeated measured Apple-diagnostics gaps and a released, documented, cross-native policy plus full artifact/processor proof. |
| Apple diagnostics are sparse, delayed, or incomplete | App Store usage/crash evidence is consent-dependent and thresholded, analytics can lag, and Crashes Organizer excludes watchdog, invalid-signature, thermal, and Jetsam events; a small launch can look empty without being stable. | Retain archives/symbols, prove TestFlight crash and physical-device hang capture, inspect termination/launch metrics, rehearse original device-log support, record sample/completeness with every version comparison, and treat absent data as unknown. Defer MetricKit ingestion until this boundary repeatedly blocks a real incident. |
| Database connection exhaustion or semantic mismatch | Autoscaling web/ops/jobs pools can multiply clients, while transaction pooling rejects prepared statements and cannot preserve session state. | Separate runtime roles, shared Supavisor transaction mode, capped Fluid Compute pools, short explicit transactions, no session-dependent authorization/locks, Gate 1 burst/rollback proof, and connection/headroom alerts. |
| Region tuple drift | A general Supabase choice, Vercel's `iad1` default, a wrong-Region KMS ARN, or an implicit S3 replication setting can move online or recovery data across an unreviewed boundary and add latency or residency risk while dashboards still look healthy. | Gate 0 exact online and recovery-storage tuples, deployment/startup assertions, fail-closed mismatch fixtures, bucket/key/replication inventory, region evidence in every release, and an explicit migration decision for any later change. |
| Email OTP transport becomes an account-access outage | Custom SMTP can accept a message that is later delayed, bounced, suppressed, filtered, or blocked by quota/reputation; Resend suppressions and rate limits are team-wide, its sending Region is not data residency, and a leaked non-expiring SMTP API key can abuse the domain. | Auth-only team/subdomain and transactional template, SPF/DKIM/DMARC, tracking off, accepted US processing/30-day retention, intersecting quota/abuse controls, signed idempotent delivery events, suppression and reputation alerts, sending-only domain-scoped key rotation, generic recovery UX, and a rehearsed manual standby-provider cutover. |
| One-person on-call | Push, auth, sync, retractions, reports, and deletion can fail simultaneously. | Small managed stack, actionable alerts, job replay, runbooks, spend caps, human backup, constrained publication. |
| Vendor/API price drift | Baseline crosses multiple managed products. | Adapter seams, quarterly cost review, usage budgets, postpone irreversible coupling, fallback plans. |

## Irreversible or expensive decisions to delay

Delay until evidence is available, but set a decision deadline before its dependent gate:

- permanent Apple-only product direction; retain cross-platform code until product evidence says otherwise;
- public Android launch date; keep compatibility proof only;
- an ORCID membership/license, required integration review, Production Member API
  credentials, and token-bearing integration;
- a dedicated external search engine or analytics warehouse;
- product-owned MetricKit ingestion, Sentry, or another state-labelled native
  diagnostics processor until repeated Apple evidence gaps justify the
  additional app/backend data boundary and the selected released SDK exposes a
  stable, documented policy across JavaScript, Android, and iOS;
- arbitrary Field Note media/video and its moderation/storage policy;
- client-held E2EE/zero-knowledge recovery, per-athlete wrapping keys or
  cryptographic deletion, dual wrapping, and data-key caching for Field Note
  free text; the v1 server-side dedicated envelope is recommended, while these
  stronger but recovery- and operations-heavy variants wait for a separate
  threat/RTO/support decision;
- custom CRDT or general-purpose replication engine, multi-region active-active database, microservices, or a generic provider framework; the already recommended narrow typed command/change-feed protocol remains the Gate 1 default rather than a deferred general sync platform;
- public follower lists/counts, engagement ranking, reposts, DMs, or recommendation algorithms;
- HealthKit/Health Connect, wearable data, or automatic training-plan integration;
- long-lived public API or third-party Pack marketplace;
- copying/auto-migrating protocols between Pack versions.

Some decisions cannot wait until launch: seller/legal entity, primary data
region, whether a documented cross-Region service requirement overrides the
single-Region Field Note wrapping-key recommendation before the first envelope,
privacy retention, processor/DPA acceptance, exact public URL identity,
complete Pack contracts, credential jurisdictions, moderation coverage, and
what happens to public revisions/account data on deletion. Record these before
Gate 1 or Gate 3 as noted. A single-Region key cannot later be converted into a
multi-Region key; changing that boundary requires a new key and envelope
migration.

## Explicit assumptions

1. Complete v1 launches publicly on iOS first; Android is a maintained future release target.
2. The product is a new repository/deployment and does not share Training Hub users, credentials, database, or live services.
3. English is the only release UI/content locale, but identifiers, layouts, and copy infrastructure do not prevent localization.
4. One app account represents one athlete; coaches/practitioners have external authority metadata or their own public identity, not delegated write access to athlete raw data in v1.
5. Multi-device use is supported and requires explicit conflict handling.
6. No automatic wearable/health-platform import, causal adaptation, diagnosis, injury clearance, or plan rewrite is in v1.
7. Field Notes are typed text/numeric/choice records; arbitrary private photo/video/audio is excluded pending Pack-specific evidence.
8. Public submission volume can be human reviewed. If expected volume invalidates that, the publication policy—not safety review quality—must narrow.
9. PostgreSQL FTS is sufficient for the expected English corpus and latency at complete-v1 scale.
10. The product will obtain legal/privacy review appropriate to launch regions; this architecture does not assert HIPAA, GDPR, LGPD, or medical-device compliance.
11. The backend may briefly process decrypted Field Note free text for an
    owner-authorized read/sync/export or athlete-selected case attachment. The
    architecture protects database-only copies and roles; it does not promise
    client-held E2EE, zero knowledge, or availability during a KMS outage.
12. The Gate 1 baseline is Expo SDK 57, starting from the current
    `expo@57.0.18` / React Native 0.86.3 stable pair and never below the
    `expo@57.0.17` / React Native 0.86.3 regression-fixed floor, on the mandatory
    New Architecture; the exact lock follows release-artifact proof, and no
    complete-v1 capability depends on a Legacy Architecture fallback, Expo SDK
    56, or an unproved third-party native interop path.
13. Complete v1 uses the mandatory no-Sentry diagnostics path; Sentry is absent
    from dependencies, generated native projects, signed artifacts, build
    secrets, and network destinations. Native evidence is Apple's
    TestFlight/App Store/Xcode Organizer path with retained archives/symbols
    and explicit sample/latency limits. A measured post-v1 incident gap may
    reopen Sentry or product-owned MetricKit only as a new processor, privacy,
    retention, compatibility, cost, and release-artifact decision.
14. Complete v1 has no managed cross-Region writable database failover. A
    Supabase Read Replica is capacity/latency redundancy only and does not
    change the disclosed provider/region-wide service-recovery boundary.
15. Gate 0 can select one exact common Supabase/Vercel/Field Note KMS region
    tuple. If Brazil is the accepted first data jurisdiction under current
    provider inventories, that tuple is `sa-east-1` / `gru1` / `sa-east-1`;
    no launch assumption silently substitutes a general or merely nearby
    region.
16. No numeric cross-Region Field Note service target or alternate complete
    runtime has been accepted in this research. Complete v1 therefore uses the
    single-Region key; a later product/legal requirement must reopen and prove
    that boundary before the first production envelope.
17. Every complete-v1 purchase and restore begins from an authenticated live
    product account with its own server-issued opaque UUIDv4 RevenueCat
    reference. The product has no anonymous purchase, anonymous entitlement, or
    guest-to-account merge path.

## Open questions and required Gate decisions

1. Which countries/jurisdictions launch first, and what credential types can the product responsibly verify in each?
2. What exact retention applies to reports, appeals, security audit, credential decisions/evidence, deletion receipts, exports, provider logs, and backups? The accepted schedule also sets the finite audit-checkpoint retention; v1 uses governance mode and must not switch to compliance-mode WORM without a separate deletion/retention decision.
3. Which launch-jurisdiction laws, if any, require retaining a minimum nonpublic record after account deletion, for which exact objects and duration? V1 otherwise deletes substantive authored public revisions and replies rather than retaining or merely anonymizing them for revision/thread continuity.
4. Who is the qualified primary and independent appeal/backup reviewer for each safety/credential scope, and what are the published response targets?
5. Is permanent Apple exclusivity a credible product strategy, or is iOS-first only an operational sequence?
6. Does the pinned Expo SDK 57 `expo-sqlite`/SQLCipher adapter pass the Gate 1
   encrypted-store proof on release-shaped iOS and Android artifacts, including
   `PRAGMA cipher_version`, wrong-key and migration behavior, WAL/outbox
   continuity, 16 KB ZIP/ELF/runtime compatibility, and repeated
   JavaScript-runtime teardown/duplicate-handle recovery? If the proof fails or
   no compatible upstream lifecycle fix is available at the implementation
   freeze, which maintained SQLCipher adapter passes the same
   `PracticeLedger`/`SyncGateway` contract without weakening encryption?
7. Does the product-owned command/change-feed protocol pass crash/retry,
   compatibility, owner-isolation, long-offline, and independent privacy
   review? If not, can a release-shaped PowerSync spike preserve and return a
   typed permanently rejected mutation, advance beyond its blocking FIFO queue
   item to the next checkpoint, continue independent work, and include every
   managed local table in encrypted recovery/wipe proof? Only then decide
   whether its Cloud or self-hosted processing boundary, replicated
   publication/authorization model, region, retention/deletion contract, tier
   cost, and endpoint-switch/full-resync exit proof are acceptable.
8. For the fixed Race Fueling, Heat, and Performance Supplementation v1 portfolio, which exact fields, Tested Items, support levels, stop rules, and publication transformations are approved?
9. Which Tested Item categories are supported, and do any need batch/lot/expiry or manufacturer-claim capture?
10. Which exact monthly/yearly launch product IDs, which of those terms ship,
    free-to-paid offers if any, and app-wide Billing Grace tuple—3, 16, or 28
    days plus `All Renewals` or `Only Paid to Paid Renewals`—are accepted at
    Gate 0? The technical default excludes weekly and
    monthly-with-12-month-commitment products. Any weekly exception must record
    its commercial rationale and accept Apple's 3/6/6-day production cap and
    additional term/offer proof; if a free-to-paid transition needs grace, use
    `All Renewals`. Prove every launched term and eligible transition in Apple
    platform sandbox with the tester renewal speed, provider-reported
    state/expiration, recovery, and post-grace loss recorded; accelerated
    sandbox timing is not the production duration. Athlete-owned data access
    remains independent of this commercial setting.
11. Will the product obtain the applicable ORCID membership/license, complete
    the required ORCID integration review, and receive Production Member API credentials for
    post-login account linking and the member-only public-data `/summary`
    endpoint, or omit both and show only clearly unverified claims? Until all
    three production gates are recorded, complete v1 has no ORCID OAuth/API
    path. If access is pursued, will the affiliation
    policy allow a current member-validated employment to support a human
    organization/date check and a verified professional email domain to support
    only a dated domain-association state? ORCID does not become primary login,
    identity proof, credential verification, or automatic Researcher-role
    approval under either choice.
12. Are public Experiment Updates permitted for all Packs, and what minimum observations/horizon are required before submission?
13. Which minimal descriptive fields belong in the private-only generic observation contract, and which unsupported topics must remain excluded even from that contract?
14. Which launch jurisdiction and exact provider tuple, separate numeric RTOs
    for in-place PITR and project-loss recovery, operating margin, backup
    retention, AWS KMS region/account recovery boundary, and AWS processor/DPA
    terms are accepted for the decided Supabase-primary topology? Current
    official inventories make `sa-east-1` / `gru1` / `sa-east-1` the exact
    Supabase/Vercel/Field Note KMS candidate if Brazil is selected; a Supabase
    general region or Vercel default is not equivalent. Official documentation
    supplies no numeric service-recovery ceiling: launch requires measured
    whole-service recovery capability within each accepted RTO. The technical
    ceilings are a two-minute ordinary-failure database RPO through production
    PITR and a 24-hour project-loss RPO through the off-provider logical
    snapshot. Gate 0 must separately record the recovery S3 account/Region,
    backup KMS key ARN/Region, and replication decision; for Brazil without an
    accepted cross-Region target, the default is `sa-east-1` with replication
    disabled. Object RPO remains subject to its required-copy acceptance rule,
    and provider/region-wide service recovery has no v1 RTO without an alternate
    writable runtime. Current Supabase Read Replicas do not close that gap.
    Re-evaluate a future managed failover product only when it is
    production-supported and whole-service drills include writes, Auth,
    Storage, jobs, KMS, DNS, sessions, and client cutover. The technical
    Field Note default is closed: use a single-Region key and disclose that
    remote free-text read/export is unavailable while it cannot be used. What
    remains open is whether Gate 0 has a numeric cross-Region service
    requirement and complete recovery path strong enough to override that
    default before the first production envelope; a key replica by itself is
    not such a path.
15. Does the selected Vercel account actually expose Vercel Authentication over
    `All Deployments` to ordinary Pro without Advanced Deployment Protection?
    Current first-party documentation conflicts, while the detailed feature
    section requires Enterprise or the add-on and the live pricing table lists
    the add-on separately; generic method-availability language does not prove
    the production-inclusive entitlement. Gate 0 must record the plan/add-on
    state and prove an anonymous request to the real production `apps/ops`
    domain is denied before removing the add-on or its $150/month cost;
    application authorization is still required even if the perimeter
    succeeds.
16. Does Gate 0 accept Resend as the production Auth-mail processor with US
    storage of account data, email metadata, logs, API records, message content,
    delivery events, and metrics; ordinary-tier 30-day email-data retention;
    the current DPA/subprocessor and termination-deletion terms; team-wide
    suppression/rate coupling; and no Free/Pro SLA claim? If yes, freeze the
    exact auth-only team/domain/From address, sending Region, quotas, webhook
    event retention, credential rotation, and manual standby-provider runbook.
    If no, choose and prove another custom SMTP provider before external
    accounts; Supabase's default SMTP is not the fallback.

## Retained heartbeat decision evidence

The body above is authoritative. The notes below retain only heartbeat evidence
that changed or materially strengthened a decision; repeated rechecks are
collapsed into the latest result.

- **2026-08-28 22:36 -03 — Email-OTP transport:** Question:
  does the current Resend/custom-SMTP assumption safely support production
  Supabase email OTP? Primary sources: [Supabase custom
  SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Resend Supabase
  SMTP](https://resend.com/docs/send-with-supabase-smtp), [Resend quotas and
  retention](https://resend.com/docs/knowledge-base/account-quotas-and-limits),
  [Regions](https://resend.com/docs/dashboard/domains/regions), [delivery
  events](https://resend.com/docs/webhooks/event-types),
  [suppressions](https://resend.com/docs/dashboard/emails/email-suppressions),
  and [DPA](https://resend.com/legal/dpa). Challenge: supported SMTP credentials
  prove only handoff; provider acceptance is not inbox receipt, suppression and
  quotas are team-wide, ordinary tiers retain message data for 30 days in the
  US regardless of sending Region, and credentials/webhooks/failover were
  previously implicit. Conclusion: keep Resend as the provisional small-v1
  adapter only behind an auth-only verified domain/team, accepted processing
  and retention, aligned quotas/abuse controls, signed delivery-event and
  suppression operations, least-privilege rotation, generic failure UX, and a
  rehearsed manual standby-provider switch; otherwise select another custom
  SMTP provider. Changed: authentication summary/body, secrets, tests,
  observability, Gate 0, cost/risk, open question 16, source register, and this
  evidence note.
- **2026-08-28 23:24 -03 — Sentry contract:** Question: is
  the current Sentry React Native/native contract stable enough to remain a
  Gate 0 opt-in for complete v1? Primary sources: [8.24.0 latest
  release](https://github.com/getsentry/sentry-react-native/releases/tag/8.24.0),
  [SDK version
  matrix](https://github.com/getsentry/sentry-react-native/blob/main/SDK-VERSIONS.md),
  [8.24.0 options
  source](https://github.com/getsentry/sentry-react-native/blob/8.24.0/packages/core/src/js/options.ts),
  [native-filtering
  boundary](https://sentry.zendesk.com/hc/en-us/articles/26323481356443-How-to-filter-native-events-in-React-Native-SDK),
  [`dataCollection` task](https://github.com/getsentry/sentry-react-native/issues/5996),
  [Android bridge](https://github.com/getsentry/sentry-react-native/issues/5999),
  and [iOS bridge](https://github.com/getsentry/sentry-react-native/issues/6000).
  Challenge: exact version pinning and JavaScript envelope filters sound
  bounded, but `dataCollection` is deliberately omitted, both native bridges
  remain open and blocked, and Sentry says JavaScript filters do not filter
  native events; safe opt-in would require separate JavaScript, iOS, and Android
  privacy implementations plus four-SDK upgrade proof. Conclusion: make
  no-Sentry mandatory for complete v1 and reopen a third-party processor only
  after repeated measured Apple-evidence gaps and a released cross-native
  policy contract. Changed: executive/decision summary, analytics/secrets,
  observability, Gates 0/1/6, cost/risk, delayed decisions, assumption 13, open
  questions, source register, and this evidence note.
- **2026-08-29 00:00 -03 — Supabase logical recovery:** Question:
  does the checked v2.115.0 CLI bundle include necessary Auth rows and Storage
  metadata without hidden omissions? Primary sources: [CLI backup/restore
  recipe](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore),
  [v2.115.0 data-scope source](https://github.com/supabase/cli/blob/v2.115.0/apps/cli-go/pkg/migration/dump.go),
  [data-dump script](https://github.com/supabase/cli/blob/v2.115.0/apps/cli-go/pkg/migration/scripts/dump_data.sh),
  [Auth migration](https://supabase.com/docs/guides/troubleshooting/migrating-auth-users-between-projects),
  [Storage metadata](https://supabase.com/docs/guides/storage/management/download-objects),
  and [`pg_dump`](https://www.postgresql.org/docs/current/app-pgdump.html).
  Challenge: `auth` and `storage` are intentionally included, but CLI-owned
  schema and table exclusions mean “all data” could hide a future omission.
  Conclusion: retain the bundle for required Auth rows and Storage metadata,
  not literal whole-database recovery; archive and diff its effective scope and
  require table-level inventory and row-count parity, while object bytes and
  service configuration remain separate. Changed: `Canonical database
  recovery`, source register, and this evidence note.
- **2026-08-29 20:37 -03 — Managed cross-region recovery deadline recheck:**
  Question: does Supabase now offer production-supported, managed,
  cross-region writable failover for the complete project surface? Primary
  sources: [February 2026 incident](https://supabase.com/blog/supabase-incident-on-february-12-2026),
  [Read Replicas](https://supabase.com/docs/guides/platform/read-replicas),
  [restore to a new project](https://supabase.com/docs/guides/platform/clone-project),
  [regional Function invocation](https://supabase.com/docs/guides/functions/regional-invocation),
  [Queues](https://supabase.com/docs/guides/queues),
  [Cron](https://supabase.com/docs/guides/cron), and
  [Multigres v0.1 alpha](https://supabase.com/blog/multigres-v0-1-alpha).
  Challenge: cross-region read routing, regional Function execution, a Beta
  clone flow, and Multigres HA could appear to close the regional-outage gap;
  however, writes and Auth still depend on the primary, restore is same-region
  and omits multiple project services, jobs remain PostgreSQL-backed, explicit
  Function placement does not reroute automatically, and hosted
  production-ready Multigres is unavailable. Conclusion: retain the
  single-region authoritative topology, measured scenario-specific recovery,
  and no provider-wide RTO claim; treat replicas as optional read
  latency/redundancy, not failover. Changed: `Canonical database recovery`;
  Gate 0, risk, assumption 14, and open question 14 remain consistent.
- **2026-08-30 11:50 -03 — Passkey-primary authentication deadline recheck:**
  Question: should complete v1 replace company-owned email OTP primary login
  with current Supabase passkeys? Primary sources: [Supabase passkey
  guide](https://supabase.com/docs/guides/auth/passkeys), [Beta
  announcement](https://supabase.com/changelog/46458-passkeys-for-supabase-auth-beta),
  [Auth changelog](https://github.com/supabase/auth/blob/master/CHANGELOG.md),
  and [`supabase-js`
  changelog](https://github.com/supabase/supabase-js/blob/master/CHANGELOG.md).
  Challenge: current support now includes discoverable sign-in, user and admin
  credential management, multiple official client SDKs, and native two-step
  ceremonies, so deferral cannot rest on missing provider primitives.
  Conclusion: defer replacement—the live contract remains Beta/Experimental,
  explicitly opt-in and changeable without notice; post-launch shapes and
  security/lifecycle behavior have changed; native Expo ceremonies and
  lost-all-credentials recovery still require release proof. Keep email OTP as
  the sole v1 primary and recovery flow, without a phishing-resistance claim.
  Changed: `Authentication` and this evidence note; the decision summary,
  Gate 0, App Store wording, and delayed-decision boundary remain consistent.
- **2026-08-30 12:19 -03 — Expo SDK 57 stable-graph deadline recheck:**
  Question: has the stable SDK 57 package or template moved enough to invalidate
  the Gate 1 start at `expo@57.0.18` / React Native 0.86.3? Primary sources:
  [npm stable metadata](https://registry.npmjs.org/expo/latest), [SDK 57 default
  template](https://raw.githubusercontent.com/expo/expo/sdk-57/templates/expo-template-default/package.json),
  [Expo package changelog](https://raw.githubusercontent.com/expo/expo/sdk-57/packages/expo/CHANGELOG.md),
  [SDK 57 release notes](https://expo.dev/changelog/sdk-57), [`create-expo-app`
  guide](https://docs.expo.dev/more/create-expo/), and [Expo upgrade guide](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/).
  Challenge: the template artifact is version 57.0.20 and Expo's range-based
  upgrade flow can resolve newer transitive patches, so copying either the
  template's own version or one dependency snapshot as the final lock would be
  unsafe. Conclusion: no—the stable tag remains 57.0.18, the template still
  declares `expo@~57.0.18` with React Native 0.86.3, and 57.0.18 has no
  user-facing change beyond the documented 57.0.17 regression-fixed floor;
  retain the current start and resolve, inspect, and artifact-test the complete
  graph after an explicit `default@sdk-57` scaffold before pinning. Changed:
  `Mobile platform decision` recheck date and fresh-project intake were
  strengthened; no stack decision changed.
- **2026-08-30 12:35 -03 — Billing Grace catalog deadline recheck:** Question:
  should complete v1 leave a weekly App Store subscription equally open at Gate
  0? Primary sources: [App Store Connect Billing Grace
  configuration](https://developer.apple.com/help/app-store-connect/manage-subscriptions/enable-billing-grace-period-for-auto-renewable-subscriptions),
  [Apple sandbox account
  settings](https://developer.apple.com/help/app-store-connect/test-in-app-purchases/manage-sandbox-apple-account-settings/),
  [RevenueCat grace
  behavior](https://www.revenuecat.com/docs/subscription-guidance/how-grace-periods-work),
  and [RevenueCat sandbox
  boundary](https://www.revenuecat.com/docs/test-and-launch/sandbox).
  Challenge: Apple permits weekly products, but Billing Grace is app-wide and a
  selected 16- or 28-day policy becomes only six days for weekly, while
  RevenueCat exposes the store's actual expiration and its Test Store cannot
  prove StoreKit grace behavior. Conclusion: default complete v1 to monthly
  and/or yearly products; allow weekly only as a Gate 0 exception with the
  shorter grace and extra Apple-sandbox matrix accepted. Changed: `Premium
  entitlement` and open question 10.
- **2026-08-30 14:02 -03 — Direct APNs boundary:** Question: should the
  iOS-first release retain direct APNs or use Expo's relay to reduce one-
  developer operations? Primary sources: [Apple token authentication](https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns),
  [APNs responses](https://developer.apple.com/documentation/usernotifications/handling-notification-responses-from-apns),
  [APNs registration](https://developer.apple.com/documentation/usernotifications/registering-your-app-with-apns),
  [Expo provider options](https://docs.expo.dev/guides/using-push-notifications-services/),
  and [Expo relay boundary](https://docs.expo.dev/push-notifications/faq/).
  Challenge: the relay removes provider code, but adds a best-effort
  intermediary that may duplicate/omit handoff and whose staff may see payloads
  during active debugging; direct APNs instead makes environment, topic, token
  cadence, connection identity, and rotation product obligations. Conclusion:
  retain direct APNs with generic payloads and canonical inbox state, and make
  Sandbox/Production pool isolation plus related-key rotation and fresh-
  connection rejection proof release gates. Changed: `Notifications`, adapter
  tests, source register, and this evidence note.
- **2026-08-30 14:18 -03 — ORCID production-access boundary:** Question: may a
  revenue-generating complete v1 use ORCID OAuth and `/summary` without ORCID
  Member API authorization? Primary sources: [Public API
  terms](https://info.orcid.org/public-client-terms-of-service/), [Member API
  registration](https://info.orcid.org/documentation/integration-guide/registering-a-member-api-client/),
  [record summaries](https://info.orcid.org/documentation/integration-guide/summarizing-orcid-record-data/),
  and [identity-assurance boundary](https://support.orcid.org/hc/en-us/articles/360006972413-Does-an-ORCID-iD-assure-my-identity).
  Challenge: authenticated-iD OAuth is technically available through the
  Public API and ORCID public data permits commercial reuse in other forms, but
  the Public API license excludes revenue-generating products and `/summary` is
  member-only; its public payload also mixes validated and self-asserted items.
  Conclusion: ship no ORCID OAuth/API path until the organization has an
  applicable membership/license, integration review, and issued Production
  Member API credentials; then treat iD control and assertion provenance only
  as inputs to separate human identity, affiliation, credential, and role
  decisions. Changed: `ORCID boundary` and this evidence note.
- **2026-08-30 16:17 -03 — MetricKit ingestion deadline recheck:** Question:
  should complete v1 now add product-owned MetricKit ingestion instead of
  relying on Apple's distribution diagnostics and App Store Connect API?
  Primary sources: [App Store Connect power/performance
  API](https://developer.apple.com/documentation/appstoreconnectapi/power-and-performance-metrics-and-logs),
  [Apple retrieval sample and availability
  boundary](https://developer.apple.com/documentation/appstoreconnectapi/retrieve-power-and-performance-metrics-and-log-insights),
  [MetricKit](https://developer.apple.com/documentation/metrickit), [MetricKit
  updates](https://developer.apple.com/documentation/updates/metrickit), and
  [`MXMetricManager`](https://developer.apple.com/documentation/metrickit/mxmetricmanager).
  Challenge: the API now provides build/app metrics, recurring diagnostic
  signatures, and anonymized logs without an app collector, but it needs
  significant usage and may lag by days; the legacy on-device manager still
  works on the v1 floor but is deprecated, while its iOS 27 replacement remains
  Beta. Conclusion: retain no product-owned MetricKit ingestion for complete
  v1, automate the read-only App Store Connect retrieval only after launch
  credentials exist, and treat sparse/delayed output as an evidence gap rather
  than adding a dual-generation native collector before measured incidents
  justify it. Changed section: `Observability and operations` and this evidence
  note; the no-Sentry stack decision is unchanged.
- **2026-08-30 16:48 -03 — Supabase Storage recovery boundary:** Question: can
  complete v1 remove the separate versioned AWS S3 copy for non-regenerable
  private files because current Supabase Storage now supplies equivalent object
  versioning or deleted-object recovery? Primary sources: [S3 compatibility](https://supabase.com/docs/guides/storage/s3/compatibility),
  [database backups](https://supabase.com/docs/guides/platform/backups), [delete
  objects](https://supabase.com/docs/guides/storage/management/delete-objects),
  and [download/migration paths](https://supabase.com/docs/guides/storage/management/download-objects).
  Challenge: Supabase exposes an S3-compatible protocol and documented bulk
  migration paths, which can look like a built-in recovery layer; however,
  versioning and Object Lock remain unsupported, deletion is permanent, and
  database/PITR restores only object metadata. Conclusion: retain the small
  independently versioned S3 backup boundary and its checksum/inventory proof;
  protocol compatibility or a one-time copy is not recoverability. Changed
  section: `Files and media` and this evidence note.
- **2026-08-30 17:04 -03 — Durable-job orchestration boundary:** Question:
  should complete v1 replace its PostgreSQL-canonical leased job executor with
  current Vercel Workflows or Queues? Primary sources: [Workflow
  GA](https://vercel.com/blog/a-new-programming-model-for-durable-execution),
  [Vercel World](https://workflow-sdk.dev/worlds/vercel), [Workflow
  encryption](https://workflow-sdk.dev/docs/how-it-works/encryption), [event
  sourcing](https://workflow-sdk.dev/docs/how-it-works/event-sourcing), and
  [Vercel Queues](https://vercel.com/docs/queues). Challenge: Workflow is now GA
  and materially reduces retry, replay, and observability code, while its event
  log encrypts user payloads and pins runs to deployment versions. Conclusion:
  retain the product-owned executor for complete v1: the stable v4 Vercel World
  stores workflow data only in `iad1`, multi-region begins on the v5 beta line,
  direct Queues remains Beta without strict residency during failover, and no
  provider event log replaces product-authorized job status, privacy receipts,
  audit, idempotency, or deletion state. Reconsider only through an opaque-ID
  `JobExecutor` adapter after stable accepted-Region and full data-lifecycle
  proof. Changed sections: architecture decision summary, rejected alternatives,
  `Durable job execution boundary`, one-developer costs, source register, and
  this evidence note.
- **2026-08-30 17:49 -03 — Brazil region-topology deadline:** Question: do
  current official inventories still support the conditional Supabase South
  America `sa-east-1` / Vercel São Paulo `gru1` / AWS KMS `sa-east-1` tuple,
  and is Supabase's general `Americas` region equivalent to Brazil residency?
  Primary sources: [Supabase regions](https://supabase.com/docs/guides/platform/regions),
  [Vercel regions](https://vercel.com/docs/regions), [Vercel Function region
  configuration](https://vercel.com/docs/functions/configuring-functions/region),
  and [AWS KMS endpoints](https://docs.aws.amazon.com/general/latest/gr/kms.html).
  Challenge: all three providers still expose the matching Region codes, but
  that proves explicit placement only—not shared facilities or Availability
  Zones, a private provider path, whole-system residency, compliance, or
  recovery; Vercel CDN/control-plane/processor paths and any failover remain
  separate review boundaries. Conclusion: retain the conditional tuple and
  reject general `Americas`, which currently maps to North Virginia; require
  `gru1`, the exact `sa-east-1` KMS ARN, runtime assertions, and a Gate 0
  data-flow review without a cross-jurisdiction Function failover. Changed
  sections: `Deployment shape and codebase design`, Gate 0, and this evidence
  note.
- **2026-08-30 18:07 -03 — RevenueCat identity and restore boundary:**
  Question: which restore/App User ID contract permits an active Apple
  subscription to survive product-account deletion without restoring or
  aliasing deleted product data? Primary sources: [restore
  behavior](https://www.revenuecat.com/docs/projects/restore-behavior),
  [restoring
  purchases](https://www.revenuecat.com/docs/getting-started/restoring-purchases),
  [customer
  identity](https://www.revenuecat.com/docs/customers/identifying-customers),
  [customer
  deletion](https://www.revenuecat.com/docs/dashboard-and-metrics/customer-profile),
  and [restore
  tests](https://www.revenuecat.com/docs/guides/testing-guide/use-cases).
  Challenge: the prior text promised later restore but left a project-wide
  setting and anonymous-ID aliasing implicit; `Keep with original` and
  `Transfer if inactive` strand a live Apple purchase after deletion. Conclusion:
  freeze `Transfer to new App User ID`, custom-only opaque UUIDv4 provider
  identities after product authentication, explicit athlete-triggered restore,
  and entitlement-only transfer; never revive or alias deleted product data or
  provider identity. Changed: decision summary, relational inventory, `Premium
  entitlement`, account deletion, adapter tests, Gates 0/3, risk, assumption
  17, source register, and this note.
- **2026-08-30 20:05 -03 — SDK 57 privacy-manifest aggregation deadline
  recheck:** Question: can complete v1 rely on SDK 57 CocoaPods aggregation and
  App Store validation alone? Primary sources: [Expo privacy manifests](https://docs.expo.dev/guides/apple-privacy/), [SDK 57
  BuildProperties](https://docs.expo.dev/versions/v57.0.0/sdk/build-properties/),
  [SDK 57 aggregation source](https://raw.githubusercontent.com/expo/expo/sdk-57/packages/expo-build-properties/src/ios.ts),
  [SDK 57 default Podfile](https://raw.githubusercontent.com/expo/expo/sdk-57/templates/expo-template-bare-minimum/ios/Podfile),
  [Apple privacy manifests](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files),
  [required-reason APIs](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api),
  [Xcode privacy reports](https://developer.apple.com/documentation/bundleresources/describing-data-use-in-privacy-manifests),
  and [third-party SDK requirements](https://developer.apple.com/support/third-party-SDK-requirements/).
  Challenge: default aggregation plus submission-time validation could appear
  sufficient. Conclusion: no; static CocoaPods remain an acknowledged parsing
  gap, reports aggregate declarations rather than prove inventory completeness,
  and listed/repackaged or separately bundled SDKs retain bundle/signature
  obligations. Changed section: strengthened `App Store release and privacy
  readiness`; retained Gate 1 bundle/report inspection and Gate 6 signed-IPA
  reconciliation.
- **2026-08-31 08:50 -03 — Auth-mail hook handoff check:** Question:
  should Supabase's Send Email Auth Hook replace Resend custom SMTP as the
  complete-v1 production OTP transport? Primary sources: [custom
  SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Auth Hooks stage](https://supabase.com/features/auth-hooks), [hook runtime
  contract](https://supabase.com/docs/guides/auth/auth-hooks), [Send Email
  Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook), and
  [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).
  Challenge: the hook enables provider APIs, idempotency, and automatic
  multi-provider logic, but remains Beta, replaces rather than wraps SMTP,
  executes synchronously within five seconds, propagates failure into Auth, and
  expands product handling of live token/hash payloads; secure email change also
  requires an error-prone dual-message mapping. Conclusion: retain custom SMTP
  plus rehearsed manual standby for v1; adopt the hook only for an accepted
  numeric access RTO after signed-request, idempotency, timeout, payload/log,
  action-matrix, and duplicate-code proof. Changed section: `Authentication`;
  the provisional Resend decision remains unchanged.
- **2026-08-31 09:51 -03 — Ordinary-Pro operations perimeter deadline
  recheck:** Question: does ordinary Vercel Pro include Vercel Authentication
  over `All Deployments` for every custom and generated production `apps/ops`
  URL without Advanced Deployment Protection? Primary sources: [Deployment
  Protection](https://vercel.com/docs/deployment-protection), [Vercel
  Authentication](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication),
  [generated URLs](https://vercel.com/docs/deployments/generated-urls), [bypass
  methods](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection),
  and [pricing](https://vercel.com/pricing). Challenge: ordinary-Pro Standard
  Protection covers the generated production deployment URL, the scope summary
  labels `All Deployments` Pro/Enterprise, and the authentication method/API
  accept `all`; however, Standard leaves production domains public, the
  dedicated `All Deployments` rule requires Enterprise or the Pro add-on, and
  pricing still lists that add-on at $150/month. Conclusion: retain Pro plus
  Advanced Deployment Protection or Enterprise until account-level proof denies
  anonymous access on every production URL; test each URL because auth cookies
  are URL-scoped and inventory Shareable Links, automation secrets, Exceptions,
  and OPTIONS allowlists as bypasses. Changed section: `Deployment shape and
  codebase design`; Gate 0, cost, risk, and open question 15 remain consistent.
- **2026-08-31 10:21 -03 — PowerSync selective-acknowledgement deadline
  check:** Question: has current official React Native/Expo documentation or
  released product status gained stable semantics that preserve one permanently
  rejected typed mutation while later independent uploads and checkpoints
  continue? Primary sources: [React Native/Expo
  SDK](https://docs.powersync.com/client-sdks/reference/react-native-and-expo),
  [client upload
  behavior](https://docs.powersync.com/configuration/app-backend/client-side-integration),
  [consistency](https://docs.powersync.com/architecture/consistency), [validation
  errors](https://docs.powersync.com/handling-writes/handling-write-validation-errors),
  [product updates](https://releases.powersync.com/), [Checkpoint Requests
  alpha](https://releases.powersync.com/announcements/sync-catch-up-with-checkpoint-requests-alpha),
  and [source-built React Native
  API](https://powersync-ja.github.io/powersync-js/react-native-sdk/globals).
  Challenge: the alpha checkpoint surface and multi-transaction iterator could
  look like independent progress, but a thrown upload still retries from the
  queue head, checkpoints still wait for queued writes, and completing a later
  iterated transaction also completes every prior one. Conclusion: no stable
  selective acknowledgement exists; retaining the rejected typed payload while
  continuing requires the product-owned transactional recovery record before
  acknowledgement, with the documented out-of-order risk. Keep the typed
  command/change feed as default and PowerSync behind Gate 1. Changed section:
  `Sync proof gate` and this evidence note; no stack decision changed.
- **2026-08-31 10:50 -03 — Expo SQLite lifecycle final deadline recheck:**
  Question: can SDK 57 now freeze `expo-sqlite`/SQLCipher for repeated Android
  JavaScript-runtime teardown and reopen? Primary sources: [issue
  #48999](https://github.com/expo/expo/issues/48999), [maintainer PR
  #49152](https://github.com/expo/expo/pull/49152), [SDK 57 package
  manifest](https://raw.githubusercontent.com/expo/expo/sdk-57/packages/expo-sqlite/package.json),
  [current `main` source](https://raw.githubusercontent.com/expo/expo/main/packages/expo-sqlite/android/src/main/java/expo/modules/sqlite/NativeDatabase.kt),
  and [current `main` changelog](https://raw.githubusercontent.com/expo/expo/main/packages/expo-sqlite/CHANGELOG.md).
  Challenge: maintainer ownership, a proposed fix, and 57.0.2 could look
  sufficient to pin the adapter. Conclusion: no—the issue remains open, the PR
  remains Draft, the released package is still 57.0.2, `main` still closes the
  shared binding unconditionally, and the changelog has no lifecycle fix.
  Keep Gate 1's release-shaped encrypted reopen/WAL/outbox proof and adapter
  exit. Changed section: `Device store` evidence timestamp and this note; no
  stack decision changed.

## Primary-source register

The unstable technical claims in this document use current official documentation or provider primary sources. Core source groups:

- Mobile runtime mode: [Expo development and production modes](https://docs.expo.dev/workflow/development-mode/).
- Mobile/build: [React Native](https://reactnative.dev/), [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/), [Expo SDK 56 regression boundary](https://expo.dev/changelog/sdk-56), [Expo SDK 57](https://expo.dev/changelog/sdk-57), [Expo npm registry latest metadata](https://registry.npmjs.org/expo/latest), [SDK 57 default template](https://raw.githubusercontent.com/expo/expo/sdk-57/templates/expo-template-default/package.json), [SDK 57 package changelog](https://raw.githubusercontent.com/expo/expo/sdk-57/packages/expo/CHANGELOG.md), [Expo package versions](https://www.npmjs.com/package/expo?activeTab=versions), [published `expo-sqlite` package](https://www.npmjs.com/package/expo-sqlite), [Expo SDK reference](https://docs.expo.dev/versions/latest/), [SDK 57 SQLite documentation](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/), [Expo upgrade guide](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/), [React Native 0.86](https://reactnative.dev/blog/2026/06/11/react-native-0.86), [Expo New Architecture guide](https://docs.expo.dev/guides/new-architecture/), [React Native 0.82](https://reactnative.dev/blog/2025/10/08/react-native-0.82), [Expo local-first guide](https://docs.expo.dev/guides/local-first/), [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/), [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/), [SDK 57 native-module map](https://github.com/expo/expo/blob/sdk-57/packages/expo/bundledNativeModules.json), [SDK 57 `expo-sqlite` changelog](https://github.com/expo/expo/blob/sdk-57/packages/expo-sqlite/CHANGELOG.md), [SDK 57 Android build configuration](https://github.com/expo/expo/blob/sdk-57/packages/expo-sqlite/android/build.gradle), [SDK 57 CMake linkage](https://github.com/expo/expo/blob/sdk-57/packages/expo-sqlite/android/CMakeLists.txt), [SQLCipher-specific OpenSSL fix](https://github.com/expo/expo/pull/40781), [earlier SQLCipher artifact failure](https://github.com/expo/expo/issues/39792), [current Android handle-lifecycle defect](https://github.com/expo/expo/issues/48999), [draft lifecycle fix](https://github.com/expo/expo/pull/49152), [current `main` lifecycle source](https://raw.githubusercontent.com/expo/expo/main/packages/expo-sqlite/android/src/main/java/expo/modules/sqlite/NativeDatabase.kt), [current `main` changelog](https://raw.githubusercontent.com/expo/expo/main/packages/expo-sqlite/CHANGELOG.md), [SDK 57 package manifest](https://raw.githubusercontent.com/expo/expo/sdk-57/packages/expo-sqlite/package.json), [Android 16 KB guidance](https://developer.android.com/guide/practices/page-sizes), [Zetetic Android support boundary](https://www.zetetic.net/blog/2025/06/26/sqlcipher-for-android-16kb-page-size-support/), and [EAS](https://docs.expo.dev/eas/).
- Local-first/sync: [Expo local-first guide](https://docs.expo.dev/guides/local-first/), [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/), [PostgreSQL concurrency control](https://www.postgresql.org/docs/current/mvcc.html), and, for the PowerSync contingency, [PowerSync client architecture](https://docs.powersync.com/architecture/client-architecture), [React Native/Expo SDK](https://docs.powersync.com/client-sdks/reference/react-native-and-expo), [client upload behavior](https://docs.powersync.com/configuration/app-backend/client-side-integration), [consistency and checkpoint behavior](https://docs.powersync.com/architecture/consistency), [write-validation behavior](https://docs.powersync.com/handling-writes/handling-write-validation-errors), [conflict resolution](https://docs.powersync.com/handling-writes/custom-conflict-resolution), [prioritized sync](https://docs.powersync.com/sync/advanced/prioritized-sync), [current product updates](https://releases.powersync.com/), [Checkpoint Requests alpha](https://releases.powersync.com/announcements/sync-catch-up-with-checkpoint-requests-alpha), [Cloud regions](https://docs.powersync.com/configuration/powersync-service/cloud-instances), [DPA](https://powersync.com/legal/powersync-data-processing-addendum-dpa-gdpr.pdf), [subprocessors](https://powersync.com/legal/subprocessors), [pricing](https://powersync.com/pricing), [commercial terms](https://powersync.com/legal/commercial-license-and-services-agreement), and [instance migration](https://docs.powersync.com/maintenance-ops/self-hosting/migrating-instances).
- Backend/auth/storage: [Supabase Auth](https://supabase.com/docs/guides/auth), [sessions and refresh rotation](https://supabase.com/docs/guides/auth/sessions), [passkey guide](https://supabase.com/docs/guides/auth/passkeys), [passkey Beta announcement](https://supabase.com/changelog/46458-passkeys-for-supabase-auth-beta), [Supabase Auth changelog](https://github.com/supabase/auth/blob/master/CHANGELOG.md), [`supabase-js` changelog](https://github.com/supabase/supabase-js/blob/master/CHANGELOG.md), [MFA and AAL enforcement](https://supabase.com/docs/guides/auth/auth-mfa), [TOTP](https://supabase.com/docs/guides/auth/auth-mfa/totp), [server-session guidance](https://supabase.com/docs/guides/auth/server-side/advanced-guide), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html), [database connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [connection management](https://supabase.com/docs/guides/database/connection-management), [Storage security](https://supabase.com/docs/guides/storage/security/access-control), [Storage S3/versioning boundary](https://supabase.com/docs/guides/storage/s3/compatibility), [permanent object deletion](https://supabase.com/docs/guides/storage/management/delete-objects), [object download/migration paths](https://supabase.com/docs/guides/storage/management/download-objects), [backups](https://supabase.com/docs/guides/platform/backups), [CLI logical backup/restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [CLI v2.115.0 data-scope source](https://github.com/supabase/cli/blob/v2.115.0/apps/cli-go/pkg/migration/dump.go), [CLI v2.115.0 data-dump script](https://github.com/supabase/cli/blob/v2.115.0/apps/cli-go/pkg/migration/scripts/dump_data.sh), [platform restore boundary](https://supabase.com/docs/guides/self-hosting/restore-from-platform), [Auth migration](https://supabase.com/docs/guides/troubleshooting/migrating-auth-users-between-projects), [PostgreSQL `pg_dump`](https://www.postgresql.org/docs/current/app-pgdump.html), [Queues](https://supabase.com/docs/guides/queues), [Cron](https://supabase.com/docs/guides/cron), [Supabase `pgsodium` boundary](https://supabase.com/docs/guides/database/extensions/pgsodium), [AWS Encryption SDK](https://docs.aws.amazon.com/encryption-sdk/latest/developer-guide/concepts.html), [KMS encryption context](https://docs.aws.amazon.com/kms/latest/developerguide/encrypt_context.html), [KMS rotation](https://docs.aws.amazon.com/kms/latest/developerguide/rotate-keys.html), and [KMS deletion](https://docs.aws.amazon.com/kms/latest/developerguide/deleting-keys.html).
- Email OTP transport: [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Supabase production limits](https://supabase.com/docs/guides/deployment/going-into-prod), [Auth Hooks stage](https://supabase.com/features/auth-hooks), [Auth Hook runtime contract](https://supabase.com/docs/guides/auth/auth-hooks), [Send Email Auth Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook), [Resend Supabase SMTP](https://resend.com/docs/send-with-supabase-smtp), [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [SMTP boundary](https://resend.com/docs/send-with-smtp), [domains](https://resend.com/docs/dashboard/domains/introduction), [Supabase-auth deliverability](https://resend.com/docs/knowledge-base/how-do-i-maximize-deliverability-for-supabase-auth-emails), [quotas and data retention](https://resend.com/docs/knowledge-base/account-quotas-and-limits), [Regions](https://resend.com/docs/dashboard/domains/regions), [event types](https://resend.com/docs/webhooks/event-types), [webhook verification](https://resend.com/docs/webhooks/verify-webhooks-requests), [webhook retries](https://resend.com/docs/webhooks/retries-and-replays), [suppressions](https://resend.com/docs/dashboard/emails/email-suppressions), [API-key permissions](https://resend.com/docs/dashboard/api-keys/introduction), [key rotation](https://resend.com/docs/knowledge-base/how-to-handle-api-keys), [message-storage control](https://resend.com/docs/knowledge-base/how-do-i-ensure-sensitive-data-isnt-stored-on-resend), [DPA](https://resend.com/legal/dpa), and [pricing](https://resend.com/pricing).
- Durable jobs: [Vercel Function limits](https://vercel.com/docs/functions/limitations), [30-minute beta](https://vercel.com/changelog/vercel-functions-can-now-run-up-to-30-minutes), [Vercel Functions API](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package), [Workflow GA](https://vercel.com/blog/a-new-programming-model-for-durable-execution), [Vercel World and stable-region boundary](https://workflow-sdk.dev/worlds/vercel), [Workflow encryption](https://workflow-sdk.dev/docs/how-it-works/encryption), [Workflow event sourcing](https://workflow-sdk.dev/docs/how-it-works/event-sourcing), [Vercel Queues](https://vercel.com/docs/queues), [seven-day Queue TTL](https://vercel.com/changelog/queues-now-supports-7-day-ttl), [Vercel Workflow pricing](https://vercel.com/docs/limits), [Supabase Queues](https://supabase.com/docs/guides/queues), [Queues API](https://supabase.com/docs/guides/queues/api), and [Supabase Cron](https://supabase.com/docs/guides/cron).
- Regions/recovery: [Supabase regions](https://supabase.com/docs/guides/platform/regions), [region migration](https://supabase.com/docs/guides/troubleshooting/change-project-region-eWJo5Z), [Vercel regions](https://vercel.com/docs/regions), [Vercel Function region configuration](https://vercel.com/docs/functions/configuring-functions/region), [AWS KMS endpoints](https://docs.aws.amazon.com/general/latest/gr/kms.html), [S3 bucket Regions](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingBucket.html), [S3 endpoints](https://docs.aws.amazon.com/general/latest/gr/s3.html), [AWS KMS multi-Region boundary](https://docs.aws.amazon.com/kms/latest/developerguide/mrk-when-to-use.html), [multi-Region key properties](https://docs.aws.amazon.com/kms/latest/developerguide/multi-region-keys-overview.html), [multi-Region key authorization](https://docs.aws.amazon.com/kms/latest/developerguide/multi-region-keys-auth.html), [Supabase PITR duration](https://supabase.com/docs/guides/troubleshooting/how-long-does-it-take-to-restore-a-database-from-a-point-in-time-backup-pitr-qO8gOG), [February 2026 regional incident](https://supabase.com/blog/supabase-incident-on-february-12-2026), [Read Replicas](https://supabase.com/docs/guides/platform/read-replicas), [Read Replica operations](https://supabase.com/docs/guides/platform/read-replicas/getting-started), [new-project restore](https://supabase.com/docs/guides/platform/clone-project), [regional Edge Function invocation](https://supabase.com/docs/guides/functions/regional-invocation), [Multigres v0.1 alpha](https://supabase.com/blog/multigres-v0-1-alpha), [custom domains](https://supabase.com/docs/guides/platform/custom-domains), [publishable-key migration](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys), [Supabase sessions](https://supabase.com/docs/guides/auth/sessions), [AWS recovery objectives](https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_planning_for_recovery_objective_defined_recovery.html), and [S3 archive retrieval](https://docs.aws.amazon.com/AmazonS3/latest/userguide/glacier-storage-classes.html).
- Apple/release/privacy: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), [Guideline 4.8 login services](https://developer.apple.com/app-store/review/guidelines/#login-services), [account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/), [App Privacy](https://developer.apple.com/app-store/app-privacy-details/), [privacy manifests](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files), [third-party SDK requirements](https://developer.apple.com/support/third-party-SDK-requirements/), [required-reason APIs](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api), [Xcode privacy reports](https://developer.apple.com/documentation/bundleresources/describing-data-use-in-privacy-manifests), [Expo privacy manifests](https://docs.expo.dev/guides/apple-privacy/), [SDK 57 BuildProperties](https://docs.expo.dev/versions/v57.0.0/sdk/build-properties/), [SDK 57 aggregation source](https://raw.githubusercontent.com/expo/expo/sdk-57/packages/expo-build-properties/src/ios.ts), [SDK 57 default Podfile](https://raw.githubusercontent.com/expo/expo/sdk-57/templates/expo-template-bare-minimum/ios/Podfile), and [Developer Program](https://developer.apple.com/programs/).
- Native crash/hang diagnostics: [crash acquisition](https://developer.apple.com/documentation/xcode/acquiring-crash-reports-and-diagnostic-logs), [debug symbols and archive retention](https://developer.apple.com/documentation/xcode/building-your-app-to-include-debugging-information), [shipping performance](https://developer.apple.com/documentation/xcode/analyzing-the-performance-of-your-shipping-app), [hang evidence](https://developer.apple.com/documentation/xcode/analyzing-responsiveness-issues-in-your-shipping-app), [app responsiveness](https://developer.apple.com/documentation/xcode/improving-app-responsiveness), [App Crashes](https://developer.apple.com/documentation/analytics-reports/app-crashes), [App Sessions](https://developer.apple.com/documentation/analytics-reports/app-sessions), [MetricKit](https://developer.apple.com/documentation/metrickit), [legacy `MXMetricManager`](https://developer.apple.com/documentation/metrickit/mxmetricmanager), [MetricKit updates](https://developer.apple.com/documentation/updates/metrickit), [App Store Connect retrieval and availability](https://developer.apple.com/documentation/appstoreconnectapi/retrieve-power-and-performance-metrics-and-log-insights), and the [App Store Connect power/performance API](https://developer.apple.com/documentation/appstoreconnectapi/power-and-performance-metrics-and-logs).
- Sources/identity: [Crossref REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/), [Retraction Watch data](https://www.crossref.org/documentation/retrieve-metadata/retraction-watch/), [DataCite REST API](https://support.datacite.org/docs/rest-api), [DataCite removed-record boundary](https://support.datacite.org/docs/how-do-i-detect-removed-records-or-retractions-with-the-rest-api), [ORCID identity assurance](https://support.orcid.org/hc/en-us/articles/360006972413-Does-an-ORCID-iD-assure-my-identity), [ORCID OAuth sign-in/account linking](https://info.orcid.org/documentation/integration-guide/orcid-oauth-sign-in-guidelines/), [ORCID record summaries](https://info.orcid.org/documentation/integration-guide/summarizing-orcid-record-data/), [current ORCID Trust Marker paths](https://info.orcid.org/the-trust-marker-advantage-how-validated-orcid-data-correlates-with-global-university-performance/), [Production Member API registration](https://info.orcid.org/documentation/integration-guide/registering-a-member-api-client/), [ORCID Member API](https://info.orcid.org/what-is-orcid/services/member-api/), [ORCID Public API terms](https://info.orcid.org/public-client-terms-of-service/), and [ORCID Registry/public-data-file terms](https://info.orcid.org/terms-of-use/).
- Search/operations/billing/diagnostics/cost: [PostgreSQL text search](https://www.postgresql.org/docs/current/textsearch.html), [Vercel Deployment Protection](https://vercel.com/docs/deployment-protection), [Vercel Authentication](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication), [protection bypasses](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection), [automation bypass limits](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation), [generated URLs](https://vercel.com/docs/deployments/generated-urls), [system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables), [Custom Environments](https://vercel.com/docs/deployments/environments), [Vercel security](https://vercel.com/security), [Vercel pricing](https://vercel.com/pricing), [Vercel Pro plan](https://vercel.com/docs/plans/pro-plan), [Vercel Enterprise plan](https://vercel.com/docs/plans/enterprise), [private-production launch explanation](https://vercel.com/blog/protecting-deployments), [Expo notification-service options](https://docs.expo.dev/guides/using-push-notifications-services/), [Expo relay boundary](https://docs.expo.dev/push-notifications/faq/), [Apple APNs registration](https://developer.apple.com/documentation/usernotifications/registering-your-app-with-apns), [Apple token-based APNs connection](https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns), [Apple APNs response contract](https://developer.apple.com/documentation/usernotifications/handling-notification-responses-from-apns), [StoreKit grace-period implementation](https://developer.apple.com/documentation/storekit/reducing-involuntary-subscriber-churn), [grace-period expiration](https://developer.apple.com/documentation/storekit/product/subscriptioninfo/renewalinfo/graceperiodexpirationdate), [RevenueCat webhooks](https://www.revenuecat.com/docs/integrations/webhooks), [RevenueCat event fields](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields), [Sentry with Expo](https://docs.expo.dev/guides/using-sentry/), [Sentry Android PII boundary](https://docs.sentry.io/platforms/java/migration/6.x-to-7.0), [Sentry organization privacy controls](https://docs.sentry.io/api/organizations/update-an-organization/), [Sentry JavaScript event filtering](https://docs.sentry.io/platforms/javascript/configuration/filtering/), [Sentry breadcrumb filtering](https://docs.sentry.io/platforms/javascript/enriching-events/breadcrumbs/), [Sentry API regions](https://docs.sentry.io/api/), [Sentry security, retention, and removal](https://sentry.io/security/), [Sentry API permissions](https://docs.sentry.io/api/permissions/), and the official pricing pages cited in the cost table.
- Billing Grace catalog and test boundary: [StoreKit implementation](https://developer.apple.com/documentation/storekit/reducing-involuntary-subscriber-churn), [App Store Connect configuration](https://developer.apple.com/help/app-store-connect/manage-subscriptions/enable-billing-grace-period-for-auto-renewable-subscriptions), [standard durations](https://developer.apple.com/help/app-store-connect/reference/in-app-purchases-and-subscriptions/auto-renewable-subscription-information), [sandbox account settings](https://developer.apple.com/help/app-store-connect/test-in-app-purchases/manage-sandbox-apple-account-settings/), [failed-renewal testing](https://developer.apple.com/documentation/storekit/testing-failing-subscription-renewals-and-in-app-purchases), [RevenueCat grace behavior](https://www.revenuecat.com/docs/subscription-guidance/how-grace-periods-work), and [RevenueCat sandbox boundary](https://www.revenuecat.com/docs/test-and-launch/sandbox).
- RevenueCat identity and restore: [restore behavior](https://www.revenuecat.com/docs/projects/restore-behavior), [restoring purchases](https://www.revenuecat.com/docs/getting-started/restoring-purchases), [customer identity](https://www.revenuecat.com/docs/customers/identifying-customers), [customer deletion](https://www.revenuecat.com/docs/dashboard-and-metrics/customer-profile), and [restore test cases](https://www.revenuecat.com/docs/guides/testing-guide/use-cases).
- Current Sentry SDK boundary: [React Native release-channel contract](https://github.com/getsentry/sentry-react-native#releases), [React Native 8.24.0 latest release](https://github.com/getsentry/sentry-react-native/releases/tag/8.24.0), [8.7.0 Stable release](https://github.com/getsentry/sentry-react-native/releases/tag/8.7.0), [React Native SDK version matrix](https://github.com/getsentry/sentry-react-native/blob/main/SDK-VERSIONS.md), [8.24.0 options source](https://github.com/getsentry/sentry-react-native/blob/8.24.0/packages/core/src/js/options.ts), [native-event filtering boundary](https://sentry.zendesk.com/hc/en-us/articles/26323481356443-How-to-filter-native-events-in-React-Native-SDK), [React Native `dataCollection` option work](https://github.com/getsentry/sentry-react-native/issues/5996), [Android native bridge work](https://github.com/getsentry/sentry-react-native/issues/5999), and [iOS native bridge work](https://github.com/getsentry/sentry-react-native/issues/6000).

Provider documentation and prices change. Recheck the exact versions, supported native adapters, SDK privacy manifests, quotas, regions, processor terms, and list prices at Gate 0 and again immediately before production purchase/submission.
