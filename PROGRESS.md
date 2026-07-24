# Training Hub build progress

Autonomous build session started 2026-07-22. Architect + validator: Claude (Opus 4.8).
Each phase: sub-agent implements, I validate against real Turso data, then commit + push + verify prod.

Prod: https://training-hub-psi-one.vercel.app · Shared Turso DB (local dev + prod point at the same database). _(Since split: local dev uses `data/app.db`; the write scripts refuse remote DBs unless `ALLOW_REMOTE_DB=1`.)_

---

## ASSUMPTIONS (please correct any that are wrong)

Threshold and body values seeded for the fitness engine (all editable in Settings → Athlete thresholds):

| Value | Seeded | Notes |
|-------|--------|-------|
| Max HR | 199 bpm | From Garmin (real) |
| Resting HR | 50 bpm | **ASSUMED — not measured.** Flagged "estimated" in the UI. Affects every HR-based load number. |
| LTHR | 176 bpm | From Garmin, set 19 Jul 2026 (real) |
| Threshold pace | 4:29 /km (269 s/km) | From Garmin, set 19 Jul 2026 (real) |
| FTP | 150 W | **PLACEHOLDER — no test done.** Flagged "provisional". Only affects power-based ride load (few rides have power). |

Engine modelling choices (reversible; documented so you can veto):
- Training load is normalised to a single **TSS-equivalent scale** so every sport is comparable in the PMC. Per-activity method priority: power (rides w/ power) > pace rTSS (runs) > HR (hrTSS, HRR vs LTHR) > session-RPE. Method is shown per activity and the value is editable.
- **hrTSS** uses heart-rate reserve relative to LTHR: `IF = (avgHR − restingHR)/(LTHR − restingHR)`, `TSS = hours × IF² × 100`. This is why resting HR matters.
- **rTSS** (runs): `IF = thresholdPace / activityPace`, `TSS = hours × IF² × 100`.
- **PMC**: CTL = 42‑day EWMA of daily TSS, ATL = 7‑day EWMA, TSB = yesterday's CTL − yesterday's ATL. Curves seeded from the first activity (2023‑12‑01) starting at 0, so the earliest ~2 months ramp up artificially, then stabilise.
- Fitness dashboard added as its own `/fitness` tab (does **not** replace the home log). Easy to promote to home later.

---

## Phase 3 — Fitness engine ✅ shipped

**What shipped**
- `src/lib/fitness.ts`: pure engine — `computeLoad` (power→pace→hr→rpe priority, quadratic TSS), `computePmc` (CTL 42d / ATL 7d EWMA, TSB = prior day CTL−ATL), `formState`, Friel `hrZones`/`paceZones` (exported for Phase 6).
- Two new tables (`athlete_thresholds`, `activity_load`), idempotent additive migration; thresholds seeded only when empty.
- Settings → "Athlete thresholds" card (editable Max HR / LTHR / threshold pace / resting HR / FTP + estimated/provisional flags). Saving recomputes all loads.
- `/fitness` dashboard (new nav tab, does not replace home): Form/Fitness/Fatigue/7-day-ramp tiles, PMC chart (CTL area + ATL line + TSB band), weekly-load bars, window selector 90d/6m/1y/all.
- Per-activity load display + manual override + reset on the activity page.
- `npm run backfill:load` script; ran it against the shared Turso DB → **1230 activities** now carry load.

**Validation (my independent reference vs. live app, all matched exactly)**
- Persisted `activity_load`: 1230 rows (0 manual). Methods: hr 857, pace 333, power 40. 1 activity has no HR/pace/power/RPE → no load (expected).
- Known races: Jundiaí HM **152.7 TSS** (pace, IF 0.964), Athena's HM 149.7, ASICS Golden 132.8, Hoka 30k 209. Jundiaí page confirms 4:39/km, 176 avg / **190 max** HR.
- PMC today (2026-07-22): **CTL 47.5, ATL 52.2, TSB −5.3** — dashboard shows Fitness 48 / Fatigue 52 / Form −5 (Neutral). Peak CTL ever 59.1 (Sep 2025).
- `npm run build` clean (route `/fitness` registered), `npx eslint src` exit 0.
- Screenshots (light + dark, viewed): `scratchpad/shots/fitness-6m-{light,dark}.png`, `fitness-all-{light,dark}.png`, `settings-{light,dark}.png`, `activity-128-{light,dark}.png`.

**Deferred (roadmap nice-to-haves, not blocking):** recovery-hours estimate, streak, week-vs-plan.

## Phase 6 — Race block comparison ✅ shipped

**What shipped**
- `src/lib/blocks.ts`: pure engine. `buildBlock()` (12-week default block → weekly buckets aligned by weeks-to-race, volume/sessions/runs, time-in-zone estimated from each activity's avg HR, polarization, quality runs) and `analyzeRace()` (splits, fade, in-race time-in-zone, time at/above/below goal pace + longest at-goal stretch, from per-second streams).
- `/races/compare?a=&b=&weeks=` page + `race-compare.tsx`: two category-grouped race pickers + 8/12/16-week selector, per-race volume tiles, zone bars w/ polarization, overlaid weekly-running-volume + longest-run charts (aligned by weeks-to-race), and a race head-to-head card. "Compare" link added to the races page. New read query `listBlockActivities` (no schema change). Streams fetched lazily via `ensureActivityStreams` (only the 2 races).

**Validation (shipped engine run against real Turso data, matched my independent reference)**
- Block invariants hold: `sum(weekly.km) === totalKm`, `weekly.length === weeks` for all three HMs.
- Athena's 12wk: 147 sessions / 47 runs / 590km total / 398km running / 113h, Z1 68%. Jundiaí: 90 / 54 / 570 / 529 / 91.5h, Z1 56%. ASICS Golden: 94 / 56 / 617 / 569 / 91.6h. All match ground-truth.
- Head-to-head: Jundiaí **+9 s/km positive split, +3.2% fade, in-race Z5 68% / Z4 28%**; Athena's −3 s/km negative split, −1.6% fade, Z5 83%; ASICS Golden **+65 s/km positive split, 16.5% fade** (ran it easy at 154 bpm) — a real, surfaced insight.
- `npm run build` clean (`/races/compare` registered), `npx eslint src` exit 0.
- Screenshots (light + dark, viewed): `scratchpad/shots/compare-jundiai-athena-{light,dark}.png`, `compare-jundiai-asics-light.png`, `compare-default-light.png`.

**Note:** block time-in-zone is estimated from each activity's average HR (labeled in-UI). Per-second zone time across a whole block would need streams backfilled for every block activity (rate-limited) — a future refinement; race-day analysis already uses full streams.

## Phase 4 — AI coach (Claude API) ✅ shipped

**What shipped**
- `src/lib/coach.ts`: server-side AI layer. Model `claude-opus-4-8` via `@anthropic-ai/sdk` (`new Anthropic()` reads `ANTHROPIC_API_KEY`), adaptive thinking + `effort: medium`, `max_tokens 1500`, non-streaming. Compact metric context blocks (workout metrics, stream ranges, thresholds, today's CTL/ATL/TSB, journal). Lazy client behind `isCoachConfigured()` → graceful degradation with no key.
- Per-activity **Coach chat** card on the activity page (thread persisted in new `activity_chat` table; clearable). **Weekly digest** card on `/fitness` (cached in `app_meta.weekly_digest`, regenerate button).
- New actions `sendCoachMessageAction` / `clearCoachAction` / `generateWeeklyDigestAction`; all guard config + catch API errors. i18n `coach`/`digest` sections (en + pt). SDK added as a real dependency.
- Prompt tuned to emit plain text (no Markdown) so it renders cleanly in the chat/digest bubbles.

**Validation (live Claude API against real activities)**
- Live API confirmed: `claude-opus-4-8` reachable with the env key.
- Coach on the Jundiaí HM produced accurate, data-grounded coaching — quoted IF 0.96, avg HR 176 = LTHR, pace range 3:31–7:35, max HR 189, cadence 85, threshold 4:29 vs raced 4:39, CTL 48, TSB −5, 147 m gain. Persisted and re-rendered on reload.
- Weekly digest summarised the real last-7-days: CTL 46→48, ATL 41→52, TSB 3→−5, ~45.6 km / 5 runs + 2 virtual rides + 2 lifts, real session names, concrete suggestions.
- No-key path shows the "Set ANTHROPIC_API_KEY" note (verified by code path; the guard is the only env read).
- `npm run build` clean, `npx eslint src` exit 0.
- Screenshots (light + dark, viewed): `scratchpad/shots/coach-128-{light,dark}.png`, `digest-{light,dark}.png`.

**Known refinement (not blocking):** the per-activity coach is fed *today's* CTL/ATL/TSB, not the form as of the activity's date — fine for recent workouts, slightly off when analysing an older race. Easy follow-up: compute PMC as-of the activity date.

---

## Prod verification summary
- Phase 3 (`/fitness`): prod verified yes — https://training-hub-psi-one.vercel.app/fitness (Fitness 48 / Fatigue 52 / Form −5).
- Phase 6 (`/races/compare`): prod verified yes — real block + head-to-head numbers render on prod.
- Phase 4 (coach + digest): prod verified yes — `ANTHROPIC_API_KEY` is set in Vercel; a live coach call on prod (`/activity/30`) returned a correct, data-grounded reply (4:51/km goal pace, 168 bpm avg ≈ 95% of LTHR).

## Intervals.icu upgrade
- ICU-T01 Form zone bands and labels in the TSB panel: done 2026-07-24, PR #4
