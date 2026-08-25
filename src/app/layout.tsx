import type { Metadata } from "next";
import {
  Barlow,
  Barlow_Condensed,
  Geist_Mono,
  Instrument_Sans,
  Instrument_Serif,
} from "next/font/google";
import "./globals.css";
import { I18nProvider } from "@/components/i18n-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
// Speed Insights only (RUM). Usage/Web Analytics stays deferred behind the track() seam in src/lib/telemetry.ts.
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Header } from "@/components/header";
import { countPending } from "@/lib/db";
import { getLang } from "@/lib/lang";
import { isStravaConnected, shouldAutoSync } from "@/lib/strava";
import { requireCurrentUser } from "@/lib/auth";
import { requireCreator, resolveEnvironmentIndicator } from "@/features/access/server";

export const dynamic = "force-dynamic";

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
  weight: "variable",
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: {
    default: "Training Hub",
    template: "%s · Training Hub",
  },
  description:
    "Evidence-linked patterns across your own confirmed training history, with sources and limitations attached.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const lang = await getLang();
  const owner = await requireCurrentUser();
  // Login and sign-up render through this root layout too. A guest has no
  // domain context, so never query the activity queue merely to render chrome.
  const pendingCount = owner ? await countPending(owner) : 0;
  const connected = owner ? await isStravaConnected(owner) : false;
  const autoSync = owner ? await shouldAutoSync(owner) : false;
  // The capability/session check is intentionally server-side and only runs
  // for an authenticated request; guests never pay a domain access query.
  const environmentIndicator = owner ? await resolveEnvironmentIndicator() : null;
  const creator = owner ? Boolean(await requireCreator()) : false;
  const auth = owner ? "in" : "out";

  return (
    <html
      lang={lang === "pt" ? "pt-BR" : "en"}
      suppressHydrationWarning
      className={`${barlow.variable} ${barlowCondensed.variable} ${geistMono.variable} ${instrumentSans.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <I18nProvider lang={lang}>
            <a
              href="#main-content"
              className="focus-ring sr-only fixed top-3 left-3 z-50 rounded-md bg-background px-3 py-2 text-sm font-medium shadow-sm focus:not-sr-only"
            >
              Skip to main content
            </a>
            <Header
              pendingCount={pendingCount}
              connected={connected}
              autoSync={autoSync}
              auth={auth}
              accountEmail={owner?.email}
              environmentIndicator={environmentIndicator}
              creator={creator}
            />
            <main
              id="main-content"
              tabIndex={-1}
              className={
                owner
                  ? "th-foundation min-w-0 flex-1 bg-background lg:pl-64"
                  : "th-foundation min-w-0 flex-1 bg-background"
              }
            >
              {children}
            </main>
            <Toaster />
          </I18nProvider>
        </ThemeProvider>
        {owner ? <SpeedInsights /> : null}
      </body>
    </html>
  );
}
