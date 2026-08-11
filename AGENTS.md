<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:training-hub-agent-operating-system -->
# Training Hub agent operating rules

## Source of truth and work ownership

- The [GitHub Project](https://github.com/users/marcossnikel/projects/2) and its
  issues are the active delivery queue. `docs/product/` supplies product
  context; it does not replace issue status or acceptance criteria.
- Read the assigned GitHub issue, `docs/product/`, and relevant engineering
  docs before changing code. If they conflict, stop and record the conflict on
  the issue rather than choosing silently.
- One builder owns one issue, one isolated worktree, and one PR-sized change.
  Do not modify another active agent's worktree, branch, or uncommitted files.
- Builders may use fresh-context child agents only for bounded research,
  inspection, or independent review. Child agents must not spawn more agents
  and must never share a write scope with their builder.

## Required delivery loop

1. Confirm the issue is open, unblocked, sufficiently specified, and has a
   clean baseline branch. Product-facing issues must pass the Ready for Build
   gate in `docs/engineering/ORCHESTRATION.md` before implementation starts.
2. Create a short implementation plan with files/systems affected, data/auth
   impact, acceptance criteria, test plan, manual validation, and rollback or
   reset behavior.
3. Implement only the issue scope. Add or update tests with the change.
4. Run the required verification gate and all issue-specific checks. Inspect
   the result; do not report a command as passing unless it actually passed.
5. An independent reviewer checks the issue, diff, tests, and manual evidence.
   The builder fixes valid findings once, reruns the relevant checks, and
   returns the evidence.
6. Create a draft PR and update the issue/project only when the PR template is
   complete. The Orchestrator—not a child agent—accepts or rejects the result.

## Autonomous authority and stop conditions

Agents may read repository/GitHub state, make in-scope local changes in their
own worktree, run non-destructive checks, create branches/commits/draft PRs,
and update the assigned issue/project with evidence.

Stop and request direction instead of guessing when an action needs a new
account or credential, uses a production or shared database, changes a live
deployment, creates or changes live billing, sends external communications,
deletes material data, changes an accepted product decision, encounters an
unowned dirty worktree, or requires a merge that is not explicitly approved by
the repository's merge policy.

Never bypass certificate/TLS validation, disable tests, weaken checks, expose
secrets, or treat a passing type check as evidence that a feature works.

## Product and design guardrails

- Training Hub is personal training intelligence, not coaching, a medical
  product, or a generic AI chat interface. Insights must link to evidence.
- BYO Strava developer-app credentials are the beta connection path. Never
  default to the founder's credentials or claim this resolves platform-policy
  or commercial-approval questions.
- Product-facing changes require an executable design contract: user moment,
  hierarchy, exact interaction/state matrix, microinteraction and
  reduced-motion behavior, reference translation, responsive/accessibility
  check, and visual evidence in the PR. Reuse established primitives before
  adding a new visual pattern.
<!-- END:training-hub-agent-operating-system -->
