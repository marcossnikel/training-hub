# Private beta invitations

Training Hub's first cohort is manual and invitation-only (D-014). A landing
page or hidden sign-up control is not an access boundary: Better Auth's
`/sign-up/email` endpoint validates a private token on the server before it can
create an account.

## Temporary operator adapter

R6 introduces the authenticated creator-owned invitation module that R7 will
present in the product. Until its UI is delivered, this guarded CLI is a
temporary second adapter and expires in R13. It uses the same persistence and
token policy; it never duplicates invitation SQL. For a local account, use:

```sh
TRAINING_HUB_ENV=local \
TRAINING_HUB_INVITE_TARGET=local \
TRAINING_HUB_DISPOSABLE_DATA=1 \
BETA_INVITE_REGISTRATION_ENABLED=1 \
DATABASE_URL=file:data/app.db \
TRAINING_HUB_PUBLIC_ORIGIN=http://localhost:3000 \
npm run beta:invite -- --email athlete@example.test --operator your-operator-id
```

It prints one private registration URL. Share it out of band once. Do not put
the URL or its token in an issue, commit, document, chat transcript, browser
storage, analytics system, or log.

### Production Turso

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

With `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` already exported privately in
the operator shell, issue an invitation into that same production database:

```sh
TRAINING_HUB_ENV=production \
VERCEL_ENV=production \
TRAINING_HUB_INVITE_TARGET=production \
TRAINING_HUB_PRODUCTION_APPROVED=1 \
TRAINING_HUB_PRODUCTION_INVITES_ENABLED=1 \
BETA_INVITE_REGISTRATION_ENABLED=1 \
TRAINING_HUB_PUBLIC_ORIGIN=https://your-production-origin.example \
TRAINING_HUB_INVITE_PRODUCTION_ORIGIN=https://your-production-origin.example \
npm run beta:invite -- --email athlete@example.com --operator your-operator-id
```

The command fails before writing unless it sees an HTTPS origin match, Vercel
production metadata, both production approval switches, a non-preview remote
Turso URL, a Turso auth token, and no disposable-data marker. It never prints
either Turso credential.

To revoke an unused link, use its opaque database ID from an authenticated
creator summary, never its plaintext token:
`npm run beta:invite -- --revoke-id <invite-id> --operator your-operator-id`.
It intentionally reports no existence or redemption detail.

The command fails closed unless its named target matches `TRAINING_HUB_ENV`.
Local issuance refuses any Turso credential or non-`file:` database and only
emits a direct loopback `TRAINING_HUB_PUBLIC_ORIGIN` (`localhost`, `127.0.0.1`,
or `[::1]`). Preview issuance requires a disposable preview-labelled remote database,
`VERCEL_ENV=preview`, and an exact HTTPS match between
`TRAINING_HUB_PUBLIC_ORIGIN` and the separately approved
`TRAINING_HUB_INVITE_PREVIEW_ORIGIN`; the known production canonical origin is
explicitly refused. Production uses the separate approval boundary above and
must never use `TRAINING_HUB_DISPOSABLE_DATA=1`.

## Security and lifecycle

- Tokens are 32 random bytes encoded as an opaque URL-safe value. Only a SHA-256
  digest is stored.
- The token is bound to one normalized email, has a seven-day default expiry,
  and an active token can be revoked idempotently by an authenticated creator
  using its opaque invite ID. Creator operations are deployment-scoped and do
  not reveal athlete data; issuance provenance is recorded separately.
- Better Auth's pre-sign-up hook validates the token and injects only its digest.
  A SQLite trigger consumes and binds the invitation during the same Better Auth
  user/account/session transaction, then clears the transient digest from the
  user row. Failed creation rolls the redemption back.
- Invalid, expired, revoked, redeemed, malformed, and mismatched attempts all
  return the same generic registration result. Existing users continue to use
  `/login`.
- The feature remains disabled until `BETA_INVITE_REGISTRATION_ENABLED=1` is
  deliberately set in the target environment. Production additionally requires
  `TRAINING_HUB_PRODUCTION_INVITES_ENABLED=1`. When disabled, new registration
  fails server-side rather than falling back to self-service.

There is no public invitation endpoint, self-service registration, or general
user administration. The future creator UI may issue, list redacted summaries,
and revoke by opaque ID only; it receives a plaintext URL exactly once on a
successful issue result. The temporary CLI remains guarded, and remote resets
remain prohibited.
