import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/login-form";
import { getDict } from "@/lib/lang";

export const metadata = { title: "Log in" };

export default async function LoginPage() {
  const { t } = await getDict();

  return (
    <AuthShell
      mode="sign-in"
      title={t.authEntry.signInTitle}
      description={t.authEntry.signInDescription}
    >
      <LoginForm />
    </AuthShell>
  );
}
