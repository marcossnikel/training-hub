"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { InboxIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import { fill } from "@/lib/i18n";

const KEY = "review-banner-dismissed";
const EVENT = "review-banner-change";

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  return () => window.removeEventListener(EVENT, callback);
}

export function ReviewBanner({ count }: { count: number }) {
  const { t } = useI18n();
  // sessionStorage keeps the dismissal for the browser session; the server
  // snapshot renders the banner so SSR and hydration stay consistent.
  const dismissedFor = useSyncExternalStore(
    subscribe,
    () => sessionStorage.getItem(KEY),
    () => null
  );

  if (count === 0 || dismissedFor === String(count)) return null;

  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3">
      <InboxIcon className="size-4 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1 text-sm">
        {fill(t.banner.waiting, {
          n: <span className="font-semibold">{count}</span>,
          noun: count === 1 ? t.words.activity : t.words.activities,
        })}
      </p>
      <Button asChild size="sm" className="rounded-full px-3">
        <Link href="/review">{t.banner.reviewNow}</Link>
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t.banner.dismiss}
        onClick={() => {
          sessionStorage.setItem(KEY, String(count));
          window.dispatchEvent(new Event(EVENT));
        }}
      >
        <XIcon />
      </Button>
    </div>
  );
}
