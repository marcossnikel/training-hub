"use client";

import { useState, useTransition } from "react";
import { CircleAlertIcon, Loader2Icon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  disconnectStravaAction,
  reconnectStravaAction,
  type DisconnectStravaResult,
  type ReconnectStravaResult,
} from "@/lib/strava-lifecycle-actions";

function actionError(result: { status: string }): string | null {
  if (result.status === "unauthorized")
    return "Your session ended. Sign in again to manage Strava.";
  if (result.status === "unavailable") return "We couldn’t finish that Strava step. Try again.";
  return null;
}

/**
 * The connected-state controls are deliberately client-owned only for dialog
 * focus, duplicate prevention, and truthful result feedback. Every mutation
 * still derives its owner from the server session and accepts no IDs or tokens.
 */
export function StravaConnectionControls() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reconnectResult, setReconnectResult] = useState<ReconnectStravaResult | null>(null);
  const [disconnectResult, setDisconnectResult] = useState<DisconnectStravaResult | null>(null);
  const [reconnecting, startReconnect] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();

  function reconnect() {
    setDisconnectResult(null);
    setReconnectResult(null);
    startReconnect(async () => {
      const result = await reconnectStravaAction();
      setReconnectResult(result);
    });
  }

  function disconnect() {
    startDisconnect(async () => {
      const result = await disconnectStravaAction();
      setDisconnectResult(result);
      setDialogOpen(false);
    });
  }

  const reconnectError = reconnectResult ? actionError(reconnectResult) : null;
  const disconnectError = disconnectResult ? actionError(disconnectResult) : null;
  return (
    <div className="space-y-3">
      {reconnectError ? (
        <Alert variant="destructive" aria-live="assertive">
          <CircleAlertIcon aria-hidden />
          <AlertTitle>We couldn’t reconnect Strava</AlertTitle>
          <AlertDescription>{reconnectError}</AlertDescription>
        </Alert>
      ) : null}
      {disconnectError ? (
        <Alert variant="destructive" aria-live="assertive">
          <CircleAlertIcon aria-hidden />
          <AlertTitle>We couldn’t disconnect Strava</AlertTitle>
          <AlertDescription>{disconnectError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <a href="/log">View recent training</a>
        </Button>
        <Button variant="outline" onClick={reconnect} disabled={reconnecting || disconnecting}>
          {reconnecting ? (
            <Loader2Icon className="animate-spin motion-reduce:animate-none" aria-hidden />
          ) : (
            <RotateCcwIcon aria-hidden />
          )}
          {reconnecting ? "Preparing reconnect…" : "Reconnect"}
        </Button>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={reconnecting || disconnecting}
            >
              <Trash2Icon aria-hidden />
              Disconnect and delete
            </Button>
          </DialogTrigger>
          <DialogContent showCloseButton={false} aria-describedby="disconnect-description">
            <DialogHeader>
              <DialogTitle>Disconnect and delete imported data?</DialogTitle>
              <DialogDescription id="disconnect-description">
                This permanently removes this connection and activities imported from Strava,
                including their stored details, streams, metrics, and derived records. Your manual
                activities, goals, journal, thresholds, and manually entered gear stay.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={disconnecting}
              >
                Cancel
              </Button>
              <Button variant="destructive" onClick={disconnect} disabled={disconnecting}>
                {disconnecting ? (
                  <Loader2Icon className="animate-spin motion-reduce:animate-none" aria-hidden />
                ) : null}
                {disconnecting ? "Disconnecting…" : "Disconnect and delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
