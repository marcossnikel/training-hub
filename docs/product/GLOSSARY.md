# Product glossary

## Application user

The local `users` record that bridges one validated Better Auth subject to the
application's owner key. Product data is always scoped by this record's `id`,
not by email, request input, or an authentication-provider subject.

## Member

The safe default application role. A member may access only their own training
data and has no operational capability.

## Creator

An application user granted a named operational capability in one environment.
Creator is not a tenant superuser: it does not change `OwnerContext`, permit
cross-owner activities, gear, notes, blobs, Strava data, or connection state,
and does not imply user administration. Current capabilities are
`viewOperationalEnvironment` and `manageBetaInvites` only.

Creator grants are stored on the local application user per environment. The
guarded local bootstrap command identifies an existing account by email only to
make that initial grant; normal authorization always uses the validated session,
local user ID, and stored role.
