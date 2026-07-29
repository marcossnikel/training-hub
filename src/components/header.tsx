"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { useTheme } from "next-themes";
import { LogInIcon, LogOutIcon, MoonIcon, SunIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import { AutoSync, SyncButton } from "@/components/sync-button";
import { logoutAction, setLangAction } from "@/lib/actions";
import type { Lang } from "@/lib/i18n";

/**
 * Auth control state passed from the server layout:
 *  - "disabled": auth is unconfigured (dev/e2e) — show nothing.
 *  - "out": auth is configured, no valid session — show a Log in link.
 *  - "in": authenticated owner — show a Log out button (submits logoutAction).
 */
export type AuthControl = "disabled" | "in" | "out";

function AuthButton({ state }: { state: AuthControl }) {
  const { t } = useI18n();
  if (state === "disabled") return null;
  if (state === "out") {
    return (
      <Button asChild variant="ghost" size="sm">
        <Link href="/login">
          <LogInIcon data-icon="inline-start" />
          <span className="sr-only sm:not-sr-only">{t.login.logIn}</span>
        </Link>
      </Button>
    );
  }
  return (
    <form action={logoutAction}>
      <Button type="submit" variant="ghost" size="sm">
        <LogOutIcon data-icon="inline-start" />
        <span className="sr-only sm:not-sr-only">{t.login.logOut}</span>
      </Button>
    </form>
  );
}

const NAV = [
  { href: "/", key: "log" },
  { href: "/performance", key: "performance" },
  { href: "/races", key: "races" },
  { href: "/review", key: "review" },
  { href: "/gear", key: "gear" },
  { href: "/settings", key: "settings" },
] as const;

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useI18n();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={t.header.toggleTheme}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <SunIcon className="hidden dark:block" />
      <MoonIcon className="dark:hidden" />
    </Button>
  );
}

function LangToggle() {
  const { lang } = useI18n();
  const [pending, startTransition] = useTransition();

  function switchTo(next: Lang) {
    if (next === lang || pending) return;
    startTransition(async () => {
      await setLangAction(next);
    });
  }

  return (
    <div className="flex items-center rounded-lg border p-0.5">
      {(["en", "pt"] as const).map((code) => (
        <button
          key={code}
          type="button"
          aria-pressed={lang === code}
          onClick={() => switchTo(code)}
          className={cn(
            "focus-ring rounded-md px-1.5 py-0.5 text-2xs font-semibold uppercase transition-colors",
            lang === code
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {code}
        </button>
      ))}
    </div>
  );
}

export function Header({
  pendingCount,
  connected,
  configured,
  autoSync,
  auth,
}: {
  pendingCount: number;
  connected: boolean;
  configured: boolean;
  autoSync: boolean;
  auth: AuthControl;
}) {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/70 backdrop-blur-[25px]">
      {autoSync && configured ? <AutoSync /> : null}
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:gap-5 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-1.5">
          <span className="font-display text-xl font-bold tracking-tight">Training Hub</span>
          <span aria-hidden className="mt-1.5 inline-block size-1.5 rounded-full bg-primary" />
        </Link>

        {/* Six links plus the right-hand cluster do not fit a phone. Below md the
            nav becomes a horizontal scroller rather than a dropdown: no new JS,
            and aria-current stays on a real link. */}
        <nav
          aria-label="Main"
          className="no-scrollbar flex min-w-0 items-center gap-0.5 overflow-x-auto text-sm md:overflow-x-visible"
        >
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "focus-ring flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
                  active && "bg-muted text-foreground"
                )}
              >
                {t.nav[item.key]}
                {item.href === "/review" && pendingCount > 0 ? (
                  <span className="inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary px-1 font-mono text-3xs font-semibold leading-none text-primary-foreground">
                    {pendingCount}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <SyncButton connected={connected} />
          <LangToggle />
          <ThemeToggle />
          <AuthButton state={auth} />
        </div>
      </div>
    </header>
  );
}
