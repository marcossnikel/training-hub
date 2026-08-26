# Official provider access for a paid Training Hub product

**Research date:** 2026-08-25; provider-reply review updated 2026-08-26
**Status:** access and policy discovery complete; Polar has confirmed the exact
commercial use in writing; other provider and aggregator decisions are pending.
**Scope:** Strava, Garmin, COROS, Polar, Suunto, Wahoo, TrainingPeaks, Oura,
WHOOP, the Google Health API/Fitbit transition, Apple HealthKit, Android Health
Connect, Hammerhead, Withings, Samsung, Huawei, Intervals.icu, Nolio, and
lower-cost aggregation options including FitnessSyncer, SportTracks, Runalyze,
and tapiriik.

This note answers a narrower question than “can we make an OAuth request?”: can
Training Hub obtain data through an official path, use it for its evidence-linked
training product, and charge users for Training Hub without requiring every user
to create developer credentials?

The findings use provider developer documentation, policies, agreements, support
articles, and application forms. “Commercially usable” below is a product-access
screening result, not legal advice. Final production use must follow the agreement
actually presented to Training Hub during approval; several providers do not
publish that agreement or pricing before review.

## Actions taken on 2026-08-25 and 2026-08-26

Marcos explicitly authorized provider outreach on behalf of Training Hub. The
messages described the product truthfully as a Brazil-based, sole-founder,
pre-revenue, invitation-only beta with one active user and an intended low-cost
paid beta. They linked the current product and source repository and asked for
the minimum official path that permits athlete-authorized data ingestion,
retention, evidence-linked analysis, and a paid differentiated service.

| Provider | Official channel contacted | Request | Gmail thread ID | Status |
| --- | --- | --- | --- | --- |
| COROS | `api@coros.com` | OAuth2 onboarding, sole-founder eligibility, retention/analysis/subscription rights, and prerequisites for the formal form | `1a03b9f2cca02717` | Sent; no delivery failure or reply |
| Garmin | `connect-support@developer.garmin.com` | Activity API evaluation, FIT/history access, no-fee applicability, and next application step; follow-up reported the dedicated form's current “stay tuned” closure and asked for a waitlist or email intake | `1a03b9f31a4655e5` | Two messages sent; no delivery failure or reply |
| Suunto | `partners@suunto.com` | Cloud API partnership, commercial free-production path, workout/FIT ingestion, and sole-founder eligibility | `1a03b9f35cf0c5e0` | Sent; no delivery failure or reply |
| Polar | `b2bhelpdesk@polar.com` | AccessLink commercial-use confirmation and any prerequisite beyond self-service client registration | `1a03b9f9403954fc` | **Confirmed in writing on 2026-08-26:** the described paid multi-user use is allowed and there are no additional prerequisites beyond the published agreement/client fields. Human reply `1a03d03c12a88eea`; acknowledgment sent `1a03d6edcdc81443` |
| Wahoo | `wahooapi@wahoofitness.com`, copied to `partnerships@wahoofitness.com` | Cloud API approval and written confirmation for paid, non-duplicative analysis | `1a03b9f9a8b29c23` | Sent; no delivery failure or reply |
| TrainingPeaks | `support@trainingpeaks.com`, then `api@trainingpeaks.com` | Routing to the commercial API team; written exception/terms for retention beyond the default seven-day cache and a paid differentiated product while partner intake is paused | `1a03b9f98f7905f2`, `1a03bac6148417ef` | Two messages sent; no delivery failure or reply |
| Strava | `developers@strava.com` | Written policy determination for persistent historical evidence, analytics, any future AI context, BYO credentials, and a roughly US$5 paid beta; follow-up asked that ticket `#17712` remain open and be routed to the policy/commercial owner | `1a03ba00c9087d63` | Automated resource/rate-limit reply did not answer the policy questions; escalation sent in the ticket; human answer pending |
| Validic | `hello@validic.com` | Free developer sandbox limits, real-user eligibility, activity-detail fidelity, and future Business production pricing | `1a03ba011aa90229` | Automated receipt says non-COVID requests receive a response within one business day; human answer pending |
| Terra | `vanessa@tryterra.co` | Startup Accelerator fit and application route for a working pre-revenue product | `1a03ba0126d082c2` | Sent; no delivery failure or reply |
| Open Wearables / Momentum | `inquiries@themomentum.ai` | Whether self-hosted/enterprise supplies provider credentials or downstream rights; detailed activity fidelity; provider-specific AI disabling; bootstrapped support cost; deletion and provider-loss paths | `1a03bbcbc6a8b9a8` | Sent after the first contact wave; no delivery failure or reply reported |
| Intervals.icu | `david@intervals.icu`, copied to `support@intervals.icu` | Whether the commercial API license covers retained original provider files and paid derived evidence; reliable upstream provenance; flow-down restrictions; Strava/Oura exclusion; revocation/deletion; production limits or fees | `1a03bcd482c9a5ee` | Sent; no delivery failure or reply reported |
| Hammerhead / SRAM | `hammerhead.integrations@sram.com` | Paid differentiated-product rights, original Karoo FIT retention, deterministic/AI analysis, production limits/fees, Brazil eligibility, and revocation/deletion obligations | `1a03bcd4c999fd85` | Sent; no delivery failure or reply reported |
| Nolio | `contact@nolio.io` | Production/API price and Premium-account dependency; provider-by-provider downstream authority; retained history/files and derived evidence; original-file provenance; AI flow-down restrictions; DPA/deletion/provider-loss terms; Brazil eligibility | `1a03bcdfebefbcfd` | Sent; no delivery failure or reply reported |
| Huawei Health Service Kit | `hihealth@huawei.com` | Brazil sole-founder and enterprise eligibility; entity requirements and fees; paid differentiated use; retained history, trajectory and samples; deterministic/AI rights; cross-border, deletion and termination terms; whether 100-user test scopes permit real consenting testers | `1a03bd1f836fd5bd` | Sent after the 23:04 inbox check; reply pending |
| FitnessSyncer | `hi@fitnesssyncer.com`, copied to `support@fitnesssyncer.com` | Commercial agreement, minimum and per-managed-user price; free versus sponsored accounts; provider-by-provider downstream authority; OAuth versus username/password sources; normalized/original-file fidelity and provenance; retention, paid derived use, AI exclusions, DPA/security/provider-loss, Brazil eligibility and caps | `1a03bd4b68e677fa`, case thread `1a03bd6cb2fba3e8` | Human reply `1a03bee0c8239c07` confirmed API use, original FIT passthrough when received and no AI/MCP support, but requested a specific flow before pricing/approval. Exact deterministic, non-AI flow and 10/100/1,000-user pricing questions sent in `1a03d6f410deb196`; answer pending |
| SportTracks | `api@sporttracks.mobi` | Commercial API price, minimum and caps; whether every athlete needs the US$59/year subscription; provider-by-provider downstream authority; retention and paid derived use; original-file/provenance fidelity; AI exclusions, DPA/security/provider-loss and Brazil eligibility | `1a03bd53d6436529` | Sent after the 23:04 inbox check; reply pending |
| WHOOP | `apisupport@whoop.com` | Paid differentiated functionality, explicit-user-consent retention, current cost, and workout telemetry fidelity | `1a03baedd65b2feb` | Sent; no delivery failure or reply |
| Oura | `api-support@ouraring.com` | Whether prior written consent can permit a paid historical-analysis product despite the current charging, retention, and AI restrictions | `1a03baeda939cb78` | Sent; no delivery failure or reply |
| ROOK | `contact@tryrook.io` | Bootstrapped plan below US$399, pilot extension/real-account limits, granular-data cost, and provider-by-provider downstream commercial authority | `1a03bafbc484f295` | Sent; no delivery failure or reply |
| Stridee | `hi@stridee.fit` | Provider-by-provider upstream authority, paid downstream retention/analysis rights, DPA/security/deletion terms, and detailed-data fidelity | `1a03bafbac71482e` | Human reply `1a03c7dd4a2d6906` said production is live, upstream contracts are confidential and public terms are the available agreement; custom contracts start at 20,000/year, currency unstated. The published terms still lack an explicit provider-rights warranty; exact-clause follow-up `1a03d6f0005ed6aa` received final answer `1a03d71761cef1a0` pointing back to the same site without identifying a clause; **definitive procurement hold** |

Most rows remain inquiries rather than access approvals. Polar's 2026-08-26
reply is the first direct written commercial confirmation for Training Hub's
exact use case. The same inbox review found substantive replies from Stridee and
FitnessSyncer; both received targeted follow-ups in their existing threads.
Stridee's immediate final answer did not identify the requested binding clause,
so no further email was sent and the route was moved to definitive hold. All
three 2026-08-26 replies were delivered, and the post-send bounce search found
no delivery-failure notice.
Formal web applications and developer
client registrations were not submitted because they require accepting binding
terms or creating persistent credentials at the moment of submission, and the
stronger reviewed-provider forms require facts or assets the current product
does not yet have: a final public name/domain, privacy and support pages, a public
account-deletion path, production callback/webhook/status URLs, and a final logo
and contact package. Submitting invented answers would weaken the applications.

**Continuation note:** The Google Health API and Open Wearables findings were
added after the first contact wave. WHOOP, Oura, ROOK, and Stridee received the
second wave; the remaining messages shown above were subsequent
pre-application inquiries. The 2026-08-26 actions were email replies only. No
form, account registration, checkout, credential creation, payment, or terms
acceptance was performed for these routes.

## Executive decision

There is a credible low-cash path to real integrations, but it should not start
with a shared Strava client:

1. **Start Polar AccessLink now.** It is self-service, royalty-free, OAuth-based,
   and does not require a company application review. On 2026-08-26 Polar B2B
   support confirmed in writing that the exact described paid multi-user use is
   allowed and that no additional production-review, incorporation,
   privacy-policy, user-count or attribution prerequisite applies beyond the
   published agreement and client fields. Training Hub can charge for its
   differentiated product, but must not sell or sublicense Polar data or the API
   itself.
2. **Keep the direct-provider queue active, but respect the live intake state.**
   Suunto, COROS, and Wahoo have live application paths after the public
   prerequisite package exists. Garmin's dedicated access form currently only
   says “Stay tuned,” so the email thread is now the waitlist request.
   TrainingPeaks is not accepting new API partners during maintenance and its
   default terms do not permit Training Hub's persistent history; wait for a
   written exception or changed terms before treating it as viable.
3. **Use Android Health Connect as the lowest-cost aggregation route while those
   applications run.** A small native Android companion can receive user-authorized
   data written by Garmin, COROS, Polar, and Wahoo. It costs US$25 for a Play
   Console account, but its data fidelity varies and it is not accessible from a
   web-only app. Apple HealthKit is the equivalent iOS path, with a US$99/year
   Apple Developer membership.
4. **Do not treat BYO Strava credentials as a commercial-policy workaround.**
   Strava's current API Policy restricts AI use, analytics/customer-insight use,
   cross-customer combination, persistent storage, and charging for
   Strava-provided functionality. Those restrictions collide with core Training
   Hub behavior. Ask Strava for a written determination or negotiated license
   before building a hosted Strava connector or selling Strava-backed analysis.
5. **Use free programs as a hedge, not an assumption of production access.**
   Terra's standard plan and ROOK are too expensive at this stage, but Terra has
   a selective accelerator and Validic now has a free developer sandbox. Neither
   is production authority until its written downstream rights, limits, and
   post-program pricing are clear. Stridee is cheaper but does not publish
   provider-by-provider sublicensing proof. Open Wearables reduces engineering
   work but still requires Training Hub to obtain each provider credential.
6. **Add the Google Health API to the first buildable wave.** It is the official
   successor to the legacy Fitbit Web API, has a 100-user testing ceiling before
   production OAuth verification, exposes detailed Fitbit/Pixel workouts and
   registered Health Connect/HealthKit sources, and has no published API usage
   fee. Cross-provider fidelity is uneven: it is a useful summary aggregator,
   not parity with each vendor's direct API. Do not start a new legacy Fitbit
   Web API connector: Google says it is decommissioned on September 30, 2026.
7. **Treat WHOOP as a viable secondary direct integration.** Self-service access
   covers ten members, access is currently free, and the terms allow charging
   for Training Hub functionality that WHOOP does not provide. Obtain written
   retention guidance and avoid duplicating WHOOP's strain/recovery product.
8. **Put Oura on policy hold for a paid product.** Its documentation calls the
   API free for commercial apps, but the current agreement broadly restricts
   charging for API-related functionality, persistent storage, and AI use.
   Written Oura consent is needed before a paid, persisted Training Hub flow.
9. **Test Intervals.icu as the strongest zero-cost hosted bridge.** Its API terms
   expressly grant worldwide, royalty-free commercial use; OAuth exposes the
   original activity file, and free athlete accounts can sync Garmin, COROS,
   Polar, Suunto, Wahoo and more. The extra Intervals account is onboarding
   friction, and Training Hub must preserve provider provenance and exclude
   Strava/Oura-sourced data where their upstream policies conflict.
10. **Add Hammerhead's new public API to the direct queue.** It is self-service,
    no-fee, OAuth-based and returns the original Karoo FIT file. The license does
    not expressly decide paid subscriptions, long-term data retention or AI use,
    so confirm those points before public production.
11. **Keep Nolio as a technical backup, not an approved commercial bridge.** Its
    OAuth API has five-user development access and detailed streams across many
    connected providers, but no public API price or downstream commercial/data
    license was found. Production needs a written partnership agreement.
12. **Use Withings only for wellness context.** Its free Public API is open to
    individuals and companies and supports server-side OAuth/webhooks, but the
    public workout model does not expose an original activity file, GPS route,
    general laps, power or run/cycle cadence. It cannot replace an endurance
    connector.
13. **Treat Samsung and Huawei as later platform partnerships.** Samsung exposes
    rich route and sensor logs but requires an Android companion plus production
    partner approval. Huawei can expose detailed cloud workout data, including
    trajectory and samples, but those advanced scopes are enterprise-only. Both
    need written paid-subscription, retention and AI approval.
14. **Do not count Final Surge or Zepp/Amazfit as connector routes.** Final Surge
    publishes consumer syncs but no athlete-data developer API; Zepp publishes
    watch-side workout extensions, not a historical consumer cloud API.
15. **Treat SportTracks as the strongest conditional bridge from the final
    sweep.** Its current partner API uses athlete OAuth, covers Garmin, COROS,
    Polar, Suunto and Wahoo, and exposes rich normalized laps, GPS, heart rate,
    cadence and power. It does not document original-file download or
    provider-level provenance, and its API price, athlete-account requirement,
    downstream license, retention and AI rights are unpublished. Wait for the
    written commercial answer before implementing it.
16. **Keep FitnessSyncer as a capable custom-contract backup.** It supports the
    same five providers and normalized GPS/lap/sample telemetry, but commercial
    apps and sponsored users require contact, per-managed-account pricing is
    unpublished, and the public terms do not grant provider-by-provider paid
    downstream or AI rights. The US$4.99/month Pro plan is personal-only and is
    not a production license for Training Hub.
17. **Reject Runalyze and tapiriik as access shortcuts.** Runalyze's public app
    API is write-only; its read token is expressly for the athlete's own use.
    tapiriik is a consumer account-to-account sync with no downstream Training
    Hub API, misses four of the five target providers, and self-hosting still
    requires separate provider credentials and approvals.

## Opportunity matrix

| Route | Data available | Can Training Hub charge its users? | Published cost | Review and prerequisites | Action |
| --- | --- | --- | --- | --- | --- |
| **Polar AccessLink** | Exercises, activity, sleep, cardio load, Nightly Recharge, biosensing and user information through OAuth | **Yes, for Training Hub's differentiated service**, subject to the agreement; no selling, sublicensing, or commercializing Polar Licensed Materials/data | **Royalty-free** | Self-service API client; Polar Flow account; user consent; no company or geography gate published | Create a client at [admin.polaraccesslink.com](https://admin.polaraccesslink.com/) |
| **Garmin Activity API** | Full activity files and details across 30+ activity types; FIT, GPX, and TCX; OAuth user consent | **Yes, after business-use approval** for the approved Training Hub use case | General program says no licensing/maintenance fee; selected Health API metrics may carry fees or device minimums | Enterprise/business use only; normal documentation says a typical integration is 1–4 weeks, but the dedicated request form is currently closed | Keep the email waitlist request open and monitor the [dedicated access form](https://www.garmin.com/en-US/forms/GarminConnectDeveloperAccess/) |
| **Suunto Cloud API** | Workout summaries and FIT samples including heart rate, RR, power, altitude, temperature, and GPS; daily steps/calories; no sleep API | **Yes.** Suunto explicitly permits commercial and non-commercial use | **Free** | Company/organization with a public tool, app, or service; no personal-use apps; weekly review, maximum stated wait of two weeks | Submit [Become a Suunto Partner](https://survey.alchemer.eu/s3/90553908/PARTNER-Become-a-Suunto-Partner) |
| **Wahoo Cloud API** | Athlete profile/zones, routes, workouts and workout plans; upload and download; OAuth | **Conditionally yes.** May charge for differentiated functionality not provided by Wahoo; may not charge specifically for Wahoo API/platform functionality or resell it | **Currently free**; Wahoo reserves future pricing | Wahoo account, app request, purpose/scopes and review; individual 18+ or entity; no geography gate published | Register/login at [Wahoo Applications](https://developers.wahooligan.com/applications) |
| **COROS OpenAPI** | User-authorized activity sharing from COROS to third-party platforms through OAuth2 | **Plausibly yes, but the public page does not establish charging rights.** Obtain written confirmation in the agreement/review | The live application says there is no integration fee; future/commercial terms are not otherwise published | Company/platform details, privacy/technical contacts, redirect and push/status URLs, terms, security/privacy/rate limits, identity and security verification | Complete the [COROS API application](https://coros-teams.feishu.cn/share/base/form/shrcnLqSduZsaNhbvDJTO2x0Vlf) after the missing public/technical assets exist |
| **TrainingPeaks API** | Profile/zones, completed workouts and details, calendar events, weight/HRV/steps/stress/sleep metrics, planned workouts, workout uploads | **Can charge for functionality not provided by TrainingPeaks**, but default terms prohibit permanent copies and limit ordinary caching to seven days—currently incompatible with Training Hub history without written permission | Current API terms say no charge today and reserve future pricing | New-partner intake is paused; form may queue an application for later; accepting the form binds the applicant to the current terms | Do not submit until `api@trainingpeaks.com` answers the retention request or the product is redesigned around the cache limit |
| **Google Health API (Fitbit successor)** | Detailed Fitbit/Pixel exercise plus registered first/third-party sources from Health Connect/HealthKit; sessions can include telemetry, pace, laps/splits and TCX routes when the source supplies them | **Yes for a prominent user-visible fitness monitoring/analysis feature**; no data sale, advertising, brokerage or unrelated use | No API usage price published; the assessor's price for required CASA review at public scale is an unknown external launch cost | Unverified OAuth is capped at 100 users; production above 100 requires OAuth verification and, for server-stored restricted health scopes, independent CASA assessment with annual revalidation; cross-provider fields vary | Start at [Google Health API setup](https://developers.google.com/health/setup); do not build a new legacy Fitbit Web API connector |
| **WHOOP API** | Cycles, sleep, recovery and workout summaries including distance, elevation, average/max heart rate and heart-rate zones | **Yes for differentiated functionality WHOOP does not provide**; no data resale/licensing or directly/indirectly competing product | **Currently no charge**; WHOOP reserves future fees | Immediate OAuth credentials; development up to 10 WHOOP members; approval required above 10 with tested app, privacy URL and designs | Create an app in the [WHOOP Developer Dashboard](https://developer-dashboard.whoop.com/) and ask [apisupport@whoop.com](mailto:apisupport@whoop.com) about persisted user-consented history |
| **Oura API** | Workout summaries, daily activity/sleep/readiness/stress, sessions and heart-rate/HRV/temperature time series | **Not safely without written consent.** Public docs call commercial API access free, but the current agreement restricts charging for API-related functionality, storage and AI use | **Currently free**; Oura reserves differentiated/future business pricing | Self-service OAuth up to 10 users; app review above 10 | Register/test through [Oura Cloud](https://cloud.ouraring.com/docs/), then obtain a written determination from [api-support@ouraring.com](mailto:api-support@ouraring.com) before a paid flow |
| **Hammerhead Karoo API** | OAuth activity summaries/details, route polyline and the original activity FIT file; routes and planned workouts can also be written | **Plausibly for a differentiated app, but not explicit.** The license covers business applications and end users but does not specifically authorize subscription charging, retained activity data or AI use | **No license fee today**; SRAM reserves future pricing | Self-service developer-account enablement and license acceptance; no published athlete cap or geography/company-size gate; Brazil is not excluded by the US export clause | Follow [Creating a Developer Account](https://support.hammerhead.io/hc/en-us/articles/43558376710683-Creating-a-Developer-Account) and confirm commercial/retention terms before acceptance |
| **Withings Public API** | OAuth workout summaries, activity, intraday heart rate/distance/steps, sleep, body and cardiovascular data; no public original activity file or GPS route | **Plausibly for a differentiated app, but not explicit.** Terms permit branded applications with added functionality and do not state a charge ban; clarify commercial continuous sync, retention and AI | **Free Standard access**, 120 requests/minute; enterprise limits/SLA unpriced | Self-service developer dashboard for individuals or companies, no contract/prerequisite or user cap published; Brazil not excluded, but availability may vary by country | Use the [Public API setup](https://developer.withings.com/developer-guide/v3/integration-guide/public-health-data-api/developer-account/create-your-accesses-no-medical-cloud/) only as a later wellness connector; first resolve the stale terms/background-webhook conflict |
| **Intervals.icu OAuth API** | Original FIT/TCX/GPX activity file, summaries, wellness, calendar and webhooks; free accounts can sync Garmin, COROS, Polar, Suunto, Wahoo and many more | **Yes.** API terms grant worldwide, royalty-free commercial use and allow downstream use/sublicensing of derived outputs, subject to Garmin attribution | **Free** platform and royalty-free API; no per-user/API fee published | Request an OAuth app by email with site, privacy policy, logo and callbacks; no published user cap; default rate budget scales through 500 users, then support can raise it | Request an app from [david@intervals.icu](mailto:david@intervals.icu); test direct-provider files and exclude Strava/Oura-derived use until their upstream restrictions are resolved |
| **Nolio API** | OAuth access to workouts, HR/power/cadence/pace/altitude/distance/time streams, custom laps, metrics, files and webhooks across Nolio's broad connector set | **Undetermined.** The public developer surface promotes partner and AI integrations but publishes no downstream commercial/data license | No API price published; Nolio's athlete page lists API access in its €6.90/month Premium tier, so partner-user cost must be clarified | Self-service developer application for a person or company; production-backed testing only, five-user development cap, production promotion required; no geography gate published | Use the [Nolio developer portal](https://www.nolio.io/developers/) only after the [partnership form](https://www.nolio.io/contact/?subject=Demo) confirms cost and provider-by-provider downstream rights |
| **Android Health Connect** | On-device user-authorized health/fitness records written by connected apps; provider coverage and fields vary | **Yes for a user-benefiting fitness/wellness product**, subject to Play policy; subscriptions sold in the Android app normally use Play Billing | US$25 one-time Play developer registration | Native Android app; Health Apps declaration, Data Safety disclosure, minimum scopes and justification; organization account/D-U-N-S is the safer health-app path | Build a narrow native companion after reading the [publish guide](https://developer.android.com/health-and-fitness/health-connect/publish) |
| **Samsung Health Data SDK** | On-device exercise sessions with GPS route, timestamped heart rate/speed/cadence/power logs, swimming intervals and summaries; no original FIT/TCX | **Potentially, only as Samsung-approved functionality.** The partner agreement contemplates a provider service but restricts selling/marketing/data mining; obtain explicit subscription and bounded-analysis approval | No fee published; each party bears its own costs | Android 10+ companion and Samsung Health; developer mode is test-only; public distribution requires partnership plus package/signature registration; a company-backed applicant is safer | Apply through the [Samsung app-creation process](https://developer.samsung.com/health/data/process.html) only after an Android companion and Brazilian legal entity are justified |
| **Huawei Health Service Kit** | User-authorized cloud/mobile activity records; advanced scopes can include trajectory, timestamped heart rate, speed, running form, power and cycling cadence; no original FIT/TCX found | **Undetermined.** Paid use, retention and AI rights are governed by an in-console agreement not publicly resolved | No usage fee published | Detailed workout and cloud-subscription capabilities are enterprise-only; reviewed test scopes have a 100-user ceiling, six-month verification deadline and two manual review stages | Revisit after forming a Brazilian legal entity; follow the [kit-service application guide](https://developer.huawei.com/consumer/en/doc/HMSCore-Guides/harmonyos-apply-kitservice-0000001194699502) and confirm terms via [hihealth@huawei.com](mailto:hihealth@huawei.com) |
| **Apple HealthKit** | On-device user-authorized health and fitness records written by connected apps; provider coverage and fields vary | **Yes for a direct user benefit**, under HealthKit/App Store rules; digital subscriptions in the app must follow Apple's purchase rules | US$99/year developer membership | Native iOS app, HealthKit entitlement, purpose strings and per-type consent; individual/sole proprietor allowed, organization enrollment needs D-U-N-S | Start with [HealthKit](https://developer.apple.com/documentation/healthkit) and [membership comparison](https://developer.apple.com/support/compare-memberships/) |
| **Strava API** | Athlete-authorized activity/profile data through OAuth | **Not safely for Training Hub's current core behavior without written authorization.** Marketing/selling an app is contemplated, but current policy separately restricts AI, analytics/customer insights, persistent data and charging for Strava-provided functionality | API Agreement says access is currently no-charge; Standard-tier subscription requirements may apply; exact current price is not published on the reviewed pages | New apps begin with one athlete, settings upgrade to 10, then formal review; screenshots and a compliant connect flow required; Extended access applies at 10,000+ athletes | First request a written product-use determination from [developers@strava.com](mailto:developers@strava.com); do not submit a generic limit increase until the use case is resolved |

## Direct-provider findings

### 1. Polar AccessLink — fastest direct production candidate

**Official access.** [AccessLink API v4](https://www.polar.com/polar-api-v4/)
allows a registered Polar Flow user to create an OAuth client, register users with
their explicit consent, and access exercise, daily activity, sleep and recovery
data. The published limits are 3,000 requests per 15 minutes and 100,000 requests
per day. Polar directs support questions to
[b2bhelpdesk@polar.com](mailto:b2bhelpdesk@polar.com).

**Written provider confirmation.** On 2026-08-26 Polar Customer Care/Juha
answered the exact Training Hub inquiry: AccessLink may be used commercially for
the described paid multi-user product, and there are no extra production-review,
company-incorporation, privacy-policy, user-count or attribution prerequisites
beyond the published agreement and client-registration fields. The incoming
Gmail message is `1a03d03c12a88eea` in thread `1a03b9f9403954fc`; Training Hub
acknowledged and preserved the decision in `1a03d6edcdc81443`.

**Commercial boundary.** The [Polar API License
Agreement](https://www.polar.com/en/legal/polar-api-agreement) grants a
royalty-free, non-exclusive, worldwide license to develop a proprietary
application/service and make it available to customers. It prohibits selling,
renting, sublicensing, distributing, or otherwise commercializing the Licensed
Materials themselves. The defensible product model is therefore: charge for
Training Hub's own evidence-linked interface and analysis, never for raw Polar
data access or a data-resale product. The app should extend the member experience
and must not compete with Polar.

**Prerequisites and implementation obligations.** There is no published company,
country, or application-review gate. Training Hub must provide explicit consent,
a privacy notice, source attribution, data protection, revocation, and deletion.
The agreement excludes entities designated as EU Digital Markets Act gatekeepers,
which is not relevant to the present project.

**Next action.** With the use case now confirmed, create the Training Hub client at
[admin.polaraccesslink.com](https://admin.polaraccesslink.com/), capture the exact
terms shown at registration, and run a developer-account OAuth proof. Before real
users, add provider-specific disconnect/deletion behavior and verify which
historical windows each v4 endpoint actually returns.

### 2. Garmin Connect Developer Program — strong no-fee activity route

**Official access.** The [Garmin Connect Developer Program
overview](https://developer.garmin.com/gc-developer-program/overview/) offers
cloud-to-cloud APIs. The [Activity
API](https://developer.garmin.com/gc-developer-program/activity-api/) provides
detailed activities and FIT, GPX, or TCX files across more than 30 activity types
after OAuth consent. The program also has APIs for all-day health data, training,
and courses.

**Commercial boundary and cost.** Garmin's [program
FAQ](https://developer.garmin.com/gc-developer-program/program-faq/) says the
program is for enterprise/business use and that Garmin generally charges no
licensing or maintenance fees. Some Health API metrics may require a fee or a
minimum Garmin-device order; the [Health
API](https://developer.garmin.com/gc-developer-program/health-api/) separately
states that some commercial use is licensed. Training Hub should request the
**Activity API first** and avoid paid Health API metrics unless they become
necessary.

**Review.** Garmin's documentation says a typical integration takes one to four
weeks after intake. No country exclusion or mandatory company identifier is
published, but it is explicitly a business-use program and approval is
use-case-specific. The dedicated [Connect Developer Program access
form](https://www.garmin.com/en-US/forms/GarminConnectDeveloperAccess/) was
inspected in a real browser on 2026-08-25 and currently has no fields; it only
says “Stay tuned for more updates on the program.” The broader Garmin Health
contact form is not a substitute for that API form.

**Next action.** Keep the existing support thread open as a request for the
waitlist, reopening date, or authorized email intake. When the form reopens,
request Activity API, FIT access and history synchronization for an
athlete-authorized, evidence-linked review product. Ask about the Training API
only if Training Hub later needs to push workouts; it is not needed for the
current read-and-interpret product.

### 3. Suunto Cloud API — explicitly commercial and free

**Official access.** [Suunto API Zone](https://apizone.suunto.com/) documents
OAuth2 access to workout FIT files, summaries, and samples including heart rate,
RR, power, altitude, temperature, and GPS. The [Suunto
FAQ](https://apizone.suunto.com/faq) says daily steps and calories are available,
but sleep is not.

**Commercial boundary and cost.** Suunto explicitly welcomes commercial and
non-commercial applications and says it does not charge for API use. It does not
approve personal/private applications: the applicant should be a company or
organization offering a tool, app, or service to the public. Suunto reviews brand
fit, customer interest, and innovation.

**Review.** The application includes the API agreement. Suunto says it reviews
applications weekly, with a maximum stated two-week wait, then provides a
development API and later a production subscription/content after validation.
Questions go to [partners@suunto.com](mailto:partners@suunto.com).

**Next action.** Ensure the domain has a truthful public product page, privacy
policy, support contact and deletion explanation, then submit [Become a Suunto
Partner](https://survey.alchemer.eu/s3/90553908/PARTNER-Become-a-Suunto-Partner).
Request workout/FIT ingestion and daily activity only; do not promise sleep data.

### 4. Wahoo Cloud API — free today, charging allowed for differentiated value

**Official access.** The [Wahoo Cloud API
portal](https://developers.wahooligan.com/cloud) supports web and mobile OAuth
applications. It exposes profile and heart-rate/power zones, routes, workouts,
and workout plans, including upload/download. Wahoo asks applicants to state the
purpose, required scopes and user benefit in detail.

**Commercial boundary and cost.** The [Wahoo API
Agreement](https://www.wahoofitness.com/wahoo-api-agreement) says access is
currently free but Wahoo may introduce pricing. It contemplates marketing and
selling a developer application. It prohibits charging specifically for Wahoo
API/platform functionality or reselling the API, but allows charging for
functionality not provided by Wahoo. It also prohibits competitive applications.
Training Hub should sell its cross-period evidence and athlete context—not “Wahoo
sync” or a copy of Wahoo's own functionality.

**Review.** No geography or incorporation requirement is published; the agreement
can be accepted by an adult individual or an entity. The request is reviewed and
may be rejected. User consent, a privacy policy, security, revocation, deletion,
and Wahoo attribution are required.

**Next action.** Sign in to [Wahoo
Applications](https://developers.wahooligan.com/applications) and request the
minimum read scopes, explaining the exact evidence-linked experience. Clarify in
writing that a paid Training Hub subscription for non-duplicative analysis is
accepted. Use the [API support form](https://wahooapi.zendesk.com/hc/en-us/requests/new),
[wahooapi@wahoofitness.com](mailto:wahooapi@wahoofitness.com), or
[partnerships@wahoofitness.com](mailto:partnerships@wahoofitness.com) if the
portal leaves that point ambiguous.

### 5. COROS OpenAPI — newly explicit application process, terms unpublished

**Official access.** COROS's [Submit an API
Application](https://support.coros.com/hc/en-us/articles/17085887816340-Submit-an-API-Application)
page describes user-authorized OAuth2 sharing with third-party platforms. It says
COROS uses a standardized, objective onboarding process and grants access to
platforms that meet its security and operational requirements.

**Commercial boundary and cost.** The live application says COROS does not
charge an integration fee, but it does not publish a commercial-use license,
data retention rights, future pricing, or whether the app may charge users.
Those are open contract questions, not reasons to use an unofficial connection.

**Review and prerequisites.** Prepare company/project identity, authorized
technical contacts, redirect URIs, security/privacy description, and acceptance
of COROS terms, rate limits and privacy requirements. COROS performs identity and
security verification. No country restriction is published.

**Next action.** Submit the [official COROS
form](https://coros-teams.feishu.cn/share/base/form/shrcnLqSduZsaNhbvDJTO2x0Vlf).
In the application or a parallel question to
[api@coros.com](mailto:api@coros.com), explicitly request confirmation that
Training Hub may (a) retain user-authorized activity history for the user's
evidence view, (b) generate user-facing analysis, and (c) charge a subscription
for that differentiated service.

### 6. TrainingPeaks API — official commercial path, likely competitive review

**Official access.** The [TrainingPeaks API help
page](https://help.trainingpeaks.com/hc/en-us/articles/234441128-TrainingPeaks-API)
lists profiles/zones, completed workout details, calendar events, metrics such as
weight, HRV, steps, stress and sleep, planned workouts up to seven days ahead,
and workout/metric uploads.

**Commercial boundary and cost.** The [live API access form and embedded
terms](https://api.trainingpeaks.com/request-access) permit charging for
functionality the TrainingPeaks Platform does not provide and say API access is
currently no-charge, with future charges reserved. The same terms make the
present product incompatible by default: data may not remain cached beyond the
response header or seven days when no header exists, and developers may not
build databases or permanent copies of returned content. Training Hub's
multi-month evidence history therefore needs an express written exception or a
different product boundary. It also overlaps with TrainingPeaks in training
history and analysis, making approval less certain than Garmin, Suunto, or Polar.

**Review.** The live form now says TrainingPeaks is not accepting new API
partners while it performs API-system maintenance. Applicants may still submit,
but TrainingPeaks will only follow up when it begins adding partners again. The
form accepts the full embedded terms at submission; it is not a harmless
waitlist checkbox.

**Next action.** Wait for the direct `api@trainingpeaks.com` answer about a
retention exception and future-partner eligibility. If the answer is favorable,
submit [Request API Access](https://api.trainingpeaks.com/request-access) as an
athlete-owned evidence/intelligence layer, requesting only profile/zones,
completed workout data/details and relevant metrics—no coaching, calendar,
planning, or write scopes.

### 7. Strava — working OAuth is not commercial authorization

**Official access and review.** New applications begin in “Single Player” mode
with one athlete. Strava's [rate-limit and athlete-capacity
documentation](https://developers.strava.com/docs/rate-limits/) says the app
settings flow can increase that to 10 athletes; a larger audience requires the
[official athlete-capacity review
form](https://share.hsforms.com/1VXSwPUYqSH6IxK0y51FjHwcnkd8), screenshots, and
a compliant “Connect with Strava” experience. Increases are not guaranteed.

**Commercial boundary.** The current [Strava API
Agreement](https://www.strava.com/legal/api) contemplates developers marketing
and selling applications and says API access is currently provided without
charge, while reserving future or differentiated business pricing. The separate
[Strava API Policy](https://www.strava.com/legal/api_policy), effective 2026-06-01,
places restrictions that are decisive for Training Hub:

- Strava data may not be used to train, fine-tune, evaluate, ground, embed, or
  provide context to AI/ML systems. Strava's own MCP exception is for personal,
  non-commercial use and does not solve the product case.
- Strava data may not be used to create analytics, analyses, customer insights,
  improve a product/service, or be combined with other customers' data.
- Data generally may not be retained beyond the policy's short caching window,
  and a persistent index is prohibited, subject to narrow stated exceptions.
- An app may not charge end users for Strava API or related Strava platform
  functionality. It may charge for functionality Strava does not provide and
  that is not substantially duplicative.
- Data display and use are bound to the authenticated athlete, with explicit
  consent, deletion, security, branding and support obligations.

Training Hub currently persists Strava-origin activity history and generates
evidence-linked analyses and customer insights. Its proposed paid entitlement
would govern sync and insight generation. That makes a generic capacity request
insufficient: even if approved for more athletes, the product could still violate
use restrictions.

**Cost and tiers.** The Agreement says access is currently no-charge and reserves
future pricing. The Policy describes Standard and Extended access and refers to
subscription requirements, but the reviewed public pages do not provide a
reliable current price. Do not budget “free forever” or invent a price.

**Next action.** Send a precise written pre-application question to
[developers@strava.com](mailto:developers@strava.com), including current data
retention, evidence analysis, any AI context use, user-facing sources/deletion,
and the paid subscription boundary. Ask whether Strava will authorize that use
under the Standard terms, requires a negotiated license, or will not approve it.
Do not claim that per-user/BYO developer apps avoid these obligations.

### 8. Google Health API — the official Fitbit successor and strongest new route

**Do not start with the legacy Fitbit Web API.** Google's current [Fitbit Web API
documentation](https://dev.fitbit.com/build/reference/web-api/intraday/) says
that API will be decommissioned on September 30, 2026 and directs developers to
the Google Health API. The legacy API can expose activities, TCX files and
intraday data, but third-party intraday access was already case-by-case and
commercial applications were selectively reviewed. With decommissioning
imminent, it is not a sensible new production dependency.

**Official successor and data.** The generally available [Google Health
API](https://developers.google.com/health) is a cloud OAuth API with native
Fitbit/Pixel data and registered first- and third-party sources. Its [endpoint
model](https://developers.google.com/health/endpoints) distinguishes all
registered sources from Google sources, and the REST source platforms include
Health Connect and HealthKit. Its [data-type
catalog](https://developers.google.com/health/data-types)
includes exercise, heart-rate samples, distance, altitude, steps, swim lengths,
sleep and VO2 max. The [workout guide](https://developers.google.com/health/data-types/workouts)
documents sessions with active duration, average pace/speed/heart rate,
distance, elevation gain, pauses and laps/splits; related time-series endpoints
provide high-frequency measurements, and `exportExerciseTcx` can return a GPS
route with location permission. Collection reads can retrieve full available
history with pagination.

**Provider fidelity.** This is **high-value for detailed Fitbit/Pixel endurance
activity** and a useful summary-level cross-provider aggregator, not a guarantee
of direct-API parity. Google's official [Garmin data-sharing
guide](https://support.google.com/googlehealth/answer/14236613?hl=en) says Garmin
data can arrive through Health Connect or Apple Health, but excludes exercise
maps/routes and detailed lap splits. COROS officially lists Health Connect as a
[supported third-party app](https://support.coros.com/hc/en-us/articles/360040256531-Supported-3rd-Party-Apps),
while Polar's [Health Connect export](https://support.polar.com/en/flow-app-health-connect)
is richer and can include laps, route, workout heart rate and speed. The
reviewed Google data catalog also did not document cycling power or cadence.

**Commercial and retention boundary.** The [Health API user-data
policy](https://developers.google.com/health/policies/health-api-developer-user-data-policy)
allows user-visible monitoring, analysis and synchronization of physical
activity. It permits storing data for that prominent user-facing purpose, with
minimum scopes, informed consent, privacy disclosure, deletion and encryption.
It prohibits selling data, advertising/brokerage uses, and unrelated processing;
medical-device and certain regulated-health uses need separate approval. The
[terms](https://developers.google.com/health/policies/health-api-developer-terms-and-conditions)
also anticipate an application storing data at the source granularity and
require explicit location permission. No Google Health API usage price was
published in the reviewed official pages; do not confuse it with the separately
priced Google Cloud Healthcare API.

**Production approval.** Create a Google Cloud project and OAuth client using
the [setup guide](https://developers.google.com/health/setup). In testing mode,
only allowlisted testers can connect. The [developer
checklist](https://developers.google.com/health/developer-checklist) and [rate
limits](https://developers.google.com/health/rate-limits) cap an unverified app
at 100 users; production above 100 requires OAuth verification of the app,
privacy policy and terms. Because Google Health scopes are restricted and
Training Hub would store/transmit the data on its server, Google's [restricted
scope verification guide](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)
and [CASA FAQ](https://support.google.com/cloud/answer/13463817) require an
independent security assessment and annual revalidation at public scale. Google
does not charge for the assessment itself, but the assessor's price is negotiated
and therefore an unknown launch cost. Use the
[Health API support page](https://developers.google.com/health/support) and its
Issue Tracker for access questions.

**Next action.** Add this to the reusable privacy/security package, create a
testing-mode OAuth client only when Marcos is ready to accept the console terms,
and test workout, time-series and TCX fidelity first with a Fitbit source, then
with Garmin and Polar records arriving through the registered health platforms.
Budget no API fee today, but treat any required security assessment as an
unknown launch cost.

### 9. WHOOP API — free direct access with a clear paid-value boundary

**Official access and limits.** The [WHOOP getting-started
guide](https://developer.whoop.com/docs/developing/getting-started/) provides
immediate OAuth credentials through the [Developer
Dashboard](https://developer-dashboard.whoop.com/); a team can create up to five
apps. Development is available for up to ten WHOOP members. To exceed ten, the
[app-approval process](https://developer.whoop.com/docs/developing/app-approval/)
requires a working test with at least one member, contact and privacy URLs,
product designs, and brand compliance.

**Data and endurance fidelity.** [WHOOP API v2](https://developer.whoop.com/api/)
exposes profile, physiological cycles, sleep, recovery, workouts and webhooks.
Workout summaries contain sport, start/end, strain, calories, distance,
elevation change/gain, average/max heart rate and time in heart-rate zones.
Historical collection endpoints are paginated. This is **moderately useful for
endurance analysis**, but the published API does not expose raw GPS routes,
laps/splits, power, cadence or per-second heart-rate samples.

**Commercial and retention boundary.** The [WHOOP API Terms of
Use](https://developer.whoop.com/api-terms-of-use/) say access is currently free
and may carry fees later. They expressly allow an app to charge for functionality
WHOOP does not provide, while prohibiting sale/licensing of WHOOP data,
sublicensing the API, and directly or indirectly competing with WHOOP. The
terms put data-retention responsibility on the person making data available and
otherwise restrict permanent copying/caching unless the data owner or law
permits it. That supports explicit athlete-consented history, but is ambiguous
enough that Training Hub should obtain written confirmation before persistent
production storage. Termination requires deletion of stored/cached WHOOP
content.

**Next action.** Create a development app after the public privacy URL exists,
test summary fidelity, and ask [apisupport@whoop.com](mailto:apisupport@whoop.com)
to confirm that explicit user consent permits retained activity history for a
paid evidence view. Position Training Hub as cross-period source-linked review;
do not reproduce WHOOP strain, recovery, readiness or coaching screens.

### 10. Oura API — self-service commercial API, but paid-product terms conflict

**Official access and limits.** Oura's [getting-started
guide](https://cloud.ouraring.com/docs/) provides OAuth app registration and a
default ten-user limit; the app page can submit a review request above ten.
[API v2](https://cloud.ouraring.com/v2/docs) is free for personal and commercial
apps and exposes workout summaries, daily activity, sleep, readiness, stress,
sessions, SpO2, cardiovascular age, resilience, and heart-rate/HRV/temperature
time series.

**Endurance fidelity.** Oura is useful for wellness and recovery context and has
workout summaries, but the reviewed API does not publish GPS routes, laps,
splits, cadence or cycling power. It is **low-to-moderate value for detailed
endurance activities** and should not displace Garmin, Suunto, COROS, Wahoo or
the Google Health API.

**Commercial, retention and AI conflict.** The current [Oura API
Agreement](https://cloud.ouraring.com/legal/api-agreement) reserves future or
differentiated business pricing and permits approved user-authorized purposes,
but it also says a developer may not charge users for access to or use of the
Oura API/platform or services/functionality included in or related to them
without Oura's prior written consent. It limits storage to the duration strictly
necessary for the authorized purpose, requires deletion after revocation or
subscription/access termination, and prohibits sale, advertising and unrelated
use. Oura API data may not be supplied to AI/ML as input, prompt, context or
training data; Oura's MCP terms do not create a commercial Training Hub
exception. The public statement that the API is free for commercial apps is
therefore not sufficient authority for Training Hub's paid, persisted analysis.

**Next action.** Keep Oura on hold unless athlete demand justifies a policy
request. Ask [api-support@ouraring.com](mailto:api-support@ouraring.com) for
written permission covering a paid Training Hub subscription, exact retention
for deterministic evidence/history, deletion timing and the AI prohibition.
Do not route Oura data into any interpretation model while that prohibition
applies.

### 11. Hammerhead Karoo API — new no-fee direct FIT access

**Official access and fidelity.** Hammerhead now publishes a cloud [OAuth API
reference](https://api.hammerhead.io/v1/docs) for user-authorized activities,
routes, workouts and training metrics. `GET /activities/{activityId}/file`
returns the original Karoo FIT file, while activity detail includes the route
polyline. A recorded FIT can preserve GPS, laps, power, cadence, heart rate and
other sensor samples, making this **high-value for detailed cycling**. This is
separate from the on-device Karoo Extensions SDK, which enhances the head unit
but is not the Training Hub history-ingestion path.

**Commercial, retention and AI boundary.** The current [API License
Agreement](https://support.hammerhead.io/hc/en-us/articles/42738760915099-API-Licence-Document)
grants a no-fee license for business purposes to build applications that
interoperate with Karoo, recognizes ownership of the developer's application,
and discusses its end users. It prohibits reselling/sublicensing the API,
unauthorized combinations, and replacing the Karoo experience. It does not
expressly prohibit charging for Training Hub, but neither does it expressly
authorize subscription charging, long-term retention of athlete data or AI
processing. There is no specific AI rule in the reviewed license. Those three
points need written confirmation rather than inference. SRAM may charge in the
future.

**Self-service and eligibility.** The [developer-account
guide](https://support.hammerhead.io/hc/en-us/articles/43558376710683-Creating-a-Developer-Account)
instructs a developer to create a Hammerhead Dashboard account, enable developer
settings, describe the app, upload an SVG logo and accept the license; the
dashboard then exposes client ID/secret, redirects and webhook settings. No test
or production athlete cap, separate review, incorporated-company requirement or
country restriction is published. The agreement can be accepted by a person
with authority and applies ordinary US export restrictions; it does not exclude
a Brazil-based sole founder. An [official partner
application](https://www.hammerhead.io/pages/developer-platform) can make an app
available to all Karoo users, but extensions may be built without partnership.

**Next action.** Add Hammerhead to the direct-provider queue. Before accepting
the clickwrap, ask
[hammerhead.integrations@sram.com](mailto:hammerhead.integrations@sram.com) to
confirm paid subscription, retained athlete-authorized FIT/history, optional
bounded AI use, production user limits and whether partner review is required
for a cloud data connector.

### 12. Withings Public API — self-service wellness context, not detailed endurance

**Official access and eligibility.** Withings says its [Public
API](https://developer.withings.com/developer-guide/v3/withings-solutions/app-to-app-solution/)
is available to individuals and companies, with or without a Withings contract,
for consenting users through web OAuth and cloud webhooks. The [standard-access
setup](https://developer.withings.com/developer-guide/v3/integration-guide/public-health-data-api/developer-account/create-your-accesses-no-medical-cloud/)
publishes no prerequisite and no fee; the standard rate is 120 requests per
minute across the application. No user-count cap or Brazil exclusion is
published, although Withings reserves country availability. A Brazil-based sole
founder can therefore register a development/beta/production application without
first incorporating.

**Fidelity.** The public [health-data API
reference](https://developer.withings.com/api-reference/) exposes workout
summaries such as distance, steps, calories, intensity, heart-rate summaries and
zones, plus activity, sleep, body and cardiovascular measurements. Intraday
activity can add sampled heart rate, distance and steps, and swimming summaries
can include pool laps and strokes. The reviewed public schema does **not** expose
an original FIT/TCX file, GPS trajectory, run/cycle cadence, power or a general
lap/split model. Raw PPG/accelerometer data is a [contracted-partner
feature](https://developer.withings.com/developer-guide/v3/integration-guide/public-health-data-api/data-api/raw-data/).
Withings is useful for wellness context, not as Training Hub's primary endurance
connector.

**Commercial, retention and AI boundary.** The current hosted [API
terms](https://www.withings.com/eu/en/legal/api-terms-of-use) govern either an
individual or entity and permit an application under the developer's brand, but
prohibit a Withings-like app, a data-capture-only app without added user
functionality, access without consent and commercialization of the API software
itself. They do not expressly ban charging for Training Hub's added-value
service, but neither do they publish explicit subscription, retention or AI/model
rights. There is also a material documentation conflict: the 2018 terms say API
queries must respond to end-user actions, while current [notification
documentation](https://developer.withings.com/developer-guide/v3/data-api/notifications/notification-overview/)
describes background webhooks followed by API retrieval. Do not base a continuous
paid sync on that inconsistency without written clarification.

**Next action.** Defer until wellness context is a product priority. Then use the
developer dashboard's support-ticket channel to confirm paid subscription use,
continuous webhook fetches, retained user-authorized history,
deletion timing and bounded AI analysis before handling production data.

## Mobile aggregation paths

These are official user-consent surfaces, not cloud APIs from the watch vendors.
They can provide early multi-provider coverage without an aggregator bill, but a
native companion app and provider-specific fidelity tests are required.

### Android Health Connect — best low-cost aggregation experiment

**How access works.** [Health Connect
availability](https://developer.android.com/health-and-fitness/health-connect/availability)
is Android-only and on-device: it is built into Android 14+ and available through
Google Play services on supported Android 9–13 devices. A web server cannot read
it directly. A native Android app obtains per-data-type user consent and can send
authorized records to Training Hub under a clear privacy disclosure.

The [data-type guide](https://developer.android.com/health-and-fitness/health-connect/data-types)
defines exercise, vitals, activity, sleep and body measurements. Access to more
than 30 days of history and background reads requires additional permissions.

**Commercial and policy boundary.** Google Play's [Health Connect permissions
policy](https://support.google.com/googleplay/android-developer/answer/16558241)
accepts fitness/wellness/coaching apps that give users direct physical-activity
benefit. It requires minimum necessary access, affirmative consent, accurate
disclosures and secure handling. It prohibits selling health data, advertising
uses and unrelated transfers. Training Hub's athlete-facing evidence use fits the
listed fitness/wellness category if it requests only the records actually shown
or analyzed. A generic invisible data bridge is not the right positioning.

Publishing requires the [Health Apps declaration and Data Safety
disclosures](https://developer.android.com/health-and-fitness/health-connect/publish),
with a justification for every requested type. A [Play developer
account](https://support.google.com/googleplay/android-developer/answer/6112435)
costs US$25 once. Google says developers providing health apps should use an
organization account; [organization account
verification](https://support.google.com/googleplay/android-developer/answer/13634885)
uses a D-U-N-S number. If a digital subscription is sold in the Android app,
Google Play's payments policy and billing system also apply.

**Provider coverage documented by the providers.** Coverage does not mean full
raw-workout parity:

- [Garmin → Health
  Connect](https://support.garmin.com/en-US/?faq=JToBEy0jfe6pIygark2Ui5) includes
  activity calories, cadence, distance, elevation, heart rate, speed, steps and
  swim strokes, plus selected wellness records. Garmin's published list does not
  promise GPS routes or FIT/lap detail.
- COROS lists Health Connect among its [supported third-party
  apps](https://support.coros.com/hc/en-us/articles/360040256531-Supported-3rd-Party-Apps).
- [Polar → Health
  Connect](https://support.polar.com/en/flow-app-health-connect) includes exercise
  start/end, laps, route when available, heart rate, speed, distance, sleep,
  SpO2, VO2 max and other records.
- Wahoo lists Health Connect as an [authorized Wahoo
  app](https://support.wahoofitness.com/hc/en-us/articles/14467471126802-Authorized-Apps-Wahoo-app)
  destination.

**Product implication.** Build a one-provider proof before promising broad
coverage. Show exactly which fields arrived and their source, deduplicate the
same workout when a later direct connector is enabled, and preserve a manual
file-import fallback. Do not market Health Connect as equivalent to a provider's
full activity API.

### Apple HealthKit — official iOS equivalent, higher entry cost

**How access works.** [HealthKit](https://developer.apple.com/documentation/healthkit)
is an on-device repository on iPhone and Apple Watch. A native iOS app must add
the [HealthKit capability and purpose
strings](https://developer.apple.com/documentation/Xcode/configuring-healthkit-access)
and request each data type from the user. It is not a server API.

**Commercial and policy boundary.** Apple's [App Review
Guidelines](https://developer.apple.com/app-store/review/guidelines/) allow health
and fitness apps to use HealthKit data for a direct user benefit. They prohibit
advertising/marketing/data-mining uses of health data and require consent,
privacy, security and appropriate storage. Digital features/subscriptions sold
in the iOS app must comply with Apple's purchase rules; the subscription must not
make protected-data permission compulsory where Apple requires an alternative.

Apple Developer Program [membership](https://developer.apple.com/support/compare-memberships/)
is US$99/year. An individual/sole proprietor can enroll; an organization normally
needs a D-U-N-S number. App review is the access review.

**Provider coverage documented by the providers.** Again, fidelity varies:

- [Garmin → Apple
  Health](https://support.garmin.com/en-US/?faq=lK5FPB9iPF5PXFkIpFlFPA) shares
  workouts but not GPS tracks; Garmin describes limited heart-rate fields and up
  to two weeks of backfill.
- [COROS → Apple
  Health](https://support.coros.com/hc/en-us/articles/360041549551-Connecting-Apple-Health-with-COROS-App)
  shares selected run/cycle/swim distance, heart rate, sleep and steps.
- [Polar → Apple
  Health](https://support.polar.com/en/support/connecting_polar_flow_with_apple_health)
  shares selected workout summaries, heart rate and activity records.
- Wahoo lists Apple Health in its [authorized-app
  documentation](https://support.wahoofitness.com/hc/en-us/articles/14467471126802-Authorized-Apps-Wahoo-app).

**Product implication.** HealthKit is valuable after Android proof or when iOS
demand is clear. Garmin's lack of route data alone means it cannot replace the
direct Activity API for a complete evidence product.

### Samsung Health Data SDK — high fidelity, native Android and partner-gated

The current [Samsung Health Data SDK](https://developer.samsung.com/health/data/overview.html)
reads the Samsung Health store on Android 10+ phones, including supported
non-Samsung phones. It is an Android library, not a cloud OAuth API, so Training
Hub would need a companion app to obtain per-data-type user permission and upload
the authorized records securely; there are no server webhooks. The [exercise
session model](https://developer.samsung.com/health/data/api-reference/-shd/com.samsung.android.sdk.health.data.data.entries/-exercise-session/index.html)
includes GPS route, timestamped heart-rate/speed/cadence/power logs, summaries
and swimming intervals. That is high-fidelity structured data, but there is no
original FIT/TCX endpoint and no general run/cycle lap object in the reviewed
surface.

Local reads can be tested through developer mode, but Samsung explicitly says
that mode is not for app users. The [distribution
process](https://developer.samsung.com/health/data/process.html) requires partner
approval and registration of the release package name and SHA-256 signature;
otherwise the SDK runs only in developer mode. No numeric test-device or
production-user limit and no partner fee are published.

The public [Samsung Health partner
agreement](https://developer.samsung.com/health/sensor/sdk-license-partner-service-agreement.html)
contemplates a provider-owned service for users and does not state that the
service must be free, but restricts selling or making processed data available,
marketing claims, advertising/marketing/sale uses and data mining. No ordinary
retention period or explicit AI exception is published. Training Hub should not
assume LLM/model processing fits that boundary. Brazil is not excluded from the
worldwide territory, but the agreement requires corporate authority; a Brazilian
legal entity is the safer production applicant. Because this public agreement is
hosted under Samsung's Sensor SDK area, confirm that it is also the exact
agreement governing Data SDK v1.1.0. Apply through the [health
partnership contact](https://developer.samsung.com/health/partnerships/contact-us)
only when an Android companion is justified, and request written subscription,
retention and bounded-analysis approval.

### Huawei Health Service Kit — detailed cloud data, enterprise-gated

Huawei's current [Health Service
Kit](https://developer.huawei.com/consumer/en/hms/huaweihealth/) supports
user-authorized Android, iOS, Web and cloud access. The official [scope
reference](https://developer.huawei.com/consumer/jp/doc/HMSCore-References/scopes-0000001050092713)
includes activity records, detailed activity data and location/trajectory;
Huawei's official [cloud activity-record
example](https://developer.huawei.com/consumer/es/doc/HMSCore-Guides/elliptic-machine-exercise-records-0000001232651133)
shows timestamped speed, power, heart rate, step rate and pedaling rate, while
the detailed scope also covers running form. No original FIT/TCX/GPX export
endpoint was found, and a universal lap object was not verified.

The blocker is eligibility, not technical fidelity. Huawei's [extended-service
guide](https://developer.huawei.com/consumer/en/doc/hmscore-guides/extended-introduction-0000001050060843)
says advanced data, including the detailed workout capabilities Training Hub
needs, is not open to individual developers. Enterprise registration and scope
review are required, and cloud subscription notifications are also
enterprise-only. The [application
guide](https://developer.huawei.com/consumer/en/doc/HMSCore-Guides/harmonyos-apply-kitservice-0000001194699502)
describes an approximately 15-working-day manual review, an initial 100-user test
limit and a six-month deadline for formal verification. [Commercial-use
verification](https://developer.huawei.com/consumer/en/doc/HMSCore-Guides/verification-0000001211587947)
requires another review and removes that user ceiling.

No usage price is published. The controlling agreement is accepted inside the
Huawei console, and the public materials do not resolve paid-subscription,
retention or AI/model rights. A sole founder can use basic scopes, but a
Brazilian legal entity is required for the rich workout path and remains subject
to regional and scope approval. Revisit after incorporation and confirm the
commercial/data terms with [hihealth@huawei.com](mailto:hihealth@huawei.com)
before applying.

## Aggregators and integration libraries

### Published-cost comparison

| Option | Official published offer | What it solves | Decision now |
| --- | --- | --- | --- |
| [Intervals.icu Open API](https://www.intervals.icu/features/open-api/) | Free athlete platform plus worldwide, royalty-free API license for commercial use | OAuth bridge to original activity files from Garmin, COROS, Polar, Suunto, Wahoo and other user-connected sources | **Best zero-cost hosted experiment**; request an OAuth app and validate direct-source provenance/fidelity, excluding policy-conflicted Strava/Oura data |
| [SportTracks API](https://sporttracks.mobi/api/doc) | Partner credentials by email; no API fee or production cap published; consumer service is US$59/year after a 45-day trial | Athlete OAuth plus rich normalized laps and sample streams across Garmin, COROS, Polar, Suunto and Wahoo connections | **Strongest conditional sweep lead**; inquiry pending on commercial price, athlete subscription friction, upstream authority, retention/AI rights and missing original-file provenance |
| [FitnessSyncer API](https://www.fitnesssyncer.com/api/documentation.html) | Personal Pro is US$4.99/month and personal-only; commercial/corporate API access is custom-priced per managed account | Athlete OAuth to FitnessSyncer plus normalized GPS, laps, heart rate, cadence, power and other samples across all five target sources | Strong technical backup, commercial hold; inquiry pending on sponsored accounts, price, provider-by-provider rights, target-source authentication and original-file provenance |
| [Nolio API](https://www.nolio.io/developers/) | Self-service developer application and five-user development access; API price/production partnership terms not published | Broad official connector set plus detailed workout streams, files, metrics and webhooks | Technical fit, commercial hold; obtain a provider-by-provider downstream license and clarify whether every athlete needs Premium |
| [Terra pricing](https://tryterra.co/pricing) | US$499/month month-to-month or US$399/month on annual billing, with 100,000 credits on the listed plan | Hosted normalized wearable API and provider relationships | Defer; outside the present budget |
| [Terra Startup Accelerator](https://tryterra.co/accelerator/) | Up to US$100,000 of API credits for up to six months, no cost or equity; rolling applications and a published roughly 1.8% acceptance rate | Temporary production-capable runway if Training Hub is accepted | Asked by email for fit/routing; pursue, but require a credible post-credit plan |
| [ROOK pricing](https://www.tryrook.io/pricing) | Core US$399/month for up to 750 active users; granular-data add-on US$249/month on Core/Core+, making detailed data at least US$648/month | Hosted wearable API/SDK, provider connections and normalization | Defer; its free sandbox is time-limited and non-commercial, not a startup production tier |
| [Validic free developer tier](https://validic.com/news/Validic-launches-free-developer-tier-with-API-driven-agentic-self-signup/) | No-contract, no-credit-card developer sandbox advertising 700+ supported devices; production Business tier is not publicly priced on the reviewed announcement | Fast normalized-device prototyping and fidelity tests | Open a sandbox only after accepting the developer terms; do not treat it as real-user production access |
| [Stridee pricing](https://platform.stridee.fit/pricing) | Fourteen-day trial; annual-billing tiers are US$9/month for 1 user, US$29/month for up to 5,000, and US$99/month for unlimited users | Live site claims hosted Garmin, COROS, Polar, Wahoo and Zepp connections; activity events include the original device file | Technically attractive at US$29/month, but procurement hold until upstream commercial authority and flow-down rights are proven |
| [Open Wearables pricing](https://openwearables.io/pricing) | MIT self-hosted software is free; Training Hub pays infrastructure/operations; enterprise deployment/support is custom-priced | Reduces OAuth, ingestion and normalization engineering and gives one internal model | Useful only after direct approvals; it still requires Training Hub's provider credentials and presently lists COROS/Fitbit as coming soon |

### Intervals.icu — strongest no-cost hosted bridge, with account friction

Intervals.icu's [Open API](https://www.intervals.icu/features/open-api/) provides
OAuth 2.0 granular consent for completed activities, wellness and calendar data,
plus webhooks. Its [integration cookbook](https://forum.intervals.icu/t/intervals-icu-api-integration-cookbook/80090)
distinguishes downloading the **original** gzip-compressed FIT/TCX/GPX activity
file from downloading an Intervals-generated FIT. The original file can preserve
GPS, device laps, power, cadence, heart rate and samples, making this **high-value
for detailed endurance**. The [free platform](https://www.intervals.icu/pricing/)
officially syncs Garmin, Strava, Polar, Suunto, COROS, Wahoo and other sources.
The tradeoff is that each Training Hub user must also create a free Intervals.icu
account and connect the provider there.

The current [API Terms](https://forum.intervals.icu/t/intervals-icu-api-terms-and-conditions/114087)
grant a worldwide, royalty-free, perpetual API license for lawful purposes,
including commercial use, and permit integrating and sublicensing derived
outputs. Garmin-sourced displays require Garmin attribution. The terms publish
no storage-duration or AI prohibition, and Intervals' [official integration
page](https://www.intervals.icu/features/app-integrations/) explicitly describes
commercial developers and AI coaches. This is much stronger downstream language
than Stridee publishes. It still cannot erase restrictions attached to the
upstream source: retain provider provenance, exclude Strava-origin activities
from Training Hub's current analysis, and exclude Oura data from AI. The
cookbook also says Strava activities do not emit activity webhooks.

To create an app, the official [OAuth guide](https://forum.intervals.icu/t/intervals-icu-oauth-support/2759)
asks the developer to email app description, website, privacy policy, logo,
redirects and an Intervals athlete ID to
[david@intervals.icu](mailto:david@intervals.icu). The owner can test immediately
and can send consent links before public directory listing. No athlete cap or
company/geography gate is published. Default OAuth rate capacity is 100 requests
per user per day through 500 users, with a 5,000-request minimum; the [rate-limit
guide](https://forum.intervals.icu/t/api-access-to-intervals-icu/609) says to
contact support above 500. The free platform and royalty-free API have no
published per-user fee, and the worldwide license fits a Brazil-based sole
founder.

**Next action.** Once the public privacy/callback assets exist, request an OAuth
app and test original files from one Garmin/Polar/COROS/Wahoo source. Ask
[support@intervals.icu](mailto:support@intervals.icu) to confirm that the
commercial license covers retaining original provider files and user-visible
derived evidence, and request a definitive provider provenance field/flow-down
matrix before marketing multi-provider coverage.

### SportTracks — strongest conditional bridge from the final sweep

SportTracks has a current [partner developer
portal](https://sporttracks.mobi/api/doc) and an athlete-consent [OAuth 2.0
flow](https://sporttracks.mobi/api/doc/authentication). It issues partner client
credentials through [api@sporttracks.mobi](mailto:api@sporttracks.mobi), rather
than through self-service registration. Access tokens last two hours and refresh
tokens at least 90 days, so offline synchronization is supported. Its official
[partner catalog](https://sporttracks.mobi/partners) lists automatic connections
for Garmin, COROS, Polar, Suunto and Wahoo.

This is a strong endurance-data fit. SportTracks' [activity data
model](https://sporttracks.mobi/api/doc/data-structures) exposes laps, pauses,
GPS location, elevation, distance, heart rate, cadence, power, temperature,
vertical oscillation, ground-contact time, power balance and muscle oxygen when
present. The [activity API](https://sporttracks.mobi/api/doc/activities)
documents reading private workouts and uploading FIT, TCX and GPX, but does not
document downloading the untouched source file or returning an upstream-provider
provenance field. Training Hub would therefore receive rich normalized data,
not proven original-file fidelity.

The unresolved issues are commercial, not technical. SportTracks publishes a
[US$59/year consumer subscription](https://sporttracks.mobi/pricing) after a
45-day trial, but no API price, minimum, rate cap, sponsored-user model or rule
saying whether every authorizing athlete must subscribe. The public developer
pages are partner-oriented, yet they do not grant provider-by-provider
downstream authority to retain source data, charge for derived analysis or use
it in an AI context. Its [privacy policy](https://sporttracks.mobi/privacy)
supports user account/data deletion but does not publish partner retention,
revocation cascade or provider-loss obligations. No public geography or entity
restriction was found, so a Brazil sole founder may inquire, but approval and
the written agreement control production.

**Next action.** The commercial inquiry to
[api@sporttracks.mobi](mailto:api@sporttracks.mobi) is pending. Do not request
credentials until SportTracks confirms price, athlete-account requirements,
provider-by-provider authority, retention/deletion, derived paid use, AI
exclusions, provenance, DPA/security terms and production limits in writing.

### FitnessSyncer — broad normalized telemetry, custom agreement required

FitnessSyncer's current [API documentation](https://www.fitnesssyncer.com/api/documentation.html)
uses OAuth 2.0 between a user and the requesting Training Hub client, supports
revocation/deregistration, and can activate a user subscription when the app
sponsors access. Personal apps can start with a manually configured redirect;
commercial/non-personal apps must contact FitnessSyncer for credentials,
redirect configuration and any webhook subscription. Its official [supported
services table](https://www.fitnesssyncer.com/support/supported-apps-and-services)
currently lists read access for Garmin, COROS and Polar and read/write access
for Suunto and Wahoo.

The API exposes activities in a common schema with GPS, laps and sampled points. The
documented fields include latitude/longitude, altitude, heart rate, speed,
cadence, power, estimated power, temperature, torque and running dynamics when
the upstream source supplies them. This is useful for detailed endurance
analysis, but the provider has now clarified that it does not normalize or
improve the source payload itself. Its API can return the original FIT file when
FitnessSyncer originally downloaded one—Eric named Garmin, Zepp and Polar as
examples—and may synthesize a FIT when the source was Strava, Google Health or
Android Health. Original-file availability for COROS, Suunto and Wahoo and a
durable upstream-source provenance guarantee remain unconfirmed. Historical
depth is generally a Pro feature and varies by provider; numeric production
limits are also unpublished. Before using it, Training Hub must confirm that
each of the five target connections uses a current provider-authorized
consent/token flow rather than stored consumer credentials.

The public [personal Pro plan](https://www.fitnesssyncer.com/go-pro) is
US$4.99/month and expressly personal-only. FitnessSyncer's [corporate
service](https://www.fitnesssyncer.com/support/corporate-wellness-services) can
use individual participant accounts or a managed corporate account and charges
per account under management, but publishes no price. Its [general FAQ](https://www.fitnesssyncer.com/support/general-faq)
directs non-personal API use to contact. The public
[terms](https://www.fitnesssyncer.com/about/terms.html) prohibit commercial use
without written permission and require the app to disclose caching duration;
they do not establish provider-by-provider sublicensing, retained raw-data,
paid derived-analysis or AI/model rights. Garmin-origin displays also require
Garmin attribution. No public geography/company gate was found, so a Brazil
sole founder can seek a custom agreement.

**2026-08-26 provider reply.** Eric Theriault answered case `#23581` in Gmail
message `1a03bee0c8239c07`. He said FitnessSyncer has permission to share the
information it exposes, subject to the specific use case; directed Training Hub
to use its OAuth API; explained the original-versus-synthesized FIT behavior
above; stated that this proposed route does not support AI or MCP; and said the
listed processing locations are United States-based. The answer did not yet
provide production pricing, the account sponsorship model, provider-by-provider
paid downstream authority, retention permission or deletion behavior.

Training Hub replied in `1a03d6f410deb196` with the exact proposed flow: minimum
OAuth scopes, owner-scoped storage, original FIT ingestion where available,
deterministic fixed-logic charts and historical comparisons, no LLM/generative
AI/ML/MCP or third-party redistribution, user disconnect/deletion, and an
initial 10-user path toward 100 and 1,000. The follow-up asks for the supported
source-creation flow, price at those volumes, paid downstream authority for
Garmin/COROS/Polar/Suunto/Wahoo, retention and deletion terms.

**Next action.** Wait for Eric's answer to the concrete flow. Do not create a
commercial client or send real-user data until the reply establishes
sponsored/free-user onboarding, minimum/per-user cost,
target-source authentication, provider-by-provider paid downstream authority,
original-file/provenance fidelity, retention/deletion, AI exclusions, DPA and
production caps.

### Nolio — broad detailed bridge, but no public downstream commercial license

Nolio's current [connector catalog](https://www.nolio.io/en/connectors/) lists
Garmin, Suunto, Polar, COROS, Fitbit, Wahoo, Oura, WHOOP, Hammerhead, Zepp,
Bryton and others, with user authorization and automatic activity/metric sync.
Its [developer portal](https://www.nolio.io/developers/) offers OAuth and
webhooks for workouts, metrics and files. The official [API
documentation](https://github.com/NolioApp/NolioAPI-Documentation/) documents
parallel workout streams for heart rate, torque, watts, cadence, pace, altitude,
distance and time, plus custom laps and a file URL; the overview also advertises
GPS streams. This is **high-value detailed data when the source supplies it**,
although the docs do not promise that the file URL always returns the untouched
provider file.

Developer signup accepts a person or company. There is no public sandbox: Nolio
says to use a dedicated production test account. Development apps are capped at
five synchronized users and 200 requests/hour plus 2,000/day; production raises
the rate formula and user cap after promotion. No geographic restriction is
published, so a Brazil sole founder can apply. Nolio publishes no API/partner
price; its [athlete product page](https://www.nolio.io/en/trail/) lists API access
inside the €6.90/month Premium tier, which may or may not apply to users of a
partner OAuth app.

The developer page explicitly frames the API for tools built with Claude,
Gemini or ChatGPT, so Nolio does not publish a general AI prohibition. However,
neither the developer page nor the consumer terms grant Training Hub a clear
commercial sublicense for provider data, retained copies, paid downstream
analysis or AI processing. Nolio's own permission from each provider does not
automatically flow through to Training Hub.

**Next action.** Use the official [partnership contact
form](https://www.nolio.io/contact/?subject=Demo) before creating an app. Ask for
API/production price, whether free Nolio athletes can authorize a partner app,
provider-by-provider original-file and field fidelity, a DPA, and written
retention, derived-analysis, paid subscription and AI rights. Do not process
real-user data until those are contractual.

### ROOK — polished hosted coverage, but no free production startup path

ROOK's [pricing](https://www.tryrook.io/pricing) starts at US$399/month for Core.
The comparison lists granular data at an additional US$249/month on Core or
Core+, so minute-level/detailed use starts around US$648/month. Business at
US$1,999/month includes granular data. The site's pilot language is not a
permanent free tier: the current [Sandbox
Terms](https://www.clients.portal.tryrook.io/resources/terms.pdf) provide twenty
calendar days unless ROOK authorizes an extension, only for development/testing,
with no SLA and no commercial use or real identifiable health data. Moving to
the [production environment](https://support.tryrook.io/en/articles/8724913-what-is-the-difference-between-the-sandbox-and-production-environment-here-you-will-be-able-to-test-all-our-functionalities-without-restrictions)
requires a paid contract. No official startup discount or free production
program was found.

ROOK can be highly useful for detailed endurance data once granular access is
purchased: its [Garmin data-source reference](https://docs.tryrook.io/data-sources/garmin/)
lists cadence, heart rate, elevation, speed, distance, power and position arrays.
Fidelity varies by provider, and [granular data is an
add-on](https://docs.tryrook.io/docs/rookconnect/add-ons/). ROOK also says some
brand flows still require customer-owned upstream credentials: its [brand
authentication guide](https://support.tryrook.io/en/articles/11713900-brand-authentication-process)
requires the customer to create WHOOP and Dexcom apps, with final approval left
to the provider. Contact [contact@tryrook.io](mailto:contact@tryrook.io) or the
pricing-page demo form only if the US$648/month detailed-data floor becomes
affordable.

### Stridee — lowest hosted price and original files, upstream authority unproven

Stridee's own site says it is not affiliated with the device manufacturers. Its
current [platform](https://platform.stridee.fit/) claims live Garmin, COROS,
Polar, Wahoo and Zepp connections without customer-supplied provider credentials.
The [activity API](https://platform.stridee.fit/docs/api) returns a summary and a
download URL for the device-written activity file. That can preserve GPS,
laps/splits, power, cadence and samples present in the original FIT file, making
Stridee potentially **high-value for detailed endurance** even though its API
does not yet normalize laps or per-second series. Events are retained for thirty
days. Wellness is currently listed only for Garmin and COROS.

The current [Developer Platform
Terms](https://stridee.fit/terms/platform) are materially better than a generic
privacy page: they characterize Training Hub as controller and Stridee as GDPR
processor, cover activity/workout data including precise geolocation, require
processor security/deletion duties, promise 30 days' subprocessor-change notice,
48-hour breach notification, and deletion/return after termination, and say
provider relationships are independent-controller relationships. They still do not publish
provider-by-provider authorization, an upstream commercial sublicense or
flow-down rights that let Training Hub retain and analyze data for a paid
subscription. This matters because provider agreements such as Polar's and
Wahoo's restrict reselling/sublicensing.

**2026-08-26 provider reply.** Alvaro Molina answered in Gmail message
`1a03c7dd4a2d6906` that the platform is real production and provides the needed
data, that Stridee's wearable-provider contracts are confidential, and that the
public platform terms are the agreement accepted at signup. He said that no more
can be disclosed and custom contracts are reserved for Enterprise customers
starting at 20,000/year; the email did not state the currency. The response did
not identify a published clause that warrants provider authority for a client's
paid downstream use, long-term retention or derived analysis.

Training Hub replied in `1a03d6f0005ed6aa`, asking only for the exact binding
published clause—not confidential upstream contracts—and stating that it will
not sign up or process athlete data through Stridee if that assurance exists
only in the Enterprise contract. Alvaro's immediate final answer
`1a03d71761cef1a0` only pointed back to the same website and did not identify a
clause. Further repetition would not improve the evidence. Stridee is therefore
on **definitive procurement hold** for Training Hub's present budget: no
checkout, account, credentials or athlete data.

Before sending real-user data through any low-cost aggregator, obtain and retain:

- written provider-by-provider authority to process data for a paid downstream
  Training Hub product, including retention, derived analysis and subscription
  rights;
- a signed service agreement and data-processing agreement, subprocessor list,
  data locations, deletion time, incident-notification SLA, security controls,
  uptime/support commitment and liability terms;
- a tested account deletion/disconnect cascade and an export/exit path if the
  aggregator loses a provider relationship;
- confirmation that the price and terms apply to the API platform, not only a
  demo or personal-use product.

### Open Wearables — free self-hosted engineering layer, not access authority

Open Wearables is MIT-licensed and [free to
self-host](https://openwearables.io/pricing), with no per-call, per-user or
license fee; Training Hub pays its database/cloud, upgrades, incident response
and operations. Its [integration model](https://openwearables.io/integrations)
and [OAuth guide](https://openwearables.io/oauth) explicitly require the
deployer to apply for every cloud provider's credentials, which remain stored
on Training Hub's infrastructure. Production therefore means running the
[Docker-based self-hosted stack](https://openwearables.io/self-hosted) without a
vendor SLA, or buying a custom enterprise deployment/support agreement from
Momentum. Self-hosting does not by itself create compliance.

The unified [API reference](https://openwearables.io/docs/api-reference/introduction)
has workouts, summaries and time-series endpoints, so it may reduce connector
engineering and preserve useful detailed activity where an upstream connector
implements it. Fidelity still depends on each provider adapter; unlike Stridee,
the public model does not promise receipt of the watch's original FIT file.
Its current [provider page](https://openwearables.io/wearable-api) lists WHOOP,
Garmin, Oura, Apple Health, Strava, Polar, Suunto, Samsung, Health Connect and
Ultrahuman, while COROS and Fitbit remain “coming soon.” Treat readiness/health
scoring and AI-oriented features as opt-in code to exclude: they conflict with
Training Hub's product boundary and can violate upstream Oura/Strava AI rules.
Open Wearables is an engineering accelerator **after** provider approvals, not
a substitute for them.

## Screened but not a current connector path

### Final Surge — consumer syncs are not a downstream API license

Final Surge documents first-party consumer connections to Garmin, Polar and
other services, but publishes no athlete-data developer portal, OAuth client
registration or historical-workout API for third-party products. Its only
officially described API arrangement is [case-by-case support for hosted virtual
races](https://log.finalsurge.com/VirtualRace/host-a-race), which is not a
general Training Hub data connector. The [support request
form](https://support.finalsurge.com/hc/en-us/requests/new) is generic rather
than an application path. Do not infer downstream commercial rights from a
consumer sync. Revisit only if Final Surge offers a written bespoke partner API
covering athlete consent, detailed files/streams, retention and paid use.

### Zepp/Amazfit — watch extension platform, not historical cloud access

The current official Zepp developer surface provides watch Mini Programs and
[Workout Extensions](https://docs.zepp.com/docs/guides/workout-extension/intro/),
not a consumer-cloud OAuth API. Watch-side APIs expose rich live metrics such as
heart rate, speed, distance, cadence, cycling power and lap/segment summaries,
and an extension can use the watch network to send data to its own cloud.
However, the historical [Workout
API](https://docs.zepp.com/docs/reference/device-app-api/newAPI/sensor/Workout/)
returns only workout start time and duration: no historical GPS, detailed
samples, laps or original file.

A compatible-watch uploader would be a separate installed product and cannot
backfill existing history. The ordinary app-review path is self-service, but the
[official paid-app channel](https://docs.zepp.com/docs/guides/faq/paid-app/) is
limited to certified corporate developers in mainland China; public terms also
do not resolve server retention or AI rights. Do not count Zepp/Amazfit as an
integration route. Contact [developer@zepp.com](mailto:developer@zepp.com) only
if future demand justifies a watch-side Training Hub extension.

### Runalyze — useful athlete platform, no public downstream read API

Runalyze can itself import from [Garmin, Polar, Suunto, COROS and
Wahoo](https://runalyze.com/help/article/create-activity?_locale=en), and its
supported [FIT fields](https://runalyze.com/help/article/file-types) include the
detailed endurance data Training Hub wants. That source coverage does not flow
through its public developer interface: the current [Public
API](https://runalyze.com/doc-api?_locale=en) accepts OAuth app proposals but
only exposes activity-push and health-data **write** operations. It has no public
workout read endpoint.

The read-capable [Personal API](https://runalyze.com/help/article/personal-api)
uses a user-generated token and is explicitly for private/own use. Paid athletes
can also configure [Dropbox export](https://runalyze.com/help/article/dropbox?_locale=en)
of an original FIT when Runalyze retained it, or a generated TCX otherwise, but
that is a consumer account-to-account workflow rather than an authorized
Training Hub API. Runalyze's [Supporter and Premium
prices](https://runalyze.com/pricing) do not buy Training Hub a commercial
downstream license, retention/AI rights or provider credentials. Reject this
route unless Runalyze later publishes or contracts a partner read API; do not
use personal tokens, Dropbox automation or the user-configured MCP path as a
commercial workaround.

### tapiriik — consumer sync, not provider-access authority

The hosted [tapiriik service](https://tapiriik.com/) is operational as a
consumer account-to-account activity sync; [automatic sync costs
US$2/year](https://tapiriik.com/faq). It can preserve detailed heart rate,
cadence, power and temperature between supported services, but its current list
includes Garmin and omits COROS, Polar, Suunto and Wahoo. It exposes no athlete
OAuth/API through which Training Hub can read the synchronized data. The
[privacy policy](https://tapiriik.com/privacy) says activity data is cached only
as needed and shared among the user's connected services, not licensed to a
downstream product; some service connections can also involve stored consumer
credentials.

Its official [open-source repository](https://github.com/cpfair/tapiriik) is
Apache-licensed, but that code license does not grant upstream API access. The
[self-hosting settings](https://github.com/cpfair/tapiriik/blob/master/tapiriik/local_settings.py.example)
instruct each deployment to register separately with every provider for client
credentials. Self-hosting therefore recreates the same provider-approval gap
and is not a legal or low-friction shortcut. Reject tapiriik for a paid Training
Hub connector.

## Application-ready package

Complete this once and reuse it across the reviewed applications:

1. **Public identity:** final legal applicant name, Training Hub domain, business
   email, owner/technical contact, country and company/sole-proprietor status.
2. **Truthful product page:** self-coached athlete audience, evidence-linked
   activity review, screenshots, supported sports and current beta status. Do not
   present the product as medical advice, autonomous coaching, or a provider
   replacement.
3. **Privacy and controls:** privacy policy naming each provider; exact data
   types/purpose/retention; encryption and access controls; account/provider
   disconnect; revocation webhook handling; export/deletion; support contact.
4. **Technical packet:** production callback URL per provider, OAuth state/PKCE
   approach where supported, token encryption/rotation, minimum scopes, webhook
   verification, rate-limit/retry plan, deduplication and tenant isolation.
5. **Data-flow diagram:** provider → user consent → Training Hub ingestion →
   owner-scoped storage → deterministic evidence/optional bounded interpretation
   → user-visible source links → disconnect/deletion. State clearly whether any
   provider data enters an AI context.
6. **Commercial explanation:** the user pays for Training Hub's differentiated
   evidence and workflow, not for raw provider access; no provider data is sold,
   shared for advertising, or used to train a model.
7. **Per-provider answers:** requested endpoints/scopes, historical depth,
   expected early user count, launch country, support process, and a direct
   request for written retention, derived-analysis, AI, and paid-subscription
   permission where public terms are unclear.

The public landing/privacy/support pages are not cosmetic: Suunto explicitly
requires a public service, Strava asks for screenshots and a working connection
experience, and every reviewed provider expects a real user-facing privacy and
deletion boundary.

The current checkout confirms those are real gaps, not paperwork already hiding
in the product: `Training Hub` remains an internal working name, the landing
contract deliberately forbids invented privacy/contact/legal links, and provider
disconnect exists without a delivered account-deletion surface. A provider-
neutral source model is also needed because today's ingestion, identifiers, and
deletion graph are Strava-specific. Finally, COROS already markets its own
coaching platform as COROS Training Hub, so the planned public rename should be
resolved before a COROS launch or brand review.

### Reusable truthful draft answers

These facts and phrases can be pasted into provider forms once the unresolved
identity/terms items below are confirmed. They deliberately avoid claiming a
company, customer base, compliance control, or launch date that does not exist.

| Field | Draft answer |
| --- | --- |
| Applicant | Marcos Nikel, sole founder in Brazil; legal individual/sole-proprietor status to be confirmed before accepting an entity agreement |
| Current project name | Training Hub — working name only; a public rename is advisable before COROS review |
| Current website | [training-hub-psi-one.vercel.app](https://training-hub-psi-one.vercel.app) |
| Public code | [github.com/marcossnikel/training-hub](https://github.com/marcossnikel/training-hub) |
| Current stage | Working, pre-revenue, invitation-only beta with one active user |
| Intended commercial model | Approximately US$5/month for Training Hub's differentiated evidence/history workflow; never sell raw provider data or charge separately for provider connectivity |
| Short description | “Evidence-linked training history and activity review for self-coached endurance athletes.” |
| Audience | Athletes only; no coaches, teams, medical professionals, or employer/insurer use |
| Read use case | With each athlete's OAuth consent, read completed workouts and the minimum relevant activity/profile metrics, retain provenance, and show source-linked comparisons across the athlete's own history |
| Write use case | None in the first integration; do not request planned-workout, calendar, course, nutrition, or upload scopes |
| Geography and launch | Brazil first; launch only after provider approval and the required privacy, support, disconnect, deletion, callback, and webhook work; no committed date yet |
| Data business model | No sale, advertising, brokerage, cross-customer data product, or model training; owner-scoped data only |
| AI statement | Do not send Strava or Oura data to any AI/ML context. For every other provider, disclose the exact bounded interpretation flow and disable it unless the accepted agreement expressly permits it |
| Minimum technical request | Completed activity summary/detail plus original FIT/TCX when available; OAuth refresh; history/backfill; verified webhooks; revocation/deletion events; no write scopes |

The privacy/security paragraphs should only claim controls after they exist in
the product. The application-ready target is encrypted provider tokens,
owner-scoped storage, OAuth state/PKCE where supported, verified webhook
signatures, least-privilege scopes, provider disconnect, user export/deletion,
audit/support handling, and a documented retention schedule.

### Actions paused for Marcos's action-time confirmation

Research and email inquiries are complete without inventing company facts or
accepting agreements. The following next clicks create accounts/credentials,
bind the applicant to terms, subscribe an address to communications, or spend
money. They should be done in a short browser session with Marcos present:

| Route | What is ready | Confirmation or fact still required |
| --- | --- | --- |
| Polar | AccessLink client registration; exact commercial use now confirmed in writing by Polar support | Create/use a Polar Flow account, choose a password if needed, and accept the registration agreement |
| Google Health API | Testing-mode project/OAuth setup; first scopes and test matrix mapped | Create/select a Google Cloud project, accept console/API terms, and store the generated secret securely |
| WHOOP | Development-app path and ten-member limit mapped | Use a WHOOP member account; membership/device is required because there is no sandbox data; accept dashboard terms |
| Wahoo | Application portal and minimum-scope narrative mapped | Create a Wahoo account and accept account/API terms; password must be chosen by Marcos |
| Suunto | Live application fields and truthful narrative mapped | Confirm submitting the API Agreement and the form's automatic Suunto Partner News subscription; final domain/company status |
| COROS | Live application field inventory mapped | Confirm agreement acceptance; final public name/logo, owner/privacy/technical contacts, launch date/regions, privacy URL, OAuth callback, push, and status endpoints |
| TrainingPeaks | Exact minimal read scopes mapped | Do not accept current terms unless the seven-day-cache conflict is resolved in writing; intake is paused |
| Garmin | Email waitlist request already sent | No API form can be submitted now; the general Health contact form additionally asks for Marcos's phone number but is not the access form |
| Health Connect / HealthKit | Costs and publishing requirements mapped | Decide whether to spend US$25 for Play Console and/or US$99/year for Apple Developer; organization enrollment may require D-U-N-S |
| Hammerhead | Self-service developer-account and original-FIT route mapped | Create/use a Hammerhead account and accept the API license; first obtain written subscription, retention and AI clarification |
| Intervals.icu | OAuth request packet and source-fidelity test plan mapped | Final public name/site/privacy/logo and callback URLs; decide whether the extra athlete account is acceptable onboarding |
| Samsung / Huawei | Partner gates and high-fidelity fields mapped; Huawei eligibility/rights inquiry sent | Defer until a native companion/legal entity has enough user demand; accepted console/partner terms require Marcos review; wait for Huawei's answer before assuming a Brazil sole founder can use enterprise scopes |
| SportTracks / FitnessSyncer | Partner API and fidelity paths mapped; FitnessSyncer human reply received and concrete non-AI flow sent back | Do not request credentials, create a managed account or accept commercial terms until pricing, athlete-account friction and provider-by-provider downstream rights are answered in writing |

The minimal product assets blocking the reviewed applications are: final public
name/domain, legal applicant status, privacy/support/deletion pages, a real
provider-neutral callback and webhook/status surface, a logo, and a launch
region/date. These are product decisions and implementation work, not fields to
guess inside a provider form.

## Recommended execution order

### This week: no-cost and concrete

1. Review and accept the Polar AccessLink registration agreement with Marcos
   present, create the client, and archive the exact accepted agreement together
   with Polar's written commercial-use confirmation.
2. Prepare the reusable application package and production callback-domain list,
   then register a testing-mode Google Health API OAuth client and a WHOOP
   development app with Marcos present. Validate Fitbit/Pixel, one cross-provider
   health source, and WHOOP workout fidelity before requesting production access.
3. Request an Intervals.icu OAuth app after the public callback/privacy package
   exists, and validate original Garmin/COROS/Polar/Suunto/Wahoo files with
   provider provenance. Separately ask Hammerhead for written subscription,
   retention and AI clarification before accepting its clickwrap.
4. Convert the Suunto, COROS, and Wahoo contact threads into formal applications
   after the public prerequisite package is live. Monitor Garmin's closed form
   and do not submit TrainingPeaks while its retention conflict remains.
5. Wait for Strava's written policy determination before requesting athlete-
   capacity expansion or selling Strava-backed analysis.
6. Create the Play Console organization prerequisites/D-U-N-S workstream only if
   a Health Connect Android companion is the selected near-term aggregation
   route.

### While providers review

- Map Polar first into a provider-neutral activity source model; retain provider,
  external record ID, authorization, provenance, source timestamps and deletion
  status.
- Prototype Health Connect with a synthetic/test account and measure Garmin or
  Polar record completeness against the original provider app.
- Compare Google Health API workout sessions, telemetry and TCX export with the
  original Fitbit record and a Garmin/Polar health-platform record; separately
  compare WHOOP summaries with the member app.
- Evaluate Open Wearables locally only after the provider-neutral source model is
  defined; it can reduce adapter work but cannot unlock any provider account.
- Compare the written SportTracks and FitnessSyncer answers when they arrive.
  Prefer SportTracks on documented telemetry and partner simplicity only if its
  commercial price, athlete onboarding and provider flow-down rights are viable;
  neither route should block the free Intervals.icu experiment.
- Design duplicate resolution for the same activity arriving from Strava,
  Health Connect/HealthKit and a later direct provider API.
- Keep billing entitlement separate from provider consent: cancellation can stop
  new paid analysis while disconnect/deletion always remain available.

### Decision gates before public paid access

- A provider's accepted agreement or written approval covers storage, derived
  analysis and a paid differentiated service.
- The exact provider-specific privacy, revocation, deletion and attribution
  requirements are implemented and tested.
- Health Connect/HealthKit marketing states measured field fidelity, not “all
  Garmin/COROS/Polar/Wahoo data.”
- Strava-backed persistent analysis remains unavailable commercially unless
  Strava resolves the identified policy conflict in writing.
- No aggregator processes production data until its upstream authority and DPA
  survive the due-diligence checklist above.

## Direct application and contact queue

| Priority | Provider | Submit/login | Direct question channel | Ask for |
| --- | --- | --- | --- | --- |
| 1 | Polar | [Create AccessLink client](https://admin.polaraccesslink.com/) | Written commercial-use confirmation received from [b2bhelpdesk@polar.com](mailto:b2bhelpdesk@polar.com) in thread `1a03b9f9403954fc` | Exercise/activity scopes; preserve the accepted registration terms and return to support only if they materially differ from the published license |
| 2 | Google Health API | [Cloud/OAuth setup](https://developers.google.com/health/setup) | [Health API support and Issue Tracker](https://developers.google.com/health/support) | Fitbit/Pixel and registered-source exercise, telemetry, TCX and location scopes; production verification/CASA steps, quotas and cross-provider fidelity |
| 3 | Suunto | [Partner application](https://survey.alchemer.eu/s3/90553908/PARTNER-Become-a-Suunto-Partner) | [partners@suunto.com](mailto:partners@suunto.com) | Cloud workout/FIT API and daily activity; commercial free production use |
| 4 | COROS | [OpenAPI application](https://coros-teams.feishu.cn/share/base/form/shrcnLqSduZsaNhbvDJTO2x0Vlf) | [api@coros.com](mailto:api@coros.com) | Activity history, retention, derived analysis and paid-product rights |
| 5 | Wahoo | [Developer applications](https://developers.wahooligan.com/applications) | [API support](https://wahooapi.zendesk.com/hc/en-us/requests/new), [wahooapi@wahoofitness.com](mailto:wahooapi@wahoofitness.com) | Minimum workout/profile scopes and written confirmation of non-duplicative paid analysis |
| 6 | WHOOP | [Developer Dashboard](https://developer-dashboard.whoop.com/) | [apisupport@whoop.com](mailto:apisupport@whoop.com) | Written confirmation that athlete consent permits persisted history for a paid non-duplicative evidence product; app approval above 10 members |
| 7 | Hammerhead | [Developer-account setup](https://support.hammerhead.io/hc/en-us/articles/43558376710683-Creating-a-Developer-Account) | Inquiry sent to [hammerhead.integrations@sram.com](mailto:hammerhead.integrations@sram.com); reply pending | Paid subscription, retained original FIT/history, bounded AI use, production user limit and whether cloud connectors need partner review |
| Waitlist | Garmin | [Closed dedicated access form](https://www.garmin.com/en-US/forms/GarminConnectDeveloperAccess/) | Existing `connect-support@developer.garmin.com` thread | Reopening/waitlist; Activity API, FIT/history and OAuth; no Health API initially |
| Later | Withings | [Public API setup](https://developer.withings.com/developer-guide/v3/integration-guide/public-health-data-api/developer-account/create-your-accesses-no-medical-cloud/) | Developer Dashboard support ticket | Continuous webhook fetches despite the 2018 query clause; paid use, retention/deletion and bounded AI; wellness fields only |
| Hold | TrainingPeaks | [Paused API access form](https://api.trainingpeaks.com/request-access) | [api@trainingpeaks.com](mailto:api@trainingpeaks.com) | Written exception for persistent user history; future-partner eligibility; minimum completed-workout/metric scopes |
| Hold | Oura | [Oura Cloud app registration](https://cloud.ouraring.com/docs/) only after policy clearance | [api-support@ouraring.com](mailto:api-support@ouraring.com) | Prior written consent for subscription charging, exact storage/deletion period, deterministic analysis and AI prohibition |
| Hold | Strava | [Capacity review form](https://share.hsforms.com/1VXSwPUYqSH6IxK0y51FjHwcnkd8) only after policy answer | [developers@strava.com](mailto:developers@strava.com) | Written determination on persistent evidence analysis, AI context, cross-source use and paid entitlement |

### Platform partnership queue

| Order | Platform | Apply/contact | Gate and ask |
| --- | --- | --- | --- |
| 1 | Samsung Health Data SDK | [Partnership contact](https://developer.samsung.com/health/partnerships/contact-us) | Only after an Android companion and company-backed application are justified; confirm subscription charging, server retention, upload architecture and whether bounded deterministic/AI analysis avoids the data-mining restriction |
| 2 | Huawei Health Service Kit | Inquiry sent to [hihealth@huawei.com](mailto:hihealth@huawei.com); application not submitted; [application guide](https://developer.huawei.com/consumer/en/doc/HMSCore-Guides/harmonyos-apply-kitservice-0000001194699502) | Enterprise-only detailed/cloud workout scopes; reply pending on Brazilian entity eligibility, regional availability, price, real consenting testers, paid use, retention, cross-border processing and AI terms |

### Aggregator due-diligence queue

No demo request, trial, account, checkout, credentials request, or terms
acceptance was submitted. The vendors with a sent inquiry are recorded below.

| Order | Vendor | Contact status | Ask before any real-user data |
| --- | --- | --- | --- |
| 1 | Intervals.icu | Pre-application rights inquiry sent to [david@intervals.icu](mailto:david@intervals.icu) and [support@intervals.icu](mailto:support@intervals.icu); OAuth credentials not requested; reply pending | Confirm original-file provenance for each direct source, upstream flow-down limits, permitted raw-file retention/deletion and Garmin attribution; validate webhook gaps, including Strava-origin activities |
| 2 | SportTracks | Pre-application commercial inquiry sent to [api@sporttracks.mobi](mailto:api@sporttracks.mobi); client credentials not requested; reply pending | API price/minimum/caps, athlete subscription requirement, provider-by-provider authority, normalized versus original-file/provenance fidelity, paid retention/analysis, AI exclusions, DPA/security and provider-loss behavior |
| 3 | FitnessSyncer | Human reply received in case `#23581`; exact deterministic non-AI/MCP flow and 10/100/1,000-user questions sent back; no app/account created; second answer pending | Minimum/per-managed-user price, sponsored/free accounts, target-source authentication, provider-by-provider authority, original-file provenance for all five targets, paid retention/analysis, deletion, DPA/security and provider-loss behavior |
| 4 | Nolio | Pre-application inquiry sent to [contact@nolio.io](mailto:contact@nolio.io); developer account/partnership form not submitted; reply pending | API/production price, whether each athlete needs Premium, original-file fidelity, provider-by-provider downstream paid/retention/analysis rights, DPA/deletion and AI constraints |
| 5 | Stridee | Two human replies received; final answer pointed back to the same site without identifying a provider-rights clause; **definitive procurement hold** and no checkout/account | Do not proceed at the present budget; reconsider only if public terms add the missing warranty or a viable contract supplies it |
| 6 | Open Wearables / Momentum | Inquiry sent to [inquiries@themomentum.ai](mailto:inquiries@themomentum.ai); reply pending | Provider-adapter maturity/fidelity, provider credentials/downstream rights, security and migration ownership, AI feature isolation, production support/cost, deletion and provider-loss behavior |
| 7 | ROOK | Inquiry sent to [contact@tryrook.io](mailto:contact@tryrook.io); reply pending | Confirm Core plus granular price, provider-specific fidelity/credentials, commercial production rights and whether any founder program exists; proceed only if the minimum spend becomes viable |
