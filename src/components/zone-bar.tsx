// Stacked-percent zone distribution with a legend, shared by the race
// comparison and the activity page. Deliberately not a "use client" module: it
// holds no state, so it renders on the server for the activity page and is
// bundled into the client for race-compare.

import { fmtDuration } from "@/lib/format";
import { ZONE_COLORS } from "@/lib/zones";

// fmtDuration returns the missing-value placeholder for 0, which in this legend
// would make a zone the athlete genuinely never entered look like absent data.
// Every zone here has a known value, so a true zero is a real clock reading.
function fmtZoneTime(s: number): string {
  return s > 0 ? fmtDuration(s) : "0:00";
}

export function ZoneBar({
  zoneSec,
  labels,
  showTime = false,
}: {
  zoneSec: number[];
  labels: string[];
  /** Print each zone's mm:ss beside its percentage in the legend. */
  showTime?: boolean;
}) {
  const total = zoneSec.reduce((s, v) => s + v, 0);
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {zoneSec.map((v, i) => {
          const pct = total > 0 ? (v / total) * 100 : 0;
          if (pct <= 0) return null;
          return (
            <div
              key={i}
              style={{ width: `${pct}%`, backgroundColor: ZONE_COLORS[i] }}
              title={`${labels[i]} · ${Math.round(pct)}%`}
            />
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {zoneSec.map((v, i) => {
          const pct = total > 0 ? Math.round((v / total) * 100) : 0;
          return (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
            >
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: ZONE_COLORS[i] }}
                aria-hidden
              />
              {labels[i]}
              <span className="font-mono tabular-nums">{pct}%</span>
              {showTime ? (
                <span className="font-mono tabular-nums opacity-70">{fmtZoneTime(v)}</span>
              ) : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}
