# Training Hub pivot decision brief

**Date:** 2026-08-25  
**Decision:** whether to pivot Training Hub into an easier paid endurance product that does not depend on provider approval  
**Research stage:** pain and category evidence found; willingness to pay for the proposed wedge is not yet validated

## Research context

- Training Hub already contains private accounts, owner isolation, an evidence-first product model, deterministic analysis, limitations, feedback, and a bounded Training Analyst contract.
- Its current first-value loop depends heavily on Strava-derived activity history.
- The current Strava API Policy prohibits using Strava data to operate an AI application, including context-window ingestion and retrieval-augmented generation. It also restricts analytics, persistent storage, and end-user charges tied to Strava functionality.
- The product opportunity should therefore create first value from a training plan, athlete-entered context, and optionally uploaded documents. Activity providers should be an optional enhancement, not the product substrate.
- The initial market hypothesis is self-coached runners with a race goal and an existing plan. The secondary hypothesis is independent endurance coaches.

## Executive conclusion

Do not pivot into another full AI coach that owns the plan, ingests years of activity data, and pushes workouts to devices. RestOrTrain, Runna, Athletica, Mara, Runapt, and TrainAsONE already occupy that territory. It also recreates the provider problem.

The best wedge is a **plan-agnostic training-plan workbench**, provisionally called **PlanLint**. The athlete brings any existing plan from a PDF, screenshot, spreadsheet, book, app, or coach. Deterministic rules map the block and surface tensions. A bounded Training Theory Agent explains every finding with the athlete's context, the applicable theory source, and its limitations. The athlete remains in control and can simulate changes without surrendering the plan to another platform.

The easiest paid starting product is not the complete workbench. It is a concierge **Plan X-Ray**: a one-time, evidence-linked audit of a real training block. If people pay and return when the plan changes, convert the repeated work into PlanLint and a plan-repair workflow.

## What the user probably meant by “rest of train”

The closest and most likely match is [RestOrTrain](https://www.restortrain.com/), not “Rest of Run.” RestOrTrain positions itself as a cycling-first AI coach that reads an athlete's complete history, finds gaps, plans sessions, adapts around life, and sends workouts to devices.

Its traction makes the category real. RestOrTrain reports more than 50,000 downloads and a 4.8 rating from more than 2,000 App Store ratings. The Brazilian App Store lists Pro at R$89.90 per month or R$829.90 per year. These are category demand and pricing signals, not proof that a new product will convert.

It also demonstrates the provider risk. [RestOrTrain says its Strava sync ends on 2026-09-01](https://www.restortrain.com/strava) because Strava's policy blocks AI apps from reading athlete data. New Strava connections are already disabled. RestOrTrain now relies on Garmin, Wahoo, Hammerhead, Zwift, Rouvy, Intervals.icu, Apple Health, or manual file uploads.

## Pain evidence

| Observed user behavior or complaint | Evidence | Product implication |
| --- | --- | --- |
| A runner wants control over an existing plan, but does not know whether one adjustment damages the rest of the progression. | A highly engaged [2026 Runna review](https://www.reddit.com/r/running/comments/1tfyl2u/indepth_review_of_runna_after_using_it_for_a_year/) says the app felt expensive and insufficiently customizable. A follow-up describes the exact fear of changing one workout and then guessing about the rest of the plan. | Preserve the user's plan and show change impact instead of replacing the plan. |
| Self-coached runners already copy plans from books, then adapt them when work, relationships, illness, and fatigue interfere. | In a [2025 AdvancedRunning thread](https://www.reddit.com/r/AdvancedRunning/comments/1o22vxz/self_coached_runners_how_do_you_build_your/), the dominant answer is to start from Daniels or Pfitzinger. The discussion emphasizes understanding each workout's purpose and making constant adjustments. | The job is plan comprehension and safe modification, not plan discovery. |
| Missed workouts create immediate, repeated uncertainty. | Recent [2026](https://www.reddit.com/r/Marathon_Training/comments/1qbcbds/missed_runs_what_do_you_do/) and [2025](https://www.reddit.com/r/Marathon_Training/comments/1l1q9do/help_making_up_for_missed_training_days/) discussions ask whether to make up sessions, skip them, or compress the week. | “Life happened” is a recurring trigger for a paid decision workflow. |
| Athletes already use generic AI manually and can obtain value without provider integrations. | A [2025 marathon case](https://www.reddit.com/r/Marathon_Training/comments/1jyxzxc/i_used_chatgpt_to_turn_my_350_marathon_pb_into_a/) describes months of manually entering run summaries and context. The discussion also notes hallucinations and the need for enough training knowledge to challenge unsafe answers. | Manual context is acceptable to an early adopter. The product must outperform generic chat through structured memory, deterministic checks, and cited theory. |
| Generic AI makes the athlete maintain the context. | A [2025 triathlon discussion](https://www.reddit.com/r/triathlon/comments/1piw87t/overwhelmed_with_training_plans_static_plan_self/) says a structured ChatGPT prompt works only because the athlete re-enters constraints and acts as the memory each week. | Persistent, typed training context is part of the product, not a chat convenience. |
| Athletes want to understand the purpose behind a plan. | An [AdvancedRunning discussion](https://www.reddit.com/r/AdvancedRunning/comments/1flzyhm/advanced_running_without_a_planstructure_possible/) argues that understanding the reason behind a program improves execution and makes adaptation possible. | Explanation and theory provenance can be the wedge. |

### What is validated and what is not

**Validated enough to test:** athletes repeatedly struggle to understand and adapt existing plans; they already pay for training apps and human coaching; some already use generic AI with manual input.

**Not validated:** that the target athlete will pay for a plan audit, a plan linter, or a plan-repair pass. Competitor prices validate category spend, not this product's willingness to pay.

## Competitor landscape

| Competitor | Core promise | Current price signal | Required substrate | Positioning gap |
| --- | --- | --- | --- | --- |
| [RestOrTrain](https://www.restortrain.com/) | Full-history conversational AI coach, plan creation, adaptation, and device delivery | R$89.90/month in Brazilian App Store | Activity history plus direct device/platform connections or manual files | Owns the coaching loop and depends on data plumbing. Does not lead with plan-agnostic audit or visible theory provenance. |
| [Runna](https://www.runna.com/en-gb/pricing) | Personalized running plans created by coaches, device sync, progress, and support | US$19.99/month or US$119.99/year | Its own plan plus optional devices | Strong incumbent for beginners and intermediates. Users report limited control once they modify the plan. |
| [Athletica](https://athletica.ai/pricing) | Adaptive endurance plan plus AI grounded in a curated sport-science knowledge base and athlete data | US$19.90/month | Its platform, plan, and synced training data | Close to “science plus data.” Still a full coaching platform and integration-led. |
| [Mara](https://www.maramiles.com/) | Running plan, weekly check-ins, and adaptation when life happens | US$20/month or US$144/year | Its own plan; manual logging works, sync improves it | Direct competitor to plan repair. Strong content distribution through Marathon Handbook. |
| [Runapt](https://runapt.com/) | VDOT plan, missed-session adaptation, routes, readiness, and AI notes | US$7.99/month or US$49/year | Its own plan and phone or health data | Competes aggressively on price and already explains plan changes. |
| [TrainCurve](https://traincurve.com/) | Training load, file imports, open data, and BYOK AI | EUR9/month | FIT/TCX/GPX or integrations | Provider-independent imports, but centered on load analytics and “should I rest” coaching. |
| [TrainingPeaks](https://www.trainingpeaks.com/pricing/for-athletes/) | Planning, analysis, device sync, and coach collaboration | US$19.95/month or US$134.99/year; coaching starts at US$149/month | Calendar, activity data, optional coach | Powerful but complex. Moving sessions is easier than reasoning about the consequences. |
| Generic ChatGPT | Flexible conversation and custom plan generation | Free or bundled into a general AI subscription | Athlete manually supplies all context | No typed training state, deterministic rules, domain evaluation, or reliable provenance. |

### Saturated claims

- Personalized plan
- Adapts when life happens
- AI coach in your pocket
- Science-backed training
- Syncs with every device
- Knows your full history

Any product led by these claims will sound interchangeable with current competitors.

### Open positioning territory

1. **Plan legibility:** explain the structure and purpose of the plan the athlete already chose.
2. **Plan linting:** identify tensions and missing assumptions without pretending there is one universal correct plan.
3. **Change impact:** show what a proposed edit protects, compromises, or leaves uncertain across the rest of the block.
4. **Theory provenance:** attach applicable sources, scope, and limitations to each finding.
5. **Plan independence:** work before any Garmin, Strava, Apple Health, or FIT integration exists.

## Candidate product score

Scores use a 1 to 5 planning scale. They are judgment inputs, not market validation.

| Candidate | Pain strength | WTP evidence | Provider independence | MVP speed | Differentiation | Weighted view |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| **PlanLint plus Training Theory Agent** | 4.5 | 3.5 | 5.0 | 4.5 | 4.5 | **4.4** |
| **Coach Check-in Copilot** | 4.0 | 4.5 | 5.0 | 4.0 | 3.5 | **4.2** |
| **Life Happens Plan Repair** | 5.0 | 4.0 | 5.0 | 4.0 | 2.5 | **4.1** |
| **Workout Intent Debrief** | 3.5 | 3.0 | 4.5 | 4.0 | 2.5 | **3.5** |
| **Full provider-backed AI coach** | 4.5 | 4.5 | 1.0 | 2.0 | 1.5 | **2.7** |

## Proposal 1: PlanLint plus Training Theory Agent

### Customer and job

The initial customer is an intermediate self-coached runner in a real race block. They already have a plan, read books or forums, and want autonomy. Their job is: “Help me understand whether this plan fits my actual baseline and what an edit changes before I commit to it.”

### Product

1. Import or paste the plan from a screenshot, PDF, spreadsheet, or structured form.
2. Add the athlete's current baseline, race goal, training days, constraints, recent disruptions, and known unknowns.
3. Convert the plan into a typed block map: weeks, sessions, intended stimulus, volume, intensity, recovery, specificity, and dependencies.
4. Run deterministic checks. Examples include abrupt volume changes, clustered hard sessions, missing recovery, unclear workout intent, mismatch with the athlete's baseline, and a proposed change that shifts another key session.
5. Let the agent explain each finding using only the structured plan, athlete context, and approved theory sources.
6. Let the athlete simulate an edit and see the change-impact map before saving it.
7. Keep a decision ledger with what changed, why, which principle was protected, and what remains uncertain.

### Unique mechanism

**Block Integrity Map:** a deterministic representation of the plan and its dependencies. The model does not calculate load or invent rules. It explains findings produced by the plan engine and can ask for missing context.

Alternative mechanism names:

- PlanLint
- Change Impact Map
- Training Theory Graph
- Block X-Ray
- Training Decision Ledger

### Why it can stop the right buyer

It does not promise a better generic plan. It promises control over the plan they already trust. The sharp analogy is: **ESLint plus Codex for a training block.**

### Monetization hypothesis

- Concierge Plan X-Ray: R$79 to R$149 once
- Self-serve block pass: R$149 to R$249 per race block
- Recurring what-if and plan-repair access: R$39 to R$59 per month
- These prices are hypotheses. The first test must collect payment before delivery.

### Main risks

- Training theory is contextual. Avoid a universal plan score and surface conflicts, questions, and limitations instead.
- Proprietary books cannot become an unlicensed knowledge base. Use owned summaries, licensed material, open research, and explicit citations.
- Advice can cross into medical or injury territory. Red-flag symptoms must stop the workflow and refer the athlete to a qualified professional.
- A generic LLM can imitate the copy. The defensible layer is the typed plan model, deterministic checks, evaluation fixtures, source provenance, and decision history.

## Proposal 2: Coach Check-in Copilot

### Customer and job

An independent running, cycling, or triathlon coach with 10 to 40 athletes. The job is: “Help me review weekly check-ins, spot plans that need attention, and draft an explanation in my voice without surrendering the coaching decision.”

### Product

- Athlete completes a structured weekly check-in and optionally attaches plan screenshots or files.
- The system ranks the coach's review queue by explicit rules and missing information.
- The Training Theory Agent drafts a response that cites the athlete's own context and the coach's approved methodology.
- The coach approves, edits, or rejects every message. Nothing is sent automatically.
- A change-impact view shows which future sessions a proposed edit affects.

### Why it may monetize better

TrainingPeaks lists human coaching from US$149 to US$359 per month. Independent coaches sell high-value attention, but program construction and check-in administration consume that attention. A tool that saves even one to two hours per week can support a higher price than a consumer dashboard.

### Monetization hypothesis

- R$149 to R$399 per coach per month for a bounded roster
- US$29 to US$79 per month for an international pilot
- The hardest part is access to coaches and trust, not implementation.

### Main risks

- Athletica already markets an AI assistant for coaches.
- Coaches may resist a new workspace. The first version should overlay their existing forms and plans, not demand a platform migration.
- Athlete consent, data access, and message approval need explicit boundaries.

## Proposal 3: Life Happens Plan Repair

### Customer and job

A self-coached runner who missed a long run, became sick, traveled, slept badly, or had to move a key session. The job is: “Show me what to do with the rest of this week and what the change means for the block.”

### Product

- Import the current plan once.
- Record the disruption through a short structured check-in.
- Produce two or three options, each naming what it protects, what it compromises, and what is unknown.
- Never silently rewrite the plan. The athlete chooses and the decision ledger updates.

### Strategic role

This is a strong recurring feature and acquisition hook, but a weak standalone category because RestOrTrain, Mara, Runapt, Runna, and TrainAsONE already promise adaptation. It becomes more defensible when powered by PlanLint and when it repairs plans from any source.

### Monetization hypothesis

- R$29 for one repair
- R$149 for a 12 to 16 week “block protection” pass
- Use this as the second paid offer after Plan X-Ray.

## Product directions to reject for now

### Another training-load dashboard

Intervals.icu, TrainingPeaks, RUNALYZE, TrainCurve, Garmin, and existing Training Hub code already cover much of this territory. It also pushes the product back toward activity ingestion.

### Another full AI plan generator

The category is real but crowded, provider-heavy, trust-sensitive, and expensive to distribute. “Personalized, adaptive, science-backed AI coach” is no longer differentiated copy.

### A generic training-theory chatbot

ChatGPT already answers generic questions. A paid product needs structured context, deterministic checks, persistent state, and an outcome-specific workflow.

### Return-to-running or injury guidance as the first wedge

The pain is strong, but the product would immediately cross into higher medical, clinical, and liability risk. It is not the easiest pivot.

## Primary avatar

| Category | Detail |
| --- | --- |
| Situation | Training four to six days per week for a 5K, 10K, half, marathon, or triathlon. Already owns a plan. |
| Desired identity | An informed, autonomous athlete who understands the work instead of blindly obeying an app. |
| Practical pain | Work, family, travel, fatigue, weather, or illness disrupts the calendar. The athlete does not know which session is essential or what an edit changes. |
| Emotional pain | Fear of wasting a block, arriving underprepared, or creating too much fatigue through a panicked catch-up. |
| Existing alternatives | Follow the PDF blindly, ask Reddit, re-prompt ChatGPT, pay for a full app, or hire a coach. |
| Purchase trigger | A disruption during a paid race block, uncertainty about a plan they assembled, or a major goal race. |
| Why this segment is reachable | Running and triathlon communities openly discuss plans and disruptions. Run clubs, race communities, coaches, and search queries provide concrete channels. |

### Primary conflict

The athlete wants control, but control creates responsibility. They do not want another app to own every training decision, yet they also do not trust themselves to modify a complex block blindly. The product should increase their understanding and preserve their agency.

## Market awareness and sophistication

The target buyer is solution-aware and often product-aware. They know Runna, Garmin Coach, TrainingPeaks, books, and ChatGPT. Many have already tried at least one. This is a sophistication level 4 market: “personalized AI plan” sounds generic, and the buyer wants proof that the product solves the failure mode of prior tools.

Claims that can land:

1. Bring the plan you already chose. See how one change affects the rest of the block.
2. Every finding names the training principle, athlete context, source, and limitation behind it.
3. The rules detect the tension. The agent explains it. You make the decision.

## Value propositions

### Athlete homepage

Bring the training plan you already trust and see where it fits, where it conflicts with your baseline, and what a change would affect across the rest of the block. PlanLint maps the plan with deterministic checks, then a Training Theory Agent explains each finding with sources, context, and limitations so you can adapt without blindly obeying another coach app.

### Paid audit

Upload your real race plan and receive a Plan X-Ray that maps the block's structure, hard-session spacing, progression, recovery, specificity, assumptions, and unanswered questions against your actual training baseline. You keep the plan. The report helps you understand the decisions hidden inside it before race preparation gets expensive.

### Coach product

Keep your methodology and your relationship with each athlete while reducing the weekly work around them. The copilot structures check-ins, flags the plans that need human attention, and drafts evidence-linked explanations in your approved voice. You remain the coach and approve every change.

### Category statement

This is not an AI coach that owns the athlete's plan. It is a training-plan workbench that makes the plan legible, testable, and easier to adapt.

## Mental-model reframes

| Mental model | Reframed angle | Message example |
| --- | --- | --- |
| Challenger | The problem is not a lack of personalized plans. It is that plans become illegible after the first real disruption. | “Your plan was personalized on day one. What explains it on day 37?” |
| Loss aversion | The athlete fears wasting weeks of consistent work through one panicked adjustment. | “Before you make up the missed long run, see what it changes in the next ten days.” |
| Category creation | Position the product as a linter and workbench, not another coach. | “The rules detect the tension. The agent explains it. You decide.” |
| Jobs to be done | The athlete hires the product to preserve autonomy with confidence. | “Keep your plan. Understand the tradeoffs before you edit it.” |

## Market sizing discipline

This research does not produce a decision-grade TAM. A broad top-down estimate and a community-based bottom-up estimate diverged by 95.1 percent, which fails the 40 percent triangulation tolerance for a consumer product.

### Top-down planning model

- Strava reported more than 195 million athletes in June 2026.
- A prior Strava survey reported that 43 percent wanted to complete a major race or event.
- At US$120 per year, that broad pool implies about US$10.1B in annual category spend.
- Assuming only 10 percent is serviceable to a plan-agnostic English or Portuguese product produces about US$1.0B SAM.
- These filters are unverified planning assumptions and the number should not be quoted as market fact.

### Bottom-up planning model

- A reachable-interest proxy of 4.15 million community members at US$120 per year yields US$498M TAM.
- Assuming 5 percent is currently in a relevant structured block yields US$24.9M SAM.
- Assuming 1 percent adoption yields 2,075 customers and US$249K annual SOM.
- Community membership is duplicated, global, and not a buyer count. This is a capacity model, not a market measurement.

### Interpretation

The divergence is too large to support a TAM claim. The immediate decision only needs proof that a narrow, reachable group pays. A paid pilot is more informative than another market report.

## Segment scoring

The scoring applied measurable, substantial, accessible, differentiable, and actionable criteria.

| Segment | Score | Verdict |
| --- | ---: | --- |
| Self-coached runners repairing an existing race plan after disruptions | 82.8/100 | Primary target |
| Self-coached triathletes reconciling multiple plans and life constraints | 70.6/100 | Secondary target |
| Beginners wanting a complete AI-generated plan | 67.4/100 | Real market, poor entry point because differentiation and actionability are weak |
| Independent endurance coaches needing weekly check-in triage | 65.9/100 | High-WTP follow-up segment, access must be proven |
| Data-heavy athletes wanting another load dashboard | 59.7/100 | Watch, not a pivot |

## Seven-day paid validation

### Offer

Sell five concierge **Plan X-Ray** slots at one fixed price, suggested R$79. Payment happens before delivery. The buyer submits:

- the plan or the next four to sixteen weeks;
- race goal and date;
- current weekly baseline and recent training consistency;
- fixed schedule constraints;
- the last disruption or change they were unsure about; and
- the decision they are trying to make.

Deliver a human-reviewed report within 24 hours. Use the same structured template for every customer so repeated work becomes the product specification.

### Follow-up offer

After delivery, offer either:

- one Plan Repair for R$29; or
- a 12 to 16 week block pass for R$149 that includes a limited number of change-impact checks.

### Success criteria

Proceed to a coded MVP only if:

1. At least 3 of 15 qualified prospects pay R$79 before seeing the report.
2. At least 4 buyers can provide a real plan and a concrete decision without founder hand-holding.
3. At least 3 use or request a second plan check within two weeks.
4. At least 2 pay for the follow-up repair or block pass.
5. The repeated findings can be expressed as deterministic rules with clear inputs, sources, and limitations.

If people praise the report but do not pay or return, do not build the subscription product.

### Interview prompts

Ask about behavior, not opinions:

1. Tell me about the last time your training plan stopped fitting your week.
2. Show me exactly what you changed and what information you used.
3. What worried you about that change?
4. Which app, coach, book, forum, or AI did you use? What did it fail to answer?
5. What have you paid for during this race block?
6. What would a useful second opinion need to show before you trusted it?
7. Here is the paid Plan X-Ray offer. Do you want one of the five slots?

Do not ask whether they “would use” an imagined app. Payment and a real plan are the evidence.

### Optional directional survey

For a 90 percent confidence level and 10 percent overall margin of error, the conservative sample is 68. To report runners and triathletes separately at a 15 percent segment margin, recruit 79 total, including at least 31 triathletes. This survey can compare pain frequency and current alternatives. It cannot validate willingness to pay.

## Smallest coded MVP after payment proof

1. Account and owner-scoped plan.
2. Structured plan intake and editable calendar. Support manual entry first, then screenshot/PDF extraction with explicit confirmation.
3. Three to five deterministic checks derived from the paid reports.
4. Finding card with plan evidence, theory reference, limitations, and missing questions.
5. One what-if edit with before/after change impact.
6. Useful or not useful feedback plus a private note.
7. No provider connection, activity sync, automatic workout prescription, or device export.

## Existing Training Hub assets worth keeping

- Better Auth and database-backed sessions
- Owner-scoped persistence and privacy boundaries
- libSQL/Turso data layer
- Pure deterministic domain modules and fixed evaluation fixtures
- Weekly brief model with sources and limitations
- Insight feedback and private notes
- Training Analyst contract with bounded evidence packets and structured output
- Portuguese and English product copy infrastructure
- Existing UI primitives, loading, error, focus, and responsive conventions

The Strava connection, import pipeline, activity streams, and provider-specific gear work can be isolated or deferred. The pivot does not require rewriting the whole repository before the first paid test.

## Guardrails

1. Deterministic code computes plan facts. The model only explains bounded evidence and asks questions.
2. Never produce an overall “good plan” score that hides disagreement or missing context.
3. Every finding includes the plan evidence, applicable theory source, scope, limitation, and confidence category.
4. No diagnosis, injury clearance, return-to-sport prescription, or medical readiness claims.
5. Do not ingest copyrighted books into a commercial knowledge base without the necessary rights.
6. The athlete or coach approves every plan change. No silent autonomous actions.
7. Real user data requires explicit consent, minimization, retention, deletion, and provider terms before any external model call.

## Confidence statement

| Question | Confidence | Reason |
| --- | --- | --- |
| Is the provider problem material? | High | Current Strava policy and RestOrTrain's forced migration directly confirm it. |
| Is plan adaptation and comprehension a repeated pain? | High | Multiple recent discussions contain the same behavior and decision trigger. |
| Do athletes pay for training guidance software? | High at category level | RestOrTrain, Runna, Athletica, TrainingPeaks, Mara, and others sustain paid tiers. |
| Will athletes pay for PlanLint or Plan X-Ray? | Low until tested | No direct transaction evidence exists for this exact wedge. |
| Is the concierge MVP easy to deliver? | High | It needs a plan, structured intake, a repeatable report, and human review. No provider is required. |
| Is the full safe product easy? | Moderate | Plan parsing, theory rights, rule quality, evaluation, privacy, and health boundaries remain substantial work. |

## Recommendation

Run the paid Plan X-Ray test before changing the product roadmap or retiring the current Training Hub. If payment and repeat-use thresholds pass, build PlanLint as the new core and add Life Happens Plan Repair as the recurring loop. In parallel, interview three to five independent coaches. If coaches show stronger urgency and pay more readily, expose the same plan engine through a coach review queue rather than building a second product.

## Sources reviewed

All sources were accessed on 2026-08-25.

- [Strava API Policy](https://www.strava.com/legal/api_policy)
- [Strava and Stanford sports-science announcement](https://press.strava.com/ea/articles/strava-announces-collaboration-with-stanford-university-researchers)
- [Strava 2025 Year in Sport report](https://press.strava.com/articles/strava-releases-12th-annual-year-in-sport-trend-report-2025)
- [Strava acquisition announcement for Runna](https://press.strava.com/id/articles/strava-to-acquire-runna-a-leading-running-training-app)
- [RestOrTrain product](https://www.restortrain.com/)
- [RestOrTrain Strava transition](https://www.restortrain.com/strava)
- [RestOrTrain FAQ](https://www.restortrain.com/faq)
- [RestOrTrain Brazilian App Store](https://apps.apple.com/br/app/restortrain/id6752621455)
- [Runna pricing](https://www.runna.com/en-gb/pricing)
- [Runna company history](https://public.runna.com/)
- [Athletica pricing and product](https://athletica.ai/pricing)
- [Mara](https://www.maramiles.com/)
- [Runapt](https://runapt.com/)
- [TrainCurve](https://traincurve.com/)
- [TrainingPeaks athlete and coach pricing](https://www.trainingpeaks.com/pricing/for-athletes/)
- [Runna control and customization discussion](https://www.reddit.com/r/running/comments/1tfyl2u/indepth_review_of_runna_after_using_it_for_a_year/)
- [Self-coached plan-building discussion](https://www.reddit.com/r/AdvancedRunning/comments/1o22vxz/self_coached_runners_how_do_you_build_your/)
- [Training-plan comprehension discussion](https://www.reddit.com/r/AdvancedRunning/comments/1flzyhm/advanced_running_without_a_planstructure_possible/)
- [Missed-run discussion](https://www.reddit.com/r/Marathon_Training/comments/1qbcbds/missed_runs_what_do_you_do/)
- [Generic AI marathon case](https://www.reddit.com/r/Marathon_Training/comments/1jyxzxc/i_used_chatgpt_to_turn_my_350_marathon_pb_into_a/)
- [Triathlon plan and generic AI memory discussion](https://www.reddit.com/r/triathlon/comments/1piw87t/overwhelmed_with_training_plans_static_plan_self/)
