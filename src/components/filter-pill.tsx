import Link from "next/link";
import { cn } from "@/lib/utils";

export function FilterPill({
  href,
  active,
  label,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  count?: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "focus-ring inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
        active
          ? "border-transparent bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:border-ring hover:text-foreground"
      )}
    >
      {label}
      {count != null ? (
        <span
          className={cn(
            "font-mono text-2xs tabular-nums",
            active ? "text-primary-foreground" : "text-muted-foreground"
          )}
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}
