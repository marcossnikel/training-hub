"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, MedalIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/components/i18n-provider";
import { setActivityRaceAction } from "@/features/activities/server/actions";
import { fmtPaceShort, parsePace } from "@/lib/format";
import type { Activity } from "@/lib/types";

export function RaceControl({ activity }: { activity: Activity }) {
  const { t } = useI18n();
  const isRace = activity.is_race;
  const [editing, setEditing] = useState(false);
  const [goal, setGoal] = useState(fmtPaceShort(activity.goal_pace_s_per_km));
  const [pending, startTransition] = useTransition();

  // Re-seed from the prop on every open, so an abandoned draft (typed, then
  // cancelled) can never be shown again or saved on the next edit.
  function startEditing() {
    setGoal(fmtPaceShort(activity.goal_pace_s_per_km));
    setEditing(true);
  }

  function submit(nextIsRace: boolean) {
    const goalPace = nextIsRace && goal.trim() ? parsePace(goal) : null;
    if (nextIsRace && goal.trim() && goalPace == null) {
      toast.error(`${t.detail.goalPace}: mm:ss`);
      return;
    }
    startTransition(async () => {
      const result = await setActivityRaceAction({
        activityId: activity.id,
        isRace: nextIsRace,
        goalPace,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setEditing(false);
    });
  }

  // Not a race, not editing: a quiet button to mark it.
  if (!isRace && !editing) {
    return (
      <Button variant="ghost" size="sm" onClick={startEditing}>
        <MedalIcon data-icon="inline-start" /> {t.detail.markRace}
      </Button>
    );
  }

  // Editing (marking, or changing goal pace on an existing race).
  if (editing) {
    return (
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/40 p-3">
        <div className="space-y-1.5">
          <Label htmlFor="goal-pace" className="text-xs">
            {t.detail.goalPace}
          </Label>
          <Input
            id="goal-pace"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder={t.detail.goalPacePlaceholder}
            inputMode="numeric"
            className="w-24 text-center font-mono tabular-nums"
          />
        </div>
        <Button onClick={() => submit(true)} disabled={pending} size="sm">
          {pending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
          {isRace ? t.detail.save : t.detail.markRace}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={pending}>
          {t.detail.cancel}
        </Button>
        <p className="w-full text-xs text-muted-foreground">{t.detail.goalPaceHint}</p>
      </div>
    );
  }

  // Marked as a race: show the badge with goal pace and controls.
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
        <MedalIcon className="size-3.5" aria-hidden />
        {t.detail.race}
        {activity.goal_pace_s_per_km ? (
          <span className="font-mono tabular-nums">
            · {t.detail.goalPace} {fmtPaceShort(activity.goal_pace_s_per_km)}/km
          </span>
        ) : null}
      </span>
      <Button variant="ghost" size="sm" onClick={startEditing}>
        {t.detail.edit}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => submit(false)} disabled={pending}>
        <XIcon data-icon="inline-start" /> {t.detail.unmarkRace}
      </Button>
    </div>
  );
}
