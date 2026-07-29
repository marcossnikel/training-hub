"use client";

import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n-provider";
import { FEELINGS } from "@/lib/feelings";
import type { Feeling } from "@/lib/types";

export function RpeControl({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const { t } = useI18n();
  return (
    <div>
      <div className="flex items-center gap-1" role="radiogroup" aria-label="RPE 1-10">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            onClick={() => onChange(value === n ? null : n)}
            className={cn(
              "focus-ring h-8 w-full min-w-6 rounded-md border font-mono text-xs tabular-nums transition-colors",
              value === n
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:border-ring hover:text-foreground"
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex h-4 items-center gap-2 text-xs text-muted-foreground">
        {value != null ? (
          <>
            <span>
              RPE {value} · {t.rpeHints[value]}
            </span>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="inline-flex items-center gap-0.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <XIcon className="size-3" aria-hidden /> {t.review.clear}
            </button>
          </>
        ) : (
          <span className="text-muted-foreground">{t.review.rpeEmptyHint}</span>
        )}
      </div>
    </div>
  );
}

export function FeelingControl({
  value,
  onChange,
}: {
  value: Feeling | null;
  onChange: (value: Feeling | null) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-5 gap-1" role="radiogroup" aria-label={t.review.feeling}>
      {FEELINGS.map((f) => (
        <button
          key={f.value}
          type="button"
          role="radio"
          aria-checked={value === f.value}
          onClick={() => onChange(value === f.value ? null : f.value)}
          className={cn(
            "focus-ring flex flex-col items-center gap-0.5 rounded-lg border px-1 py-2 text-xs transition-colors",
            value === f.value
              ? "border-primary bg-accent text-accent-foreground"
              : "border-border text-muted-foreground hover:border-ring hover:text-foreground"
          )}
        >
          <span aria-hidden className="text-base leading-none">
            {f.emoji}
          </span>
          {t.feelings[f.value]}
        </button>
      ))}
    </div>
  );
}
