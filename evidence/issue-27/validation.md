# #27 local tenant-isolation proof

Captured on the disposable Playwright database only. No preview, shared database,
credential, or Strava request was used.

Run the explicit capture command:

```bash
CAPTURE_TENANT_ISOLATION_EVIDENCE=1 npm run test:e2e -- e2e/tenant-isolation.spec.ts
```

- `27-owner-a-gear-1440.png`: authenticated owner A at desktop width. The
  assertion immediately before capture proves the unique owner-B shoe is absent.
- `27-owner-b-settings-390.png`: authenticated owner B at 390px after real
  sign-up, shoe creation, and manual-entry creation. The focused E2E assertion
  proves no horizontal overflow and that the server can decrypt B's inert,
  owner-bound test connection without rendering its plaintext, envelopes, or key.

The same test records the exact denials: owner A receives an empty activity
not-found boundary for B's activity, B's private photo is 200 only for B and 404
for A, the captured B `Next-Action` shoe-retirement request returns `Shoe not
found` when replayed with A's session, guest upload/connect redirect to login,
and guest callback is 401. Normal test runs emit no committed artifacts; images
are refreshed only by the explicit command above.
