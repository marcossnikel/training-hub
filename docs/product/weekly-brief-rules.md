# Weekly brief rule contract

`buildWeeklyBrief` in `src/lib/weekly-brief.ts` is the launch rule contract for a future weekly-brief adapter and UI. It is pure: it accepts already-authorized summaries, never accepts an owner ID, and does not query a database, call a network service, read a clock, or persist anything.

## Input and calendar contract

- The adapter supplies only one authenticated owner’s confirmed activity summaries. Source IDs are evidence handles and must remain owner-scoped.
- `asOfWeekStart` is a valid Monday local-day key (`YYYY-MM-DD`) for a week the adapter has already established is complete. The function never decides that a current week is complete.
- The current window is that Monday through the following Monday, exclusive. The baseline is the four immediately preceding Monday–Sunday weeks. Activities outside those five weeks are ignored.
- An activity’s local day is `startedAtLocal` when present, otherwise `startedAt`, using the same local-stamp-first convention as `src/lib/totals.ts`.
- Only `confirmed: true` activities with a valid local date and finite, positive `movingTimeS` count. Invalid/missing/non-positive moving time and all unconfirmed records are ignored. Distance is returned only as source provenance; it is never aggregated for decisions.

## History and outcomes

Three of the four baseline weeks must contain at least one usable confirmed activity. Missing weeks are not converted to zeros. A failed gate returns `insufficient_history`; no observations are considered. With adequate history, no qualifying rule returns `no_material_change`. Otherwise the state is `observations`.

The baseline median for time and sessions uses only baseline weeks containing at least one usable activity. Every observation carries the two windows, machine-readable values, current/baseline source IDs and dates, and this limitation when exactly three baseline weeks qualified: `Baseline has activity in 3 of the previous 4 completed weeks.`

## Observations

| Kind | Eligibility | Evidence/copy |
| --- | --- | --- |
| `training_time_change` | Current week is at least 60 minutes and differs from the baseline weekly-time median by at least 20%. | Signed percentage, current total time, and both windows. |
| `session_frequency_change` | Current week has at least 2 sessions; it differs from the baseline session median by at least 1 session and 25%. | Counts, signed percentage, and both windows. |
| `sport_mix_change` | Current week is at least 90 minutes; a named sport has at least 30 current minutes; baseline aggregate time is at least 90 minutes; that sport’s share changes by at least 20 percentage points. | Sport name, both shares, signed percentage-point change, and both windows. |
| `longest_session_concentration` | Current week is at least 120 minutes; its longest session is at least 45 minutes and at least 40% of the week. | Longest-session date/time, weekly time, share, and current window. |

## Selection, ordering, and language

Candidates are ranked by absolute normalized threshold distance: percentage/20 for training time, the larger of absolute session-count change and percentage/25 for sessions, percentage-point change/20 for sport mix, and share/40% for longest-session concentration. Ties use the fixed kind order above, then the earliest source local date and ID.

Eligibility and ranking always use the unrounded values. Values are rounded only in the returned observation and its copy, so an underlying 19.999% change cannot qualify merely because it displays as 20%.

To avoid overlapping claims, selection keeps at most one training-time/session-frequency change and at most one sport-mix/longest-session context. The public return remains capped at three observations. This initial set therefore returns at most two, intentionally.

Copy is derived only from returned values. It says what changed and which window produced it; it does not claim causality, confidence, freshness, completeness, readiness, health, threshold zones, quality, or make a recommendation. A later adapter/UI must separately disclose sync freshness and partial-import state under an accepted connection contract.

## Rollback

There is no stored state. Reverting this module and contract removes the rules.
