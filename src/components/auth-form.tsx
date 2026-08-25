"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/components/i18n-provider";
import { authClient } from "@/lib/auth-client";

export function AuthForm({
  mode,
  inviteToken,
  continuationHref,
}: {
  mode: "sign-in" | "sign-up";
  inviteToken?: string;
  /** Resolved by the server page; signup never accepts browser-selected destinations. */
  continuationHref: string;
}) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, startTransition] = useTransition();
  const submittingRef = useRef(false);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const signUp = mode === "sign-up";

  // Keep the one-time token only in component memory while the athlete fills
  // this form. It is removed from the address bar before any retry or success
  // navigation and is never written to storage.
  useEffect(() => {
    if (!signUp || !inviteToken) return;
    window.history.replaceState(null, "", window.location.pathname);
  }, [inviteToken, signUp]);

  useEffect(() => {
    if (error) statusRef.current?.focus();
  }, [error]);

  function submit(formData: FormData) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    startTransition(async () => {
      try {
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
          setError(signUp ? t.authEntry.signUpError : t.authEntry.signInError);
          return;
        }
        window.location.assign(continuationHref);
      } catch {
        setError(signUp ? t.authEntry.signUpError : t.authEntry.signInError);
      } finally {
        submittingRef.current = false;
      }
    });
  }

  const pendingText = signUp ? t.authEntry.creatingAccount : t.authEntry.signingIn;
  const submitText = signUp ? t.authEntry.createAccount : t.authEntry.signIn;

  return (
    <form action={submit} className="max-w-[27.5rem] space-y-5" aria-describedby="auth-status">
      {signUp ? (
        <div className="space-y-1.5">
          <Label id="invitation-label" className="text-xs tracking-wide text-muted-foreground">
            {t.authEntry.invitation}
          </Label>
          <div
            aria-labelledby="invitation-label"
            aria-describedby="invitation-hint"
            className="flex min-h-12 items-center rounded-lg border border-input bg-background px-3 text-base"
          >
            {t.authEntry.invitationReady}
          </div>
          <p
            id="invitation-hint"
            className="font-mono text-xs leading-[1.125rem] text-muted-foreground"
          >
            {t.authEntry.invitationHint}
          </p>
        </div>
      ) : null}
      {signUp ? (
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-xs tracking-wide text-muted-foreground">
            {t.authEntry.name}
          </Label>
          <Input
            id="name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            required
            minLength={2}
            autoFocus
            className="h-12 px-3 text-base md:text-base"
          />
        </div>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-xs tracking-wide text-muted-foreground">
          {t.authEntry.email}
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          autoFocus={!signUp}
          required
          placeholder={t.authEntry.emailPlaceholder}
          aria-describedby={signUp ? "invite-email-hint" : undefined}
          className="h-12 px-3 text-base md:text-base"
        />
        {signUp ? (
          <p
            id="invite-email-hint"
            className="font-mono text-xs leading-[1.125rem] text-muted-foreground"
          >
            {t.authEntry.inviteEmailHint}
          </p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password" className="text-xs tracking-wide text-muted-foreground">
          {t.authEntry.password}
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={signUp ? "new-password" : "current-password"}
          required
          minLength={8}
          aria-describedby="password-hint"
          className="h-12 px-3 text-base md:text-base"
        />
        <p
          id="password-hint"
          className="font-mono text-xs leading-[1.125rem] text-muted-foreground"
        >
          {signUp ? t.authEntry.passwordReuse : t.authEntry.passwordMinimum}
        </p>
      </div>
      <p
        id="auth-status"
        ref={statusRef}
        tabIndex={error ? -1 : undefined}
        aria-live="polite"
        role={error ? "alert" : undefined}
        className={
          error
            ? "rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive outline-none"
            : "sr-only"
        }
      >
        {error ?? (pending ? pendingText : "")}
      </p>
      <Button
        type="submit"
        disabled={pending}
        className="h-12 rounded-full px-5 text-base disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
      >
        {pending ? pendingText : submitText}
      </Button>
      <p className="text-sm leading-6 text-muted-foreground">
        {signUp ? (
          <>
            {t.authEntry.alreadyHaveAccount}{" "}
            <Link
              className="focus-ring rounded-sm font-medium text-foreground underline underline-offset-4"
              href="/login"
            >
              {t.authEntry.signInInstead}
            </Link>
          </>
        ) : (
          t.authEntry.signInInviteBoundary
        )}
      </p>
    </form>
  );
}
