# Issue 22 authentication validation record

This record is intentionally local-only. It uses the isolated Playwright DB and
the disposable auth accounts created by `e2e/auth.setup.ts`; it never needs a
mail sender, remote database, or shared credentials.

## Automated proof

Run `npm run test:e2e -- --project=chromium-guest`. The suite proves the
desktop form has labelled email/password controls, invalid credentials produce
an alert and no session cookie, sign-up produces an HttpOnly session, and sign
out returns to `/login`. `src/lib/actions.auth.test.ts` separately proves that
migration 16 creates the application auth tables and that a previously valid
cookie is rejected by a fresh Better Auth request after its database session
row is deleted.

## Manual visual and interaction proof

Start a disposable server only (do not reuse a running development server):

```sh
DATABASE_URL=file:data/e2e.db BETTER_AUTH_SECRET=visual-proof-secret-with-at-least-32-chars BETTER_AUTH_URL=http://localhost:3101 npm run dev -- --port 3101
```

Capture the packet viewports in another terminal:

```sh
npx playwright screenshot --viewport-size='1440,900' http://localhost:3101/login evidence/issue-22/login-desktop.png
npx playwright screenshot --viewport-size='390,844' http://localhost:3101/sign-up evidence/issue-22/signup-mobile.png
```

At each viewport, verify these observable states before accepting a change:

| State | Reproduction and expected result |
| --- | --- |
| Keyboard focus | On `/login`, focus Email and press Tab: Password, then Log in, then Create an account receive a visible focus ring in that order. Shift+Tab reverses it. |
| Invalid/error | Submit a nonexistent email with any password. The inline `role=alert` is announced, focus remains in the form, the URL stays `/login`, and no session cookie is created. The error is generic and does not claim whether the email exists. |
| Pending/disabled | In browser DevTools, throttle the sign-in request, submit valid-looking credentials, and confirm the submit button is disabled and reads `Working…` until the response settles. |
| Reduced motion | Enable `prefers-reduced-motion: reduce` in DevTools rendering emulation, repeat focus and submit. Auth state changes remain static—there is no required motion or animation to understand the result. |

The committed captures show the default desktop sign-in and narrow sign-up
states. The forms use native labels, `aria-live` feedback, disabled pending
controls, and static state changes, so the same contract holds without motion.
