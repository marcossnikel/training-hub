"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowUpRightIcon, CheckCircle2Icon, Loader2Icon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  beginByoConnectionAction,
  type BeginByoConnectionResult,
} from "@/lib/byo-connection-actions";
import { STRAVA_BYO_HANDOFF_PATH } from "@/lib/strava-byo";

type DisplayState = Extract<
  BeginByoConnectionResult,
  { status: "invalid" | "ready" | "pending" | "unavailable" }
>;

/**
 * Keeps the secret only in the password input while the athlete types. Every
 * result state is deliberately secret-free, and a submit clears the controlled
 * input before the server response can render.
 */
export function ByoConnectionForm({
  callbackUrl,
  pendingAuthorization = false,
}: {
  callbackUrl: string | null;
  pendingAuthorization?: boolean;
}) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [result, setResult] = useState<DisplayState | null>(() =>
    pendingAuthorization ? { status: "pending", handoffPath: STRAVA_BYO_HANDOFF_PATH } : null
  );
  const [pending, startTransition] = useTransition();
  const errorSummary = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (result?.status === "invalid") errorSummary.current?.focus();
  }, [result]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    // FormData has already captured the submitted value. Never keep the secret
    // in React state while the round trip or an error message is rendered.
    setClientSecret("");
    setResult(null);
    startTransition(async () => {
      const next = await beginByoConnectionAction(formData);
      if (next.status === "invalid") {
        setClientId(next.clientId);
        setResult(next);
        return;
      }
      if (next.status === "ready" || next.status === "pending" || next.status === "unavailable") {
        setResult(next);
      }
    });
  }

  if (result?.status === "ready" || result?.status === "pending") {
    return (
      <div className="space-y-3" aria-live="polite">
        <Alert className="border-emerald-500/30 text-emerald-800 dark:text-emerald-200">
          <CheckCircle2Icon aria-hidden />
          <AlertTitle>Credentials held securely</AlertTitle>
          <AlertDescription>
            Your Client Secret is stored only on the server. Continue when you are ready to
            authorize this app in Strava.
          </AlertDescription>
        </Alert>
        <Button asChild>
          <a href={result.handoffPath}>
            Continue to Strava <ArrowUpRightIcon data-icon="inline-end" aria-hidden />
          </a>
        </Button>
        <p className="text-xs text-muted-foreground">
          This connection is waiting for authorization. A second credential submission is disabled
          until the authorization path continues.
        </p>
      </div>
    );
  }

  const errors = result?.status === "invalid" ? result.errors : {};
  const unavailable = result?.status === "unavailable";
  const disabled = pending || !callbackUrl;

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="strava-client-id">Strava Client ID</Label>
        <Input
          id="strava-client-id"
          name="clientId"
          value={clientId}
          onChange={(event) => setClientId(event.target.value)}
          autoComplete="off"
          aria-describedby={errors.clientId ? "strava-client-id-error" : undefined}
          aria-invalid={Boolean(errors.clientId)}
          disabled={disabled}
        />
        {errors.clientId ? (
          <p id="strava-client-id-error" className="text-sm text-destructive">
            {errors.clientId}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="strava-client-secret">Strava Client Secret</Label>
        <Input
          id="strava-client-secret"
          name="clientSecret"
          type="password"
          value={clientSecret}
          onChange={(event) => setClientSecret(event.target.value)}
          autoComplete="new-password"
          aria-describedby={errors.clientSecret ? "strava-client-secret-error" : undefined}
          aria-invalid={Boolean(errors.clientSecret)}
          disabled={disabled}
        />
        {errors.clientSecret ? (
          <p id="strava-client-secret-error" className="text-sm text-destructive">
            {errors.clientSecret}
          </p>
        ) : null}
      </div>

      {result?.status === "invalid" ? (
        <div
          ref={errorSummary}
          tabIndex={-1}
          role="alert"
          className="focus-ring rounded-md text-sm text-destructive"
        >
          Check the highlighted fields. Your Client Secret was not kept.
        </div>
      ) : null}
      {unavailable ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>We could not hold these credentials.</AlertTitle>
          <AlertDescription>
            Check the values and try again. Your Client Secret was not kept.
          </AlertDescription>
        </Alert>
      ) : null}
      {!callbackUrl ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>This callback address is unavailable.</AlertTitle>
          <AlertDescription>Reload Settings before entering credentials.</AlertDescription>
        </Alert>
      ) : null}

      <Button
        type="submit"
        disabled={disabled}
        aria-describedby={!callbackUrl ? "callback-help" : undefined}
      >
        {pending ? (
          <Loader2Icon className="animate-spin motion-reduce:animate-none" aria-hidden />
        ) : null}
        {pending ? "Validating…" : "Validate and continue"}
      </Button>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {pending ? "Validating credentials securely. Please wait." : ""}
      </p>
    </form>
  );
}
