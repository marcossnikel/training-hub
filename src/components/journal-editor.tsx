"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FeelingBadge } from "@/components/feeling-badge";
import { FeelingControl, RpeControl } from "@/components/journal-controls";
import { useI18n } from "@/components/i18n-provider";
import { updateJournalAction } from "@/features/activities/server/actions";
import type { Activity, Feeling } from "@/lib/types";

function NoteBlock({
  label,
  text,
  emptyText,
}: {
  label: string;
  text: string | null;
  emptyText: string;
}) {
  return (
    <div>
      <div className="label-micro">{label}</div>
      {text ? (
        <p className="mt-1 text-sm leading-relaxed italic whitespace-pre-wrap">{text}</p>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">{emptyText}</p>
      )}
    </div>
  );
}

export function JournalEditor({ activity }: { activity: Activity }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [rpe, setRpe] = useState<number | null>(activity.rpe);
  const [feeling, setFeeling] = useState<Feeling | null>(activity.feeling);
  const [workoutNotes, setWorkoutNotes] = useState(activity.workout_notes ?? "");
  const [healthNotes, setHealthNotes] = useState(activity.health_notes ?? "");
  const [pending, startTransition] = useTransition();

  function startEditing() {
    setRpe(activity.rpe);
    setFeeling(activity.feeling);
    setWorkoutNotes(activity.workout_notes ?? "");
    setHealthNotes(activity.health_notes ?? "");
    setEditing(true);
  }

  function save() {
    startTransition(async () => {
      const result = await updateJournalAction({
        activityId: activity.id,
        rpe,
        feeling,
        workoutNotes,
        healthNotes,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(t.toasts.journalSaved);
      setEditing(false);
    });
  }

  if (!editing) {
    const empty =
      activity.rpe == null &&
      activity.feeling == null &&
      !activity.workout_notes &&
      !activity.health_notes;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {activity.feeling ? (
              <FeelingBadge feeling={activity.feeling} label={t.feelings[activity.feeling]} />
            ) : null}
            {activity.rpe != null ? (
              <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs font-medium tabular-nums">
                RPE {activity.rpe}
              </span>
            ) : null}
            {empty ? (
              <span className="text-sm text-muted-foreground">{t.detail.noJournal}</span>
            ) : null}
          </div>
          <Button variant="ghost" size="sm" onClick={startEditing}>
            <PencilIcon data-icon="inline-start" />
            {empty ? t.detail.addNotes : t.detail.edit}
          </Button>
        </div>
        {!empty ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <NoteBlock
              label={t.detail.workout}
              text={activity.workout_notes}
              emptyText={t.detail.nothingNoted}
            />
            <NoteBlock
              label={t.detail.health}
              text={activity.health_notes}
              emptyText={t.detail.nothingNoted}
            />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="label-micro">{t.review.effort}</Label>
          <RpeControl value={rpe} onChange={setRpe} />
        </div>
        <div className="space-y-2">
          <Label className="label-micro">{t.review.feeling}</Label>
          <FeelingControl value={feeling} onChange={setFeeling} />
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="edit-workout-notes" className="label-micro">
            {t.review.workoutNotes}
          </Label>
          <Textarea
            id="edit-workout-notes"
            value={workoutNotes}
            onChange={(e) => setWorkoutNotes(e.target.value)}
            className="min-h-24 resize-y"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-health-notes" className="label-micro">
            {t.review.healthNotes}
          </Label>
          <Textarea
            id="edit-health-notes"
            value={healthNotes}
            onChange={(e) => setHealthNotes(e.target.value)}
            className="min-h-24 resize-y"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
          {t.detail.save}
        </Button>
        <Button variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
          {t.detail.cancel}
        </Button>
      </div>
    </div>
  );
}
