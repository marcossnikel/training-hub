"use client";

import Link from "next/link";
import { useEffect, useRef, type RefObject } from "react";
import { CheckCircle2Icon, InboxIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { useI18n } from "@/components/i18n-provider";
import { fillStr } from "@/lib/i18n";
import { fmtKm } from "@/lib/format";
import type { FormState, Summary } from "@/components/review-flow-form";

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="label-micro">{label}</div>
      <div className="mt-0.5 truncate font-display text-lg font-semibold">{value}</div>
    </div>
  );
}

/**
 * The empty-queue screen: a per-session confirmation summary once anything was
 * confirmed, otherwise the "all caught up" empty state.
 */
export function ReviewSummaryScreen({
  summary,
  freshArrivalsCount,
  onReviewMore,
}: {
  summary: Summary;
  freshArrivalsCount: number;
  onReviewMore: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="animate-in fade-in zoom-in-95 duration-500">
      {summary.count > 0 ? (
        <div className="flex flex-col items-center rounded-xl border bg-card px-6 py-14 text-center">
          <CheckCircle2Icon className="size-10 text-positive" aria-hidden />
          <h2 className="mt-4 font-display text-3xl font-bold">{t.review.caughtUp}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {fillStr(t.review.confirmedSummary, {
              n: summary.count,
              noun: summary.count === 1 ? t.words.activity : t.words.activities,
            })}
            {summary.totalKm > 0 ? (
              <> {fillStr(t.review.covering, { km: fmtKm(summary.totalKm) })}</>
            ) : null}
            .
          </p>
          {Object.keys(summary.perShoe).length > 0 ? (
            <dl className="mt-6 w-full max-w-sm space-y-1.5 text-sm">
              {Object.entries(summary.perShoe)
                .sort((a, b) => b[1] - a[1])
                .map(([name, km]) => (
                  <div
                    key={name}
                    className="flex items-baseline justify-between gap-4 border-b border-dashed border-border/70 pb-1.5"
                  >
                    <dt className="truncate text-muted-foreground">{name}</dt>
                    <dd className="font-mono font-medium tabular-nums text-positive">
                      +{fmtKm(km)}
                    </dd>
                  </div>
                ))}
            </dl>
          ) : null}
          <div className="mt-8 flex items-center gap-2">
            <Button asChild>
              <Link href="/">{t.review.backToLog}</Link>
            </Button>
            {freshArrivalsCount > 0 ? (
              <Button variant="outline" onClick={onReviewMore}>
                {fillStr(t.review.reviewMore, { n: freshArrivalsCount })}
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <EmptyState icon={InboxIcon} title={t.review.caughtUp} description={t.review.emptyBody}>
          <Button asChild variant="outline">
            <Link href="/">{t.review.backToLog}</Link>
          </Button>
        </EmptyState>
      )}
    </div>
  );
}

/**
 * Global keyboard shortcuts for the review flow. The handlers are read through a
 * ref refreshed every render, so the window listener attaches once yet always
 * calls the latest closures (identical to the inline effect it replaces).
 */
export function useReviewKeyboard(handlers: {
  confirmCurrent: () => void;
  goto: (next: number) => void;
  index: number;
  patchForm: (patch: Partial<FormState>) => void;
  kmInputRef: RefObject<HTMLInputElement | null>;
}) {
  const keyApi = useRef(handlers);
  useEffect(() => {
    keyApi.current = handlers;
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const api = keyApi.current;
      const target = event.target as HTMLElement | null;
      const typing = !!target?.closest(
        "input, textarea, select, [contenteditable], [role='combobox'], [role='listbox'], [role='option']"
      );

      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        api.confirmCurrent();
        return;
      }
      if (typing) return;

      if (event.key === "Enter") {
        // Let focused buttons and links keep their native Enter behavior.
        if (target?.closest("button, a")) return;
        event.preventDefault();
        api.confirmCurrent();
      } else if (event.key === "ArrowRight") {
        api.goto(api.index + 1);
      } else if (event.key === "ArrowLeft") {
        api.goto(api.index - 1);
      } else if (event.key === "e" || event.key === "E") {
        event.preventDefault();
        api.kmInputRef.current?.focus();
        api.kmInputRef.current?.select();
      } else if (/^[0-9]$/.test(event.key)) {
        const value = event.key === "0" ? 10 : Number(event.key);
        api.patchForm({ rpe: value });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
