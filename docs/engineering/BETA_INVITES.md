# Private beta invitations

Training Hub's first cohort is manual and invitation-only (D-014). A landing
page or hidden sign-up control is not an access boundary: Better Auth's
`/sign-up/email` endpoint validates a private token on the server before it can
create an account.

## Local issuance only

The only issuance interface is the local operator command:

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

To revoke an unused link, run the same guarded local command with its private
token: `npm run beta:invite -- --revoke-token <token> --operator your-operator-id`.
It intentionally reports no existence or redemption detail.

The command fails closed unless its named target is `local` or `preview`, that
target matches `TRAINING_HUB_ENV`, `TRAINING_HUB_DISPOSABLE_DATA=1` is explicit,
and the database boundary is isolated. Local issuance refuses any Turso
credential or non-`file:` database and only emits a direct loopback
`TRAINING_HUB_PUBLIC_ORIGIN` (`localhost`, `127.0.0.1`, or `[::1]`). Preview
issuance requires a disposable preview-labelled remote database,
`VERCEL_ENV=preview`, and an exact HTTPS match between
`TRAINING_HUB_PUBLIC_ORIGIN` and the separately approved
`TRAINING_HUB_INVITE_PREVIEW_ORIGIN`; the known production canonical origin is
explicitly refused. This is not an authorization to deploy, create a remote
database, or issue a production invite.

## Security and lifecycle

- Tokens are 32 random bytes encoded as an opaque URL-safe value. Only a SHA-256
  digest is stored.
- The token is bound to one normalized email, has a seven-day default expiry,
  and an unused token can be revoked only through the same guarded local
  operator command.
- Better Auth's pre-sign-up hook validates the token and injects only its digest.
  A SQLite trigger consumes and binds the invitation during the same Better Auth
  user/account/session transaction, then clears the transient digest from the
  user row. Failed creation rolls the redemption back.
- Invalid, expired, revoked, redeemed, malformed, and mismatched attempts all
  return the same generic registration result. Existing users continue to use
  `/login`.
- The feature remains disabled until `BETA_INVITE_REGISTRATION_ENABLED=1` is
  deliberately set in an approved isolated environment. When disabled, new
  registration fails server-side rather than falling back to self-service.

No HTTP route, server action, client API, public interface, or admin UI may
issue, list, reveal, revoke, or manage invitations. A production rollout,
production schema change, remote reset, or live invitation issuance requires a
separate reviewed issue and explicit execution authority.
