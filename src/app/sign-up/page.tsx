import { UserPlusIcon } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignupForm } from "@/components/signup-form";
import { isOpaqueInviteToken } from "@/lib/beta-invites";

export const metadata = { title: "Create account" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite } = await searchParams;
  const hasInvite = isOpaqueInviteToken(invite);
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <div className="mb-1 flex size-9 items-center justify-center rounded-lg bg-muted">
            <UserPlusIcon className="size-4.5 text-muted-foreground" />
          </div>
          <CardTitle as="h1">{hasInvite ? "Create your account" : "Private beta"}</CardTitle>
          <CardDescription>
            {hasInvite
              ? "Create your private training journal."
              : "This beta is invitation-only. Use the private registration link from your invitation."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasInvite ? (
            <SignupForm inviteToken={invite} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link
                className="focus-ring rounded-sm text-foreground underline underline-offset-4"
                href="/login"
              >
                Log in
              </Link>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
