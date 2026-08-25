import { cn } from "@/lib/utils";
import type { EnvironmentIndicatorModel } from "@/features/access/environment-indicator";

export function EnvironmentIndicator({
  model,
  accessibleName,
  compact = false,
}: {
  model: EnvironmentIndicatorModel;
  accessibleName: string;
  compact?: boolean;
}) {
  return (
    <span
      aria-label={accessibleName}
      role="note"
      className={cn(
        "inline-flex max-w-[118px] items-center rounded-lg border border-border bg-muted px-2 py-1 font-mono text-[10px] leading-[14px] font-medium tracking-[0.04em] text-muted-foreground uppercase",
        compact && "py-0.5",
        model.tone === "test" && "border-dashed border-muted-foreground",
        model.tone === "info" && "border-state-blue-fg bg-state-blue-bg text-state-blue-fg",
        model.tone === "caution" &&
          "border-2 border-state-amber-fg bg-state-amber-bg font-semibold text-state-amber-fg"
      )}
      data-environment-indicator={model.label}
    >
      ENV · {model.label}
    </span>
  );
}
