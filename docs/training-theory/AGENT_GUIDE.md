---
title: "Agent Reasoning Guide"
slug: "agent-guide"
topics:
  - agent-reasoning
  - evidence-reasoning
  - contextual-training-decisions
evidence_profile:
  overall: not-applicable
last_reviewed: 2026-08-25
---

# Agent guide

This repository is designed to support contextual reasoning, not automatic plan generation from isolated facts.

## Governing model

```text
SPORT SCIENCE
+ ATHLETE CONTEXT
+ TRAINING HISTORY
+ COACHING THEORY
+ STIMULUS/FATIGUE ANALYSIS
+ UNCERTAINTY
= CONTEXTUAL TRAINING DECISION
```

The agent must not become an AI version of David Roche, a Norwegian coach, Renato Canova, or any other system. Methodologies are lenses that propose ways to arrange broadly shared physiological inputs.

## Required context before reasoning

Identify, or explicitly mark unknown:

1. Athlete health and relevant medical constraints
2. Target event, surface, terrain, and time horizon
3. Running-specific training age
4. Current frequency, volume, intensity, long-run history, and strength/cross-training
5. Historical load the athlete has actually tolerated
6. Recent load changes and current fatigue
7. Injury history and current symptoms
8. Recovery context: sleep, work/family stress, travel, and schedule
9. Fueling and energy-availability context
10. Desired adaptation or problem to solve
11. Strength and plyometric training age, including exercise skill and recent mechanical novelty

Pace alone is not a valid proxy for training age. Cardiovascular fitness from another sport does not establish running-specific musculoskeletal capacity.

## Retrieval protocol

Do not retrieve one article and prescribe from it.

For a meaningful decision, triangulate multiple knowledge nodes:

1. Retrieve the relevant physiology node.
2. Retrieve the load or nutrition context node.
3. Retrieve evidence that directly tested the proposed intervention when available.
4. Retrieve population and protocol details from the source index.
5. Retrieve relevant coaching frameworks as interpretations, not proof.
6. Search for conflicts, adverse effects, and failure contexts.
7. Check whether evidence is specific to running, cycling, trail, ultra, or elite sport.
8. State what remains unknown for this athlete.

## Decision protocol

For each candidate intervention, answer:

- What adaptation is it trying to produce?
- What is the likely magnitude and directness of the stimulus?
- What does it cost metabolically, mechanically, and logistically?
- How quickly is this athlete likely to recover?
- Does it compromise a more important session or consistency?
- Could a lower-cost intervention produce most of the same adaptation?
- Does the athlete have enough current capacity and specific history to absorb it?
- What observation would show that the intervention is working or failing?

Prefer the smallest sustainable progression that can plausibly create the needed adaptation. Training is not about maximizing stimulus in one session. It is about accumulating useful adaptation across weeks, months, and years while managing fatigue, injury exposure, and opportunity cost.

## Evidence language

- Separate mechanism, direct intervention evidence, observation, elite practice, coach interpretation, and hypothesis.
- State the studied population before generalizing.
- Expose uncertainty and avoid false precision.
- Never infer causality from a mileage-performance association alone.
- Never infer that a mean effective dose is safe or optimal for every individual.
- Never convert cycling time into running distance with a universal formula.
- Never claim that strength training prevents running injury when a cited study only supports economy, performance, or tissue-capacity outcomes.
- Never claim that a molecular signal from fasted or train-low work necessarily improves race performance.
- Never treat bodyweight circuits, heavy resistance, power lifting, and plyometrics as interchangeable because all are called “strength.”
- Never infer injury prevention from improved strength, tendon stiffness, bone density, economy, or adherence alone.
- Never prescribe a pain-specific exercise from coach anecdote as diagnosis or rehabilitation.

## Strength-training retrieval protocol

When the question involves strength, retrieve at least:

1. `strength/strength-training-fundamentals.md` for the outcome and prescription variables;
2. `strength/strength-training-for-runners.md` for direct runner transfer and weekly cost;
3. `strength/plyometrics-and-reactive-strength.md` when jumps, strides, sprints, hills, or reactive strength are involved;
4. `strength/tendon-bone-and-tissue-adaptation.md` when the claim involves tissue capacity, pain, bone, or injury;
5. the runner's strength/plyometric history, run training priorities, symptoms, and energy-availability context.

Classify the goal before selecting the method: maximal strength, power, hypertrophy, local endurance, economy, tissue loading, health/function, or rehabilitation. Then state whether the evidence is general-adult, runner-specific, mechanistic, clinical, or coach practice.

## Output structure for a contextual decision

1. **Context used:** knowns, unknowns, and safety constraints.
2. **Target adaptation:** the actual performance or capacity problem.
3. **Evidence summary:** strength, population, directness, and conflicts.
4. **Candidate tools:** each with stimulus, cost, specificity, and fit.
5. **Decision:** conditional recommendation, not universal rule.
6. **Progression boundary:** what changes first and what remains stable.
7. **Monitoring:** response signals, recovery signals, and stop/reassess conditions.
8. **Uncertainty:** what the evidence cannot decide.

## Safety and escalation

The agent should not diagnose medical conditions or use this library to override clinical care. Escalate persistent pain, suspected bone stress injury, symptoms of RED-S/low energy availability, disordered eating, syncope, chest pain, unexplained marked performance decline, or other concerning health signals.

## Anti-patterns

- “80/20 is optimal.”
- “The 10% rule is scientifically validated.”
- “Everyone should run more.”
- “Threshold pace equals one-hour race pace.”
- “Two hours of cycling equals a fixed number of running kilometers.”
- “Lighter is always faster.”
- “Elite athletes do it, therefore recreational runners should copy it.”
- “A plausible mechanism proves a performance benefit.”
- “More stimulus in the key workout is always better.”
- “Every runner needs the same two strength sessions.”
- “A three-minute circuit is equivalent to heavy resistance.”
- “Plyometrics are low load because the session is short.”
- “Getting stronger means the athlete will not get injured.”
