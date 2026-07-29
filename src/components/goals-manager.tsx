"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Loader2Icon, PlusIcon, TargetIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/components/i18n-provider";
import { createGoalAction, deleteGoalAction } from "@/lib/actions";
import { fmtDate, fmtDuration } from "@/lib/format";
import type { Goal } from "@/lib/types";

export function GoalsManager({ goals }: { goals: Goal[] }) {
  const { t, lang } = useI18n();
  // Delete is a one-way row removal, so drop it from the list right away and let
  // the revalidated server tree confirm (or restore it, if the action failed).
  const [visibleGoals, hideGoal] = useOptimistic(goals, (current, id: number) =>
    current.filter((goal) => goal.id !== id)
  );
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [distance, setDistance] = useState("");
  const [targetTime, setTargetTime] = useState("");
  const [notes, setNotes] = useState("");
  const [primary, setPrimary] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      toast.error(t.errors.goalNeedsName);
      return;
    }
    startTransition(async () => {
      const result = await createGoalAction({
        name,
        raceDate: date,
        distanceKm: distance,
        goalTime: targetTime,
        notes,
        primary,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(t.settingsPage.goals.saved);
      setName("");
      setDate("");
      setDistance("");
      setTargetTime("");
      setNotes("");
      setPrimary(false);
    });
  }

  function remove(id: number) {
    startTransition(async () => {
      hideGoal(id);
      const result = await deleteGoalAction(id);
      if (!result.ok) toast.error(result.error);
    });
  }

  const g = t.settingsPage.goals;

  return (
    <div className="space-y-5">
      {visibleGoals.length > 0 ? (
        <ul className="space-y-2">
          {visibleGoals.map((goal) => {
            const meta = [
              goal.distance_km != null ? `${goal.distance_km} km` : null,
              goal.goal_time_s != null ? fmtDuration(goal.goal_time_s) : null,
              goal.race_date ? fmtDate(`${goal.race_date}T12:00:00`, lang) : null,
            ].filter(Boolean);
            return (
              <li
                key={goal.id}
                className="flex items-start justify-between gap-3 rounded-lg border bg-card px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {goal.priority > 0 ? (
                      <TargetIcon className="size-3.5 text-primary" aria-hidden />
                    ) : null}
                    {goal.name}
                  </p>
                  {meta.length > 0 ? (
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {meta.join(" · ")}
                    </p>
                  ) : null}
                  {goal.notes ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">{goal.notes}</p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => remove(goal.id)}
                  disabled={pending}
                  aria-label={g.remove}
                  className="shrink-0 text-muted-foreground"
                >
                  <XIcon />
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{g.empty}</p>
      )}

      <form onSubmit={submit} className="space-y-3 border-t pt-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="goal-name">{g.name}</Label>
            <Input
              id="goal-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={g.namePlaceholder}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="goal-date">{g.date}</Label>
            <Input
              id="goal-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="font-mono tabular-nums"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="goal-dist">{g.distance}</Label>
              <Input
                id="goal-dist"
                inputMode="decimal"
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
                className="font-mono tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-time">{g.targetTime}</Label>
              <Input
                id="goal-time"
                value={targetTime}
                onChange={(e) => setTargetTime(e.target.value)}
                placeholder="2:59:00"
                className="font-mono tabular-nums"
              />
            </div>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="goal-notes">{g.notes}</Label>
            <Input id="goal-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={primary}
              onChange={(e) => setPrimary(e.target.checked)}
              className="size-4 accent-primary"
            />
            {g.primary}
          </label>
          <Button type="submit" disabled={pending}>
            {pending ? (
              <Loader2Icon className="animate-spin" data-icon="inline-start" />
            ) : (
              <PlusIcon data-icon="inline-start" />
            )}
            {g.add}
          </Button>
        </div>
      </form>
    </div>
  );
}
