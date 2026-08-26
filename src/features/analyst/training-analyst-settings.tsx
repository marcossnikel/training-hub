"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { enableTrainingAnalystAction, revokeTrainingAnalystAction } from "./server/actions";

export function TrainingAnalystSettings({
  consent,
}: {
  consent: "enabled" | "revoked" | "missing";
}) {
  const [understood, setUnderstood] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function enable() {
    startTransition(async () => {
      const result = await enableTrainingAnalystAction(understood);
      setMessage(result.ok ? "Training Analyst is enabled." : result.error);
    });
  }
  function revoke() {
    startTransition(async () => {
      const result = await revokeTrainingAnalystAction();
      setMessage(
        result.ok ? "Training Analyst is off and its local hypotheses were removed." : result.error
      );
    });
  }
  if (consent === "enabled")
    return (
      <div className="space-y-3">
        <p className="text-sm leading-6 text-muted-foreground">
          Training Analyst is enabled. It only proposes hypotheses; it cannot change your profile or
          training.
        </p>
        <Button variant="outline" onClick={revoke} disabled={pending}>
          Turn off Training Analyst
        </Button>
        {message ? (
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {message}
          </p>
        ) : null}
      </div>
    );
  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-muted-foreground">
        Training Hub will send a minimized, pseudonymous summary of the training evidence selected
        below to OpenAI to generate evidence-linked hypotheses. It never sends your name, email,
        Strava credentials, activity names, notes, routes, photos, streams, or raw provider
        payloads. OpenAI API content is not used to train models by default, but default
        abuse-monitoring logs may retain prompts and responses for up to 30 days. You can turn this
        off at any time.
      </p>
      <label className="flex gap-3 text-sm leading-6">
        <input
          className="mt-1 size-4"
          type="checkbox"
          checked={understood}
          onChange={(event) => setUnderstood(event.target.checked)}
        />
        I understand and want to use OpenAI for these hypotheses.
      </label>
      <Button onClick={enable} disabled={!understood || pending}>
        Enable Training Analyst
      </Button>
      {consent === "revoked" ? (
        <p className="text-sm text-muted-foreground">
          Training Analyst is off and its local hypotheses were removed.
        </p>
      ) : null}
      {message ? (
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}
    </div>
  );
}
