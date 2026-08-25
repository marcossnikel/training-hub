import { cn } from "@/lib/utils";
import type { ShoeWithMileage, WearStatus } from "@/lib/types";

export function wearStatus(shoe: ShoeWithMileage): WearStatus {
  if (shoe.retired_at) return "retired";
  const cap = shoe.retirement_km ?? 700;
  const ratio = cap > 0 ? (shoe.current_km ?? 0) / cap : 0;
  if (ratio >= 0.9) return "critical";
  if (ratio >= 0.7) return "worn";
  return "fresh";
}

const FILL_CLASS: Record<WearStatus, string> = {
  fresh: "bg-positive",
  worn: "bg-wear-worn",
  critical: "bg-wear-critical",
  retired: "bg-muted-foreground/50",
};

const TICKS = 28;

/**
 * The signature wear meter: a row of tally ticks, one per slice of the shoe's
 * retirement threshold (25 km each at the default 700 km). Filled ticks take
 * the wear status color; the status always ships with a text label elsewhere,
 * never color alone.
 */
export function WearBar({
  currentKm,
  retirementKm,
  status,
  className,
}: {
  currentKm: number;
  retirementKm: number | null;
  status: WearStatus;
  className?: string;
}) {
  const cap = retirementKm && retirementKm > 0 ? retirementKm : 700;
  const ratio = Math.max(0, currentKm / cap);
  const filled = Math.min(TICKS, Math.round(ratio * TICKS));

  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={cap}
      aria-valuenow={Math.round(Math.min(currentKm, cap))}
      aria-label={`${Math.round(currentKm)} of ${Math.round(cap)} km`}
      className={cn("flex h-3.5 items-center gap-[3px]", className)}
    >
      {Array.from({ length: TICKS }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-full w-[3px] flex-none rounded-full transition-colors",
            i < filled ? FILL_CLASS[status] : "bg-border"
          )}
        />
      ))}
    </div>
  );
}
