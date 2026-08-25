import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";

// This client-only schema carries the opaque URL token to Better Auth's
// existing sign-up endpoint. The server ignores any client-supplied digest and
// creates its own validated betaInviteClaim in src/lib/auth.ts.
export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields({
      user: {
        inviteToken: { type: "string", required: true, returned: false },
      },
    }),
  ],
});
