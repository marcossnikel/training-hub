# R7 — Add creator invitation management UI

**Status:** draft
**Ready gate note:** a concrete Figma frame must be approved before Ready  
**Delivery class:** full stack
**Risk/model:** high — Terra medium after design approval
**Depends on:** R5 and R6
**Unlocks:** R8 and creator-operated beta access

## Outcome

From an authenticated creator account, Marcos can issue, inspect redacted
status, copy a ready-to-send invitation message or its newly generated link
once, and revoke an unused beta invitation for the current environment.

## Required context

- accepted invite-management Figma frame attached before Ready
- R4 environment-indicator contract and R6 invite interface
- design foundation/visual QA, current Header navigation and Settings patterns
- beta invite product/engineering docs and i18n conventions

## Current behavior and evidence

The CLI is the only issuance interface. The engineering doc explicitly forbids
an admin UI. No route/navigation/design exists for creator tools.

## Locked decisions

1. Route is `/admin/invites`; navigation label is “Creator tools” or exact
   approved localized copy, visible only to creator.
2. Page and every mutation independently call server creator authorization.
   Hidden navigation/proxy is not authorization.
3. The initial issue form contains one required field: intended email. The
   server applies R6's seven-day default expiry; an expiry picker is not part of
   this slice.
4. Successful issue shows one ephemeral result containing the bound email,
   exact expiry, full URL, and the localized ready-to-send message defined below.
   Refresh, navigation, and list queries cannot recover the URL or message.
5. The primary success action is `Copiar mensagem` / `Copy message`; the
   secondary action is `Copiar somente o link` / `Copy link only`. Both copy the
   exact immediate result, show accessible success/failure feedback, and provide
   selectable-text fallback if clipboard access fails.
6. List columns/cards show email, issued, expires, status, and allowed actions;
   they do not show token/hash, redeemed user, operator internals, or secrets.
7. Revoke addresses invite ID, requires active status, uses confirmation, and
   returns a generic idempotent result.
8. Message generation is presentation-only. There is no automatic email,
   WhatsApp, native share, or other external send integration.
9. Page prominently inherits the current creator environment indicator; issue
   confirmation names the environment, especially production.
10. Member/guest direct access uses the existing safe not-found/redirect policy
   selected in the packet before Ready; it must not reveal route data.
11. UI handles default, loading, empty, validation, error/retry, success-once,
    revoked/expired/redeemed, keyboard, focus, 1440/390, dark, and reduced motion.
12. The list is the current deployment's creator-managed invite pool, not only
    invites issued by the signed-in creator. Issuer provenance is not exposed
    unless a later accepted design adds it.

## Invitation message contract

The UI selects the template from the creator's current Training Hub language,
uses the normalized email and exact persisted expiry returned by R6, and formats
the expiry in that locale with an unambiguous date and timezone. The preview is
read-only; Marcos can edit after pasting it into his chosen messaging tool.

Portuguese:

```text
Você foi convidado para o beta privado do Training Hub.

Crie sua conta usando este link:
{inviteUrl}

Este convite é exclusivo para {intendedEmail}, pode ser usado uma vez e expira em {localizedExpiresAt}.

Durante o beta privado, você conectará sua própria conta e seu próprio aplicativo de desenvolvedor do Strava.
```

English:

```text
You've been invited to the Training Hub private beta.

Create your account using this link:
{inviteUrl}

This invitation is only for {intendedEmail}, can be used once, and expires on {localizedExpiresAt}.

During the private beta, you'll connect your own Strava account and developer app.
```

The implementation may move these strings into the existing i18n dictionaries,
but it must preserve their meaning, paragraph breaks, single-use/email/expiry
facts, and BYO Strava beta boundary. The message contains no creator identity,
environment name, internal invite ID, token hash, or unsupported product claim.

## Protected invariants

- link/token is never in URL query, persistent client storage, analytics, toast
  history, list payload, screenshot artifact, or logs;
- generated message has the same one-time lifetime and secrecy boundary as the
  link it contains;
- double submit creates at most one user-visible result per completed action;
- session expiry returns safe login recovery without retaining form secret data;
- member/guest cannot infer invite statuses;
- invite issuance remains manual/private beta.

## Permitted scope

- approved `/admin/invites` page, creator navigation, feature UI components;
- server action/route adapter around R6 interface;
- focused component/action/E2E tests and updated invite docs.

## Non-goals

- user administration, role editing, invite email delivery, bulk invites;
- public waitlist/signup CTA;
- environment switching;
- production migration/deployment or real invite issuance.

## Implementation sequence

1. Planner supplies approved Figma frame, exact copy, safe denial behavior, and
   expiry control. Completion: task may be marked ready.
2. Add server-authorized route and redacted loading/empty list. Completion:
   member/guest fail before list query.
3. Add the email-only issue form/action and immediate one-time result.
   Completion: result uses the normalized email/persisted expiry; refresh and
   navigation remove the URL/message and list cannot recover either.
4. Render the localized read-only message and both copy actions. Completion:
   message copy includes the exact URL and required facts; link-only copy
   contains only the URL; clipboard failure exposes keyboard-selectable fallback
   without persistent storage.
5. Add revoke confirmation/action and status refresh. Completion: repeat revoke
   is safe and generic.
6. Add creator nav in approved desktop/mobile positions. Completion: member
   shell geometry remains correct with item absent.
7. Verify redaction and capture screenshots with synthetic URL replaced/covered;
   never save a usable token in an artifact.

## Required automated proof

- one focused `src/features/invites/invite-management.integration.test.ts`
  exercises the server action through R6 with disposable SQLite/auth: creator
  success and member/guest/session-expiry denial before work;
- single-result/double-submit behavior;
- exact Portuguese/English message interpolation from normalized email, persisted
  expiry, current locale, and immediate URL;
- message-copy versus link-only clipboard payload, success/failure feedback, and
  keyboard-selectable fallback;
- refresh/navigation/list cannot recover the URL or generated message;
- list redaction serialization;
- revoke active/expired/redeemed/replayed/unknown behavior;
- component accessibility/focus tests;
- E2E creator flow plus member direct-route denial using disposable DB.

```sh
npx vitest run src/features/invites/invites.integration.test.ts src/features/invites/invite-management.integration.test.ts
npx playwright test e2e/beta-invite.spec.ts e2e/tenant-isolation.spec.ts
```

Do not run the full repository gate. The builder first makes the focused
integration command green, then starts the disposable app and iterates the real
browser story until the named Playwright specs and direct 1440/390 inspection
match the approved contract.

## Required manual or visual proof

Approved 1440/390 frames and implementation captures for empty, list, issue
success with read-only message and both copy actions (using a non-usable redacted
placeholder in stored evidence), clipboard failure, validation error, revoke
confirmation/result, mobile nav, dark, and reduced motion.

## Migration, rollout, and rollback

Uses R6 schema. Keep CLI during initial rollout as a named compatibility adapter.
After UI and production behavior are separately verified, R13 decides removal.
Rollback removes UI/routes/nav while CLI remains available; added invite data is
retained.

## Stop conditions

- approved Figma frame, exact copy, or safe denial behavior still requires a
  Marcos decision;
- preserving R6's accepted token boundary would require a product/security
  contract change; or
- live invite/deployment access is required.

Clipboard API behavior, focus/responsive defects, test fixture failures,
token-lifetime implementation bugs, double-submit bugs, and all other
recoverable local findings are owned and fixed by the builder inside this task.
The builder does not add the broad Better Auth admin plugin.

## Completion criteria

- Creator can enter an email and issue/list/revoke in disposable E2E.
- Immediate success can copy the exact localized message or only the link; both
  disappear permanently after leaving/refreshing the result.
- Member/guest direct access and mutations are denied server-side.
- Every specified state is implemented and visually proven.
- No stored evidence or later payload contains usable token material.
- CLI expiry remains explicit.
- Both named focused commands pass using disposable data and the real browser.
