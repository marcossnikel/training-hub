---
title: "Training Theory Knowledge Base"
slug: "training-theory"
topics:
  - endurance-training
  - sport-science
  - evidence-reasoning
sports:
  - running
  - cycling
athlete_levels:
  - novice
  - developing
  - trained
  - highly-trained
  - elite
evidence_profile:
  overall: not-applicable
source_types:
  - systematic-review
  - meta-analysis
  - consensus-statement
  - randomized-trial
  - observational-study
  - mechanistic-study
  - coach-article
last_reviewed: 2026-08-25
---

# Training Theory

This repository is a small, evidence-aware knowledge system about endurance running. It is not a collection of generic training advice and it is not a library about any single coaching system.

The governing question is:

> What do we reasonably know about how endurance athletes adapt, and how do coaching frameworks attempt to use those adaptations?

Running is the primary sport. Cycling and other cross-training modes are considered mainly as ways to add central aerobic, metabolic, or muscular work with different mechanical costs and less running-specific transfer.

## Reasoning order

1. Physiological mechanism
2. Experimental evidence
3. Observational evidence
4. Elite practice
5. Coach interpretation
6. Recreational-athlete extrapolation
7. Unproven hypothesis

This order is not a simple evidence ladder. A well-replicated observational pattern may be more informative for long-term training than a short, underpowered trial. Evidence weight reflects design, quality, replication, population, duration, effect magnitude, consistency, bias risk, and external validity.

## Core principles

- Trace major claims to source IDs such as `[SRC-001]`.
- State the population and training status whenever applicability could change.
- Separate association from causation, especially in elite-training datasets.
- Preserve disagreements and uncertainty instead of silently averaging them away.
- Treat training age as years and history of specific exposure, not as race pace.
- Compare stimulus, fatigue, recovery time, injury exposure, and opportunity cost.
- Do not turn group means into deterministic prescriptions for individuals.
- Preserve specificity: central aerobic transfer does not imply identical peripheral or mechanical transfer.
- Treat SWAP, Norwegian, Canova, polarized, and pyramidal training as frameworks, not universal truths.

## Repository map

- `AGENT_GUIDE.md`: retrieval and decision protocol for a future agent.
- `TAXONOMY.md`: canonical controlled vocabulary and evidence rules.
- `physiology/`: adaptations and performance determinants.
- `training-load/`: volume, frequency, overload, recovery, and risk.
- `intensity/`: intensity domains and distribution.
- `workouts/`: tools described through stimulus, cost, fit, and uncertainty.
- `cross-training/`: transfer and specificity.
- `strength/`: strength, economy, performance, and tissue capacity.
- `nutrition/`: fueling, energy availability, hydration, recovery, and supplements.
- `methodologies/`: coaching frameworks mapped to mechanisms and evidence.
- `development/`: training age and long-term progression.
- `sources/`: source registry and research notes.

## Scope of the knowledge base

The knowledge base currently prioritizes fourteen connected foundation documents rather than filling every planned directory with shallow pages:

- aerobic development
- running economy
- durability
- training age
- training volume
- fueling fundamentals
- carbohydrates
- cycling for runners
- SWAP
- Norwegian Method
- strength-training fundamentals
- strength training for runners
- plyometrics and reactive strength
- tendon, bone, and tissue adaptation

Documents are synthesis snapshots, not clinical advice or individualized plans. `last_reviewed` is the literature-review date, not a guarantee that every later publication has been incorporated.

## Strength cluster reading order

1. [Strength Training Fundamentals](strength/strength-training-fundamentals.md) defines strength, power, hypertrophy, load, volume, failure, progression, minimal dose, and concurrent training.
2. [Strength Training for Runners](strength/strength-training-for-runners.md) evaluates economy, performance, fatigue, placement, maintenance, injury claims, and the SWAP interpretation.
3. [Plyometrics and Reactive Strength](strength/plyometrics-and-reactive-strength.md) separates jumps from heavy resistance and tracks contact quality, progression, and mechanical cost.
4. [Tendon, Bone, and Tissue Adaptation](strength/tendon-bone-and-tissue-adaptation.md) separates tissue properties, pain, and injury incidence and states the medical/energy-availability boundary.

The scientific and coaching records behind these pages are registered once in [Source Index](sources/source-index.md). Roche/SWAP implementation is mapped in [SWAP Coaching Methodology](methodologies/swap.md), not treated as scientific confirmation by authority.

## How to read evidence labels

- **Strong:** several sufficiently direct, credible, and broadly consistent sources, usually including synthesis evidence.
- **Moderate:** meaningful support with limitations in quantity, directness, duration, or applicability.
- **Limited:** sparse, indirect, small, short, or weakly replicated evidence.
- **Mixed:** credible findings conflict or effects depend materially on protocol or population.
- **Insufficient:** evidence cannot support a practical conclusion.
- **Not applicable:** the document is procedural, taxonomic, or descriptive rather than an evidence claim.

Coach-practice labels describe what a coach or system does or argues. They do not upgrade a claim's scientific evidence.

## Safety boundary

This repository does not diagnose injury, low energy availability, RED-S, iron deficiency, or other medical conditions. Persistent pain, menstrual disturbance, loss of libido, recurrent bone stress injury, unexplained performance decline, disordered eating, or other concerning symptoms require qualified clinical assessment.
