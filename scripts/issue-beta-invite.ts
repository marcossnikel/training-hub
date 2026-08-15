#!/usr/bin/env node

import {
  assertBetaInviteIssuanceTarget,
  buildPrivateInviteUrl,
  issueBetaInvite,
  revokeBetaInvite,
} from "../src/lib/beta-invites";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const email = argument("--email");
  const operator = argument("--operator");
  const revokeToken = argument("--revoke-token");
  if (!operator || (!email && !revokeToken) || (email && revokeToken))
    throw new Error(
      "Usage: npm run beta:invite -- --email <email> --operator <operator> | --revoke-token <token> --operator <operator>"
    );
  assertBetaInviteIssuanceTarget();
  if (revokeToken) {
    await revokeBetaInvite(revokeToken);
    console.log("Invitation revocation processed.");
    return;
  }
  const origin = process.env.TRAINING_HUB_PUBLIC_ORIGIN;
  if (!origin)
    throw new Error("TRAINING_HUB_PUBLIC_ORIGIN must name the approved isolated target.");
  const invite = await issueBetaInvite({ email, issuedBy: operator });
  // This is the sole plaintext-token output. Do not copy it to a file, issue,
  // log service, or product surface; share it privately once with the athlete.
  console.log(
    `Private registration URL (share once): ${buildPrivateInviteUrl(origin, invite.token)}`
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Invitation issuance failed.");
  process.exitCode = 1;
});
