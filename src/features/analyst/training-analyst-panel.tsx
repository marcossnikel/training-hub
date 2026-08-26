"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { AnalystHypothesis } from "./types";
import { requestTrainingAnalystAction, saveTrainingAnalystFeedbackAction } from "./server/actions";

function labelFor(action: string): string {
  return action === "confirmed"
    ? "Confirm"
    : action === "edited"
      ? "Save edit"
      : action === "rejected"
        ? "Reject"
        : "Defer";
}

function HypothesisCard({ hypothesis }: { hypothesis: AnalystHypothesis }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(hypothesis.hypothesis);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  function action(action: "confirmed" | "edited" | "rejected" | "deferred") {
    startTransition(async () => {
      const result = await saveTrainingAnalystFeedbackAction({
        hypothesisId: hypothesis.id,
        action,
        requestId: crypto.randomUUID(),
        editedHypothesis: action === "edited" ? draft : null,
      });
      setMessage(result.ok ? `${labelFor(action)} saved.` : result.error);
      if (result.ok) {
        setEditing(false);
        headingRef.current?.focus();
      }
    });
  }
  function startEdit() {
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }
  function cancel() {
    setEditing(false);
    editRef.current?.focus();
  }
  return (
    <article className="rounded-xl border bg-card p-4 sm:p-5">
      <h3 ref={headingRef} tabIndex={-1} className="text-lg font-semibold outline-none">
        {hypothesis.observation}
      </h3>
      <p className="mt-3 text-sm leading-6">{hypothesis.hypothesis}</p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-mono text-xs text-muted-foreground uppercase">Confidence</dt>
          <dd className="mt-1 capitalize">{hypothesis.confidence}</dd>
        </div>
        <div>
          <dt className="font-mono text-xs text-muted-foreground uppercase">Evidence</dt>
          <dd className="mt-1">{hypothesis.evidenceIds.join(", ")}</dd>
        </div>
        <div>
          <dt className="font-mono text-xs text-muted-foreground uppercase">Theory sources</dt>
          <dd className="mt-1">{hypothesis.sourceIds.join(", ")}</dd>
        </div>
      </dl>
      <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm leading-6 text-muted-foreground">
        Limitation: {hypothesis.limitation}
      </p>
      {hypothesis.question ? (
        <p className="mt-3 text-sm leading-6">Question: {hypothesis.question}</p>
      ) : null}
      {hypothesis.state === "pending" ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {editing ? (
            <>
              <label
                className="w-full text-sm font-medium"
                htmlFor={`analyst-edit-${hypothesis.id}`}
              >
                Edit this hypothesis
              </label>
              <textarea
                ref={inputRef}
                id={`analyst-edit-${hypothesis.id}`}
                maxLength={280}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                className="min-h-24 w-full rounded-md border bg-background p-2 text-sm"
              />
              <Button onClick={() => action("edited")} disabled={pending}>
                Save edit
              </Button>
              <Button variant="outline" onClick={cancel} disabled={pending}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => action("confirmed")} disabled={pending}>
                Confirm
              </Button>
              <Button ref={editRef} variant="outline" onClick={startEdit} disabled={pending}>
                Edit
              </Button>
              <Button variant="outline" onClick={() => action("rejected")} disabled={pending}>
                Reject
              </Button>
              <Button variant="outline" onClick={() => action("deferred")} disabled={pending}>
                Defer
              </Button>
            </>
          )}
        </div>
      ) : (
        <p className="mt-4 text-sm font-medium capitalize">{hypothesis.state}</p>
      )}
      {message ? (
        <p aria-live="polite" className="mt-3 text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}
    </article>
  );
}

export function TrainingAnalystPanel({
  consent,
  hypotheses,
}: {
  consent: "enabled" | "revoked" | "missing";
  hypotheses: AnalystHypothesis[];
}) {
  const [state, setState] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function request() {
    setState("generating");
    startTransition(async () => {
      const result = await requestTrainingAnalystAction();
      setState(result.ok ? "success" : result.error);
    });
  }
  if (consent === "missing")
    return (
      <section className="mt-6 rounded-2xl border bg-card p-4 sm:p-5">
        <h2 className="text-xl font-semibold">Training Analyst</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Training Analyst is off. Your training summaries still work without it.
        </p>
        <a
          className="focus-ring mt-3 inline-block text-sm font-medium underline"
          href="/settings#training-analyst"
        >
          Review settings
        </a>
      </section>
    );
  if (consent === "revoked")
    return (
      <section className="mt-6 rounded-2xl border bg-card p-4 sm:p-5">
        <h2 className="text-xl font-semibold">Training Analyst</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Training Analyst is off and its local hypotheses were removed.
        </p>
      </section>
    );
  const copy =
    state === "insufficient_evidence"
      ? "There isn’t enough connected evidence for a careful hypothesis yet."
      : state === "limit"
        ? "Training Analyst has reached its current limit. Your deterministic training summary is still available."
        : state === "unavailable"
          ? "Training Analyst is unavailable right now. Your deterministic training summary is still available."
          : null;
  return (
    <section className="mt-6 rounded-2xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Training Analyst</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Hypotheses to inspect, not training instructions.
          </p>
        </div>
        {hypotheses.length === 0 ? (
          <Button onClick={request} disabled={pending}>
            {pending
              ? "Checking the selected evidence against the training library…"
              : "Request hypotheses"}
          </Button>
        ) : null}
      </div>
      {state === "generating" ? (
        <p aria-live="polite" className="mt-4 text-sm text-muted-foreground">
          Checking the selected evidence against the training library…
        </p>
      ) : null}
      {copy ? (
        <p
          aria-live="polite"
          className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm leading-6 text-muted-foreground"
        >
          {copy}
        </p>
      ) : null}
      {hypotheses.length > 0 ? (
        <div className="mt-5 grid gap-4">
          {hypotheses.map((hypothesis) => (
            <HypothesisCard key={hypothesis.id} hypothesis={hypothesis} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
