"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Loader2Icon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/empty-state";
import { GaugeIcon } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { computeZonesAction } from "@/lib/actions";
import { fmtPace, fmtDateLong } from "@/lib/format";
import { fillStr } from "@/lib/i18n";
import { type DerivedZones, type ZoneKey } from "@/lib/zones";

const hrRange = (a: number | null, b: number | null) =>
  a != null || b != null ? `${a ?? "–"}–${b ?? "–"}` : "–";
const paceRange = (a: number | null, b: number | null) =>
  a != null || b != null
    ? `${a ? fmtPace(a).replace(" /km", "") : "–"}–${b ? fmtPace(b).replace(" /km", "") : "–"}`
    : "–";

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="label-micro">{label}</div>
      <div className="mt-0.5 font-display text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

export function ZonesPanel({
  initial,
  configured,
}: {
  initial: DerivedZones | null;
  configured: boolean;
}) {
  const { t, lang } = useI18n();
  // The server prop is the source of truth: computeZonesAction persists the
  // zones and revalidates, so its response already carries the new `initial`.
  // The optimistic layer only shows the freshly computed zones for the tail of
  // the transition, then hands back to the server tree.
  const [zones, showZones] = useOptimistic(initial);
  const [extra, setExtra] = useState("");
  const [pending, startTransition] = useTransition();
  const z = t.zones;

  if (!configured) {
    return <p className="text-sm text-muted-foreground">{z.notConfigured}</p>;
  }

  function compute() {
    startTransition(async () => {
      const result = await computeZonesAction(extra);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      showZones(result.zones);
    });
  }

  return (
    <div className="space-y-5">
      {zones ? (
        <>
          <dl className="grid grid-cols-3 gap-x-4 gap-y-4 sm:grid-cols-5">
            <StatTile label={z.maxHr} value={zones.maxHr != null ? String(zones.maxHr) : "–"} />
            <StatTile label={z.lt1} value={zones.lt1Hr != null ? `${zones.lt1Hr}` : "–"} />
            <StatTile label={z.lt2} value={zones.lt2Hr != null ? `${zones.lt2Hr}` : "–"} />
            <StatTile
              label={z.vo2max}
              value={zones.vo2maxEstimate != null ? String(Math.round(zones.vo2maxEstimate)) : "–"}
            />
            <StatTile label={z.confidenceLabel} value={z.confidence[zones.confidence]} />
          </dl>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left label-micro">
                  <th className="pb-2 font-medium">&nbsp;</th>
                  <th className="pb-2 font-medium">{z.hr}</th>
                  <th className="pb-2 font-medium">{z.pace}</th>
                </tr>
              </thead>
              <tbody>
                {[...zones.zones]
                  .sort((a, b) => a.zone - b.zone)
                  .map((zone) => (
                    <tr key={zone.zone} className="border-t">
                      <td className="py-1.5 font-medium">
                        {z.names[`z${zone.zone}` as ZoneKey] ?? `Z${zone.zone}`}
                      </td>
                      <td className="py-1.5 font-mono tabular-nums">
                        {hrRange(zone.hrMin, zone.hrMax)}
                      </td>
                      <td className="py-1.5 font-mono tabular-nums">
                        {paceRange(zone.paceMinSPerKm, zone.paceMaxSPerKm)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {zones.summary ? (
            <p className="text-sm leading-relaxed text-muted-foreground">{zones.summary}</p>
          ) : null}

          {zones.missingInfo.length > 0 ? (
            <div className="rounded-lg border border-dashed p-3">
              <p className="text-xs font-medium">{z.missingInfo}</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {zones.missingInfo.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">
            {fillStr(z.generatedAt, { date: fmtDateLong(zones.generatedAt, lang) })}
          </p>
        </>
      ) : (
        <EmptyState icon={GaugeIcon} title={z.empty} description={z.emptyBody} />
      )}

      <div className="space-y-2 border-t pt-4">
        <Textarea
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          placeholder={z.refinePlaceholder}
          className="min-h-16 resize-y text-sm"
          disabled={pending}
        />
        <Button onClick={compute} disabled={pending}>
          {pending ? (
            <Loader2Icon className="animate-spin" data-icon="inline-start" />
          ) : (
            <SparklesIcon data-icon="inline-start" />
          )}
          {pending ? z.computing : zones ? z.recompute : z.compute}
        </Button>
      </div>
    </div>
  );
}
