import { CableIcon, CheckCircle2Icon, CircleAlertIcon, KeyRoundIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SyncButton } from "@/components/sync-button";
import { DisconnectButton, GearMatcher, ManualActivityForm } from "@/components/settings-forms";
import { ThresholdsForm } from "@/components/thresholds-form";
import { GoalsManager } from "@/components/goals-manager";
import { getAthleteThresholds, getMeta, listBikes, listGoals, listShoes } from "@/lib/db";
import { toGearOption } from "@/lib/gear";
import { getDict } from "@/lib/lang";
import { isStravaConnected, stravaConfigured, tryFetchAllGear } from "@/lib/strava";
import { fmtDate, fmtDateLong, fmtTime } from "@/lib/format";
import { fillStr } from "@/lib/i18n";
import { requireCurrentUser } from "@/lib/auth";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const owner = await requireCurrentUser();
  if (!owner) return null;
  const params = await searchParams;
  const { lang, t } = await getDict();
  const configured = stravaConfigured();
  const connected = await isStravaConnected(owner);
  const athleteName = await getMeta(owner, "athlete_name");
  const lastSync = await getMeta(owner, "last_sync_at");
  const baselineDate = await getMeta(owner, "baseline_date");
  const allGear = connected ? await tryFetchAllGear(owner) : null;
  const gear = allGear?.shoes ?? null;
  const bikeGear = allGear?.bikes ?? null;
  const shoes = await listShoes();
  const bikes = await listBikes();
  const thresholds = await getAthleteThresholds(owner);
  const goals = await listGoals();

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
            {!configured ? (
              <div className="space-y-3 text-sm">
                <p className="flex items-center gap-2 font-medium">
                  <KeyRoundIcon className="size-4 text-wear-worn" aria-hidden />
                  {t.settingsPage.keysMissing}
                </p>
                <ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground">
                  <li>
                    {t.settingsPage.step1a}{" "}
                    <a
                      href="https://www.strava.com/settings/api"
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2 hover:text-foreground"
                    >
                      strava.com/settings/api
                    </a>{" "}
                    {t.settingsPage.step1b}{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                      localhost
                    </code>
                  </li>
                  <li>
                    {t.settingsPage.step2a}{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                      .env.example
                    </code>{" "}
                    {t.settingsPage.step2b}{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                      .env.local
                    </code>{" "}
                    {t.settingsPage.step2c}
                  </li>
                  <li>{t.settingsPage.step3}</li>
                </ol>
              </div>
            ) : connected ? (
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
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  <p className="flex items-center gap-2 font-medium">
                    <span aria-hidden className="size-2 rounded-full bg-muted-foreground/40" />
                    {t.settingsPage.notConnected}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t.settingsPage.notConnectedBody}
                  </p>
                </div>
                <Button asChild>
                  <a href="/api/strava/connect">
                    <CableIcon data-icon="inline-start" /> {t.settingsPage.connect}
                  </a>
                </Button>
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
