"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FootprintsIcon,
  Loader2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { FeelingControl, RpeControl } from "@/components/journal-controls";
import { SportIcon } from "@/components/sport-icon";
import { useI18n } from "@/components/i18n-provider";
import { SplitsEditor, rowsToSplits } from "@/components/splits-editor";
import { initForm, type FormState, type Summary } from "@/components/review-flow-form";
import { Stat, ReviewSummaryScreen, useReviewKeyboard } from "@/components/review-flow-parts";
import { confirmActivityAction } from "@/features/activities/server/actions";
import {
  fmtDate,
  fmtDuration,
  fmtElev,
  fmtHr,
  fmtKm,
  fmtPace,
  fmtTime,
  localStartedAt,
} from "@/lib/format";
import { fill, fillStr, splitErrorText } from "@/lib/i18n";
import { isRunSport, validateSplits } from "@/lib/validate";
import { BikeSelect } from "@/components/bike-select";
import { isRideSport } from "@/lib/cycling";
import type { ActivityWithSplits, BikeOption, ShoeOption } from "@/lib/types";

export function ReviewFlow({
  items: serverItems,
  shoes,
  bikes,
}: {
  items: ActivityWithSplits[];
  shoes: ShoeOption[];
  bikes: BikeOption[];
}) {
  const { lang, t } = useI18n();
  const [queue, setQueue] = useState<ActivityWithSplits[]>(serverItems);
  const [index, setIndex] = useState(0);
  const [forms, setForms] = useState<Record<number, FormState>>({});
  const [handledIds, setHandledIds] = useState<Set<number>>(() => new Set());
  const [summary, setSummary] = useState<Summary>({ count: 0, totalKm: 0, perShoe: {} });
  const [pending, startTransition] = useTransition();
  const kmInputRef = useRef<HTMLInputElement | null>(null);

  const sessionTotal = summary.count + queue.length;
  const current = queue[index] ?? null;
  const form = useMemo(
    () => (current ? (forms[current.id] ?? initForm(current)) : null),
    [current, forms]
  );

  const splitsPayload = useMemo(() => (form ? rowsToSplits(form.rows) : []), [form]);
  const validationError = current && form ? validateSplits(current, splitsPayload) : null;
  const validationMessage = validationError ? splitErrorText(validationError, t) : null;

  function patchForm(patch: Partial<FormState>) {
    if (!current) return;
    const id = current.id;
    const base = forms[id] ?? initForm(current);
    setForms((f) => ({ ...f, [id]: { ...base, ...patch } }));
  }

  function goto(next: number) {
    if (queue.length === 0) return;
    setIndex(Math.min(Math.max(next, 0), queue.length - 1));
  }

  function confirmCurrent() {
    if (!current || !form || pending) return;
    if (validationMessage) {
      toast.error(validationMessage);
      return;
    }
    const activity = current;
    const payload = splitsPayload;
    startTransition(async () => {
      const result = await confirmActivityAction({
        activityId: activity.id,
        splits: payload,
        bikeId: form.bikeId,
        rpe: form.rpe,
        feeling: form.feeling,
        workoutNotes: form.workoutNotes,
        healthNotes: form.healthNotes,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSummary((prev) => {
        const perShoe = { ...prev.perShoe };
        for (const split of payload) {
          const shoe = shoes.find((s) => s.id === split.shoe_id);
          if (shoe) perShoe[shoe.name] = (perShoe[shoe.name] ?? 0) + split.km;
        }
        return {
          count: prev.count + 1,
          totalKm: prev.totalKm + (activity.distance_km ?? 0),
          perShoe,
        };
      });
      setHandledIds((prev) => new Set(prev).add(activity.id));
      // Both updaters stay pure: the next queue is derived here, outside them,
      // so nothing is scheduled from inside a state updater (React 19 double-
      // invokes updaters in StrictMode).
      const nextQueue = queue.filter((a) => a.id !== activity.id);
      setQueue(nextQueue);
      setIndex((i) => Math.min(i, Math.max(0, nextQueue.length - 1)));
    });
  }

  useReviewKeyboard({ confirmCurrent, goto, index, patchForm, kmInputRef });

  // ------------------------------------------------------------------
  // Empty queue states
  // ------------------------------------------------------------------
  if (!current || !form) {
    const freshArrivals = serverItems.filter((a) => !handledIds.has(a.id));
    return (
      <div className="mt-6">
        <ReviewSummaryScreen
          summary={summary}
          freshArrivalsCount={freshArrivals.length}
          onReviewMore={() => {
            setQueue(freshArrivals);
            setIndex(0);
          }}
        />
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Review card
  // ------------------------------------------------------------------
  const run = isRunSport(current.sport_type);
  const ride = isRideSport(current.sport_type);
  const distance = current.distance_km ?? 0;
  const hadUnmatchedShoe = run && current.splits.some((s) => s.shoe_id === null);
  const activeShoes = shoes.filter((s) => !s.retired);

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs tabular-nums text-muted-foreground uppercase">
            {summary.count + index + 1} {t.review.of} {sessionTotal}
          </span>
          {sessionTotal <= 30 ? (
            <div className="flex items-center gap-1" aria-hidden>
              {Array.from({ length: sessionTotal }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-3 w-[3px] rounded-full",
                    i < summary.count + index
                      ? "bg-positive"
                      : i === summary.count + index
                        ? "bg-primary"
                        : "bg-border"
                  )}
                />
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t.review.previous}
            disabled={index === 0}
            onClick={() => goto(index - 1)}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t.review.next}
            disabled={index >= queue.length - 1}
            onClick={() => goto(index + 1)}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>

      <Card
        key={current.id}
        className="animate-in rounded-2xl border bg-card shadow-none ring-0 fade-in duration-150"
      >
        <CardContent className="space-y-5">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <SportIcon sport={current.sport_type} />
              <span>{current.sport_type ?? ""}</span>
              <span aria-hidden>·</span>
              <span className="font-mono tabular-nums">
                {fmtDate(localStartedAt(current), lang)}
                {current.started_at ? `, ${fmtTime(localStartedAt(current))}` : ""}
              </span>
            </div>
            <h2 className="mt-1.5 font-display text-2xl font-semibold tracking-tight">
              {current.name ?? t.log.untitled}
            </h2>
            <p className="mt-2 max-w-xl text-base leading-6 text-muted-foreground">
              {fillStr(t.review.importedQuestion, {
                sport: (current.sport_type || t.words.activity).toLowerCase(),
              })}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-x-4 gap-y-3 sm:grid-cols-5">
            <Stat label={t.review.distance} value={fmtKm(distance, distance >= 100 ? 0 : 2)} />
            {run ? <Stat label={t.review.pace} value={fmtPace(current.avg_pace_s_per_km)} /> : null}
            <Stat label={t.review.time} value={fmtDuration(current.moving_time_s)} />
            <Stat label={t.review.heartRate} value={fmtHr(current.avg_hr)} />
            <Stat label={t.review.elevation} value={fmtElev(current.elevation_gain_m)} />
          </div>

          <p className="max-w-xl font-mono text-xs leading-[1.5] text-muted-foreground">
            {t.review.confirmationEvidence}
          </p>

          <Separator />

          <p className="text-base font-medium">{t.review.details}</p>

          {ride ? (
            <div className="space-y-2">
              <Label className="label-micro">{t.detail.bike}</Label>
              <BikeSelect
                value={form.bikeId}
                onChange={(bikeId) => patchForm({ bikeId })}
                bikes={bikes}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="label-micro">
                  {run ? t.review.shoes : t.review.shoesOptional}
                </Label>
                {hadUnmatchedShoe ? (
                  <span className="inline-flex items-center gap-1 text-xs text-destructive">
                    <TriangleAlertIcon className="size-3.5" aria-hidden />
                    {t.review.noGearMatch}
                  </span>
                ) : null}
              </div>
              <SplitsEditor
                rows={form.rows}
                onChange={(rows) => patchForm({ rows })}
                distanceKm={distance}
                isRun={run}
                shoes={shoes}
                firstKmInputRef={kmInputRef}
              />
            </div>
          )}

          <Separator />

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="label-micro">{t.review.effort}</Label>
              <RpeControl value={form.rpe} onChange={(rpe) => patchForm({ rpe })} />
            </div>
            <div className="space-y-2">
              <Label className="label-micro">{t.review.feeling}</Label>
              <FeelingControl value={form.feeling} onChange={(feeling) => patchForm({ feeling })} />
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="workout-notes" className="label-micro">
                {t.review.workoutNotes}
              </Label>
              <Textarea
                id="workout-notes"
                value={form.workoutNotes}
                onChange={(e) => patchForm({ workoutNotes: e.target.value })}
                placeholder={t.review.workoutPlaceholder}
                className="min-h-24 resize-y"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="health-notes" className="label-micro">
                {t.review.healthNotes}
              </Label>
              <Textarea
                id="health-notes"
                value={form.healthNotes}
                onChange={(e) => patchForm({ healthNotes: e.target.value })}
                placeholder={t.review.healthPlaceholder}
                className="min-h-24 resize-y"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Button
              size="lg"
              className="h-10 w-full rounded-full px-4 sm:w-auto"
              onClick={confirmCurrent}
              disabled={pending || !!validationMessage || (run && activeShoes.length === 0)}
            >
              {pending ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <CheckIcon data-icon="inline-start" />
              )}
              {t.review.confirm}
              <kbd className="kbd ml-1 border-primary-foreground/30 bg-transparent text-primary-foreground">
                ↵
              </kbd>
            </Button>
            {validationMessage ? (
              <p className="text-center text-xs text-destructive">{validationMessage}</p>
            ) : null}
            {activeShoes.length === 0 && run ? (
              <p className="text-center text-xs text-destructive">
                {fill(t.review.addShoeFirst, {
                  link: (
                    <Link href="/gear" className="underline">
                      {t.nav.shoes}
                    </Link>
                  ),
                })}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <p className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <kbd className="kbd">↵</kbd> {t.review.kbdConfirm}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <kbd className="kbd">←</kbd>
          <kbd className="kbd">→</kbd> {t.review.kbdNavigate}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <kbd className="kbd">E</kbd> {t.review.kbdSplits}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <kbd className="kbd">1</kbd>–<kbd className="kbd">0</kbd> RPE
        </span>
        <span className="inline-flex items-center gap-1.5">
          <FootprintsIcon className="size-3" aria-hidden /> {t.review.kbdMileage}
        </span>
      </p>
    </div>
  );
}
