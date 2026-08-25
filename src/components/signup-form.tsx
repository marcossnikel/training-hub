import { AuthForm } from "./auth-form";

export function SignupForm({ inviteToken }: { inviteToken: string }) {
  return <AuthForm mode="sign-up" inviteToken={inviteToken} />;
}
