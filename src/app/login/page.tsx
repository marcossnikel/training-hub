import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/login-form";
import { signInContinuation } from "@/features/access/auth-journey";
import { requireCurrentUser } from "@/lib/auth";
import { getDict } from "@/lib/lang";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await requireCurrentUser()) redirect("/");
  const params = await searchParams;
  const { t } = await getDict();

  return (
    <AuthShell
      mode="sign-in"
      title={t.authEntry.signInTitle}
      description={t.authEntry.signInDescription}
    >
      <LoginForm continuationHref={signInContinuation(params.next)} />
    </AuthShell>
  );
}
