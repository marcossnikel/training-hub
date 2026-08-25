#!/usr/bin/env node

import {
  assertBetaInviteIssuanceTarget,
  buildPrivateInviteUrl,
  issueBetaInvite,
  revokeBetaInviteById,
} from "../src/lib/beta-invites";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const email = argument("--email");
  const operator = argument("--operator");
  const revokeId = argument("--revoke-id");
  if (!operator || (!email && !revokeId) || (email && revokeId))
    throw new Error(
      "Usage: npm run beta:invite -- --email <email> --operator <operator> | --revoke-id <invite-id> --operator <operator>"
    );
  const origin = assertBetaInviteIssuanceTarget();
  if (revokeId) {
    await revokeBetaInviteById(revokeId);
    console.log("Invitation revocation processed.");
    return;
  }
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
