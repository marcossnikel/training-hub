# Intervals.icu upgrade plan

Goal: adopt the most valuable information intervals.icu surfaces (fitness/form context, per-interval depth, derived training metrics) with a cleaner presentation than theirs. Research found their data depth is universally praised while their UI is the top complaint (modal soup, 70-field configurable tables, settings sprawl). We take the numbers, not the layout.

This plan is written for an implementing agent. Every task is self-contained: read section 2 (conventions), section 3 (execution protocol), then your one task. Do not read ahead or implement parts of other tasks.

## 1. Background facts (verified against intervals.icu's production bundle and our repo)

intervals.icu reference values used throughout this plan:

- Form zones (their bundle constants, form = TSB or TSB as % of CTL): High Risk form <= -30, Optimal -30 to -10, Grey Zone -10 to +5, Fresh +5 to +20, Transition >= +20.
- CTL/ATL recurrence: `ctl = ctl_prev * exp(-1/42) + load * (1 - exp(-1/42))`, same with 7 for ATL. Ours (`computePmc` in `src/lib/fitness.ts`) uses alpha = 1/42 and 1/7 simple EWMA. Keep ours, the difference is negligible; never mix the two forms.
- Ramp rate: `ramp(day) = ctl(day) - ctl(day - 7)`, rendered as a step area around a dashed zero line.
- Aerobic decoupling: split the activity at its midpoint, `ef1 = firstHalfOutput / firstHalfHr`, `ef2` same for second half, `decoupling = (ef1 - ef2) * 100 / ef1`. Output = plain average watts for rides, average speed for runs.
- Efficiency Factor (EF): rides = normalized power / avg HR, runs = avg speed in m/min / avg HR.
- Normalized Power: 30 s rolling average of watts, then mean of 4th powers, then 4th root. Only valid at full stream resolution.
- Variability Index = NP / avg power. Intensity Factor = NP / FTP (rides) or thresholdPace / avgPace (runs, ours already).
- Monotony (Foster): mean of last 7 daily loads / stddev of same. Strain = weekly load * monotony. Caution above 2.0, warning above 2.5.
- ACWR: mean 7 d daily load / mean 28 d daily load. Bands: below 0.8 undertraining, 0.8 to 1.3 sweet spot, 1.3 to 1.5 caution, above 1.5 elevated injury risk.
- Polarization Index (Treff 2019): with S1 = time in Z1+Z2, S2 = Z3+Z4, S3 = Z5, PI = log10(S1 / S2 * S3) when S3 > 0; PI >= 2 means polarized.

Our repo facts every task relies on (all verified):

- Data layer is the directory `src/lib/db/` (client.ts, helpers.ts, migrations.ts, per-domain modules). `src/lib/db/migrations.ts` currently has 9 ordered idempotent migrations (versions 1 to 9); the next sequential version is 10. The migration numbers in this plan (10 to 14) assume nothing lands in between; always use the next free sequential version, never leave gaps and never edit an already-applied migration in place.
- `activities.detail_json` caches the full Strava detail payload per activity (fetched lazily on first view). Inside it, `laps[]` and `splits_metric[]` are typed and used; `best_efforts[]` is present for runs but completely unread today.
- `activity_streams.json` caches per-activity streams downsampled to max 400 points (`src/lib/streams.ts`, `MAX_POINTS = 400`), index-aligned nullable arrays: `timeS, distanceKm, heartrate, paceSPerKm, watts, cadence, altitudeM`. Full resolution is currently discarded at fetch time.
- Thresholds live in `athlete_thresholds` (single row: max_hr, resting_hr, lthr, threshold_pace_s_per_km, ftp_w). Zone builders: `hrZones()` and `paceZones()` in `src/lib/fitness.ts` (Friel fractions 0.81 / 0.90 / 0.94 / 1.00 of LTHR and of threshold speed, 5 zones).
- PMC: `computePmc()` and `dailyLoadSeries()` in `src/lib/fitness.ts`, fed by `listActivityLoadsForPmc()` in `src/lib/db/load.ts` (returns `{started_at, tss}[]`). `formState(tsb)` returns key fresh / neutral / productive / fatigued with bands +5 / -10 / -30.
- Charts are hand-rolled inline SVG. Shared idiom: unitless viewBox (VBW = 760), `width=100%`, colors only via CSS vars (`--primary`, `--chart-2..5`, `--positive`, `--wear-worn`, `--wear-critical`, `--muted`, `--muted-foreground`), hover crosshair + HTML tooltip + keyboard nav as implemented in `src/components/activity-chart.tsx` and `pmc-chart.tsx`. Copy those patterns.
- `src/components/race-compare.tsx` contains a file-local `ZoneBar` (line ~186) and the engine `src/lib/blocks.ts` exports `analyzeRace()` (line ~205) computing half splits, fade %, goal-pace breakdown from cached streams.
- Formatting helpers: `src/lib/format.ts` (fmtKm, fmtPace, fmtDuration, fmtHr, fmtElev, mondayOf, ...) and `src/lib/cycling.ts` (fmtPower, fmtCadence, fmtSpeed). All null-safe.

Live data coverage (queried read-only on 24 Jul 2026; these drift as training continues, treat them as dry-run expectations, not assertions): 1235 activities, 1234 activity_load rows (method hr = 897, pace = 335, power = 2). Only 11 activities have cached activity_streams rows and only 21 have detail_json (13 runs with non-empty best_efforts, about 103 effort rows, 25 with pr_rank). 16 activities have is_race = 1. athlete_goals has the right schema but ZERO rows. health_metrics history starts 2026-05-25 (keys hrv_overnight, resting_hr, sleep_total). Exactly 2 rides have real device power (both VirtualRide); 265 runs carry watch run power, which this plan deliberately does not use.

## 2. Conventions and landmines (read before every task)

1. Next.js 16 has breaking changes vs your training data. Before writing code, read the relevant guide in `node_modules/next/dist/docs/`. Server components by default; client components only where interaction demands it.
2. i18n lockstep: i18n is the directory `src/lib/i18n/`. `en.ts` defines the dict and `Dict = typeof en`; `pt.ts` is typed `export const pt: Dict`, so every key you add to en.ts MUST be added to pt.ts in the same commit or the build fails. All user-visible strings go through the dict, no hardcoded English in JSX.
3. Charts: hand-rolled SVG only. No chart libraries, no new dependencies of any kind. Reuse the geometry and interaction patterns from `activity-chart.tsx` / `activity-chart-series.ts` / `pmc-chart.tsx`. Colors only via existing CSS vars.
4. Turso is SHARED between dev and prod. A bad write hits production instantly. Migrations must be additive (new tables or `addColumnIfMissing`), never rewrite or delete rows of `activities`, `shoes`, `bikes`, `activity_chat`, `health_metrics`. Any backfill script must run in dry-run mode first (print what it would write, row counts, 3 sample rows) and only write on a `--write` flag.
5. Strava API budget: roughly 100 read requests per 15 min and 1000 per day. Any task that fetches from Strava must reuse the existing client in `src/lib/strava.ts` (it already handles 429 / Retry-After) and be resumable.
6. Pure computation goes in `src/lib/` with colocated `*.test.ts` vitest unit tests. UI components carry no business math.
7. Local gates before any push: `npm run build` and `npx vitest run` must pass. For UI tasks, verify the page renders against the dev server (one may already be running on port 3000/3001, it hot-reloads; do not kill it, do not start a second one, Next 16 holds a global dev lock).
8. Keep diffs lean. No drive-by refactors, no unrelated formatting churn, one concern per PR.
9. Do not touch `.env.local`, seeded threshold values, or anything under `scratchpad/`.
10. Task ids TNN in this plan are a fresh namespace. BUILD_LOG.md's historical dotted ids (T2.1 style) are unrelated; never cross-reference them.

## 3. Execution protocol (autonomous PR loop)

Repo: `betterfit-inc/training-hub`. All `gh` commands must be prefixed with `GH_TOKEN=$(gh auth token --user marcossnikel)`. Never run `gh auth switch`.

Per task, in order:

1. `git checkout main && git pull`, then branch `feat/tNN-short-slug`.
2. Implement the task. Run local gates (section 2, item 7).
3. Append one line to `PROGRESS.md` under a `## Intervals.icu upgrade` heading (create it once): `- ICU-TNN <title>: done <date>, PR #<n>` (the ICU- prefix keeps these distinct from BUILD_LOG's historical T-numbers).
4. Commit (message `feat(scope): TNN short description`), push, open PR. Title: `TNN: <task title>`. Body: goal paragraph from this plan, the acceptance checklist as checkboxes, and the plan path `docs/intervals-icu-upgrade-plan.md`.
5. Wait for Cubic: poll `gh pr view <n> --json reviews,comments` every 2 to 3 minutes for a review by `cubic-dev-ai` newer than the head commit, up to 30 minutes. If none arrives, proceed to step 7.
6. Triage every Cubic finding into: (a) correctness or convention bug, fix it and push; (b) conflicts with this plan or section 2 conventions, reply on the thread citing the plan and do not implement; (c) subjective style, implementer's discretion. Reply to every thread. Maximum 2 review rounds, then stop looping.
7. Merge criteria, all required: local gates passed, every Cubic thread answered, no unresolved correctness finding. Then `gh pr merge --squash --delete-branch`. If criteria cannot be met, leave the PR open, log why in PROGRESS.md, and move to the next task only if it does not depend on this one; otherwise stop.
8. Hard stops (leave PR open, do not merge, halt the loop): a migration that is not purely additive, the same task failing twice, an unresolvable merge conflict, or any backfill whose dry-run output looks wrong (unexpected row counts, malformed samples).

Tasks must be executed in numeric order unless marked independent. Dependencies are listed per task.

## 4. Task overview

| ID | Title | Effort | Depends on |
|----|-------|--------|------------|
| T01 | Form zone bands and labels in the TSB panel | S | - |
| T02 | Race and goal markers on the PMC chart | S | - |
| T03 | Ramp-rate lane and ACWR tile | M | - |
| T04 | Monotony and strain tiles | S | T03 |
| T05 | Projected fitness scenarios and race-day form readout | M | T02 |
| T06 | Per-sport stacked weekly load bars with real tooltip | M | - |
| T07 | Sport filter on /fitness | S | T06 |
| T08 | Wellness overlay lanes under the PMC | M | - |
| T09 | Richer laps table (power, cadence, elevation, zone tint) | S | - |
| T10 | Best-effort chips on run activities | S | - |
| T11 | Per-activity time-in-zone card | S | - |
| T12 | EF, decoupling and IF tiles on the activity page | M | - |
| T13 | Execution card for races and long runs | S | T11 |
| T14 | Run cadence and stride tiles | S | - |
| T15 | Approximate GAP on km splits | S | - |
| T16 | Zone band shading in HR and pace chart panels | M | - |
| T17 | Lap strip above the stream chart | M | T09 |
| T18 | Drag-selection with instant range metrics | M | - |
| T19 | Form strip on the training log | S | - |
| T20 | Totals table with period deltas | M | - |
| T21 | Consistency heatmap | S | - |
| T22 | activity_best_efforts table and backfill (two PRs: 22a data, 22b UI) | M | T10 |
| T23 | VDOT trend from best efforts | S | T22 |
| T24 | Derived-metrics pipeline (activity_metrics + full-res compute) | L | T12 |
| T25 | Stream-integrated hrTSS with explicit recompute action | L | T24 |
| T26 | grade_smooth ingestion and real GAP | M | T24 |
| T27 | Mean-max curves on /performance | L | T24, T22 |
| T28 | Cycling eFTP with apply button | M | T27 |
| T29 | Backlog doc coherence pass | S | - |

Milestone boundaries: T01 to T08 fitness page, T09 to T18 activity page, T19 to T21 dashboard and totals, T22 to T23 safe data foundations, T24 to T28 stream engine (heavier, DB and backfill work; re-read section 2 items 4 and 5 before each), T29 documentation housekeeping.

## 5. Milestone 1: fitness page (/fitness)

### T01. Form zone bands and labels in the TSB panel (S)

Goal: make the TSB panel in `src/components/pmc-chart.tsx` readable as form zones at a glance, like intervals.icu's zone-shaded form chart but confined to the small TSB lane.

Implement:
- Extend `FormStateKey` in `src/lib/fitness.ts` with `"transition"`. Only the new band is added; existing boundary semantics must not change (fitness.test.ts asserts formState(5) is neutral, keep that test green as-is). Resulting order with the existing strict-greater convention: transition tsb > 20, fresh tsb > 5, neutral tsb >= -10, productive tsb >= -30, else fatigued. So formState(5) stays neutral, formState(20) is fresh, formState(20.1) is transition. Update the `STATE_COLOR` map in `src/app/fitness/page.tsx` (transition: `var(--wear-worn)`) and add en/pt dict keys for the new state label.
- In the TSB panel of PmcChart, draw one low-opacity background `<rect>` per band, clipped to the panel: transition and fresh `var(--positive)` at 0.05 and 0.08, neutral `var(--muted-foreground)` at 0.05, productive `var(--primary)` at 0.07, fatigued `var(--wear-critical)` at 0.07. Bands span the panel's y-range mapped from the TSB scale; clamp bands that fall outside the current extent.
- Add 9px `font-mono` labels at the right edge of each visible band (translated via dict keys, reuse the formState labels).
- In the existing hover tooltip, color the TSB row's value via the STATE_COLOR mapping for the hovered day's state (the band rect fills are a separate decorative palette; STATE_COLOR is the source of truth for text).
- Update `pmc-chart.test.tsx` and `fitness.test.ts` for the new state.

Acceptance: build and tests pass; TSB panel shows bands in both themes; tooltip TSB value uses STATE_COLOR; `formState(25).key === "transition"` and `formState(5).key === "neutral"` (existing assertion untouched); en and pt both updated.

### T02. Race and goal markers on the PMC chart (S)

Goal: show races and goal dates on the fitness timeline so load history reads against real events (taper and post-race dips become visible).

Implement:
- In `src/app/fitness/page.tsx`, query confirmed activities with `is_race = 1` inside the window (`started_at`, `name`) and goals from `athlete_goals` (`race_date`, `name`); build `markers: {date: string; kind: "race" | "goal"; label: string}[]` and pass to PmcChart as a new optional prop.
- In PmcChart, render race markers as small circles sitting on the CTL line at that date's index (r = 4, fill `var(--wear-critical)`, stroke `var(--card)` width 2) and goal markers as dashed vertical lines (`var(--muted-foreground)`, opacity 0.5) with a 9px label at the top.
- When the hover index lands on a marker date, append a row to the tooltip: marker label plus kind. Add en/pt keys for "Race" and "Goal" if not already in the dict.

Data: `activities.is_race`, `athlete_goals.race_date`, both already stored. One added query, no migration.

Acceptance: with the all window selected, every confirmed is_race activity gets a marker (verify the count against `SELECT COUNT(*) FROM activities WHERE is_race = 1`, 16 as of Jul 2026); narrower windows show only the races inside them; hover on a race date shows its name. athlete_goals is EMPTY today, so goal markers must be covered by a component-level test or fixture, and the live page must render nothing goal-related without errors. Build and tests pass.

### T03. Ramp-rate lane and ACWR tile (M)

Goal: surface injury-risk context (ramp and acute:chronic ratio) where training decisions are made.

Implement:
- In `src/lib/fitness.ts`, extend `computePmc` points with `rampRate` (ctl[i] - ctl[i-7], null for i < 7) and add `computeAcwr(daily: {date; load}[]): number | null` replicating the EXACT current semantics of the private math in `src/lib/db/readiness.ts` loadState() (around lines 90 to 102): acute = mean of the last up-to-7 available days, chronic = mean of the last up-to-28 available days, return null only when the chronic mean is 0 (do NOT return null merely for under 28 days of history, that would change behavior). No existing test covers db/readiness.ts, so first write unit tests for computeAcwr that pin today's behavior including the short-history case, then refactor loadState() to call the helper.
- Add a fifth stat tile on `/fitness` (grid becomes `sm:grid-cols-5`): ACWR, colored `var(--muted-foreground)` below 0.8, default 0.8 to 1.3, `var(--wear-worn)` 1.3 to 1.5, `var(--wear-critical)` above 1.5. One-line title tooltip explaining the bands. en/pt keys.
- In PmcChart, add a slim lane (about 40 px) under the TSB panel: step path of rampRate around a dashed zero line, fill `var(--positive)` at 0.15 above zero and `var(--chart-2)` at 0.15 below, clamp display to [-10, +12] and draw a dotted reference line at +8 (the existing warning threshold in the ramp tile). Extend the shared hover: tooltip gains a Ramp row (value formatted +X.X /wk).
- Unit tests for rampRate values and computeAcwr edge cases (empty history, exactly 7 days).

Acceptance: tiles row shows 5 tiles; ramp lane renders and tracks the tooltip; the new computeAcwr unit tests pin the pre-refactor semantics including short history; build and tests pass.

### T04. Monotony and strain tiles (S, after T03)

Goal: flag grindy same-load weeks that ramp and ACWR miss.

Implement:
- `weeklyMonotony(daily: {date; load}[]): {monotony: number | null; strain: number | null}` in `src/lib/fitness.ts` over the trailing 7 days: monotony = mean / stddev (population stddev; return null if stddev < 1 or fewer than 4 non-zero days), strain = 7 d total load * monotony. Unit tests with hand-computed fixtures.
- Render as two quiet tiles in a second row under the 5-tile row on `/fitness` (smaller text, `text-muted-foreground` captions): monotony colored `var(--wear-worn)` above 2.0 and `var(--wear-critical)` above 2.5; strain shown raw with the 7 d load as sub-text. Title tooltips with one-line definitions. en/pt keys.
- Append both values to the weekly digest prompt context in `src/lib/coach.ts` (the weekly digest block already passes CTL/ATL/TSB, around lines 307 to 313). Bundling this one prompt-context line with the UI tiles in the same PR is intentionally accepted for this task.

Acceptance: tiles render with sensible values against real data; null-safe when history is short; build and tests pass.

### T05. Projected fitness scenarios and race-day form readout (M, after T02)

Goal: extend the PMC beyond today with two closed-form scenarios (no planned-workout system needed): full rest and steady load.

Implement:
- `projectPmc(last: PmcPoint, days: number, dailyLoad: number): PmcPoint[]` in `src/lib/fitness.ts` using the exact same EWMA recurrence as `computePmc`. Scenarios computed in the page: rest (load 0) and steady (mean daily load over trailing 28 days). Horizon: 28 days, extended to the next goal race date when it falls within 56 days.
- In PmcChart: dashed vertical "today" divider, then dashed CTL and TSB continuations for both scenarios (steady in the series' own colors, rest in `var(--muted-foreground)`), no hover in the projected region (or clamp hover to today, whichever is simpler).
- When a goal exists inside the horizon, render one line under the chart: "Race in N d: projected form +X resting, Y at current load" (en/pt), values = projected TSB on race date per scenario, each colored by its formState band.
- Unit tests: decay-only projection matches hand-computed EWMA; steady-state projection converges toward dailyLoad-implied CTL.

Acceptance: projections render past today and visually connect to the historical series; readout appears only when a goal is within 56 days; build and tests pass.

### T06. Per-sport stacked weekly load bars with real tooltip (M)

Goal: make the weekly load bars informative (which sport drove the week) and interactive like the main panel.

Implement:
- Extend `listActivityLoadsForPmc()` in `src/lib/db/load.ts` to also select `sport_type` (column already on activities; keep the return type additive: `{started_at, tss, sport_type?}`). It has three consumers that must compile unchanged: src/app/fitness/page.tsx, src/lib/db/readiness.ts, and buildPmc() in src/lib/action-helpers.ts.
- In `src/app/fitness/page.tsx`, map sport_type via `sportCategory()` in `src/lib/sports.ts` and bucket weekly load into run / bike / other (the SportCategory keys are 'run' and 'bike'; fold strength, walk, elliptical and swim into other) using `mondayOf`.
- In PmcChart's weekly bars SVG: stacked rect segments per week, run `var(--primary)`, bike `var(--chart-3)`, other `var(--chart-5)`; swatch-dot legend above (reuse the existing t.sports labels); replace native `<title>` tooltips with the standard hover pattern (pointer to week index, HTML tooltip listing per-sport values and total, keyboard nav parity).

Acceptance: stacks sum to the same weekly totals as before (spot-check one week against old rendering or DB query); tooltip works with mouse and keyboard; build and tests pass.

### T07. Sport filter on /fitness (S, after T06)

Goal: per-sport CTL/ATL/TSB, the intervals.icu custom-chart trick as a one-click filter.

Implement:
- A second `FilterPill` row (All / Run / Bike / Other) driven by `?sport=` (mirror the training log's pill pattern including URL state).
- Server-side: filter the load rows by sport category before `dailyLoadSeries`; everything downstream (tiles, chart, weekly bars, projections) follows automatically.
- When filtered, show a small caption under the tiles: "Run-only load; combined form is on All" (en/pt).

Acceptance: switching pills changes tiles and chart consistently; All matches previous behavior exactly; URL is shareable; build and tests pass.

### T08. Wellness overlay lanes under the PMC (M)

Goal: correlate load blocks with recovery response (HRV, resting HR, sleep) on one date axis.

Implement:
- Structure, stated precisely because /fitness is a server component: the page ALWAYS fetches all three series for the window and passes them as optional props; PmcChart (already a client component) renders the toggle pills and owns the on/off visibility state, all off by default. Metrics: HRV, Resting HR, Sleep. Each enabled metric adds one compact lane (about 48 px) below the TSB panel (and below the T03 ramp lane), date-aligned to the same x grid.
- Data: fetch via `getResolvedNumericSeries` (`src/lib/db/health.ts`) for the window's date range. Exact metric keys (verified live): hrv_overnight, resting_hr, sleep_total, matching TREND_METRICS in `src/app/health/page.tsx`. History starts 2026-05-25, so earlier parts of the PMC window render as gaps; that is expected.
- Lane rendering: 7-day trailing average as the line, faint daily dots, null-broken segments where days are missing (copy the null-segment approach from `activity-chart.tsx`). Colors: next free chart slots, HRV `var(--chart-2)`, RHR `var(--chart-4)`, sleep `var(--chart-5)`.
- Shared crosshair extends through enabled lanes; tooltip gains one row per enabled metric. Reuse existing health metric i18n keys where possible.

Acceptance: lanes align by date with the PMC (spot-check a date after 2026-05-25); days before the Garmin history render as breaks, not interpolation; toggles add/remove lanes without layout jumps elsewhere; build and tests pass.

## 6. Milestone 2: activity page (/activity/[id])

Recency note: this page changed shortly before the plan was written (an upfront AI insight card was added above the chat, and the coach context expanded). Re-read the current page top to bottom before placing any new card.

### T09. Richer laps table: power, cadence, elevation, zone tint (S)

Goal: bring the laps table from 6 columns to the useful intervals.icu subset without the 70-field configurator.

Implement:
- Extend `StravaLap` in `src/lib/strava.ts` with `average_watts?`, `average_cadence?`, `start_date?` (they exist in every cached `detail_json` lap object).
- In `LapsTable` (local to `src/app/activity/[id]/page.tsx`): add columns Power (rides only, `fmtPower`), Cadence (`fmtCadence`; for runs multiply by 2 for spm), Elev (`fmtElev` of `total_elevation_gain`, hide the column if all laps are zero/absent). Headers via en/pt keys.
- Add an inline relative bar to the pace/speed cell like `KmSplitsTable` already does (fastest lap = full width, `bg-primary/80` on `bg-muted`).
- Zone tint: classify each lap by pace into `paceZones(thresholds)` (runs) or by average_watts into %FTP bands 0.55/0.75/0.90/1.05 (rides with real power); render a small colored dot before the lap number using the zone color slots (`--primary`, `--chart-2..5`); laps in Z1/Z2 also get `text-muted-foreground` on the row (implicit recovery typing). Thresholds are NOT currently bound on the page (getAthleteThresholds() is only called inline in the storedLoad fallback around line 200): add an unconditional `const thresholds = await getAthleteThresholds()` and reuse it in that fallback.

Acceptance: an interval run (e.g. any activity with structured laps) shows bars and zone dots; a ride shows power column; no cadence/power columns appear when data absent; build and tests pass.

### T10. Best-effort chips on run activities (S)

Goal: surface Strava's `best_efforts` (fastest 400m/1k/1mi/5k/10k... inside the run, with PR rank), which we already cache but never read.

Implement:
- Extend `StravaActivityDetail` in `src/lib/strava.ts` with `best_efforts?: {name: string; distance: number; moving_time: number; elapsed_time: number; pr_rank: number | null; start_date_local?: string}[]`.
- On run activity pages, render a chip row directly under the stats grid: each chip `<name> <time>` in `font-mono` (e.g. "5K 20:41", format via `fmtDuration`), `pr_rank` chips accented without inventing colors (no medal styling exists in the repo, and section 2 item 3 forbids new colors): rank 1 border and text `var(--wear-worn)` at full opacity, rank 2 at 0.7 opacity, rank 3 at 0.45; other chips muted. Hidden when the array is absent or empty. Card title via en/pt keys.

Data: already inside `detail_json` for every viewed run; `ensureActivityDetail` populates older ones on first view. Display-only, no migration.

Acceptance: a recent run with efforts shows chips; rides and manual activities show nothing; build and tests pass.

### T11. Per-activity time-in-zone card (S)

Goal: the single most-missed piece on our activity page: where did this workout's time go, by zone.

Implement:
- Extract `ZoneBar` from `src/components/race-compare.tsx` into `src/components/zone-bar.tsx` (props unchanged: `zoneSec: number[]`, `labels: string[]`), update race-compare's import, zero behavior change there.
- Server-side on the activity page, when a cached stream exists: integrate seconds per zone by walking the stream samples (`dt = timeS[i+1] - timeS[i]`, attribute to the zone of sample i), HR zones via `hrZones(thresholds)` for any sport with heartrate, pace zones via `paceZones(thresholds)` for runs (skip null pace samples).
- New "Zones" card between the chart and laps sections: one or two stacked-percent bars (HR, pace) with Z1 to Z5 legend showing mm:ss per zone, plus an easy:hard caption (Z1+Z2 vs Z3+Z4+Z5 percentage, same convention as `blocks.ts`). Card hidden when no stream. en/pt keys for the card title and caption.

Acceptance: bars sum to ~moving time (within downsample tolerance); card absent on streamless activities; race-compare unchanged visually; build and tests pass.

### T12. EF, decoupling and IF tiles on the activity page (M)

Goal: the aerobic-quality numbers intervals.icu users check on every workout, in one glanceable row.

Implement:
- New pure module `src/lib/analysis.ts` with unit tests:
  - `computeEf(streams, avgHr, opts)`: rides with real power = (weighted_average_watts ?? average_watts) / avgHR; runs = avg speed in m/min / avgHR. Null when HR absent.
  - `computeDecoupling(streams)`: drop the first 5 minutes (a deliberate deviation from the section 1 reference formula, which splits the raw midpoint; expect small differences vs intervals.icu), split remaining samples at the midpoint of elapsed time, ef per half (power/HR for rides, speed/HR for runs), `(ef1 - ef2) * 100 / ef1`. Null when moving time under 40 min or HR/velocity missing. The 400-point cached streams are adequate for half averages.
- Render a 4-tile row inside the existing load card: TSS (existing), IF (from `activity_load.intensity_factor`, currently persisted but never displayed), EF (2 decimals), Decoupling (percent, colored `var(--positive)` under 5, `var(--wear-worn)` 5 to 10, `var(--wear-critical)` above 10). Each tile gets a one-line title tooltip definition. en/pt keys.
- Computed server-side at request time, no persistence (T24 will persist later; keep the functions pure so they can be reused there).

Acceptance: a long steady run shows plausible EF and decoupling (only 11 activities have cached streams today, so pick spot-checks from recently viewed runs; an intervals.icu comparison is approximate by design, expect 1 to 2 points of difference from the warm-up exclusion); tiles hide individually when inputs are missing; unit tests cover ride/run/missing-data paths; build and tests pass.

### T13. Execution card for races and long runs (S, after T11)

Goal: relocate the already-built race execution analysis (`analyzeRace` in `src/lib/blocks.ts`) onto the activity page where it belongs.

Implement:
- On `/activity/[id]`, when `is_race` or (run and distance >= 10 km) and a cached stream exists, call `analyzeRace` server-side with existing streams and thresholds.
- New "Execution" card: Split tile (second-half minus first-half pace in s/km, labeled negative/positive split, `var(--positive)` for negative, `var(--wear-worn)` for positive), Fade tile (final-quarter %), and when `goal_pace_s_per_km` is set: a 3-segment stacked bar (time at/faster/slower than goal, reuse the `zone-bar.tsx` component from T11) plus "longest stretch at goal" readout. en/pt keys.
- Zero new math; imports only.

Acceptance: a marked race shows the card with the same numbers race-compare shows for that activity; a short easy run shows no card; build and tests pass.

### T14. Run cadence and stride tiles (S)

Goal: complete the run stats grid (cadence exists only for rides today).

Implement:
- In the run stats grid on the activity page, parse `average_cadence` from `raw_json` (same access pattern `rideMetrics` uses in `src/lib/cycling.ts`) and render Cadence = value * 2 spm, plus Stride = avg speed / (spm / 60) in meters, 2 decimals. Both hidden when cadence absent. en/pt keys `detail.cadenceRun`, `detail.stride` (or matching existing naming scheme).

Acceptance: a watch-recorded run shows both tiles with plausible values (cadence 150 to 200 spm, stride 0.8 to 1.4 m); manual activities show neither; build and tests pass.

### T15. Approximate GAP on km splits (S)

Goal: honest pace comparison across hilly kilometers using data already in `splits_metric` (this is the split-level approximation; real stream GAP is T26).

Implement:
- Primary source, no math: Strava already ships per-split GAP as `splits_metric[].average_grade_adjusted_speed` (verified present on all outdoor-run splits in the live DB). Extend `StravaSplit` in `src/lib/strava.ts` with `average_grade_adjusted_speed?: number` and convert to s/km for display.
- Fallback approximation, only when that field is absent AND `elevation_difference` is non-null: grade = elevation_difference / distance; working in s/km, adjustedPace = rawPace / (1 + 3.3 * gradePct/100) for uphill (gradePct > 0) and rawPace / (1 - 1.8 * |gradePct|/100) for downhill, clamping gradePct to [-10, +10]. Direction check, this is the part an implementer gets backwards: GAP must be FASTER (smaller s/km) than raw pace uphill and slower downhill. Unit tests must assert those inequalities at +5% and -5% plus equality at 0%. Indoor splits (both fields null) get no GAP. Pure helper in `src/lib/analysis.ts` (from T12; if T12 is not merged yet, create the module here).
- In `KmSplitsTable`: show GAP as a second muted value in the pace cell, prefixed with `~` only when it comes from the fallback approximation (Strava's own value gets no `~`), and scale the existing inline bar by GAP when available, raw pace otherwise. Column header gets a title tooltip. en/pt keys.

Acceptance: on a hilly run, uphill kms show GAP faster than raw pace and downhill kms slower, flat kms roughly equal; indoor runs show no GAP; the inequality unit tests pass; build and tests pass.

### T16. Zone band shading in HR and pace chart panels (M)

Goal: read at a glance which zone a stretch of the workout sat in, directly in the stream chart.

Implement:
- Extend `SeriesDef` in `src/components/activity-chart-series.ts` with optional `zoneBounds?: number[]` (the 4 boundary values). `buildSeries` fills it for heartRate (from `hrZones`) and pace (from `paceZones`, remember pace panel's inverted axis) using thresholds passed down from the page (add a prop).
- In the panel renderer in `activity-chart.tsx`: when zoneBounds present, draw up to 5 horizontal `<rect>` bands clipped to the panel's padded extent, zone color slots (`--primary`, `--chart-2..5`) at 0.06 opacity, behind the polyline. Bands partially outside the y-extent are clamped, not skipped.
- Append the zone label (Z1 to Z5) to that series' tooltip row for the hovered sample.
- Always on, no toggle (bands are faint by design).

Acceptance: HR and pace panels show faint bands in both themes; other panels unchanged; tooltip shows the zone; no visible performance regression while hovering; build and tests pass.

### T17. Lap strip above the stream chart (M, after T09)

Goal: connect laps to the chart (today they are fully disconnected components).

Implement:
- Server-side, build `laps: {label: string; startS: number; endS: number}[]` by accumulating lap `elapsed_time` (fall back to `start_date` deltas once parsed in T09); only when the page's existing structured-laps check passes. Pass as optional prop to `ActivityChart`.
- Render a slim strip (about 10 px) between the toggle pills and the first panel: alternating rects (`var(--chart-4)` at 0.15 / 0.3), mapped through the existing x-scale in both time mode (direct) and distance mode (interpolate `timeS` to `distanceKm`).
- Hovering a segment draws a translucent highlight rect spanning all panels for that lap and prefixes the tooltip header with the lap label; click pins/unpins the highlight; Esc clears. All state local to the component.

Acceptance: an interval workout shows the strip; hover highlights the correct span in both x-modes; activities without structured laps show no strip; build and tests pass.

### T18. Drag-selection with instant range metrics (M)

Goal: intervals.icu's most-praised interaction: select any range, get its numbers, no permanent artifacts.

Implement:
- In `activity-chart.tsx`: pointer-down plus drag beyond ~6 px starts a selection `[i0, i1]` (plain click keeps current hover behavior); translucent band (`var(--foreground)` at 0.06) with edge lines across all panels; Esc or pointer-down outside clears; Shift+Arrow extends from the keyboard cursor (a11y parity with existing arrow nav).
- Below the chart, a single-line `font-mono` metrics strip: duration (delta timeS), distance (delta distanceKm), avg and max HR, avg pace (time-weighted from paceSPerKm over the range) or avg power for rides, elevation gain (sum of positive altitudeM deltas). All computed client-side from the arrays already in the component; null-safe per metric. en/pt label keys.
- Note in a code comment: at the 400-point downsample a 1 h activity has ~9 s samples, selections under ~30 s are coarse. No zoom, no re-fetch.

Acceptance: dragging shows the band and strip with correct values (sanity-check duration and distance against the tooltip endpoints); keyboard path works; click-without-drag behaves exactly as before; build and tests pass.

## 7. Milestone 3: dashboard and totals

### T19. Form strip on the training log (S)

Goal: today's form without navigating to /fitness (the "attractive top-level glance" intervals.icu users ask for and never got).

Implement:
- In `src/app/page.tsx`, compute the PMC snapshot server-side. A helper already exists: `buildPmc()` in `src/lib/action-helpers.ts` is exactly computePmc(dailyLoadSeries(await listActivityLoadsForPmc())); reuse it. Do NOT add DB-touching helpers to src/lib/fitness.ts, that module's header forbids DB imports.
- Render one compact strip under the page title, the whole strip links to `/fitness`: Form chip (TSB value + state label in the state color, reuse `formState` + the STATE_COLOR mapping, move it to a shared location if importing from the fitness page is awkward), CTL with a tiny 14-day sparkline (inline SVG polyline ~120x32, no interaction, HealthTrendChart geometry as reference), and this week's load vs trailing 4-week average ("210 / avg 305"). en/pt keys.

Acceptance: strip renders on / with values matching /fitness tiles the same moment; links to /fitness; adds no visible latency to the log page; build and tests pass.

### T20. Totals table with period deltas (M)

Goal: the useful core of intervals.icu's /totals page as one clean table, no configuration.

Implement:
- Data path, stated precisely to avoid UTC week-boundary drift: ONE query in `src/lib/db/` (activities domain module) returning per-activity rows (started_at, tss via join to activity_load, moving_time_s, distance_km, elevation_gain_m) over confirmed activities in range; ALL grouping happens in JS with `mondayOf` / local date helpers from `src/lib/format.ts`, matching dailyLoadSeries' local-date convention. No SQL strftime grouping.
- "Totals" card on `/fitness` under the chart: Weeks (default, last 12) / Months (last 12) toggle as URL-param pills mirroring the existing window pills, so the page stays fully server-rendered; table with columns Period, Load, Hours, Distance, Elevation, Sessions. Values `font-mono tabular-nums`; under each value a 10px signed delta vs the previous period, `var(--positive)` when up, `var(--muted-foreground)` when down (more training is not always better, keep deltas neutral-negative). Wrap in `overflow-x-auto`. Reuse the TH/TD class idiom from the activity page tables. en/pt keys for headers and pills.

Acceptance: current-week Hours, Distance and Sessions match the training log's week summary; Load matches the /fitness weekly bar for the same week (the log never displays load or elevation, do not look for them there); deltas verified by hand for one pair of rows; table scrolls horizontally on narrow screens; build and tests pass.

### T21. Consistency heatmap (S)

Goal: a GitHub-style year strip of daily load, the at-a-glance consistency view intervals.icu itself lacks.

Implement:
- Server-rendered SVG, zero client JS (HealthTrendChart philosophy): 53 columns x 7 rows, one cell per day over the trailing year, 3 px gap. Fill `var(--muted)` for empty days, else `var(--primary)` at 4 opacity steps bucketed by that year's daily-TSS quartiles (compute quartiles from the non-zero days of the displayed year). Month initials along the top (en/pt), native `<title>` per cell with date, TSS, session count.
- Data: `dailyLoadSeries` output (already computed on /fitness) plus one grouped COUNT query per day for session counts.
- Placement: collapsed-by-default card at the top of `/fitness` (native `<details>` or the repo's existing collapse idiom), with current streak (consecutive days with load) and active days per week (trailing 4 weeks) as text beside the title.

Acceptance: renders the full year in both themes; cell count and month alignment correct (spot-check today and 1 Jan); streak number matches manual count for recent days; page works with JS disabled for this card; build and tests pass.

## 8. Milestone 4: safe data foundations

### T22. activity_best_efforts table and backfill (M, after T10; ships as two sequential PRs, 22a then 22b)

Goal: turn the unread `best_efforts` payloads into queryable rows powering /performance, PR badges, and later the pace curve (T27) and VDOT (T23).

Implement:
- PR 22a. Migration 10 (the next sequential version) in `src/lib/db/migrations.ts`: table `activity_best_efforts` (id INTEGER PK, activity_id references activities ON DELETE CASCADE, name TEXT, distance_m REAL, elapsed_time_s INTEGER, moving_time_s INTEGER, pr_rank INTEGER NULL, UNIQUE(activity_id, name)). Follow the existing migration structure exactly.
- Populate inside `ensureActivityDetail` (upsert on the UNIQUE key) whenever detail is fetched or already cached, so rows appear organically.
- PR 22a. Backfill script `scripts/backfill-best-efforts.ts`: walk activities with non-null `detail_json`, parse, upsert. Local re-parse only, ZERO Strava API calls. Reuse scripts/backfill-load.ts ONLY for its remote-DB guard (assertLocalDb, which refuses non-file: URLs unless ALLOW_REMOTE_DB=1) and its package.json wiring; do NOT copy its write behavior (it writes unconditionally and predates the dry-run convention) and do not reuse --force, which there means allow remote DB. This script must be dry-run by default (print row count and 3 samples) with a separate `--write` flag. Documented run command for the PR body: `set -a; . ./.env.local; set +a; ALLOW_REMOTE_DB=1 npx tsx scripts/backfill-best-efforts.ts` (then again with `--write`).
- Scope expectation: only 21 activities have detail_json today (13 runs with non-empty best_efforts, about 103 effort rows). A dry-run reporting numbers of that order is CORRECT, not a bug. The table fills organically as activities are viewed, and T24's fetch pass deepens history later.
- PR 22b (after 22a merges): `/performance` best-efforts card upgraded to prefer `activity_best_efforts` (true sub-segment efforts) over the whole-activity matching in `benchmarks.ts`, falling back where the table is empty; small "PR" badge on the activity page chip (T10) when pr_rank = 1.

Acceptance: dry-run output sane before write (order of 103 rows from 13 runs as of Jul 2026); after write, counts match the dry-run; /performance shows faster (or equal) best efforts than before, never slower; no Strava API calls made; build and tests pass.

### T23. VDOT trend from best efforts (S, after T22)

Goal: a deterministic fitness-over-time proxy beyond CTL, replacing the one-off AI VO2max guess with math.

Implement:
- `vdotFromEffort(distanceM: number, timeS: number): number` in `src/lib/benchmarks.ts` implementing Daniels-Gilbert: with v = distanceM / (timeS/60) in m/min and t = timeS/60 in minutes, VO2 = -4.6 + 0.182258 v + 0.000104 v^2; pct = 0.8 + 0.1894393 e^(-0.012778 t) + 0.2989558 e^(-0.1932605 t); VDOT = VO2 / pct. Unit tests against published table values (e.g. 5k 20:00 -> ~49.8, 10k 40:00 -> ~52 area; assert within 0.5).
- Compute per qualifying effort (distance >= 1500 m) from `activity_best_efforts`; current VDOT = max over trailing 90 days.
- Render on `/performance` beside the Riegel card: current VDOT tile plus a small trend line (monthly max over the last 12 months, HealthTrendChart-style non-interactive SVG). Pass current VDOT into the zones agent evidence (find where best-effort evidence is already assembled in `src/lib/db/zones.ts`; bundling that one evidence line with the UI in this PR is intentionally accepted). en/pt keys.

Acceptance: anchor on the unit tests, they are the ground truth: 5k in 20:00 gives ~49.8 and 10k in 40:00 gives ~52 (assert within 0.5). The Jundiaí HM (21.2 km at 4:39/km) correctly computes to about 46; do NOT adjust the formula to make it come out higher. Trend renders with sparse months handled; build and tests pass.

## 9. Milestone 5: stream engine (heavier; re-read section 2 items 4 and 5 first)

### T24. Derived-metrics pipeline: activity_metrics table plus full-resolution compute (L, after T12)

Goal: stop discarding full-resolution streams unprocessed; persist derived metrics at fetch time so pages read cheap columns.

Implement:
- Migration 11: table `activity_metrics` (activity_id INTEGER PK references activities ON DELETE CASCADE, ef REAL, decoupling_pct REAL, np_w REAL, hr_zone_secs TEXT, pace_zone_secs TEXT, metrics_version INTEGER NOT NULL, computed_at TEXT). Zone secs stored as JSON arrays of 5 numbers.
- New pure module `src/lib/stream-metrics.ts` with `computeStreamMetrics(fullRes, thresholds): ActivityMetrics`: NP (30 s rolling average of watts, mean of 4th powers, 4th root; only when real power), EF and decoupling (reuse/lift the T12 functions, full-res inputs), hr/pace zone seconds (same integration as T11 but full-res). Thorough unit tests with synthetic streams (constant power NP = avg; alternating power NP > avg; known zone distributions).
- Hook in `src/lib/strava.ts` `ensureActivityStreams`: between the raw fetch and the 400-point downsample, run computeStreamMetrics and upsert `activity_metrics` with `metrics_version = 2`. Failures must not break stream caching (try/catch, log).
- Local backfill for already-cached streams: `scripts/backfill-metrics.ts` computing from the 400-point cached streams (adequate for EF/decoupling/zone secs, NOT for NP: leave np_w null) with `metrics_version = 1`. Dry-run default, `--write` flag, same ALLOW_REMOTE_DB guard pattern as T22. Scope expectation: only 11 activities have cached streams today, so a dry-run count of 11 is CORRECT, not a bug.
- Historical fetch pass, same task, separate script `scripts/fetch-history.ts`: newest-first over confirmed activities, for each one missing data call the existing `ensureActivityDetail` then `ensureActivityStreams` (which, after the hook above, also writes activity_metrics). These are the app's own lazy code paths, inserts only. Self-throttling: stay under 90 requests per 15 minutes and stop after 900 calls per run (Strava budget is roughly 100/15 min and 1000/day); print progress and the remaining count; safe to interrupt and re-run, it skips already-populated activities so it is naturally resumable. Full history (~1230 activities, up to 2 calls each) takes about 3 daily runs. Supervise the first ~50-activity run, then it may continue in the background; log each run's coverage in PROGRESS.md. This pass is also what gives T22's table, T23's trend and T27's curves their historical depth.
- Switch consumers: T12's tiles and T11's zone card prefer `activity_metrics` when a row exists (falling back to on-the-fly compute); `buildBlock` in `src/lib/blocks.ts` prefers persisted hr_zone_secs over its avg-HR estimate for activities that have rows, which closes the block-level time-in-zone gap flagged in PROGRESS.md.
- The 11 activities with pre-existing cached streams keep metrics_version = 1 (computed from the downsample); everything the fetch pass touches gets full-resolution version 2. Re-fetching those 11 is not worth the API calls.

Acceptance: new activities get a version-2 row automatically on first view; backfill dry-run reports 11; the fetch pass's first supervised run of ~50 activities respects its rate budget and populates detail, streams and metrics rows; T11/T12 UI values unchanged within rounding for a spot-checked activity; unit tests pass; build passes.

### T25. Stream-integrated hrTSS with explicit recompute action (L, after T24)

Goal: fix the biggest systematic load error: 897 of 1234 load rows use whole-activity average HR, which underscores interval sessions. Run this task only after T24's fetch pass has covered most history; before that, only the handful of previously cached streams would change, and the recompute preview showing few changed activities would be coverage, not a bug.

Implement:
- `computeHrTssFromStream(hr: number[], timeS: number[], thresholds): number` in `src/lib/stream-metrics.ts`: per-sample Karvonen IF = (hr - restingHr) / (lthr - restingHr) clamped to [0, 1.5], TSS = sum(dt/3600 * IF^2 * 100). Unit tests: constant-HR stream matches the existing avg-HR formula; a 50/50 hard/easy interval stream scores higher than its average-HR equivalent.
- Additive migration 12: nullable column `variant TEXT` on `activity_load` (values 'stream' | 'avg'), via addColumnIfMissing. Seam, stated precisely because computeLoad is a pure sync function with no stream access: add an OPTIONAL `hrStream?: {hr: (number | null)[]; timeS: number[]}` field to computeLoad's inputs, used by the hr path when present; callers are responsible for loading the cached 400-point stream, and the bulk recompute path in src/lib/db/load.ts must batch its stream reads (several hundred JSON rows). Set variant accordingly; the UI load control shows "HR (stream)" vs "HR (avg)" via en/pt keys.
- CRITICAL SAFETY: do NOT bulk-recompute silently. Historical TSS feeds CTL/ATL. Ship a one-shot "Recompute loads" server action on /settings that (a) first runs in preview mode: computes everything in memory, shows count of changed activities, mean/max TSS delta, and resulting CTL delta today, then (b) only applies on a second explicit confirm click. Never touches rows where `activity_load.source` marks a manual override (the existing protection, verify it). This action is for Marcos to click, the implementing agent must NOT run it.
- The weekly digest and readiness read loads dynamically, so no other changes needed; state this in the PR body.

Acceptance: unit tests prove interval sessions score higher via stream; preview shows sane deltas without writing; manual-override rows untouched in preview counts; new activities with streams get variant='stream' organically; build and tests pass.

### T26. grade_smooth ingestion and real GAP (M, after T24)

Goal: real grade-adjusted pace from streams (replaces T15's split-level approximation where available).

Implement:
- Add `grade_smooth` to the requested stream keys in `src/lib/strava.ts` and to the `ActivityStreams` type / downsampler in `src/lib/streams.ts` (nullable channel like the others).
- In `stream-metrics.ts`: per-sample GAP via a Minetti-style cost polynomial (implement `paceAdjustmentFactor(gradePct)` as a pure function with unit tests at -10, -5, 0, +5, +10; clamp outside ±30%); persist `avg_gap_s_per_km REAL` on `activity_metrics` via a NEW additive migration (13 if the plan's sequence holds) using `addColumnIfMissing("activity_metrics", "avg_gap_s_per_km", "REAL")`. Never edit an already-applied migration in place: the runner tracks schema_version only, so an in-place edit silently never runs on the shared DB.
- Fallback for already-cached streams (fetched without grade_smooth): derive grade from smoothed altitudeM deltas over distanceKm (5-sample smoothing window); mark via metrics_version so a future re-fetch can upgrade precision.
- Display: GAP value beside pace in the run stats grid, and an optional second polyline in the existing pace panel of ActivityChart (same SeriesDef contract, `var(--chart-2)` dashed at 0.6 opacity). When `avg_gap_s_per_km` exists, T12's run EF switches to GAP-based speed (note it in the tile tooltip).
- rTSS switching to GAP is explicitly NOT in this task (it changes history; would ride the T25 recompute action as a follow-up decision).

Acceptance: a hilly run's GAP is faster than raw pace uphill-heavy and the flat-run GAP ~equals pace; polynomial unit tests pass; no regression for rides; build and tests pass.

### T27. Mean-max curves on /performance (L, after T24 and T22)

Goal: the pace-distance curve (runs) and power-duration curve (rides), intervals.icu's second-most-praised feature, as two clean panels with one comparison overlay each.

Implement:
- Additive migration (14 if the plan's sequence holds): table `activity_curve_points` (activity_id references activities ON DELETE CASCADE, kind TEXT 'pace' | 'power', bucket TEXT, value REAL, PRIMARY KEY(activity_id, kind, bucket)). Buckets: runs best pace (s/km) over 400m, 1k, 1mi, 5k, 10k, half; rides best avg power over 5s, 1m, 5m, 8m, 20m, 60m.
- In `stream-metrics.ts`: two-pointer cumulative scan over full-res distance/time for run buckets; rolling-window max over watts for ride buckets (only real power). Wire into the T24 fetch-time hook. Unit tests with synthetic streams (constant speed run: all buckets equal pace; a stream with one fast km: 1k bucket reflects it).
- Seed run buckets immediately from `activity_best_efforts` (T22) where curve rows are absent, so the run curve is useful on day one without any stream work (400m/1k/1mi/5k/10k map directly; pace = elapsed_time / km).
- UI on `/performance`: one SVG panel per sport (hide the power panel below 10 rides with data). Log-scaled x (bucket index is fine given fixed buckets), y = pace (inverted, faster up) or watts. Two series max: selected window (pills reusing `src/lib/windows.ts`) vs all-time, `var(--primary)` and `var(--muted-foreground)` dashed. Hover crosshair + tooltip listing both values and the source activity name + date (store/lookup the argmax activity per bucket in the query). en/pt keys.
- The athlete curve is `SELECT bucket, MIN(value)` (pace) / `MAX(value)` (power) joined to activities inside the window: cheap SQL, no stream reads at render time.

Acceptance: run curve renders from seeded best_efforts alone (verify before any stream backfill); window vs all-time overlay behaves; clicking nothing (no interactions beyond hover) keeps it clean; unit tests pass; build passes.

### T28. Cycling eFTP with apply button (M, after T27)

Goal: replace the provisional FTP=150 placeholder with a data-derived estimate, mirroring the existing Critical Speed + apply-threshold-pace pattern.

Implement:
- `estimateEftp(points: {durationS: number; watts: number}[])` in `src/lib/benchmarks.ts`: Monod-Scherrer 2-parameter linear fit work = CP * t + W' over best-effort powers at durations 180 s to 1200 s from `activity_curve_points`; require at least 2 distinct durations and return `{cp, wPrimeJ, r2, sampleCount}` or null. Unit tests with synthetic points of known CP.
- Card on `/performance` next to Critical Speed: eFTP value, current FTP, fit quality (r2, n), and an ApplyFtpButton writing `ftp_w` and clearing the provisional flag (clone `src/components/apply-threshold-pace.tsx` and its server action pattern). Card entirely hidden when data is below the floor (fewer than 2 qualifying durations or r2 < 0.9): show nothing rather than a junk number. en/pt keys, including an honest caveat line that only real-power rides count (exactly 2 today, both VirtualRide, so the card will hide until more accumulate, and that is correct behavior). Run power, present on 265 runs, is explicitly out of scope for this task.

Acceptance: with today's sparse power data the card most likely hides itself (correct behavior); synthetic-data unit tests prove the fit; apply button updates settings and the load engine picks up the new FTP on next compute; build and tests pass.

### T29. Backlog doc coherence pass (S, independent)

Goal: stop the planning docs from diverging now that this plan supersedes parts of them. Docs only, no code.

Implement:
- FEATURE_IDEAS.md: add one-line pointers on the items this plan covers (curves T27, EF/decoupling T12, ACWR/ramp T03, GAP T15/T26, time-in-zone T11/T24, VDOT T23, PR board T10/T22, heatmap T21, wellness overlay T08), each like "-> docs/intervals-icu-upgrade-plan.md TNN"; note in the wellness item that the data source shipped via Garmin health sync, making the intervals.icu bridge optional; note the PMC forecast item is superseded by T05's closed-form projections.
- ROADMAP.md: answer the open "should the fitness dashboard replace /?" question with a pointer to T19's decision (log stays home, form strip added).
- docs/ux-backlog.md: mark the single Gear-page item done (shipped, see commit ee6737d and src/app/gear/page.tsx).

Acceptance: the three docs read consistently with this plan; no code changes in the PR; build passes.

## 10. Deliberately not adopted from intervals.icu

Recorded so future sessions do not relitigate: the 70-field configurable interval table (we pick a fixed useful subset), custom JS charts and calculated fields, the workout builder and planned-workout compliance (no planning system in this app by design, projections in T05 cover the taper question), multi-athlete/coach features, the tabbed activity layout (our single scroll page stays), automatic interval detection from power (device laps suffice for a runner-first app), and weather integration (already a FEATURE_IDEAS item, orthogonal to this plan). Also recorded: T05 deliberately supersedes FEATURE_IDEAS' full PMC forecast/taper planner with closed-form projections; T19 resolves ROADMAP's open home-view question in favor of keeping the log as home; run power (265 runs carry it) is a known non-goal for curves and load for now; switching rTSS to GAP-based pace is a follow-up decision that would ride the T25 recompute action, not part of this plan.
