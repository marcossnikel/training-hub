"use client";

import { useLayoutEffect, useRef, useState, useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  removeInsightFeedbackAction,
  saveInsightFeedbackNoteAction,
  saveInsightUsefulnessAction,
  type InsightFeedbackTargetInput,
} from "@/lib/actions";
import { INSIGHT_NOTE_MAX_LENGTH, type InsightUsefulness } from "@/lib/insight-feedback";
import { cn } from "@/lib/utils";

type FeedbackState = { usefulness: InsightUsefulness | null; note: string | null };

export function InsightFeedback({
  target,
  initial,
}: {
  target: InsightFeedbackTargetInput;
  initial: FeedbackState | null;
}) {
  const [feedback, setFeedback] = useState<FeedbackState>(
    initial ?? { usefulness: null, note: null }
  );
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(initial?.note ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const usefulRef = useRef<HTMLButtonElement>(null);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);
  const restoreUsefulFocusRef = useRef(false);

  // Removing the active response unmounts its adjacent action controls. The
  // transition briefly disables response buttons, so restore keyboard context
  // only after that removal has committed and the native Useful button is live.
  useLayoutEffect(() => {
    if (!restoreUsefulFocusRef.current || feedback.usefulness !== null || pending) return;
    restoreUsefulFocusRef.current = false;
    usefulRef.current?.focus();
  }, [feedback.usefulness, pending]);

  function focusControl(id: string) {
    queueMicrotask(() => document.getElementById(id)?.focus());
  }

  function clearStatus() {
    setMessage(null);
    setError(null);
  }

  function choose(usefulness: InsightUsefulness) {
    clearStatus();
    startTransition(async () => {
      const result = await saveInsightUsefulnessAction({ target, usefulness });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setFeedback((current) => ({ ...current, usefulness }));
      setMessage("Feedback saved.");
    });
  }

  function openEditor() {
    clearStatus();
    setNote(feedback.note ?? "");
    setEditing(true);
    queueMicrotask(() => noteInputRef.current?.focus());
  }

  function cancelEditor() {
    clearStatus();
    setEditing(false);
    setNote(feedback.note ?? "");
    focusControl("insight-feedback-note-trigger");
  }

  function onEditorKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    cancelEditor();
  }

  function saveNote(event: React.FormEvent) {
    event.preventDefault();
    clearStatus();
    startTransition(async () => {
      const result = await saveInsightFeedbackNoteAction({ target, note });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setFeedback((current) => ({ ...current, note }));
      setEditing(false);
      setMessage("Feedback saved.");
      focusControl("insight-feedback-note-trigger");
    });
  }

  function remove() {
    clearStatus();
    startTransition(async () => {
      const result = await removeInsightFeedbackAction({ target });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      restoreUsefulFocusRef.current = true;
      setFeedback({ usefulness: null, note: null });
      setEditing(false);
      setNote("");
      setMessage("Feedback removed.");
    });
  }

  const hasResponse = feedback.usefulness !== null;

  return (
    <section
      aria-busy={pending}
      aria-labelledby="insight-feedback-heading"
      className="mt-4 rounded-xl bg-muted p-4"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="insight-feedback-heading" className="text-sm font-semibold">
          Was this useful?
        </h2>
        <span className="font-mono text-xs text-muted-foreground">Private feedback only</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Was this useful?">
        {(
          [
            ["useful", "Useful"],
            ["not_useful", "Not useful"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            ref={value === "useful" ? usefulRef : undefined}
            type="button"
            aria-pressed={feedback.usefulness === value}
            disabled={pending}
            onClick={() => choose(value)}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "transition-colors duration-150 motion-reduce:transition-none",
              feedback.usefulness === value && "border-primary bg-primary/10 text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {hasResponse && !editing ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button
            id="insight-feedback-note-trigger"
            type="button"
            variant="link"
            size="sm"
            disabled={pending}
            onClick={openEditor}
          >
            {feedback.note ? "Edit note" : "Add a note"}
          </Button>
          <Button type="button" variant="link" size="sm" disabled={pending} onClick={remove}>
            Remove response
          </Button>
        </div>
      ) : null}
      {editing ? (
        <form onSubmit={saveNote} className="mt-4 max-w-xl space-y-2">
          <Label htmlFor="insight-feedback-note">Optional note</Label>
          <p id="insight-feedback-note-help" className="text-sm text-muted-foreground">
            Share what made this useful or what was missing.
          </p>
          <Textarea
            ref={noteInputRef}
            id="insight-feedback-note"
            value={note}
            maxLength={INSIGHT_NOTE_MAX_LENGTH}
            aria-describedby="insight-feedback-note-help"
            disabled={pending}
            onChange={(event) => setNote(event.target.value)}
            onKeyDown={onEditorKeyDown}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              Save note
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={cancelEditor}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {pending ? (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          Updating feedback…
        </p>
      ) : null}
      {message ? <p className="mt-3 text-sm text-muted-foreground">{message}</p> : null}
    </section>
  );
}
