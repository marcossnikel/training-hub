"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
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
 *  - "out": auth is configured, no valid session — show a Log in link.
 *  - "in": authenticated owner — show a Log out button (submits logoutAction).
 */
export type AuthControl = "in" | "out";

function AuthButton({ state, compact = false }: { state: AuthControl; compact?: boolean }) {
  const { t } = useI18n();
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
    <form action={logoutAction} className={compact ? undefined : "w-full"}>
      <Button
        type="submit"
        variant="ghost"
        size={compact ? "icon" : "default"}
        className={compact ? "size-10 rounded-full" : "h-10 w-full justify-start rounded-lg"}
      >
        <LogOutIcon data-icon="inline-start" />
        <span className={compact ? "sr-only" : undefined}>{t.login.logOut}</span>
      </Button>
    </form>
  );
}

const NAV = [
  { href: "/", key: "log" },
  { href: "/review", key: "review" },
  { href: "/weekly-brief", key: "weeklyBrief" },
  { href: "/performance", key: "performance" },
  { href: "/races", key: "races" },
  { href: "/gear", key: "gear" },
  { href: "/settings", key: "settings" },
] as const;

function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useI18n();
  const dark = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      className={compact ? "size-10 rounded-full" : "size-10 rounded-lg"}
      aria-label={t.header.darkTheme}
      aria-pressed={dark}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      <SunIcon className="hidden dark:block" />
      <MoonIcon className="dark:hidden" />
    </Button>
  );
}

function LangToggle({ compact = false }: { compact?: boolean }) {
  const { lang, t } = useI18n();
  const [pending, startTransition] = useTransition();

  function switchTo(next: Lang) {
    if (next === lang || pending) return;
    startTransition(async () => {
      await setLangAction(next);
    });
  }

  return (
    <div
      className={cn("flex items-center rounded-lg border p-0.5", compact && "rounded-full")}
      role="group"
      aria-label={t.header.language}
    >
      {(["en", "pt"] as const).map((code) => (
        <button
          key={code}
          type="button"
          aria-label={`${t.header.language}: ${code.toUpperCase()}`}
          aria-pressed={lang === code}
          disabled={pending}
          onClick={() => switchTo(code)}
          className={cn(
            "focus-ring min-h-8 rounded-md px-2 py-1 text-xs font-semibold uppercase transition-colors",
            compact && "rounded-full",
            lang === code
              ? "bg-card text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {code}
        </button>
      ))}
    </div>
  );
}

function NavigationLinks({
  pathname,
  pendingCount,
  compact = false,
}: {
  pathname: string;
  pendingCount: number;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const currentRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!compact) return;
    currentRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [compact, pathname]);

  return (
    <nav
      aria-label="Main"
      className={cn(
        compact
          ? "no-scrollbar flex min-w-0 gap-1 overflow-x-auto px-4 pb-3"
          : "mt-8 flex flex-col gap-1 px-3"
      )}
    >
      {NAV.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            ref={active ? currentRef : undefined}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "focus-ring flex min-h-11 items-center gap-2 whitespace-nowrap text-sm font-medium transition-colors",
              compact
                ? "rounded-lg px-3 text-muted-foreground hover:bg-card hover:text-foreground"
                : "rounded-r-lg border-l-2 border-transparent px-3 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
              active &&
                (compact
                  ? "bg-card text-foreground shadow-sm"
                  : "border-primary bg-sidebar-accent text-foreground")
            )}
          >
            <span>{t.nav[item.key]}</span>
            {item.href === "/review" && pendingCount > 0 ? (
              <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 font-mono text-[0.625rem] font-semibold leading-none text-primary-foreground">
                {pendingCount}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function Header({
  pendingCount,
  connected,
  autoSync,
  auth,
  accountEmail,
}: {
  pendingCount: number;
  connected: boolean;
  autoSync: boolean;
  auth: AuthControl;
  accountEmail?: string;
}) {
  const pathname = usePathname();
  const { t } = useI18n();

  // Auth-entry pages carry their own two-part hierarchy. The public landing
  // keeps its existing minimal utility bar unchanged until issue #67.
  if (auth === "out" && (pathname === "/login" || pathname === "/sign-up")) return null;

  if (auth === "out") {
    return (
      <header className="border-b border-border/70 bg-background">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/"
            className="focus-ring rounded-md font-display text-xl font-bold tracking-tight transition-colors duration-150 hover:text-primary motion-reduce:transition-none"
          >
            Training Hub
          </Link>
          <Link
            href="/login"
            className="focus-ring rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground motion-reduce:transition-none"
          >
            Log in
          </Link>
        </div>
      </header>
    );
  }

  const connectionLabel = connected ? t.header.stravaConnected : t.header.stravaNotConnected;

  return (
    <>
      {autoSync ? <AutoSync /> : null}

      <aside
        className="th-foundation fixed inset-y-0 left-0 z-40 hidden w-64 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar lg:flex"
        data-app-shell="wide"
      >
        <div className="px-6 pt-7">
          <Link
            href="/"
            className="focus-ring inline-flex rounded-md text-lg font-semibold tracking-[-0.02em]"
          >
            Training Hub
          </Link>
          <p className="mt-2 font-mono text-[0.625rem] font-medium tracking-[0.12em] text-muted-foreground">
            PRIVATE BETA
          </p>
        </div>

        <NavigationLinks pathname={pathname} pendingCount={pendingCount} />

        <div className="mt-auto border-t border-sidebar-border p-4">
          <div className="rounded-xl border border-sidebar-border bg-card p-3">
            <p className="font-mono text-[0.625rem] font-medium tracking-[0.1em] text-muted-foreground uppercase">
              Strava
            </p>
            <p className="mt-2 flex items-center gap-2 text-sm font-medium">
              <span
                aria-hidden
                className={cn(
                  "size-2 rounded-full",
                  connected ? "bg-positive" : "bg-muted-foreground"
                )}
              />
              {connectionLabel}
            </p>
          </div>

          <div className="mt-4 min-w-0">
            <p className="font-mono text-[0.625rem] font-medium tracking-[0.1em] text-muted-foreground uppercase">
              {t.header.account}
            </p>
            <p className="mt-1 truncate text-sm font-medium" title={accountEmail}>
              {accountEmail}
            </p>
          </div>

          <div className="mt-4">
            <SyncButton connected={connected} size="default" className="h-10 w-full rounded-full" />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <LangToggle />
            <ThemeToggle />
          </div>
          <div className="mt-2">
            <AuthButton state={auth} />
          </div>
        </div>
      </aside>

      <header
        className="th-foundation sticky top-0 z-40 border-b border-border bg-background lg:hidden"
        data-app-shell="compact"
      >
        <div className="flex min-h-14 items-center gap-2 px-4 py-2">
          <Link
            href="/"
            className="focus-ring mr-auto shrink-0 rounded-md font-semibold tracking-tight"
          >
            Training Hub
          </Link>
          <SyncButton connected={connected} size="default" className="size-10 rounded-full px-0" />
          <ThemeToggle compact />
          <AuthButton state={auth} compact />
        </div>
        <div className="flex min-w-0 items-center gap-2 px-4 pb-2 text-xs text-muted-foreground">
          <span className="max-w-[30%] truncate font-medium text-foreground" title={accountEmail}>
            {accountEmail}
          </span>
          <span aria-hidden>·</span>
          <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
            <span
              aria-hidden
              className={cn(
                "size-1.5 rounded-full",
                connected ? "bg-positive" : "bg-muted-foreground"
              )}
            />
            {connectionLabel}
          </span>
          <span className="ml-auto">
            <LangToggle compact />
          </span>
        </div>
        <NavigationLinks pathname={pathname} pendingCount={pendingCount} compact />
      </header>
    </>
  );
}
