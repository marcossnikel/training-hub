import { notFound } from "next/navigation";
import { InviteManagement } from "@/features/invites/invite-management";
import { listInvitationSummaries } from "@/features/invites/server";
import { requireCreator, resolveEnvironmentIndicator } from "@/features/access/server";

export const metadata = { title: "Creator tools" };

export default async function InviteManagementPage() {
  const creator = await requireCreator();
  if (!creator) notFound();
  const [invitations, environment] = await Promise.all([
    listInvitationSummaries(),
    resolveEnvironmentIndicator(),
  ]);
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:py-10">
      <header className="max-w-3xl">
        <p className="font-mono text-xs text-muted-foreground uppercase">Creator tools</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-[2.5rem] sm:leading-[2.75rem]">
          Private beta invitations
        </h1>
        <p className="mt-3 text-base leading-7 text-muted-foreground">
          Issue and manage private beta access for this deployment. Each link is bound to its
          intended email and can be used once.
        </p>
      </header>
      <InviteManagement
        initialInvitations={invitations}
        environment={environment?.label ?? "CURRENT"}
      />
    </div>
  );
}
