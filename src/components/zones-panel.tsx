"use client";

import { EmptyState } from "@/components/empty-state";
import { GaugeIcon } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { fmtDateLong, fmtPace } from "@/lib/format";
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

/** Displays saved zones only. Generation and refinement are intentionally absent. */
export function ZonesPanel({ initial: zones }: { initial: DerivedZones | null }) {
  const { t, lang } = useI18n();
  const z = t.zones;

  if (!zones) return <EmptyState icon={GaugeIcon} title={z.empty} description={z.emptyBody} />;

  return (
    <div className="space-y-5">
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
            {zones.missingInfo.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {fillStr(z.generatedAt, { date: fmtDateLong(zones.generatedAt, lang) })}
      </p>
    </div>
  );
}
