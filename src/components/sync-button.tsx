"use client";

import { useEffect, useRef, useTransition } from "react";
import { RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/components/i18n-provider";
import { syncNowAction, type SyncActionResult } from "@/lib/actions";
import { fillStr, type Dict } from "@/lib/i18n";

function announce(result: SyncActionResult, manual: boolean, t: Dict) {
  if (!result.ok) {
    toast.error(result.error);
    return;
  }
  if (result.pendingNew > 0) {
    const noun = result.pendingNew === 1 ? t.words.activity : t.words.activities;
    toast.success(fillStr(t.toasts.newToReview, { n: result.pendingNew, noun }));
  } else if (result.imported > 0) {
    const noun = result.imported === 1 ? t.words.activity : t.words.activities;
    toast.success(fillStr(t.toasts.imported, { n: result.imported, noun }));
  } else if (manual) {
    toast.info(t.toasts.upToDate);
  }
}

export function SyncButton({
  connected,
  size = "sm",
  className,
}: {
  connected: boolean;
  size?: "sm" | "default";
  className?: string;
}) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      announce(await syncNowAction(), true, t);
    });
  }

  const button = (
    <Button
      variant="outline"
      size={size}
      className={className}
      onClick={run}
      disabled={!connected || pending}
    >
      <RefreshCwIcon className={pending ? "animate-spin" : undefined} />
      {/* Icon-only on a phone, where the header cannot afford the label. sr-only
          rather than hidden so the button keeps its accessible name. */}
      <span className="sr-only sm:not-sr-only">{pending ? t.header.syncing : t.header.sync}</span>
    </Button>
  );

  if (connected) return button;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0}>{button}</span>
        </TooltipTrigger>
        <TooltipContent>{t.header.connectFirst}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Fires one background sync when the app loads and the last sync is stale. */
export function AutoSync() {
  const { t } = useI18n();
  const ran = useRef(false);
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  });

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    syncNowAction().then((result) => {
      announce(result, false, tRef.current);
    });
  }, []);

  return null;
}
