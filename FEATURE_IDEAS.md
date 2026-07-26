# Training Hub: feature map (ideas from competing platforms)

Ideas the big training platforms ship that Training Hub does not, scoped to what makes sense for a
**private, single-user** log for one serious runner/cyclist who already has 2.5 years of Strava
history, per-activity TSS, a CTL/ATL/TSB dashboard, Friel HR and pace zones, per-second stream charts,
race block comparison, gear tracking, and an AI coach.

Every idea below is grounded in a real competitor feature and a real reason for this specific athlete.
The honest constraint that shapes all of it: **Strava alone gives us summary metrics plus per-second
streams (HR, pace/velocity, watts, cadence, altitude), but no HRV, no sleep, no resting-HR trend, no
Firstbeat VO2max, and no running dynamics.** Anything needing those needs a new data source (a .fit
upload pipe or the intervals.icu wellness bridge already named in the roadmap), and some of it needs a
wearable the athlete actually wears. Ideas are flagged accordingly.

What the app already has, so it is not repeated below: PMC (CTL/ATL/TSB), per-activity multi-method
TSS, Friel HR/pace zones, stream charts, block-level polarization, race splits/fade/in-race
time-in-zone/time-at-goal-pace, cycling NP/VI/kJ, gear mileage, the AI coach and weekly digest.

---

## Top 10 highest-leverage ideas for THIS app

| # | Feature | Why it fits this athlete | Complexity / data | Priority |
|---|---------|--------------------------|-------------------|----------|
| 1 | Power/pace/HR **duration curves** (mean-max) + all-time **best efforts** | 2.5y of streams is the ideal input; surfaces "fastest ever 1k/5k/10k/HM" and strength profile the app cannot show today | Pure compute on streams; needs a one-time stream backfill | High |
| 2 | **Critical Speed / mFTP auto-threshold** from the curve | Replaces the *placeholder* FTP (150 W) and *assumed* threshold pace that every TSS number currently depends on | Pure compute once #1 exists | High |
| 3 | **Aerobic decoupling + efficiency factor** per activity | Single best cheap marker of aerobic-base progress across a block; feeds the coach directly | Pure compute on HR + pace/power streams | High |
| 4 | **ACWR / ramp-rate injury flag** | The one metric a solo, self-coached, injury-exposed runner most needs; the app already has daily TSS to build it | Pure compute on existing daily load | High |
| 5 | **Grade Adjusted Pace** | Makes hilly runs comparable and sharpens rTSS and time-in-zone; altitude stream is already fetched | Pure compute on pace + altitude streams | High |
| 6 | **Precise per-second time-in-zone everywhere** | PROGRESS.md flags block zone time as *estimated from average HR*; real streams fix polarization and zone accuracy | Compute is trivial; gated on stream backfill | High |
| 7 | **Race predictor** (Critical Speed / VDOT / Riegel) | The athlete races half marathons; predicts 5k to marathon from real best efforts and sets goal paces | Pure compute on #1 + races | Medium |
| 8 | **Structured workouts + planned-vs-actual + calendar** | Turns the hub from a rear-view log into a plan; review already captures actuals to compare against | New data model + calendar UI | Medium-High |
| 9 | **PMC forecast / taper planner** | Project CTL/ATL/TSB forward from planned load to peak form on race day, not just read the past | Builds on PMC + planned load (#8) | Medium |
| 10 | **HRV / resting-HR / sleep readiness** via intervals.icu bridge | Adds the entire recovery-readiness layer (Garmin's marquee feature) the app is missing | New data source; needs a wearable that measures HRV | Medium |

Read 1 to 6 as a single cheap, high-return block: they are almost all pure math on data the app already
pulls, and several of them fix correctness problems the app already knows it has (placeholder FTP,
assumed threshold, avg-HR zone estimates). Do those before any integration work.

Status (July 2026): items 1 to 6, 9 and 10 have since shipped or been superseded. Each one carries a
pointer to the task that did it in its theme section below.

---

## Theme 1: Advanced analytics

### 1.1 Power/pace/HR duration curves (mean-max curves)
- **What it is:** the best average power (or speed, or HR) sustained for every duration from a few
  seconds to hours, plotted as a single curve, and comparable season over season.
- **Who has it:** Intervals.icu (42-day and all-time power/pace curves), Stryd (Power Duration Curve),
  TrainingPeaks/WKO (peak-power and peak-pace curves), Strava (best efforts).
- **Why for this athlete:** 2.5 years of cached streams is exactly the input a mean-max curve wants, and
  the app currently shows single-activity charts but nothing longitudinal. The curve is the substrate
  for threshold estimation (1.2), the race predictor (5.x), and a "strengths" read (sprinter vs
  diesel).
- **Complexity / data:** pure compute, but it needs the per-second streams cached for the activities in
  the window. Streams are fetched lazily today, so this depends on a one-time rate-limited backfill
  (already contemplated in the roadmap). Logic is a rolling-max sweep per duration bucket.
- **Priority:** high. It is the foundation several other ideas stand on.
- **Shipped:** mean-max curves render per sport on `/performance` (selected window against all-time)
  off an `activity_curve_points` table. Run buckets are seeded from stored best efforts so the curve
  was useful before any stream work, and deepen as full-resolution streams are fetched; the power
  panel hides until enough rides carry real power.
  -> docs/intervals-icu-upgrade-plan.md T27

### 1.2 Critical Speed / Critical Power model and auto-threshold (mFTP-style)
- **What it is:** fit a 2- or 3-parameter critical-power/critical-speed model to the duration curve to
  estimate sustainable threshold (and anaerobic capacity, W'), then use it to set threshold pace and FTP
  automatically instead of by hand.
- **Who has it:** WKO (modeled mFTP), Intervals.icu (eFTP, Morton 3P, Monod-Scherrer), Stryd
  (auto-calculated Critical Power).
- **Why for this athlete:** PROGRESS.md is explicit that FTP is a **placeholder (150 W)** and resting HR
  is **assumed**, and every hrTSS/rTSS/power-TSS value and every zone boundary flows from those numbers.
  Deriving threshold from the athlete's own best efforts turns the whole engine from "seeded guesses"
  into "measured," and it can auto-suggest a threshold update as fitness moves.
- **Complexity / data:** pure compute once 1.1 exists. Needs a sanity guardrail (the athlete must have a
  few genuinely hard efforts in the window for the fit to be valid) and should stay a *suggestion* that
  the existing Settings threshold card accepts.
- **Priority:** high. Directly fixes a known data-quality weakness.
- **Shipped, half of it:** Critical Speed already suggests threshold pace, and a Monod-Scherrer eFTP
  fit over 3 to 20 minute powers now suggests FTP with the same apply-button pattern. It reads a fixed
  90-day window and hides itself below its fit-quality floor, so with only two real-power rides in the
  history (both VirtualRide) the card shows nothing today and the 150 W placeholder stands. That is the
  intended behaviour, not a gap. -> docs/intervals-icu-upgrade-plan.md T28

### 1.3 Aerobic decoupling and efficiency factor per activity
- **What it is:** efficiency factor is output per heartbeat (pace-or-power to HR ratio). Decoupling is
  how much that ratio drifts from the first half of a steady effort to the second (cardiac drift). Lower
  decoupling means a better-supported aerobic base.
- **Who has it:** Intervals.icu (decoupling chart, Seiler-style), TrainingPeaks (EF, Pw:Hr decoupling).
- **Why for this athlete:** it is the cleanest single-number answer to "is my aerobic base actually
  improving across this block," computed from data already on hand, and it is a natural input to the AI
  coach and the race block comparison (which currently compares volume and zones but not efficiency
  trend).
- **Complexity / data:** pure compute on the HR plus pace/power streams the app already normalizes.
  Best shown as a per-activity value plus a trend line for steady runs.
- **Priority:** high. Cheap, and genuinely diagnostic for a base-building runner.
- **Shipped:** EF, decoupling and intensity-factor tiles sit on the activity page, computed once in
  `stream-metrics.ts` and persisted on `activity_metrics` by the derived-metrics pipeline. A run's EF
  is measured against grade-adjusted speed since T26. The cross-block trend line is still not built.
  -> docs/intervals-icu-upgrade-plan.md T12

### 1.4 Grade Adjusted Pace (GAP)
- **What it is:** pace normalized for gradient, so uphill splits convert to an equivalent flat pace.
- **Who has it:** Strava (GAP), most analysis tools in some form.
- **Why for this athlete:** the altitude stream is already fetched and charted, so hilly runs currently
  distort raw pace, rTSS, pace-zone time, and race-day fade math. GAP makes efforts comparable and
  improves every pace-derived number.
- **Complexity / data:** pure compute on the pace and altitude streams already present, using a standard
  gradient-cost curve. Medium-low.
- **Priority:** high (it also quietly improves several existing features).
- **Shipped:** whole-activity GAP is a per-sample integration of Strava's `grade_smooth` channel
  through a Minetti cost curve, with an altitude-derived fallback for the streams cached before that
  channel was requested (those rows are never re-fetched). It shows as a stat beside average pace, as
  a dashed overlay on the pace panel, and feeds a run's efficiency factor; the average is persisted on
  `activity_metrics`. Per-kilometre GAP in the splits table uses Strava's own grade-adjusted speed.
  Load is untouched: rTSS still reads raw average pace, and moving it to GAP is a separate decision.
  -> docs/intervals-icu-upgrade-plan.md T26 (which deleted T15's linear approximation)

### 1.5 Precise per-second time-in-zone for every activity
- **What it is:** actual time spent in each HR (and pace, and power) zone from the per-second stream,
  not estimated from the activity's average.
- **Who has it:** everyone with streams (Garmin, COROS, Intervals.icu, TrainingPeaks).
- **Why for this athlete:** PROGRESS.md explicitly labels block-level zone time as *estimated from each
  activity's average HR*, which understates variability in interval sessions. Real per-second zone time
  makes the polarization ratio and the block comparison trustworthy.
- **Complexity / data:** the compute is a trivial delta-time sum per sample (the race analyzer already
  does exactly this for the two races). The only cost is having streams backfilled for the block's
  activities, which is the rate-limited part.
- **Priority:** high, and it lands almost for free once streams are backfilled for 1.1.
- **Shipped:** the activity page has a per-second time-in-zone card, and the derived-metrics pipeline
  persists the HR and pace zone splits on `activity_metrics`, so `blocks.ts` prefers a real per-sample
  distribution and falls back to the avg-HR estimate only for activities without one. Blocks therefore
  read truer as the fetch pass covers more history.
  Stored splits do go stale when thresholds move, see 6.6.
  -> docs/intervals-icu-upgrade-plan.md T11 and T24

### 1.6 VO2max estimate / fitness trend without a Garmin
- **What it is:** an estimated VO2max trend, either race-derived (Daniels VDOT from best efforts) or the
  Firstbeat-style HR-to-pace regression on sub-maximal runs.
- **Who has it:** Garmin/Firstbeat (VO2max, the root of Training Status and Race Predictor), COROS
  (Running Fitness), Stryd (via CP).
- **Why for this athlete:** Garmin's VO2max is not exposed through Strava, so the app has no fitness
  proxy other than CTL. A VDOT-from-races number is easy and interpretable; a full HR/pace VO2max
  estimate is possible but noisy.
- **Complexity / data:** VDOT from race results is pure compute and cheap. The regression version is
  medium and needs clean steady runs with HR.
- **Priority:** medium. The race-derived VDOT is worth it; the noisy regression version is lower value at
  n=1.
- **Shipped:** the race-derived half. A card on `/performance` shows today's Daniels VDOT from the
  best-effort ladder against a monthly-max trend. The HR-to-pace regression version was not built.
  -> docs/intervals-icu-upgrade-plan.md T23

### 1.7 Running dynamics (ground contact, vertical oscillation, cadence balance)
- **What it is:** form metrics from a compatible watch/pod: ground contact time and balance, vertical
  oscillation and ratio, stride length.
- **Who has it:** Garmin Running Dynamics, COROS Running Form.
- **Why for this athlete:** genuinely useful only if the athlete is actively working on form; otherwise
  it is a dashboard nobody reads.
- **Complexity / data:** **not available from Strava.** Lives in .fit files, so it needs the .fit
  ingestion pipe (see Theme 4). Building it is a follow-on to that pipe, not a standalone project.
- **Priority:** low for this athlete unless form work becomes a focus. Listed for completeness.

---

## Theme 2: Recovery and readiness

This whole theme is the biggest gap versus Garmin and COROS, and also the honest edge of what Strava
can supply.

### 2.1 ACWR and ramp-rate injury flag
- **What it is:** acute:chronic workload ratio (last 7 days of load over the 28-day average) plus a
  weekly ramp-rate check, with a "sweet spot" band (roughly 0.8 to 1.5; risk rises above 1.5).
- **Who has it:** Garmin (Training Load Ratio / acute:chronic), and it is a well-established
  sports-science metric for running injury risk.
- **Why for this athlete:** a self-coached solo runner has nobody watching for a too-fast build. The app
  already computes daily TSS and effectively already has ATL (7d) and CTL (42d), so ACWR and a ramp flag
  are almost free, and this is arguably the single most protective number the app could add.
- **Complexity / data:** pure compute on the daily loads already stored. Note ACWR uses a 28-day chronic
  window, distinct from the 42-day CTL, so it is a small addition, not a relabel.
- **Priority:** high.
- **Shipped:** an ACWR tile with the risk bands sits in the `/fitness` tile row and a ramp-rate lane
  runs under the TSB panel, both off the daily loads already stored. Foster monotony and strain
  followed in T04. -> docs/intervals-icu-upgrade-plan.md T03

### 2.2 HRV status and resting-HR trend
- **What it is:** overnight HRV trend against a personal baseline, plus a daily resting-HR trend line.
- **Who has it:** Garmin (HRV Status, the core input to Training Readiness and Body Battery), COROS,
  Whoop, Oura, Intervals.icu (imports all of them).
- **Why for this athlete:** resting HR is currently a single **assumed** value (50 bpm) that feeds every
  hrTSS number, and there is no readiness signal at all. A real resting-HR and HRV trend both improves
  load accuracy and adds the recovery dimension the app lacks.
- **Complexity / data:** **not available from Strava.** Needs the intervals.icu wellness bridge (its
  open API pulls HRV, resting HR, sleep, weight from Garmin/COROS/Oura/Whoop), or manual entry, and it
  needs the athlete to actually wear something overnight that measures HRV.
- **Priority:** medium (high if a wearable with HRV is already in use; otherwise blocked on hardware).
- **Shipped, and not through intervals.icu:** a standalone daily Garmin Connect sync service posts a
  trailing window of overnight HRV, resting HR and sleep into `health_metrics` through the app's ingest
  endpoint. `/health` shows the trends and a readiness snapshot built on them, and the PMC now carries
  optional wellness lanes for the same three metrics underneath it. The intervals.icu bridge (4.2) is
  therefore optional rather than the only route into this theme.
  -> docs/intervals-icu-upgrade-plan.md T08

### 2.3 Training readiness score
- **What it is:** a single morning 0 to 100 readiness number combining sleep, HRV, recent load, and
  recovery time.
- **Who has it:** Garmin (Training Readiness), Whoop (recovery), Oura (readiness).
- **Why for this athlete:** a clean "go hard / go easy today" call is exactly the kind of daily-open
  hook the roadmap wants. But it is only as good as its inputs.
- **Complexity / data:** depends on 2.2 landing first (sleep and HRV). Without those, a Training Hub
  readiness score would collapse to "load and form," which the PMC already shows. Do not fake it.
- **Priority:** medium, and strictly downstream of 2.2.

### 2.4 Recovery-time / recovery-hours estimate
- **What it is:** hours until recovered after a session, from its intensity and duration and recent
  load.
- **Who has it:** Garmin (Recovery Time), COROS (Recovery Timer).
- **Why for this athlete:** already named as *deferred* in PROGRESS.md, so it is an acknowledged gap.
- **Complexity / data:** a defensible version is pure compute from the session's TSS/IF plus current
  ATL; a good version wants HRV. Low-to-medium.
- **Priority:** low-to-medium. Nice, but the PMC's ATL/TSB already tells most of this story, so it is
  incremental rather than new.

---

## Theme 3: Training planning

This is the category Training Hub is furthest behind on: it is a review-and-analyze tool with no
forward-looking plan at all.

### 3.1 Structured workout builder + planned-vs-actual
- **What it is:** build a workout as targeted steps (warmup, N x interval at target pace/HR/power,
  recoveries, cooldown) with a planned TSS, then after the matching activity syncs, score how closely
  the actuals hit the targets.
- **Who has it:** TrainingPeaks (Structured Workout Builder), Intervals.icu (workout library + planned
  vs actual), COROS, Garmin.
- **Why for this athlete:** the review ritual already captures actuals (splits, RPE, streams). Adding a
  planned side turns "what did I do" into "did I execute the session," which is the core value of a
  structured tool and something the AI coach could then critique against intent.
- **Complexity / data:** new: a workout/plan data model, a builder UI, and a matcher that links a
  planned workout to the synced activity (by date and type). Medium-high, the biggest single build here.
- **Priority:** medium-high. High value, but honestly the heaviest lift, and at n=1 with no device push
  the athlete still runs the session from memory; the payoff is the planned-vs-actual review and the PMC
  forecast, not on-watch guidance.

### 3.2 Training calendar with planned load
- **What it is:** a week/month calendar showing planned and completed sessions side by side, with
  planned weekly volume and TSS.
- **Who has it:** TrainingPeaks, Intervals.icu (drag-and-drop calendar), Runna.
- **Why for this athlete:** the hub's home is a linear log; a calendar is the natural surface for a plan
  and for spotting gaps and clustering. Also the container 3.1 and 3.3 live in.
- **Complexity / data:** medium, mostly UI. The completed side is data the app already has.
- **Priority:** medium, and it pairs with 3.1.

### 3.3 PMC forecast / taper planner
- **What it is:** project CTL/ATL/TSB forward from planned future load so you can shape a taper to arrive
  at a target form (TSB) on race day, and answer "what CTL do I need by race week."
- **Who has it:** TrainingPeaks (PMC planning and the mFTP-vs-CTL peak chart), Intervals.icu (fitness
  planning), WKO.
- **Why for this athlete:** the app already computes the PMC and already marks races; extending the same
  math forward from planned load is the natural, high-value next step for someone building toward a goal
  half marathon, and it is a very personal analysis vendors will not tailor to one athlete.
- **Complexity / data:** medium. The PMC engine exists; this needs planned daily load (from 3.1/3.2 or a
  simple weekly-ramp assumption) and a forward projection plus a taper solver.
- **Priority:** medium (high once planning exists).
- **Superseded for the part that mattered:** the fitness page projects CTL/ATL/TSB forward in closed
  form from a steady daily load and from rest, and reads out the form the next race lands on. That
  answers the taper question without a planning system, so what is left here is only the planned-load
  version, which stays downstream of 3.1 and 3.2.
  -> docs/intervals-icu-upgrade-plan.md T05

### 3.4 Annual training plan / periodization view
- **What it is:** a season-level plan that lays out base/build/peak/taper phases around A/B/C races with
  weekly volume targets.
- **Who has it:** TrainingPeaks (ATP), Friel's periodization model.
- **Why for this athlete:** useful for someone running multiple races a year, and it complements the
  existing race block comparison by planning the block instead of only reviewing it.
- **Complexity / data:** medium, mostly a planning layer over 3.2.
- **Priority:** low-to-medium. Real, but only after the weekly planning primitives exist.

### 3.5 Adaptive plan (auto-adjusting)
- **What it is:** a plan that regenerates future sessions based on recent performance, missed workouts,
  and current fitness.
- **Who has it:** Runna, Trenara, TrainingPeaks adaptive plans.
- **Why for this athlete:** appealing, but the app already has an AI coach that can give this kind of
  guidance conversationally, and a full adaptive-plan engine is a large, opinionated build.
- **Complexity / data:** high. Needs 3.1 to 3.3 first, plus a plan-generation policy.
- **Priority:** low as a dedicated engine. A lighter path: have the existing Claude coach propose next
  week's sessions from the PMC and ACWR, which reuses what is already built.

---

## Theme 4: Data sources and integrations (beyond Strava)

### 4.1 .fit file ingestion
- **What it is:** drag-and-drop .fit (or .tcx) upload that parses a full activity with per-second
  streams, deduped against Strava by start time and duration.
- **Who has it:** intervals.icu, TrainingPeaks, Garmin, COROS all ingest .fit.
- **Why for this athlete:** already Phase 2 in the roadmap. It is the universal fallback for any source
  without an API, guarantees complete streams without Strava rate limits, and is the **only** way to get
  running dynamics (1.7) and Stryd running power into the hub.
- **Complexity / data:** medium-high (a .fit parser and a dedupe/merge step).
- **Priority:** medium. It is an enabler more than a feature; its value is everything it unlocks.

### 4.2 intervals.icu wellness bridge
- **What it is:** pull activities and wellness (HRV, resting HR, sleep, weight) through intervals.icu's
  open personal API.
- **Who has it:** intervals.icu itself (it syncs COROS, Garmin, Wahoo, Polar, Suunto, Oura, Whoop).
- **Why for this athlete:** already named in the roadmap as the legal aggregator bridge. It is the
  realistic route to the entire recovery/readiness theme (2.2 to 2.4) and a cross-check on the app's own
  load numbers.
- **Complexity / data:** medium (one authenticated API client plus a wellness table).
- **Priority:** downgraded to low. The Garmin sync service (2.2) already fills the wellness table, so
  this is now a cross-check and a backup source, not the unlock for Theme 2.

### 4.3 Running power (Stryd) support
- **What it is:** treat running watts as a first-class signal: power zones, power-based TSS for runs, and
  a running Critical Power.
- **Who has it:** Stryd, and any platform reading its .fit power stream.
- **Why for this athlete:** only relevant if the athlete owns a Stryd or a watch with native running
  power. If so, running power TSS is more stable than pace-based TSS on hills and in wind.
- **Complexity / data:** low once .fit or a Strava run-watts stream is present (the load engine's power
  branch is run-agnostic in shape). Gated on the athlete actually having a power source.
- **Priority:** low unless a Stryd is in play; then medium.

### 4.4 Weather and heat context
- **What it is:** temperature, humidity, and wind stamped on each activity, and a heat-adjusted view of
  pace/HR.
- **Who has it:** Garmin (heat/altitude acclimation), most platforms show conditions.
- **Why for this athlete:** explains otherwise confusing HR spikes on hot days and contextualizes the
  block comparison across seasons.
- **Complexity / data:** needs a historical weather API keyed on the activity's lat/lng and time (the
  polyline gives location). Strava sometimes carries temperature already. Medium.
- **Priority:** low-to-medium. Pleasant context, not decision-changing at n=1.

---

## Theme 5: Race and goal tooling

### 5.1 Race predictor
- **What it is:** predicted finish times for 5k/10k/half/marathon from recent fitness.
- **Who has it:** Garmin (Race Predictor off VO2max), COROS (Race Predictor off last 6 weeks), Stryd
  (Race Power Calculator), Daniels VDOT tables, Riegel formula.
- **Why for this athlete:** the athlete races half marathons and the app already stores races and goal
  paces; a predictor built from the athlete's own duration curve (1.1) or best race is directly
  actionable for setting the next goal pace.
- **Complexity / data:** pure compute. Riegel from a recent best effort is trivial; a Critical-Speed
  predictor off 1.1/1.2 is better and still cheap.
- **Priority:** medium. Concrete and cheap, bounded value at n=1.

### 5.2 Gradient-aware pacing plan (PacePro-style)
- **What it is:** a per-kilometer target-pace plan for a specific course that spends effort evenly by
  redistributing pace across the elevation profile, with a chosen positive/negative split.
- **Who has it:** Garmin PacePro.
- **Why for this athlete:** for a goal race on a known, hilly course this produces a race-day pacing
  sheet the athlete can actually run to, and the app already knows the athlete's GAP and threshold.
- **Complexity / data:** medium. Needs the course elevation profile (a GPX upload or a past run of the
  route) plus a pacing solver.
- **Priority:** low-to-medium. High value the week of a target race, niche the rest of the time.

### 5.3 Race-day fueling and hydration plan
- **What it is:** a carbohydrate-per-hour and fluid-per-hour plan with gel timing, from body weight,
  predicted duration, and conditions (commonly 60 to 90 g carbs/hour and 400 to 800 ml/hour for a
  marathon).
- **Who has it:** dedicated calculators (e.g. race nutrition planners), not usually the analytics
  platforms.
- **Why for this athlete:** a simple, useful checklist tied to the predicted finish time (5.1).
- **Complexity / data:** low (a calculator over known inputs).
- **Priority:** low. Genuinely useful once per race, but a serious athlete likely has their fueling
  dialed; low novelty at n=1.

### 5.4 Goal tracking against A/B/C races
- **What it is:** tag races by priority and track progress (fitness, best efforts, predicted time)
  toward the goal date.
- **Who has it:** TrainingPeaks (goal events in the ATP), Runna (goal race).
- **Why for this athlete:** gives the PMC forecast and predictor a target to point at.
- **Complexity / data:** low-to-medium. A priority field on races plus a progress view; complements the
  existing race model.
- **Priority:** low-to-medium.

---

## Theme 6: UX and quality-of-life

### 6.1 All-time PR / best-effort board
- **What it is:** lifetime bests at standard distances (1k, 1mi, 5k, 10k, 15k, HM, longest run) and a
  "this activity set a PR" badge.
- **Who has it:** Strava (Best Efforts), Garmin (records).
- **Why for this athlete:** a motivating, glanceable payoff from the same duration-curve work in 1.1,
  and something the app has no equivalent of today.
- **Complexity / data:** pure compute once streams are available. Low.
- **Priority:** medium (rides on 1.1).
- **Shipped:** best-effort chips on run activities, an `activity_best_efforts` table mirrored from
  Strava's detail payload with a resumable backfill, a best-efforts card on `/performance` and a PR
  badge on the chips. Records are derived from the stored times rather than from Strava's rank, for
  the reason in 6.8. -> docs/intervals-icu-upgrade-plan.md T10 and T22

### 6.2 Calendar / consistency heatmap
- **What it is:** a year-view heatmap of daily training (GitHub-contributions style) plus streaks.
- **Who has it:** common across apps; streaks were named as deferred in PROGRESS.md.
- **Why for this athlete:** consistency is the whole game for a solo runner, and a heatmap makes gaps and
  streaks obvious at a glance.
- **Complexity / data:** pure compute on data already present. Low.
- **Priority:** medium. Cheap and motivating.
- **Shipped:** a 53-week load heatmap on `/fitness` with the current streak and active days per week
  beside its title. -> docs/intervals-icu-upgrade-plan.md T21

### 6.3 Installable PWA / offline read
- **What it is:** an installable app icon and offline access to already-synced data.
- **Who has it:** every mobile-first competitor.
- **Why for this athlete:** the roadmap's stated goal is "the first app opened every day." A phone
  install and offline read serve that directly, without building a native app.
- **Complexity / data:** medium (a service worker and manifest over the existing Next app).
- **Priority:** medium.

### 6.4 Notifications / reminders
- **What it is:** nudges for pending reviews, a ready weekly digest, or a planned session.
- **Who has it:** all mobile apps.
- **Why for this athlete:** the review ritual only works if the athlete comes back; a nudge closes that
  loop.
- **Complexity / data:** medium (web push or email). Lower value while the app is a localhost tab, higher
  once it is an installed PWA (6.3).
- **Priority:** low-to-medium.

### 6.5 PMC as-of-date correctness (small fix)
- **What it is:** feed the per-activity coach the CTL/ATL/TSB *as of that activity's date* rather than
  today's.
- **Who has it:** n/a, this is an internal accuracy fix already flagged in PROGRESS.md.
- **Why for this athlete:** makes coaching on older races accurate; the PMC engine can already produce
  historical points.
- **Complexity / data:** low, pure compute.
- **Priority:** low, but nearly free and improves an existing feature.

### 6.6 Threshold invalidation for stored zone splits (carried forward from T24)
- **What it is:** `hr_zone_secs` and `pace_zone_secs` on `activity_metrics` are frozen at the thresholds
  in force when the row was computed, and `saveAthleteThresholds` has no invalidation hook. Every reader
  that prefers a stored split over computing one is showing the zones of the day the stream was fetched.
- **Who has it:** n/a, internal correctness debt. Recorded here because a code comment is not a backlog.
- **Why it is still open:** a refresh can only read the cached 400-point downsample, since re-fetching
  full resolution costs a Strava call per activity and a delete of the cached stream first. That is
  honest for a version-1 row and a downgrade for a version-2 or version-3 one: it either strands the
  `np_w` and `avg_gap_s_per_km` that only a full-resolution fetch produces, or leaves `metrics_version`
  claiming a provenance the zone arrays no longer have. Refreshing per column-group therefore needs its
  own provenance record (a second version, or a zones-computed-at stamp), which is a data-model change
  rather than a rider on another task.
- **Complexity / data:** detecting staleness needs no migration (`activity_metrics.computed_at` against
  `athlete_thresholds.updated_at`), but the right response differs per read site: the activity page has
  an exact live fallback, so ignoring a stale row is strictly better there, while `blocks.ts` falls back
  to a whole-session average-HR estimate that a slightly stale stream split still beats.
- **Stopgap:** `scripts/backfill-metrics.ts --recompute`, which refreshes version-1 rows only.
  Thresholds move rarely. The full reasoning sits beside the data in `src/lib/db/metrics.ts`.
- **Priority:** medium, and it wants its own task.
  -> docs/intervals-icu-upgrade-plan.md T24 and T25

### 6.7 One day-key convention for the /fitness load series
- **What it is:** `dailyLoadSeries` and `weeklySportLoad` bucket by `started_at` read with local getters,
  which is the server's timezone, while the training log, `/insights` and the totals table bucket by
  `localStartedAt`, the athlete's own calendar day. As `started_at_local` fills in on synced rows, the
  weekly load bar on `/fitness` can drift from the totals table by a period boundary.
- **Who has it:** n/a, internal consistency debt.
- **Why for this athlete:** two numbers for the same week in two places on the same app is the kind of
  small wrongness that costs trust in every other number.
- **Complexity / data:** the change itself is small, but converging the conventions rewrites PMC
  history, so it is a task with its own validation pass rather than a drive-by. Note the consistency
  heatmap deliberately follows the `dailyLoadSeries` key because it paints those exact loads; it moves
  with them, it is not a third convention to fix. Documented in code in `src/lib/totals.ts` and
  `src/lib/consistency.ts`.
- **Priority:** low-to-medium.

### 6.8 Stored `pr_rank` is not current truth
- **What it is:** the `pr_rank` mirrored into `activity_best_efforts` is Strava's rank at the moment an
  activity's detail was first fetched, and detail is written only once. The stored ranks are already
  provably stale (the live table has two different activities both claiming rank 1 at several
  distances), and every deepening of that table multiplies the collisions.
- **Who has it:** n/a, a data caveat rather than a feature.
- **Why it is recorded:** the readers that matter already avoid it. Records are derived from the stored
  times, and the PR badge checks this activity's rows against the stored ladder instead of trusting the
  rank. The rule to keep is simply that no new surface presents a stored rank as a current record.
- **Priority:** none as a build item. Recorded so the column is never wired into a PR board.

---

## Explicitly not recommended (and why)

- **Body Battery / real-time stress:** Garmin-proprietary, needs continuous all-day wearable data not in
  Strava. Cannot be reproduced faithfully; a fake version would mislead.
- **Segments, leaderboards, KOM/PR-vs-others, any social layer:** out of scope by design. This is a
  private, single-user app.
- **Live / on-watch metrics, real-time pacing, live tracking:** the hub is a post-hoc log, not a device.
  PacePro-style plans (5.2) are fine as a pre-race sheet; live guidance is not the app's job.
- **Full running-dynamics dashboards (GCT/vertical oscillation/balance trends):** low value at n=1 unless
  the athlete is actively doing form work, and it needs .fit ingestion first. Build the pipe (4.1), not
  the dashboard, until there is a reason.
- **Detailed sleep staging:** needs a wearable and adds little beyond a single readiness/HRV number
  (2.2/2.3). Pull the summary metric, not the hypnogram.
- **Coach/athlete management, multi-athlete views, plan marketplace:** TrainingPeaks features for coached
  athletes; irrelevant to a solo app.
- **Full nutrition / food diary:** scope creep. A per-race fueling calculator (5.3) is the useful 5%; a
  daily diet log is not this app.
- **Billing, teams, sharing, public profiles:** explicitly excluded by the app's framing.
- **A bespoke adaptive-plan engine (Runna-style) as a first move:** too heavy and opinionated for n=1
  when the existing AI coach can already suggest sessions from the PMC and ACWR. Revisit only after the
  planning primitives (3.1 to 3.3) exist.

---

## Sources

- Garmin Training Readiness / Body Battery / Firstbeat load, VO2max, endurance and hill score, running
  dynamics, PacePro, heat/altitude acclimation: the5krunner.com and garmin.com technology pages.
- COROS EvoLab (Base Fitness, Load Impact, Recovery Timer, Race Predictor, Running Fitness):
  support.coros.com and dcrainmaker.com.
- TrainingPeaks (Structured Workout Builder, ATP, PMC, WKO mFTP): trainingpeaks.com and help center.
- Intervals.icu (power/pace curves, eFTP and CP models, decoupling, wellness/HRV import, planning):
  intervals.icu/features.
- Stryd (Power Duration Curve, auto Critical Power, Race Power Calculator): support.stryd.com.
- Strava (Best Efforts, Relative Effort, Grade Adjusted Pace): support.strava.com.
- ACWR sweet spot and running injury risk: peer-reviewed sports-science literature (PubMed) and
  scienceforsport.com.
- Marathon fueling/hydration ranges: race nutrition calculators and the Korey Stringer Institute.
