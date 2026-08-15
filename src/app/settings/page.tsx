import { headers } from "next/headers";
import { CableIcon, CheckCircle2Icon, CircleAlertIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SyncButton } from "@/components/sync-button";
import { DisconnectButton, GearMatcher, ManualActivityForm } from "@/components/settings-forms";
import { ByoConnectionForm } from "@/components/byo-connection-form";
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
import { isStravaConnected, stravaConfigured, tryFetchAllGear } from "@/lib/strava";
import { fmtDate, fmtDateLong, fmtTime } from "@/lib/format";
import { fillStr } from "@/lib/i18n";
import { requireCurrentUser } from "@/lib/auth";
import {
  callbackUrlForOrigin,
  deriveCurrentRequestOrigin,
  STRAVA_BYO_SCOPE,
} from "@/lib/strava-byo";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const owner = await requireCurrentUser();
  if (!owner) return null;
  const params = await searchParams;
  const { lang, t } = await getDict();
  const connected = await isStravaConnected(owner);
  // This stays deliberately limited to the unmodified legacy connection UI.
  // The new BYO credential form and handoff never read either global env value.
  const legacyConfigured = stravaConfigured();
  const connectionStatus = await getStravaConnectionStatus(owner);
  const callbackOrigin = deriveCurrentRequestOrigin(await headers());
  const callbackUrl = callbackOrigin ? callbackUrlForOrigin(callbackOrigin) : null;
  const athleteName = await getMeta(owner, "athlete_name");
  const lastSync = await getMeta(owner, "last_sync_at");
  const baselineDate = await getMeta(owner, "baseline_date");
  const allGear = connected ? await tryFetchAllGear(owner) : null;
  const gear = allGear?.shoes ?? null;
  const bikeGear = allGear?.bikes ?? null;
  const shoes = await listShoes(owner);
  const bikes = await listBikes(owner);
  const thresholds = await getAthleteThresholds(owner);
  const goals = await listGoals(owner);

  const justConnected = params.connected === "1";
  const errorKey = typeof params.error === "string" ? params.error : null;
  const errorMessage = errorKey ? (t.settingsPage.errors[errorKey] ?? t.errors.generic) : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-4xl font-bold">{t.settingsPage.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t.settingsPage.subtitle}</p>

      <div className="mt-6 space-y-6">
        {justConnected ? (
          <Alert className="border-emerald-500/30 text-emerald-700 dark:text-emerald-300">
            <CheckCircle2Icon />
            <AlertTitle>{t.settingsPage.connectedAlert}</AlertTitle>
            <AlertDescription>{t.settingsPage.connectedAlertBody}</AlertDescription>
          </Alert>
        ) : null}
        {errorMessage ? (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>{t.settingsPage.failedAlert}</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>{t.settingsPage.strava}</CardTitle>
            <CardDescription>{t.settingsPage.stravaBody}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {connected && legacyConfigured ? (
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
                  <Button asChild variant="outline" size="sm">
                    <a href="/api/strava/connect">{t.settingsPage.reconnect}</a>
                  </Button>
                  <DisconnectButton />
                </div>
              </div>
            ) : connectionStatus === "connected" ? (
              <Alert>
                <CircleAlertIcon aria-hidden />
                <AlertTitle>Connection completion is not available yet</AlertTitle>
                <AlertDescription>
                  This existing connection cannot be changed from Settings until its authorization
                  completion path is available. No credentials are shown here.
                </AlertDescription>
              </Alert>
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
                          unavailable until this Settings page can determine its current origin.
                        </span>
                      )}
                    </li>
                    <li>Enter the Client ID and Client Secret from that app below.</li>
                  </ol>
                </div>
                <ByoConnectionForm
                  callbackUrl={callbackUrl}
                  pendingAuthorization={connectionStatus === "pending_authorization"}
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

        <Card>
          <CardHeader>
            <CardTitle>{t.settingsPage.goals.title}</CardTitle>
            <CardDescription>{t.settingsPage.goals.body}</CardDescription>
          </CardHeader>
          <CardContent>
            <GoalsManager goals={goals} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.fitness.thresholds.title}</CardTitle>
            <CardDescription>{t.fitness.thresholds.body}</CardDescription>
          </CardHeader>
          <CardContent>
            <ThresholdsForm thresholds={thresholds} />
          </CardContent>
        </Card>

        {connected ? (
          <Card>
            <CardHeader>
              <CardTitle>{t.settingsPage.gearMatching}</CardTitle>
              <CardDescription>{t.settingsPage.gearMatchingBody}</CardDescription>
            </CardHeader>
            <CardContent>
              {gear && gear.length > 0 ? (
                <GearMatcher
                  kind="shoe"
                  items={shoes.map((s) => ({ ...toGearOption(s), gearId: s.strava_gear_id }))}
                  gear={gear}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {gear === null ? t.settingsPage.gearLoadFailed : t.settingsPage.gearScopeHint}
                </p>
              )}
            </CardContent>
          </Card>
        ) : null}

        {connected ? (
          <Card>
            <CardHeader>
              <CardTitle>{t.settingsPage.bikeMatching}</CardTitle>
              <CardDescription>{t.settingsPage.bikeMatchingBody}</CardDescription>
            </CardHeader>
            <CardContent>
              {bikeGear && bikeGear.length > 0 ? (
                <GearMatcher
                  kind="bike"
                  items={bikes.map((b) => ({ ...toGearOption(b), gearId: b.strava_gear_id }))}
                  gear={bikeGear}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {bikeGear === null ? t.settingsPage.gearLoadFailed : t.settingsPage.gearScopeHint}
                </p>
              )}
            </CardContent>
          </Card>
        ) : null}

        <Card>
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
      </div>
    </div>
  );
}
