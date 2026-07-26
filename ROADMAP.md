# Training Hub roadmap: the fitness hub

Goal: Training Hub becomes the first app opened every day. One place that ingests every activity from every source, shows fitness, fatigue and recovery computed from the complete picture, tracks gear (shoes and bikes), and has an AI layer to analyze workouts.

## What the research established (July 2026)

- TrainingPeaks Virtual has an official Strava connection; completed rides upload to Strava automatically. Both indoor rides already arrived in the hub as `VirtualRide`, so ingestion for the current setup (COROS watch to Strava, TPV to Strava) works today with zero new integrations.
- COROS officially supports importing .fit/.tcx activities into a COROS account so they count toward EvoLab, but only manually through their site or app. There is no public COROS API in either direction.
- Garmin has no personal API, and the unofficial route (garth-style mobile app impersonation) broke in March 2026 when Garmin tightened Cloudflare TLS fingerprinting. Treat Garmin automation as unreliable until the community adapts. Garmin devices still push to Strava natively, so Garmin as a source is covered anyway.
- The community answer to this exact frustration is either "route everything through Strava" or intervals.icu, which has official direct sync with COROS, Garmin, Wahoo, Polar and Suunto plus a genuinely open personal API. It can serve as a legal aggregator bridge and as a reference implementation for load math.
- Conclusion: do not fight the silo problem at the source apps. Make the hub compute its own fitness picture from the complete data it already receives. Fixing COROS EvoLab specifically is a best-effort extra, not the foundation.

## Strategy update: Garmin acquires TrainingPeaks + TrainHeroic (22 Jul 2026)

- On the same day, Garmin announced it bought TrainingPeaks and TrainHeroic. TrainingPeaks already syncs planned workouts to Garmin devices and pulls completed activities, sleep, HRV and Body Battery back; a "deeper integration" is coming but with no announced timeline.
- What it changes for us: nothing immediately. Analysis says device compatibility is unchanged for now (Coros, Polar, Wahoo, Suunto still supported), pricing is untouched, and the Firstbeat precedent (Garmin kept licensing to rivals after buying it in 2020) suggests TrainingPeaks stays device-agnostic short term. No guarantees on the API or long-term data openness though.
- Implication for the roadmap: the "keep my sources in sync" goal may partly solve itself over the next few months if a Garmin+TrainingPeaks stack absorbs the user's COROS/TPV data. That makes the sync/write-back phases (5) lower priority. It raises the value of the phases the big platforms will NOT build for one person: bespoke cross-source analysis and personal views. Lean the project toward that.
- The hub stays worth building because it can hold data from sources Garmin won't unify, and can present custom metrics and comparisons (see Race block comparison) that no vendor tailors to a single athlete.

## Phase 1: Cycling parity and bikes (small, do first)

- Bikes as gear: bike gallery like shoes (photo, name, odometer km, baseline from Strava gear totals), matched via Strava `gear_id` (fetch `athlete.bikes`, not just `athlete.shoes`). No splits: one ride, one bike.
- Indoor vs outdoor split per bike and in insights (`VirtualRide` vs `Ride`).
- Ride-aware activity pages: speed instead of pace, average and max power, cadence, energy from the cached detail payload.
- Maps for outdoor activities: draw `summary_polyline` (already cached in raw/detail JSON) as an inline SVG path. No tiles, no keys, works offline; optionally upgrade to Leaflet later.
- Log and review tweaks: ride rows show speed and power, review flow already treats rides as optional-shoe.

## Phase 2: Ingestion completeness and streams

- Streams cache: fetch `activities/{id}/streams` (heartrate, watts, cadence, velocity, altitude, time) lazily like detail_json, store compressed JSON. Enables charts and precise load math.
- Pace/HR/power chart on the activity page (downsampled, dataviz-styled).
- .fit upload: drag-and-drop ingestion parsing with a fit parser; creates a full activity with streams. Universal fallback for any source without an API, deduped against Strava by start time and duration.
- Optional intervals.icu bridge: pull activities and wellness via its open API for anything Strava misses; also a cross-check for our load numbers.

## Phase 3: The fitness engine (the differentiator)

- Athlete settings: max HR, resting HR, LTHR, threshold pace, FTP.
- Training load per activity, best available method: power TSS (rides with power) > pace-based rTSS (runs) > HR TRIMP (anything with HR) > session RPE x duration (already collected in review!). Editable per activity.
- Daily load into the Banister/PMC model: CTL (fitness, 42d EWMA), ATL (fatigue, 7d EWMA), TSB (form). Recovery-hours estimate from recent load and intensity.
- Fitness dashboard as the new home view: today's form and recovery state, load trend chart, week vs plan, streak. The log moves one click away.
- Backfill: compute historical load from the 1200+ synced activities (avg HR + duration exist for nearly all), so the curves start with 2.5 years of history on day one.

## Phase 4: AI coach

- Per-activity analysis and chat (Claude API): context is the activity, laps, stream summary, journal notes and current CTL/ATL/TSB. Ask anything about the workout.
- Weekly digest: what the week did to fitness, what stands out, suggestions.
- Optional: auto-summary suggestion at review time.
- Needs `ANTHROPIC_API_KEY` env; conversations stored per activity.

## Phase 5: Write-back and dirty corners (best effort, lower priority after Garmin+TP)

- COROS completeness: one-click .fit download bundle for TPV rides to hand-import into COROS (officially supported import), and research the reverse-engineered COROS app API for automated upload. Personal use only.
- Garmin write-back: revisit garth-family tooling once the March 2026 breakage settles.
- TrainingPeaks API is partner-only; TPV-to-Strava covers the practical need.
- Reassess once the Garmin+TrainingPeaks integration ships: it may cover the COROS/TPV sync need natively.

## Phase 6: Race block comparison (the marquee differentiator)

The feature the big platforms will not tailor to one athlete: put two (or more) race build-ups side by side and see what was actually different. Not just the race, the whole block leading into it.

- Mark an activity as a race (add `is_race`, a `goal_pace_s_per_km`/`goal_power`, and optional result to activities). A "block" = the training from a start point up to the race day (default 12-16 weeks, user-adjustable per race).
- Pick two races of the same type (e.g. two half marathons) and compare their blocks:
  - Volume: total km and hours, weekly progression chart (build/peak/taper shape overlaid), number of sessions and number of runs.
  - Intensity: time in HR/pace zones across the block (easy/moderate/threshold/VO2), polarization ratio (easy vs hard), number of quality sessions.
  - Race-pace specificity: total time spent at / above / below goal race pace across the block (needs streams + the race's goal pace), and the longest continuous time at race pace.
  - The race itself, head to head: goal vs actual pace, time in each zone during the race, positive/negative split, fade in the final quarter.
  - Long-run progression: longest run per week leading in.
- Depends on: streams (Phase 2) for time-in-zones and time-at-pace; athlete thresholds (Phase 3) for zone boundaries. Buildable incrementally: block volume/session counts need only summary data we already have; the zone and race-pace parts layer on once streams land.
- Why it fits the post-acquisition strategy: highly personal, cross-source (a block can mix COROS runs, TPV rides, gym), and comparative across time. Vendors optimize the single-activity and single-plan view, not "how did my two marathon builds differ."

## Open questions

- Is the Garmin app tied to an actual Garmin device in use, or just installed? (Determines whether Garmin matters at all.)
- Thresholds for the engine: current max HR, resting HR, LTHR, FTP, threshold pace.
- Should the fitness dashboard replace `/` or live as its own tab? **Answered: its own tab.** The log
  stays home, and instead of moving it, the log gained a form strip at the top (today's form and
  fitness, a CTL sparkline, this week's load against its trailing average) that links into `/fitness`.
  The daily open shows form without costing the log its place. -> docs/intervals-icu-upgrade-plan.md T19
- Race block comparison: default block length before a race (12 or 16 weeks)? Which race distances does the user actually run (half, full, other)? Which past races to seed as comparison targets?
