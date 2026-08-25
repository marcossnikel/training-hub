<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:training-hub-agent-operating-system -->
# Training Hub pre-production delivery rules

## Stage and priority

- Training Hub is pre-production with Marcos as the initial user. Optimize for
  working, user-visible product slices and short feedback loops.
- The user's current request, the existing product behavior, and the selected
  Figma frames are the delivery source of truth. Consult `docs/product/` and
  relevant engineering docs for constraints; GitHub issues and the Project are
  optional tracking tools, not implementation gates.
- Preserve existing capabilities and data/security behavior. Do not turn
  unrelated warnings or flaky checks into side projects unless they repeatedly
  block the current slice.

## Working loop

1. Inspect the relevant code, current behavior, git state, and design context.
   Preserve unrelated local changes.
2. For a multi-file change, state a compact plan and begin implementation. Ask
   only when a missing decision would materially change the product or create
   external risk.
3. Deliver the smallest complete vertical slice, including its important
   loading, empty, error, keyboard, focus, responsive, and reduced-motion
   behavior.
4. Verify in proportion to risk, inspect the result, and report only checks
   that actually passed.
5. Keep commits small and coherent. Direct commits and merges to `main` are
   allowed during this pre-production phase. Pull requests, issue handoffs,
   builder/reviewer roles, and independent review are optional unless the user
   explicitly requests them.

Work as one implementation stream. Use subagents, separate worktrees, or
formal reviews only when the user asks or when isolation is technically
necessary to protect overlapping local work.

## Verification contract

Every queued task declares exactly one delivery class. Its minimum proof is:

- **API/backend:** focused integration tests at the changed boundary, using a
  disposable database or local provider double when applicable.
- **Full stack:** focused integration tests plus iteration in a real browser at
  the relevant desktop and mobile widths.
- **Frontend:** iteration in a real browser at the relevant desktop and mobile
  widths, including the states and interactions named by the task.
- **Documentation/plan:** link/reference inspection and diff checks; no runtime
  suite is required unless the document changes executable configuration.

Run `npm run verify` only when the task explicitly requires it or at a
release-critical milestone. It is not the default proof for every slice.
- A newly observed failure gets one focused confirmation. Diagnose it now only
  when it reproduces and blocks the active work; otherwise record it and keep
  shipping the requested product.
- Repeated stress runs, CI-pass streaks, dedicated stabilization issues, and
  protocol-level test harnesses are reserved for release-critical risks or an
  explicit user request.
- Auth, tenant isolation, privacy, destructive data changes, migrations,
  deterministic insight logic, and production/external effects receive the
  stronger focused regression coverage their risk warrants.
- Never disable or weaken a relevant check, bypass TLS, expose secrets, or use
  a passing type check as the sole evidence that a feature works.

## Autonomous authority and stop conditions

Agents may make in-scope local changes, create commits, and merge directly to
`main`. Pushing, deploying, or changing live/shared services still requires
explicit authorization.

Agents resolve routine local and recoverable blockers inside the assigned task:
fix attributable failures, update compatible call sites, add missing focused
fixtures, and rerun the required proof. Do not create a blocker merely because
the first implementation attempt or validation failed.

Stop and request direction instead of guessing when an action needs a new
account or credential, uses a production or shared database, changes a live
deployment, creates or changes live billing, sends external communications,
deletes material data, changes an accepted product decision, encounters an
unowned dirty change that overlaps the required edit, or creates a security or
privacy ambiguity.

## Task invocation

`Realize Rxx` is sufficient authorization for one queued task whose dependencies
are done. Read this file and the named packet, refresh stale file/test facts from
the current checkout inside the same session, implement the complete outcome,
run its delivery-class proof, self-inspect the diff, mark it done, update the
roadmap's next task, and commit attributable files directly to local `main`.
Local packet drift is implementation work, not a separate planning gate. Do not
start another task, reviewer, subagent, push, or deployment unless the request
explicitly adds that authority.

## Product and design guardrails

- Training Hub is personal training intelligence, not coaching, a medical
  product, or a generic AI chat interface. Insights must link to evidence.
- BYO Strava developer-app credentials are the beta connection path. Never
  default to the founder's credentials or claim this resolves platform-policy
  or commercial-approval questions.
- Insights retain their sources, dates, windows, metrics, and limitations.
- Use the approved Figma proposal as the visual and interaction contract for
  the redesign. Reuse established primitives, validate at 1440px and 390px,
  and implement the new landing page after the shipped authenticated surfaces.
<!-- END:training-hub-agent-operating-system -->
