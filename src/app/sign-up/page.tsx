import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { SignupForm } from "@/components/signup-form";
import { firstAuthContinuation } from "@/features/access/auth-journey";
import { requireCurrentUser } from "@/lib/auth";
import { isOpaqueInviteToken } from "@/lib/beta-invites";
import { getDict } from "@/lib/lang";

export const metadata = { title: "Create account" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string | string[] }>;
}) {
  if (await requireCurrentUser()) redirect("/");
  const params = await searchParams;
  const invite = typeof params.invite === "string" ? params.invite : undefined;
  if (params.invite !== undefined && !isOpaqueInviteToken(invite)) redirect("/sign-up");
  const hasInvite = isOpaqueInviteToken(invite);
  const { t } = await getDict();

  return (
    <AuthShell
      mode="sign-up"
      invited={hasInvite}
      title={hasInvite ? t.authEntry.signUpTitle : t.authEntry.unavailableTitle}
      description={hasInvite ? t.authEntry.signUpDescription : t.authEntry.unavailableDescription}
    >
      {hasInvite ? (
        <SignupForm inviteToken={invite} continuationHref={firstAuthContinuation()} />
      ) : (
        <div className="rounded-xl border bg-card p-5 text-sm leading-6 text-muted-foreground">
          <p>{t.authEntry.alreadyHaveAccount}</p>
          <Link
            className="focus-ring mt-3 inline-flex min-h-11 items-center rounded-full border px-4 font-medium text-foreground underline-offset-4 hover:bg-muted hover:underline"
            href="/login"
          >
            {t.authEntry.signInInstead}
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
