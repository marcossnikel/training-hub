# Training Hub refactor program

This folder is the durable implementation plan for making Training Hub easier
to understand, test, change, and operate without weakening its product, data,
or environment contracts.

It is written for fresh-context implementation agents. The chat that produced
the plan is not required context.

## Reading routes

- **Planning or sequencing work:** read `AGENTS.md`, [WORKFLOW.md](WORKFLOW.md),
  [ORCHESTRATION.md](ORCHESTRATION.md), and [ROADMAP.md](ROADMAP.md).
- **Running a milestone with one builder at a time:** select the orchestrator
  model from [ORCHESTRATION.md](ORCHESTRATION.md) and use its launch prompt.
- **Implementing one task:** read `AGENTS.md`, [WORKFLOW.md](WORKFLOW.md), and
  only the assigned file under `tasks/` plus the sources it names.
- **Preparing a new task packet:** copy [TASK_TEMPLATE.md](TASK_TEMPLATE.md),
  resolve every decision marked by the template, then add it to
  [ROADMAP.md](ROADMAP.md).
- **Running a deferred review session:** use the bounded commit-range workflow
  in [ORCHESTRATION.md](ORCHESTRATION.md); review packets, evidence, and commits,
  not the builders' prior chats.

## Program outcome

The program is complete when:

1. a developer can identify the owning feature and entry point for a change
   without searching unrelated technical layers;
2. local development, disposable E2E, local production-mode verification,
   preview, and production have explicit, testable configuration semantics;
3. tests exercise stable module interfaces, real disposable SQLite, and local
   external-provider doubles instead of mocking implementation chains;
4. application routes and server actions are thin framework entry points;
5. creator-only operational behavior is server-authorized without granting
   access to another athlete's data;
6. initial Strava history bypasses Review while activities after the persisted
   connection cutoff enter Review;
7. dead code, stale compatibility exports, obsolete scripts, and contradictory
   documents have either been removed or have a named current owner; and
8. the complete verification gate passes without remote database or real
   provider access.

## Invocation prompt

Use this compact prompt with a fresh implementation model:

```text
Work only on refactor task <TASK_ID> in
docs/engineering/refactor/tasks/<TASK_FILE>.

Read AGENTS.md, docs/engineering/refactor/WORKFLOW.md, and the task file before
editing. Treat the task's locked decisions, non-goals, stop conditions, and
completion criteria as authoritative. Preserve unrelated working-tree changes.
After the required proof and WORKFLOW self-review are green, commit only the
permitted-scope files directly to local main and return the commit SHA with the
completion record. Do not push or deploy.
```

Do not ask a builder to “continue the refactor” or provide only a phase name.
The task file is the unit of work.

For autonomous multi-task progression, use the milestone orchestrator launch
prompt in [ORCHESTRATION.md](ORCHESTRATION.md), not the single-builder prompt
above.
