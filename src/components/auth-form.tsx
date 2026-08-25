"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { LogInIcon, UserPlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

const GENERIC_SIGN_IN_ERROR = "We couldn't sign you in with those details.";
const GENERIC_SIGN_UP_ERROR = "We couldn't create that account. Try another email or sign in.";

export function AuthForm({
  mode,
  inviteToken,
}: {
  mode: "sign-in" | "sign-up";
  inviteToken?: string;
}) {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const signUp = mode === "sign-up";

  // Keep the one-time token only in component memory while the athlete fills
  // this form. It is removed from the address bar before any retry or success
  // navigation and is never written to storage.
  useEffect(() => {
    if (!signUp || !inviteToken) return;
    window.history.replaceState(null, "", window.location.pathname);
  }, [inviteToken, signUp]);

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const email = String(formData.get("email") ?? "");
      const password = String(formData.get("password") ?? "");
      const result = signUp
        ? await authClient.signUp.email({
            name: String(formData.get("name") ?? ""),
            email,
            password,
            inviteToken: inviteToken ?? "",
          })
        : await authClient.signIn.email({ email, password });

      if (result.error) {
        setError(signUp ? GENERIC_SIGN_UP_ERROR : GENERIC_SIGN_IN_ERROR);
        return;
      }
      const next = searchParams.get("next");
      window.location.assign(next?.startsWith("/") && !next.startsWith("//") ? next : "/");
    });
  }

  return (
    <form
      action={submit}
      className="space-y-4"
      aria-describedby={error ? "auth-status" : undefined}
    >
      {signUp ? (
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" autoComplete="name" required minLength={2} />
        </div>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" autoFocus required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={signUp ? "new-password" : "current-password"}
          required
          minLength={8}
        />
      </div>
      <p
        id="auth-status"
        aria-live="polite"
        role={error ? "alert" : undefined}
        className={error ? "text-sm text-destructive" : "sr-only"}
      >
        {error ?? (pending ? "Working…" : "")}
      </p>
      <Button type="submit" disabled={pending} className="w-full">
        {signUp ? (
          <UserPlusIcon data-icon="inline-start" />
        ) : (
          <LogInIcon data-icon="inline-start" />
        )}
        {pending ? "Working…" : signUp ? "Create account" : "Log in"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {signUp ? "Already have an account? " : "New to Training Hub? "}
        <Link
          className="focus-ring rounded-sm text-foreground underline underline-offset-4"
          href={signUp ? "/login" : "/sign-up"}
        >
          {signUp ? "Log in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}
