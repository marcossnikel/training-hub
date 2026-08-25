"use server";

import { revalidatePath } from "next/cache";
import {
  InviteAuthorizationError,
  issueInvitation,
  listInvitationSummaries,
  revokeInvitation,
} from "./server";

export type InviteActionResult =
  | {
      ok: true;
      invitations: Awaited<ReturnType<typeof listInvitationSummaries>>;
      issued?: Awaited<ReturnType<typeof issueInvitation>>;
    }
  | { ok: false; reason: "access" | "validation" | "unavailable" };

function failure(error: unknown): InviteActionResult {
  if (error instanceof InviteAuthorizationError) return { ok: false, reason: "access" };
  if (error instanceof Error && error.message === "A valid invitation email is required.")
    return { ok: false, reason: "validation" };
  return { ok: false, reason: "unavailable" };
}

/** Each mutation authorizes again through the R6 interface; rendered UI is never the boundary. */
export async function issueInviteAction(email: string): Promise<InviteActionResult> {
  try {
    const issued = await issueInvitation({ email });
    const invitations = await listInvitationSummaries();
    revalidatePath("/admin/invites");
    return { ok: true, issued, invitations };
  } catch (error) {
    return failure(error);
  }
}

export async function revokeInviteAction(id: string): Promise<InviteActionResult> {
  try {
    await revokeInvitation(id);
    const invitations = await listInvitationSummaries();
    revalidatePath("/admin/invites");
    return { ok: true, invitations };
  } catch (error) {
    return failure(error);
  }
}
