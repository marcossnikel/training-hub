import type { Metadata } from "next";
import { Barlow, Barlow_Condensed, Geist_Mono } from "next/font/google";
import "./globals.css";
import { I18nProvider } from "@/components/i18n-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
// Speed Insights only (RUM). Usage/Web Analytics stays deferred behind the track() seam in src/lib/telemetry.ts.
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Header } from "@/components/header";
import { countPending } from "@/lib/db";
import { getLang } from "@/lib/lang";
import { isStravaConnected, shouldAutoSync, stravaConfigured } from "@/lib/strava";
import { authConfigured, isAuthenticated } from "@/lib/auth";

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

export const metadata: Metadata = {
  title: {
    default: "Training Hub",
    template: "%s · Training Hub",
  },
  description: "A private training journal with Strava sync and per-shoe mileage.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const lang = await getLang();
  const pendingCount = await countPending();
  const connected = await isStravaConnected();
  const configured = stravaConfigured();
  const autoSync = await shouldAutoSync();
  // Auth control state for the header. When auth is unconfigured (dev/e2e) show
  // nothing; when configured, reflect whether the owner has a valid session.
  const auth = !authConfigured() ? "disabled" : (await isAuthenticated()) ? "in" : "out";

  return (
    <html
      lang={lang === "pt" ? "pt-BR" : "en"}
      suppressHydrationWarning
      className={`${barlow.variable} ${barlowCondensed.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <I18nProvider lang={lang}>
            <Header
              pendingCount={pendingCount}
              connected={connected}
              configured={configured}
              autoSync={autoSync}
              auth={auth}
            />
            <main className="flex-1">{children}</main>
            <Toaster />
          </I18nProvider>
        </ThemeProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
