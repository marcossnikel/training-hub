# Private beta invitations

Training Hub's first cohort is manual and invitation-only (D-014). A landing
page or hidden sign-up control is not an access boundary: Better Auth's
`/sign-up/email` endpoint validates a private token on the server before it can
create an account.

## Creator operations

An authenticated creator uses `/admin/invites` to issue an invitation for the
current deployment, inspect redacted status, copy the one-time link or ready
message, and revoke an unused invitation. The page and every server action
authorize the creator independently. Members and guests do not receive invite
data.

Issuance is deliberately presentation-only: the product does not send email,
WhatsApp, native share messages, or any other external communication. Copy the
immediate result into the chosen private channel once. Refreshes, later list
queries, logs, analytics, and storage cannot recover the plaintext token.

The current schema records optional `issued_by_user_id` provenance. The former
free-form `issued_by` operator field and the temporary CLI adapter were removed
by R13; historical migration packets retain their original rollout context.

## Production boundary

Production registration must first be enabled in the Vercel Production
environment and redeployed with these non-secret controls alongside the
existing production Turso credentials:

```text
BETA_INVITE_REGISTRATION_ENABLED=1
TRAINING_HUB_ENV=production
TRAINING_HUB_PRODUCTION_APPROVED=1
TRAINING_HUB_PRODUCTION_INVITES_ENABLED=1
TRAINING_HUB_PUBLIC_ORIGIN=https://your-production-origin.example
TRAINING_HUB_INVITE_PRODUCTION_ORIGIN=https://your-production-origin.example
```

There is no command-line issuance path and no remote operation is implied by
this document. Production enablement, deployment, and real invitations remain
explicit operator actions outside ordinary local task work.

## Security and lifecycle

- Tokens are 32 random bytes encoded as an opaque URL-safe value. Only a SHA-256
  digest is stored.
- The token is bound to one normalized email, has a seven-day default expiry,
  and an active token can be revoked idempotently by creator through its opaque
  invite ID. Creator operations are deployment-scoped and do not reveal athlete
  data.
- Better Auth's pre-sign-up hook validates the token and injects only its digest.
  A SQLite trigger consumes and binds the invitation during the same Better Auth
  user/account/session transaction, then clears the transient digest from the
  user row. Failed creation rolls the redemption back.
- Invalid, expired, revoked, redeemed, malformed, and mismatched attempts all
  return the same generic registration result. Existing users continue to use
  `/login`.
- The feature remains disabled until `BETA_INVITE_REGISTRATION_ENABLED=1` is
  deliberately set in the target environment. Production additionally requires
  `TRAINING_HUB_PRODUCTION_INVITES_ENABLED=1`.

There is no public invitation endpoint, self-service registration, or general
user administration. The creator UI receives a plaintext URL exactly once on a
successful issue result.
