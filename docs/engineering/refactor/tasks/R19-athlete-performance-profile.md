# R19 — Model athlete performance parameters without founder defaults

**Status:** draft
**Delivery class:** full stack
**Risk/model:** high — Terra high
**Depends on:** R2M and R16 done
**Unlocks:** R20 and R21

## Outcome

Every performance calculation can distinguish unknown, athlete-entered,
provider-sourced, calculated, and analyst-hypothesis values. New accounts never
inherit Marcos's timezone, heart-rate, pace, or FTP values, and athletes can
skip or edit their profile later.

## Current truth

- `src/components/thresholds-form.tsx` and its server action require max HR,
  resting HR, LTHR, threshold pace, and FTP.
- `src/lib/db/thresholds.ts` falls back through `src/lib/baseline.ts` to
  founder-specific values for an owner without saved thresholds.
- Provenance exists only as a few provisional flags, not per field.
- `src/lib/fitness.ts` derives HR zones from LTHR and can accidentally make a
  fallback look personalized.
- `src/lib/benchmarks.ts` can estimate Critical Speed only from at least two
  distinct user-confirmed road-race distances; two points produce R²=1 without
  proving confidence.
- Stored derived zone metrics can become stale after threshold edits.

## Locked decisions

1. Remove all founder-specific runtime defaults for athlete data. Absence is
   represented as unknown, never a plausible number.
2. The profile also stores an effective IANA timezone as a typed non-numeric
   setting. A validated athlete-entered timezone overrides the connected-
   provider timezone; without either, relative calendar labels are unavailable.
3. Initial numeric keys are `resting_hr_bpm`, `max_hr_bpm`, `lthr_bpm`,
   `threshold_pace_sec_per_km`, `cycling_ftp_watts`, and
   `measured_vo2max_ml_kg_min`. Calculated VDOT/VO2 and Critical Speed are
   derived observations, not athlete-entered facts.
4. Each current parameter stores owner, typed key, numeric value, canonical
   unit, provenance (`athlete_entered`, `provider`, `calculated`, or
   `analyst_hypothesis`), observed/effective time when known, updated time, and
   optional calculation version/evidence reference required by provenance.
5. Timezone provenance is `athlete_entered` or `provider`; validate the complete
   IANA identifier server-side and never trust a browser offset or the process
   timezone. Treat the provider field as untrusted text, parse and store only a
   canonical validated IANA identifier, and reject a numeric `utc_offset` as a
   substitute because it cannot represent daylight-saving rules. Provider
   timezone is connection-origin data and is removed on true disconnect unless
   an athlete-entered override exists.
6. An `analyst_hypothesis` cannot become an effective calculation input until
   the athlete explicitly confirms/edits it; confirmation creates
   `athlete_entered` provenance.
7. Validation is key/unit-specific and server-side. Browser input cannot choose
   owner, calculation version, or trusted provenance.
8. Existing saved threshold rows migrate as `athlete_entered` or explicit
   `legacy_saved` mapped to athlete-entered; unsaved fallback values do not
   migrate.
9. Forms are field-independent and skippable. Missing one input does not require
   inventing the others. UI explains which calculations become available.
10. Deterministic modules declare required parameters and return a typed
   unavailable reason when missing/invalid/stale; they do not fall back.
11. Threshold/parameter changes invalidate or version dependent derived metrics
   so stale zones are not presented as current.
12. Easy-HR remains an observation only after the athlete confirms source runs;
    it is not inferred or prescribed in this task.
13. Critical Speed requires the athlete to confirm candidate race sources first,
    then shows dates, points, recency, fit limitation, and an explicit separate
    `Use as threshold pace` action. Two-point R² is never labeled high confidence.

## May change

- additive athlete-parameter schema/migration and feature-owned server module;
- threshold/profile actions/forms and parameter consumers;
- derived metric invalidation/version interface;
- optional Activation Summary prompt/link, Performance profile surface, i18n,
  and focused fixtures/tests.

The builder may repair deterministic consumer behavior and stale derived-value
handling inside performance/profile boundaries. It must not add new physiology
formulas or analyst runtime.

## Must remain true

- all values and evidence references are owner-scoped;
- units are explicit and conversions deterministic;
- unknown values remain unknown through API and UI;
- no medical/readiness or training-target claim;
- athlete confirmation is required before hypothesis application;
- manually saved current thresholds preserve their numeric meaning on migration.

## Non-goals

- generalized free-form EAV fields;
- automatic LTHR/easy-HR inference from average HR;
- wearable/health-provider integration;
- training recommendations;
- LLM calls.

## Implementation map

1. Inventory every current threshold/default/calendar consumer and lock typed
   parameter, timezone, and unavailable interfaces. Completion: no hidden
   fallback to founder, browser, or process timezone remains.
2. Add additive schema and migration. Completion: saved values preserve exact
   units/provenance and accounts with no saved row remain empty.
3. Implement owner-scoped read/upsert/delete/confirm operations and validation.
   Completion: forged owner/provenance/evidence is rejected and invalid IANA/
   browser-offset timezone input never becomes effective.
4. Migrate deterministic consumers to explicit availability. Completion: zones,
   curves, summaries, and forms render correct value or honest missing reason.
5. Implement profile UI and optional race-confirmation/threshold application.
   Completion: each field can save/clear independently and skip works.
6. Version/invalidate derived metrics. Completion: a changed input cannot leave
   an old derived display labeled current.

## Acceptance

- New account has no threshold/HR/FTP/VO2 values and no guessed timezone.
- Existing explicitly saved values migrate exactly with provenance.
- Each parameter can be saved, edited, cleared, or left unknown independently.
- Consumers never substitute a founder/default value.
- Derived/hypothesis values show source/version and require confirmation before
  effective use.
- Critical Speed flow confirms sources then separately applies the value.
- Athlete-entered timezone overrides provider timezone; disconnect removes only
  provider timezone and exact-date labels replace unavailable relative labels.
- Owner isolation, unit/timezone validation, stale invalidation, 1440/390,
  keyboard, focus, and missing-data UI pass.

## Validation

Focused integration tests for migration, empty account, saved account, per-key
validation/unit/provenance, provider-timezone parsing, IANA precedence/
disconnect, offset-only rejection, forged owner/source, consumer availability,
invalidation, race-source confirmation, and explicit threshold application.
Then browser-iterate profile entry/edit/clear/skip, unknown states, candidate
race flow, and dependent Performance changes at 1440/390.

## Migration, compatibility, and rollback

Add new parameter storage first, dual-read only inside this task, migrate saved
rows, switch consumers, then remove fallback/legacy read before done. Rollback
must not reinterpret new values as founder defaults; forward fix is preferred.
No remote migration is authorized.

## Stop only if

Current saved values cannot be distinguished from runtime fallbacks, a consumer
requires a non-null number with no honest unavailable state, or accepted
clinical/coaching boundaries would need to change.
