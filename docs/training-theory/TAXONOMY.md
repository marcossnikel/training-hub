---
title: "Knowledge Taxonomy"
slug: "taxonomy"
topics:
  - evidence-reasoning
  - metadata
evidence_profile:
  overall: not-applicable
last_reviewed: 2026-08-25
---

# Knowledge taxonomy

## Canonical values

### Athlete level

- `novice`: little consistent running exposure; low running-specific musculoskeletal history.
- `developing`: consistent exposure is emerging, but load and workout history remain limited.
- `trained`: sustained, structured running history with established load tolerance.
- `highly-trained`: high and durable sport-specific workload plus extensive workout/race history.
- `elite`: competition level plus the long training history and support context typical of elite sport.

These are contextual categories, not pace bands. An aerobically strong cyclist can be `trained` centrally and `novice` in running-specific tissue exposure.

### Event type

Use only: `general`, `5k`, `10k`, `half-marathon`, `marathon`, `ultra`.

### Sport

Use only: `running`, `cycling`, `elliptical`, `strength-training`, `endurance`.

### Evidence level

Use only: `strong`, `moderate`, `limited`, `mixed`, `insufficient`, `not-applicable`.

### Source type

Use only:

- `systematic-review`
- `meta-analysis`
- `consensus-statement`
- `position-stand`
- `randomized-trial`
- `controlled-trial`
- `longitudinal-study`
- `observational-study`
- `mechanistic-study`
- `case-study`
- `book`
- `coach-article`
- `coach-interview`
- `podcast`
- `elite-practice`

In prose, use `coach practice` as the epistemic label. In metadata, use the specific source type.

### Intensity domains

Prefer physiological domains over pace-name shortcuts:

- `domain-1`: below the first lactate or ventilatory threshold.
- `domain-2`: between the first and second threshold boundaries.
- `domain-3`: above the second threshold boundary; exercise tolerance depends on distance above critical speed/power and finite work capacity.

Threshold constructs are not interchangeable. Documents must name the operational definition: LT1, LT2, ventilatory threshold, maximal lactate steady state, critical speed, race-duration proxy, or coach-defined effort.

## Claim blocks

Use claim blocks for high-value propositions likely to be retrieved out of context:

```markdown
### Claim

Statement with source IDs. [SRC-001]

**Evidence:** Moderate\
**Population:** Trained runners\
**Type:** Systematic review + controlled trials\
**Confidence:** Moderate\
**Important caveat:** The main limit on generalization.
```

For coaching ideas, use `### Coaching hypothesis` and add `Coach practice`, `Potential benefit`, `Potential cost`, and `Best fit`.

## Evidence-weight rules

- Do not infer `strong` from study design alone.
- Downgrade for indirect population, very small samples, short interventions, poor controls, weak replication, or surrogate-only outcomes.
- Prefer `mixed` when credible results conflict or depend strongly on protocol.
- Mechanistic plausibility cannot establish performance benefit by itself.
- Elite practice documents feasibility among selected survivors; it does not prove causal superiority or recreational suitability.
- Absence of direct evidence is `insufficient`, not evidence of no effect.

## Source IDs

- Source IDs are stable and repository-wide.
- A source appears once in `sources/source-index.md` even when used by many documents.
- Inline source IDs should support the sentence or paragraph immediately before them.
- Raw URLs belong in the source index, not repeatedly in topic prose.
- If a source is coach content, the entry must state whether it cites research and link related scientific source IDs.

## Applicability fields

When materially relevant, describe:

- athlete level and running-specific training age;
- current and historical volume/frequency;
- injury and health constraints;
- event and surface;
- intervention duration;
- baseline carbohydrate/energy availability;
- environmental conditions;
- whether the outcome is physiology, economy, performance, symptoms, or injury incidence.

## Stimulus-cost vocabulary

Common primary/secondary stimuli:

- central aerobic development
- peripheral oxidative adaptation
- threshold-domain tolerance
- VO2max
- running economy
- neuromuscular power
- maximal strength
- reactive strength
- local muscular endurance
- tendon mechanical adaptation
- site-specific bone loading
- running-specific tissue capacity
- durability
- glycogen utilization
- heat adaptation

Common costs:

- metabolic fatigue
- musculoskeletal load
- glycogen depletion
- autonomic stress
- recovery time
- injury exposure
- gastrointestinal burden
- opportunity cost
- interference with a more important session

## Strength-method boundaries

Do not use `strength-training` as an undifferentiated intervention label when the method affects the claim. Record at least one of:

- `high-load-resistance`: external resistance at or above 80% 1RM in the runner syntheses;
- `submaximal-resistance`: 40–79% 1RM;
- `power-resistance`: external resistance moved with fast concentric intent;
- `plyometrics`: rapid stretch-shortening-cycle work such as hops, bounds, and jumps;
- `isometric`: force without intended joint movement, with joint angle and duration stated;
- `local-muscular-endurance`: repeated submaximal contractions or high-repetition circuits;
- `minimal-dose`: a deliberately low-volume approach, not a physiological method by itself.

The same routine can span categories. When it does, describe each component, the targeted outcome, and the combined cost.

Keep the following outcome claims separate:

- maximal strength;
- power or rate of force development;
- hypertrophy;
- running economy;
- fresh or fatigued running performance;
- tendon or bone property;
- pain/function;
- injury incidence.
