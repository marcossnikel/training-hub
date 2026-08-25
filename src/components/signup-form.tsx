import { AuthForm } from "./auth-form";

export function SignupForm({
  inviteToken,
  continuationHref,
}: {
  inviteToken: string;
  continuationHref: string;
}) {
  return <AuthForm mode="sign-up" inviteToken={inviteToken} continuationHref={continuationHref} />;
}
