"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CheckIcon, CopyIcon, LoaderCircleIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/components/i18n-provider";
import type { InvitationSummary } from "./server";
import { issueInviteAction, revokeInviteAction } from "./actions";

type IssuedResult = { intendedEmail: string; expiresAt: string; inviteUrl: string };

function localizedExpiry(expiresAt: string, lang: "en" | "pt") {
  return new Intl.DateTimeFormat(lang === "pt" ? "pt-BR" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(expiresAt));
}

export function invitationMessage(result: IssuedResult, lang: "en" | "pt") {
  const expiry = localizedExpiry(result.expiresAt, lang);
  if (lang === "pt") {
    return `Você foi convidado para o beta privado do Training Hub.\n\nCrie sua conta usando este link:\n${result.inviteUrl}\n\nEste convite é exclusivo para ${result.intendedEmail}, pode ser usado uma vez e expira em ${expiry}.\n\nDurante o beta privado, você conectará sua própria conta e seu próprio aplicativo de desenvolvedor do Strava.`;
  }
  return `You've been invited to the Training Hub private beta.\n\nCreate your account using this link:\n${result.inviteUrl}\n\nThis invitation is only for ${result.intendedEmail}, can be used once, and expires on ${expiry}.\n\nDuring the private beta, you'll connect your own Strava account and developer app.`;
}

function statusText(status: InvitationSummary["status"]) {
  return status.slice(0, 1).toUpperCase() + status.slice(1);
}

function CopyAction({ label, value }: { label: string; value: string }) {
  const [feedback, setFeedback] = useState<"idle" | "copied" | "failed">("idle");
  const fallbackRef = useRef<HTMLTextAreaElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback("copied");
    } catch {
      setFeedback("failed");
      fallbackRef.current?.focus();
      fallbackRef.current?.select();
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" onClick={copy}>
        {feedback === "copied" ? <CheckIcon /> : <CopyIcon />}
        {label}
      </Button>
      <p aria-live="polite" className="text-xs text-muted-foreground">
        {feedback === "copied"
          ? "Copied."
          : feedback === "failed"
            ? "Copy was unavailable. Select the text below and copy it manually."
            : null}
      </p>
      {feedback === "failed" ? (
        <textarea
          ref={fallbackRef}
          readOnly
          value={value}
          aria-label={`${label} fallback`}
          className="min-h-24 w-full rounded-lg border bg-muted/30 p-2 font-mono text-xs"
        />
      ) : null}
    </div>
  );
}

export function InviteManagement({
  initialInvitations,
  environment,
}: {
  initialInvitations: InvitationSummary[];
  environment: string;
}) {
  const { lang } = useI18n();
  const [invitations, setInvitations] = useState(initialInvitations);
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<IssuedResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<InvitationSummary | null>(null);
  const [pending, startTransition] = useTransition();
  const resultHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => setInvitations(initialInvitations), [initialInvitations]);
  useEffect(() => {
    if (result) resultHeading.current?.focus();
  }, [result]);

  function issue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const response = await issueInviteAction(email);
      if (!response.ok) {
        setError(
          response.reason === "validation"
            ? "Enter a valid email address."
            : response.reason === "access"
              ? "Your session no longer has creator access. Sign in again."
              : "We couldn't issue this invitation. Try again."
        );
        return;
      }
      setInvitations(response.invitations);
      setResult(response.issued ?? null);
      setEmail("");
    });
  }

  function revoke() {
    if (!revokeTarget || pending) return;
    startTransition(async () => {
      const response = await revokeInviteAction(revokeTarget.id);
      setRevokeTarget(null);
      if (!response.ok) {
        setError(
          response.reason === "access"
            ? "Your session no longer has creator access. Sign in again."
            : "We couldn't revoke this invitation. Try again."
        );
        return;
      }
      setInvitations(response.invitations);
    });
  }

  const message = result ? invitationMessage(result, lang) : "";
  return (
    <div className="mt-8 max-w-4xl space-y-6">
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Issue a private invitation</CardTitle>
          <CardDescription>
            Invite one person by email. The link is private, single-use, and expires seven days
            after issue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={issue} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="invite-email">Intended email</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
                placeholder="athlete@example.com"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "invite-error" : undefined}
              />
            </div>
            <Button type="submit" disabled={pending} className="h-10">
              {pending ? (
                <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
              ) : null}
              Issue invitation
            </Button>
          </form>
          {error ? (
            <p id="invite-error" role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <p className="mt-3 text-xs text-muted-foreground">
            Current environment: {environment}. Do not send a link until you have copied it to your
            chosen messaging tool.
          </p>
        </CardContent>
      </Card>

      {result ? (
        <Card className="rounded-2xl border-state-blue-fg/30">
          <CardHeader>
            <h2
              ref={resultHeading}
              tabIndex={-1}
              className="font-heading text-base leading-snug font-medium outline-none"
            >
              Private invitation ready
            </h2>
            <CardDescription>
              For {result.intendedEmail}. Expires {localizedExpiry(result.expiresAt, lang)}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="invite-message">Ready-to-send message</Label>
              <textarea
                id="invite-message"
                readOnly
                value={message}
                className="mt-2 min-h-52 w-full rounded-lg border bg-muted/30 p-3 text-sm leading-6"
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <CopyAction label="Copy message" value={message} />
              <CopyAction label="Copy link only" value={result.inviteUrl} />
            </div>
            <p className="text-xs text-muted-foreground">
              This result disappears when you leave or refresh this page.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Invitation pool</CardTitle>
          <CardDescription>
            Current deployment invitations. Links and tokens are never shown here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invitations.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No invitations have been issued in this environment.
            </p>
          ) : (
            <div className="space-y-3">
              {invitations.map((invite) => (
                <div
                  key={invite.id}
                  className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{invite.intendedEmail}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Issued {localizedExpiry(invite.createdAt, lang)} · Expires{" "}
                      {localizedExpiry(invite.expiresAt, lang)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border px-2 py-1 text-xs font-medium">
                      {statusText(invite.status)}
                    </span>
                    {invite.status === "active" ? (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => setRevokeTarget(invite)}
                      >
                        Revoke
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(revokeTarget)} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke invitation?</DialogTitle>
            <DialogDescription>
              {revokeTarget
                ? `The unused invitation for ${revokeTarget.intendedEmail} will stop working. This cannot be undone.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRevokeTarget(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={pending} onClick={revoke}>
              {pending ? (
                <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
              ) : (
                <RotateCcwIcon />
              )}
              Revoke invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
