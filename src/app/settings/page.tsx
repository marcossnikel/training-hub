import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CableIcon, CheckCircle2Icon, CircleAlertIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SyncButton } from "@/components/sync-button";
import { ManualActivityForm } from "@/components/settings-forms";
import { ByoConnectionForm } from "@/components/byo-connection-form";
import { StravaConnectionControls } from "@/components/strava-connection-controls";
import { ThresholdsForm } from "@/components/thresholds-form";
import { GoalsManager } from "@/components/goals-manager";
import {
  getAthleteThresholds,
  getMeta,
  getStravaConnectionStatus,
  listBikes,
  listGoals,
  listShoes,
} from "@/lib/db";
import { toGearOption } from "@/lib/gear";
import { getDict } from "@/lib/lang";
import { isStravaConnected } from "@/features/strava/server/connection";
import { fmtDate, fmtDateLong, fmtTime } from "@/lib/format";
import { fillStr } from "@/lib/i18n";
import { requireCurrentUser } from "@/lib/auth";
import { callbackUrlForOrigin, resolveSettingsByoOrigin, STRAVA_BYO_SCOPE } from "@/lib/strava-byo";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const owner = await requireCurrentUser();
  if (!owner) redirect("/login");
  const params = await searchParams;
  const { lang, t } = await getDict();
  const ts = t.settingsPage;
  const connected = await isStravaConnected(owner);
  const connectionStatus = await getStravaConnectionStatus(owner);
  const callbackOrigin = resolveSettingsByoOrigin(await headers());
  const callbackUrl = callbackOrigin ? callbackUrlForOrigin(callbackOrigin) : null;
  const athleteName = await getMeta(owner, "athlete_name");
  const lastSync = await getMeta(owner, "last_sync_at");
  const baselineDate = await getMeta(owner, "baseline_date");
  const shoes = await listShoes(owner);
  const bikes = await listBikes(owner);
  const thresholds = await getAthleteThresholds(owner);
  const goals = await listGoals(owner);

  const callbackResult = typeof params.strava === "string" ? params.strava : null;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:py-10">
      <header className="max-w-3xl">
        <p className="font-mono text-xs text-muted-foreground uppercase">{ts.title}</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-[2.5rem] sm:leading-[2.75rem]">
          {ts.headline}
        </h1>
        <p className="mt-3 text-base leading-7 text-muted-foreground">{ts.intro}</p>
      </header>

      <nav aria-label={ts.title} className="mt-6 flex flex-wrap gap-2">
        {[
          ["#profile", ts.profile],
          ["#connection", ts.connection],
          ["#training-preferences", ts.trainingPreferences],
          ["#gear-and-corrections", ts.gearAndCorrections],
          ["#data-and-privacy", ts.dataTitle],
        ].map(([href, label]) => (
          <a
            key={href}
            href={href}
            className="focus-ring inline-flex min-h-10 items-center rounded-full border bg-card px-3 text-xs font-medium transition-colors hover:border-primary hover:text-primary motion-reduce:transition-none"
          >
            {label}
          </a>
        ))}
      </nav>

      <div className="mt-8 max-w-3xl space-y-6">
        {callbackResult === "connected" ? (
          <Alert className="border-emerald-500/30 text-emerald-700 dark:text-emerald-300">
            <CheckCircle2Icon />
            <AlertTitle>Strava is connected</AlertTitle>
            <AlertDescription>
              Your authorized scopes were confirmed. Import status is shown from your account data.
            </AlertDescription>
          </Alert>
        ) : null}
        {callbackResult === "scope" ? (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>Strava access wasn’t approved</AlertTitle>
            <AlertDescription>
              This connection needs activity and profile access. You can try authorization again.
            </AlertDescription>
          </Alert>
        ) : null}
        {callbackResult === "recovery" ? (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>We couldn’t connect Strava</AlertTitle>
            <AlertDescription>
              Your app credentials remain private. Try authorization again.
            </AlertDescription>
          </Alert>
        ) : null}
        {callbackResult === "reconnect" ? (
          <Alert className="border-state-blue-fg/30 text-state-blue-fg">
            <CheckCircle2Icon />
            <AlertTitle>Reconnect your Strava app</AlertTitle>
            <AlertDescription>Continue to Strava to renew this connection.</AlertDescription>
          </Alert>
        ) : null}
        {callbackResult === "deleted" ? (
          <Alert className="border-emerald-500/30 text-emerald-700 dark:text-emerald-300">
            <CheckCircle2Icon />
            <AlertTitle>Disconnected and local imported data deleted</AlertTitle>
            <AlertDescription>Your manual training records stay in Training Hub.</AlertDescription>
          </Alert>
        ) : null}
        {callbackResult === "deleted_provider_unconfirmed" ? (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>Disconnected and local imported data deleted</AlertTitle>
            <AlertDescription>
              We couldn’t confirm revocation with Strava. Remove this app in Strava settings if
              needed.
            </AlertDescription>
          </Alert>
        ) : null}

        <Card id="profile" className="scroll-mt-6 rounded-2xl">
          <CardHeader>
            <CardTitle className="text-2xl tracking-[-0.025em]">{ts.profile}</CardTitle>
            <CardDescription className="max-w-2xl leading-6">{ts.profileBody}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y divide-border/70">
              <div className="flex flex-wrap items-baseline justify-between gap-2 py-3 first:pt-0">
                <dt className="text-sm font-medium">{ts.accountEmail}</dt>
                <dd className="font-mono text-xs text-muted-foreground">{owner.email}</dd>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                <dt className="text-sm font-medium">{ts.sourceName}</dt>
                <dd className="font-mono text-xs text-muted-foreground">
                  {athleteName ?? ts.notConnected}
                </dd>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-2 pt-3">
                <dt className="text-sm font-medium">{ts.language}</dt>
                <dd className="font-mono text-xs uppercase text-muted-foreground">{lang}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card
          id="connection"
          className={
            connected && connectionStatus === "connected"
              ? "scroll-mt-6 rounded-2xl bg-[var(--th-status-positive-surface)]"
              : "scroll-mt-6 rounded-2xl"
          }
        >
          <CardHeader>
            <CardTitle>{t.settingsPage.strava}</CardTitle>
            <CardDescription>{t.settingsPage.stravaBody}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {connected && connectionStatus === "connected" ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm">
                    <p className="flex items-center gap-2 font-medium">
                      <span aria-hidden className="size-2 rounded-full bg-positive" />
                      {fillStr(t.settingsPage.connectedAs, {
                        name: athleteName ? ` · ${athleteName}` : "",
                      })}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {lastSync
                        ? fillStr(t.settingsPage.lastSync, {
                            date: fmtDate(lastSync, lang),
                            time: fmtTime(lastSync),
                          })
                        : t.settingsPage.neverSynced}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <SyncButton connected={connected} />
                  </div>
                </div>
                <StravaConnectionControls />
              </>
            ) : (
              <div className="space-y-5">
                <div className="space-y-2 text-sm">
                  <p className="flex items-center gap-2 font-medium">
                    <CableIcon className="size-4 text-muted-foreground" aria-hidden />
                    Connect your Strava app
                  </p>
                  <p className="text-muted-foreground">
                    This beta connects through a Strava app you create and control. We’ll ask only
                    for the approved access needed to import your training history.
                  </p>
                  <p className="text-muted-foreground">
                    Requested access:{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                      {STRAVA_BYO_SCOPE}
                    </code>
                    . Training Hub reads your data and does not write anything to Strava. Using your
                    own app does not resolve Strava’s platform or commercial requirements.
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                  <p className="font-medium">Create and configure your app</p>
                  <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-muted-foreground">
                    <li>
                      Create an app in{" "}
                      <a
                        href="https://www.strava.com/settings/api"
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-2 hover:text-foreground"
                      >
                        Strava’s API settings
                      </a>{" "}
                      that you control.
                    </li>
                    <li id="callback-help">
                      Register this exact callback URL for this environment:{" "}
                      {callbackUrl ? (
                        <code className="break-all rounded bg-background px-1 py-0.5 font-mono text-xs">
                          {callbackUrl}
                        </code>
                      ) : (
                        <span>
                          unavailable. This environment needs a canonical callback configuration
                          before credentials can be entered.
                        </span>
                      )}
                    </li>
                    <li>Enter the Client ID and Client Secret from that app below.</li>
                  </ol>
                </div>
                <ByoConnectionForm
                  callbackUrl={callbackUrl}
                  pendingAuthorization={connectionStatus === "pending_authorization"}
                  returnKey={params.onboarding === "welcome" ? "onboarding" : "settings"}
                />
              </div>
            )}

            {baselineDate ? (
              <p className="border-t pt-3 text-xs text-muted-foreground">
                {fillStr(t.settingsPage.baselineNote, { date: fmtDateLong(baselineDate, lang) })}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card id="training-preferences" className="scroll-mt-6 rounded-2xl">
          <CardHeader>
            <CardTitle>{t.settingsPage.goals.title}</CardTitle>
            <CardDescription>{t.settingsPage.goals.body}</CardDescription>
          </CardHeader>
          <CardContent>
            <GoalsManager goals={goals} />
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>{t.fitness.thresholds.title}</CardTitle>
            <CardDescription>{t.fitness.thresholds.body}</CardDescription>
          </CardHeader>
          <CardContent>
            <ThresholdsForm thresholds={thresholds} />
          </CardContent>
        </Card>

        {connected ? (
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>{t.settingsPage.gearMatching}</CardTitle>
              <CardDescription>{t.settingsPage.gearMatchingBody}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {t.settingsPage.gearScopeHint}
            </CardContent>
          </Card>
        ) : null}

        <Card id="gear-and-corrections" className="scroll-mt-6 rounded-2xl">
          <CardHeader>
            <CardTitle>{t.settingsPage.manual}</CardTitle>
            <CardDescription>{t.settingsPage.manualBody}</CardDescription>
          </CardHeader>
          <CardContent>
            {shoes.length > 0 ? (
              <ManualActivityForm shoes={shoes.map(toGearOption)} />
            ) : (
              <p className="text-sm text-muted-foreground">{t.settingsPage.addShoeFirst}</p>
            )}
          </CardContent>
        </Card>

        <Card
          id="data-and-privacy"
          className="scroll-mt-6 rounded-2xl bg-[var(--th-status-caution-surface)]"
        >
          <CardHeader>
            <CardTitle className="text-2xl tracking-[-0.025em]">{ts.dataTitle}</CardTitle>
            <CardDescription className="max-w-2xl leading-6">{ts.dataBody}</CardDescription>
          </CardHeader>
          <CardContent>
            <a
              href="#connection"
              className="focus-ring inline-flex min-h-10 items-center rounded-full border bg-card px-4 text-sm font-medium transition-colors hover:border-primary hover:text-primary motion-reduce:transition-none"
            >
              {ts.reviewDataControl}
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
