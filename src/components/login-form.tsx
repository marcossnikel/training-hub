import { AuthForm } from "./auth-form";

export function LoginForm({ continuationHref }: { continuationHref: string }) {
  return <AuthForm mode="sign-in" continuationHref={continuationHref} />;
}
