import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { fillStr } from "@/lib/i18n";
import { photoSrc } from "@/lib/storage";

// Shared card chrome for a gear entity: the framed photo header (with an
// optional status-badge overlay), the name + role line (optional leading role
// icon), an entity-specific body (`children`), the Strava-gear caption, and the
// edit + retire footer. Shoe and bike specialize by supplying their own body,
// badge, and the fallback/role icons — the chrome lives here once.
export function GearCard({
  name,
  role,
  noRoleLabel,
  roleIcon: RoleIcon,
  photoPath,
  retired,
  fallbackIcon: FallbackIcon,
  badge,
  gearName,
  gearLabel,
  contentClassName,
  children,
  editTrigger,
  retireButton,
}: {
  name: string;
  role: string | null;
  noRoleLabel: string;
  roleIcon?: LucideIcon;
  photoPath: string | null;
  retired: boolean;
  fallbackIcon: LucideIcon;
  badge?: React.ReactNode;
  gearName: string | null;
  gearLabel: string;
  contentClassName?: string;
  children: React.ReactNode;
  editTrigger: React.ReactNode;
  retireButton: React.ReactNode;
}) {
  const photo = photoSrc(photoPath);

  return (
    <Card className={cn("pt-0", retired && "opacity-80")}>
      <div
        className={cn(
          "relative flex h-44 items-center justify-center overflow-hidden border-b",
          photo ? "bg-white" : "bg-gradient-to-br from-accent via-muted to-background",
          retired && "grayscale"
        )}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt={name}
            className="size-full object-contain p-4 mix-blend-multiply transition-transform duration-300 group-hover/card:scale-[1.04]"
          />
        ) : (
          <FallbackIcon className="size-10 text-primary/25" aria-hidden />
        )}
        {badge}
      </div>

      <CardContent className={cn("space-y-3", contentClassName)}>
        <div>
          <h3 className="truncate text-sm font-medium" title={name}>
            {name}
          </h3>
          <p
            className={cn(
              "mt-0.5 truncate text-xs text-muted-foreground italic",
              RoleIcon && "flex items-center gap-1"
            )}
          >
            {RoleIcon ? <RoleIcon className="size-3.5 shrink-0" aria-hidden /> : null}
            {role ?? noRoleLabel}
          </p>
        </div>

        {children}

        {gearName ? (
          <p className="truncate text-xs text-muted-foreground">
            {fillStr(gearLabel, { name: gearName })}
          </p>
        ) : null}

        <div className="flex items-center justify-between border-t pt-3">
          {editTrigger}
          {retireButton}
        </div>
      </CardContent>
    </Card>
  );
}
