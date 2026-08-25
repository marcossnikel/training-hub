# Refactor agent orchestration

## Purpose

This is the execution protocol for progressing through `ROADMAP.md` with
bounded Codex contexts and proportionate model cost. It keeps product and
architecture judgment in one orchestrator while each implementation task runs
in a disposable builder context with mandatory self-review.

The default topology deliberately omits a per-task reviewer:

```text
one milestone orchestrator
  -> one fresh builder for one ready task
      -> implement
      -> run focused verification
      -> inspect the complete diff and self-review
      -> commit the verified slice directly to local main
      -> return the commit and a structured handoff
  -> orchestrator checks scope, evidence, and completeness
      -> accept or send one consolidated correction
  -> orchestrator records acceptance evidence and advances
```

Independent review is batched into later, explicitly requested sessions. This
reduces token use while keeping implementation contexts small and preserving a
stronger gate before live or shared effects.

Current official Codex guidance:

- [Models](https://learn.chatgpt.com/docs/models)
- [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)

Model availability can vary by account/client. The protocol has a Terra/Luna
baseline and an optional Sol upgrade, so execution never depends on Sol being
visible in Marcos's picker.

## Roles and model policy

### Milestone orchestrator

**Default:** `gpt-5.6-terra`, high reasoning.  
**Optional upgrade:** `gpt-5.6-sol`, high reasoning, when available and the
milestone includes auth, migrations, tenant isolation, destructive repair
planning, or an unresolved cross-task design decision.

The orchestrator:

- reads `AGENTS.md`, this file, `WORKFLOW.md`, `ROADMAP.md`, and only the packet
  for the current task;
- owns Ready checks, dependency/state transitions, builder dispatch, evidence
  acceptance, program-state commits, checkpoint summaries, and next-task
  selection;
- checks the final diff and the builder's proof, but does not duplicate every
  builder command or pretend that this is an independent code review;
- does not implement ordinary task code or ingest full builder logs;
- may make a tiny orchestration/documentation correction, but sends product
  code repairs back to the builder;
- sends at most one consolidated correction to the same builder;
- runs for one milestone or at most three accepted implementation tasks,
  whichever comes first, then writes a checkpoint and ends.

Do not use Ultra by default. Manual delegation makes model choice, write
ownership, and cost visible. Max/xhigh are escalation settings for one specific
hard decision, not a persistent session default.

### Builder

Every task gets one fresh-context builder that receives no full conversation
history. It reads `AGENTS.md`, `WORKFLOW.md`, its task packet, and the exact
sources named by the packet.

| Task shape | Builder | Reasoning | Refactor tasks |
| --- | --- | --- | --- |
| Bounded code/UI/tooling | `gpt-5.6-terra` | medium | R0, R1, R5, R7, R8, R10, R12 |
| Schema/auth/data/provider semantics | `gpt-5.6-terra` | high | R2, R2M, R3, R6, R9, R11 |
| Design contract/planning | `gpt-5.6-terra` | high | R4 |
| Frozen mechanical cleanup | `gpt-5.6-luna` | high | R13 only after its inventory is approved |

Luna may also perform a deterministic search, classification, or test inventory
when the orchestrator supplies an exact scope and output schema. Luna does not
choose architecture, product behavior, deletion candidates, authorization,
migration semantics, visual direction, or Strava effects.

The builder owns implementation, focused verification, mandatory self-review,
and the coherent implementation commit directly on local `main`. It may repair
issues found during self-review, then must rerun the affected proof before
committing and returning its handoff. There is no feature branch, pull request,
or merge step in the default loop.

Direct-to-main authority is local repository authority only. It does not
authorize push, deployment, remote/shared data access, external communication,
or live-service changes.

### Deferred independent review sessions

Normal task execution does not dispatch a reviewer agent. Later review sessions
audit a bounded, already committed range: preferably one milestone, or two to
three tightly related accepted tasks.

**Default reviewer:** `gpt-5.6-terra`, high reasoning.  
**Optional upgrade:** `gpt-5.6-sol`, high reasoning, for auth, migration,
owner-isolation, destructive data repair, credential handling, or Strava effect
reviews when Sol is available.

A deferred reviewer:

- starts from fresh context and reads `AGENTS.md`, task packets, evidence files,
  and the exact commit range instead of implementation chat;
- is read-only and returns actionable findings with severity and file
  references, or an evidence-backed statement that no blocking finding remains;
- checks cross-task behavior, security, owner scope, environment isolation,
  missing tests, UI evidence where relevant, and stale compatibility code; and
- does not repair findings. A later builder session receives a bounded repair
  packet so review context and write context stay separate.

Local tasks may be accepted before this session. However, preview/production
migrations, creator bootstrap, destructive data repair, deployment/release,
real Strava effects, and shared database writes require the relevant deferred
independent review and validation to be complete, plus Marcos's explicit live
authority.

### Optional bounded helper

Helpers are disabled by default to save tokens. The orchestrator performs
ordinary readiness searches itself. If a task genuinely needs a noisy,
read-only inventory before it can become Ready, it may use one Luna-medium
helper for deterministic work or one Terra-medium helper for code-flow
exploration. The helper returns a bounded summary, never raw search/test output,
and is closed before the builder starts.

Do not spawn a helper merely to run a known command or reread a packet.

## Concurrency and write ownership

1. The orchestrator is the only persistent thread for the current milestone.
2. At most one builder subagent is active alongside the orchestrator.
3. Exactly one agent edits or commits application/repository files at a time.
4. An optional read-only helper finishes before the builder starts.
5. Two write-heavy roadmap tasks do not run in parallel in the same checkout.
6. If Marcos explicitly requests parallel implementation, each task requires an
   isolated worktree, disjoint permitted files, accepted dependencies, and no
   shared migration/config/lockfile ownership.
7. Close completed builder/helper contexts after their structured result has
   been incorporated.

This uses subagents for task-context isolation, not maximum concurrency.

## Canonical state and evidence

The `ROADMAP.md` task-index `Status` column is the only canonical program state.
Task packets contain stable Ready-gate notes, not duplicate runtime status.
Allowed transitions come from `WORKFLOW.md`.

For every accepted task, save the structured completion record from
`WORKFLOW.md` as:

```text
docs/engineering/refactor/evidence/<TASK_ID>.md
```

Add this metadata before the completion record:

```md
Task: R?
Base commit: <sha>
Implementation commits: <sha>[, <correction sha>]
Builder: <model + reasoning>
Self-review: complete
Orchestrator correction cycles: 0 | 1
Independent review: deferred | <review evidence path>
Accepted by: <orchestrator or Marcos>
```

Evidence files contain command names, exit results, important assertions, and
artifact paths. They do not contain raw logs, entire diffs, secrets, tokens,
provider payloads, or repeated task instructions. Git and the task packet remain
the source for those details.

When a later independent review completes, update `Independent review` to the
review evidence path in a program-state-only commit. Do not rewrite the
implementation commits.

## One-task execution loop

### 1. Select and prepare

1. Read the roadmap and choose the first `planned` or `ready` task whose
   dependencies are `accepted`.
2. If it is planned, apply the `WORKFLOW.md` Ready gate. Refresh the packet's
   caller/file evidence, resolve only decisions already owned by accepted
   sources, and mark it `ready`; pause when human/product authority is required.
3. Confirm no other task or unowned dirty file overlaps its permitted scope.
4. Record the base commit and change the roadmap state to `in_progress`.

Completion criterion: one packet is ready, dependency-complete, attributable to
one base commit, and safe for one writer.

### 2. Dispatch one fresh builder

Spawn without the full orchestrator conversation. Supply only:

```text
Implement refactor task <TASK_ID> from
docs/engineering/refactor/tasks/<TASK_FILE>.

Read AGENTS.md, docs/engineering/refactor/WORKFLOW.md, and the task packet.
Start from <BASE_COMMIT>. Preserve these unrelated dirty files: <LIST OR NONE>.
Work only inside Permitted scope. Stop on any packet Stop condition.
Run the required focused proof, perform the mandatory WORKFLOW self-review of
the complete diff, repair issues you find, and rerun affected checks. When every
criterion is green, stage only permitted-scope files by explicit path, inspect
the staged diff, and create one coherent commit directly on local main. Return
the commit SHA and structured completion record including the Self-review
section. Stop if main moved unexpectedly from the supplied base.
Do not push, deploy, access remote/shared data, or start another agent.
```

Completion criterion: the builder returns a bounded handoff, implementation
commit SHA, and completed self-review, then stops all writes. Claims without the
packet's required evidence keep the task in progress.

### 3. Orchestrator acceptance check

The orchestrator compares the complete diff from the recorded base through the
builder's implementation commit and the structured handoff to every completion
criterion. It checks:

- changes remain inside permitted scope and unrelated dirty files are intact;
- every required proof has a concrete command/result or artifact;
- the self-review names the inspected diff/status and reports no hidden unknown;
- protected data, auth, environment, provider, and UI invariants are addressed;
- compatibility code is removed or has the packet's named expiry; and
- no secrets, generated artifacts, remote effects, or unexplained files appear.

This is an evidence/completeness check, not an independent second review. The
orchestrator must not mark unknown or unexecuted criteria as passed.

Completion criterion: every acceptance criterion is evidenced, or all gaps are
returned as one consolidated correction.

### 4. Correct once when needed

If the acceptance check finds a concrete gap, send one consolidated list to the
same builder. The builder repairs only those items, reruns affected proof,
repeats its final diff self-review, and creates one correction commit directly
on local `main`.

Completion criterion: all gaps close in one correction cycle. A second
unresolved handoff changes the task to `blocked` with exact evidence; it does
not create an unbounded agent loop or automatically add a reviewer.

### 5. Accept, record, and advance

When required proof, builder self-review, implementation commits, and the
orchestrator acceptance check are complete, the orchestrator:

1. inspects final status and the builder's committed diff for unrelated changes
   and secret artifacts;
2. confirms every implementation commit is on local `main` and contains only
   attributable task changes;
3. writes the compact evidence file referencing the implementation commits and
   records independent review as `deferred`;
4. changes the roadmap state to `accepted` and creates a small program-state
   commit containing only the evidence/state update;
5. recomputes which dependent task is now eligible; and
6. either dispatches the next task or stops at a checkpoint.

Completion criterion: builder implementation commits, program-state commit,
roadmap state, and evidence file refer to the same locally verified result.

## Deferred review workflow

Run this in a later fresh Codex session when Marcos requests review/validation,
and always before the listed live-risk actions:

1. Select one accepted milestone or two to three tightly related tasks.
2. Resolve the base and final commits from task evidence; do not infer the range
   from chat history.
3. Give the reviewer only `AGENTS.md`, this protocol, the selected packets,
   evidence files, commit range, and any relevant approved product/design
   sources.
4. Require read-only findings ordered by severity, with exact file references,
   violated criteria, and missing proof. Require an explicit no-blocker result
   when applicable.
5. Persist the report under
   `docs/engineering/refactor/evidence/reviews/<MILESTONE_OR_RANGE>.md`.
6. If findings exist, create bounded repair packets and run them through the
   normal builder/self-review loop. Do not let the reviewer edit its own
   findings.
7. Update each covered task's `Independent review` metadata only after findings
   and required validation are closed.

This batching keeps ordinary implementation cheap while still supplying an
independent context for cross-task and release-risk review.

## Automatic progression policy

The orchestrator may automatically select the next task only when:

- the execution prompt explicitly authorizes autonomous local progression;
- the current task is committed and `accepted`;
- the next task is already `ready` and every dependency is `accepted`;
- the working tree contains no new unowned overlap;
- the next task needs no Marcos/product/Figma/live-service decision; and
- the milestone/task-count context checkpoint has not been reached.

The orchestrator pauses for Marcos at:

- R4 Figma direction approval and any later accepted visual/product decision;
- preview/production migration, creator bootstrap, data repair, deployment, or
  external communication;
- real Strava/shared database/credential use;
- destructive or privacy-ambiguous behavior;
- any live-risk action whose independent review remains `deferred`;
- a task whose Ready gate is still unresolved;
- a second failed builder handoff; or
- every milestone boundary.

Local implementation can therefore progress automatically while product,
independent-review, and live-risk authority remain explicit gates.

## Context budget

### Orchestrator context

- one milestone or three accepted implementation tasks maximum;
- requirements/decisions/state/evidence summaries only;
- no raw test output, stack-trace history, repeated task bodies, or full builder
  conversations;
- open only the current packet and its evidence dependencies;
- when a builder returns a long result, distill it immediately into the
  completion record and discard the narration.

### Builder context

- one task per thread;
- fresh context rather than full-history fork;
- one packet plus its named sources;
- exact starting commit and dirty-file list;
- no roadmap-wide exploration unless the packet explicitly requires it;
- finish after implementation, proof, complete-diff inspection, and structured
  self-review.

### Milestone checkpoint

At the milestone boundary, the orchestrator runs the roadmap's full gate, writes
the final milestone evidence summary, and returns this resume prompt:

```text
Continue the Training Hub refactor from the next unaccepted task in
docs/engineering/refactor/ROADMAP.md.

Act as the milestone orchestrator described in
docs/engineering/refactor/ORCHESTRATION.md. Read accepted evidence files instead
of prior chats. Use one fresh builder per task, one writer at a time, and require
the WORKFLOW self-review before acceptance. Do not dispatch a per-task reviewer.
Progress autonomously through local ready tasks and stop at the next human,
independent-review, live-risk, or milestone gate.
```

The next orchestrator starts from repository state, not conversation memory.

## Escalation and cost control

1. Start with the model/reasoning level in the table; do not select the most
   expensive setting reflexively.
2. A Luna worker that cannot complete a frozen mechanical task hands back the
   first concrete blocker. Redispatch once to Terra medium; do not retry Luna
   repeatedly.
3. A Terra-medium builder escalates architecture/security ambiguity to the
   Terra-high orchestrator instead of expanding scope.
4. Use optional Sol high for a bounded hard decision or deferred high-risk
   review when available, not as the default implementation model.
5. Do not spawn an agent just to run a known command. The current builder or
   orchestrator runs it directly.
6. Do not add a reviewer because a builder returns long narration. Require the
   completion schema and reject unevidenced claims.
7. After each milestone, compare first-handoff acceptance, correction count,
   missed criteria, runtime, and available usage. Move a task class to Luna only
   after representative Terra work proves it is deterministic enough.

## Orchestrator launch prompt

Use this from a fresh Codex task after selecting Terra high (or Sol high when
available and justified):

```text
Orchestrate the Training Hub refactor through the next milestone.

Read AGENTS.md and docs/engineering/refactor/{README,WORKFLOW,ORCHESTRATION,ROADMAP}.md.
Use ROADMAP.md as canonical state. For each ready task, use one fresh-context
builder with the packet's model level. The builder commits each verified slice
directly to local main after the complete WORKFLOW self-review; no PR or feature
branch is required. Then perform the orchestrator acceptance check. Do not
dispatch a per-task reviewer. Keep one writer at a time, allow at most one
consolidated builder correction commit, record accepted evidence, and
automatically advance only under the progression policy. Never push or deploy
without explicit authority. Keep raw logs and builder narration out of the main
context. Stop at a human, independent-review, or live-risk gate, blocker, three
accepted implementation tasks, or the milestone.
```
