// The /fitness consistency card: a trailing-year grid of daily load, one cell per
// day, collapsed by default. Server-rendered SVG with a native <title> per cell
// and zero client JS (the HealthTrendChart philosophy), so the card works with
// JS disabled. Every number arrives already computed by src/lib/consistency.ts —
// this file only lays out and formats.

import { ChevronRightIcon } from "lucide-react";
import type { ConsistencyHeatmap, HeatmapCell } from "@/lib/consistency";
import { fmtDayMonth, monthShort, parseLocalDate } from "@/lib/format";
import { fillStr, type Dict, type Lang } from "@/lib/i18n";

// Grid geometry in viewBox units (the SVG scales to its container width): a
// 10-unit cell with the plan's 3-unit gap, under a band for the month labels.
const CELL = 10;
const GAP = 3;
const STEP = CELL + GAP;
const MONTH_BAND = 14;
const RADIUS = 2;
const MONTH_FONT = 9;
/** Width a 3-glyph month label needs at MONTH_FONT, in viewBox units. */
const MONTH_LABEL = 16;

/**
 * The four load steps, as opacity over --primary (level 0 is the empty-day fill
 * instead). No new colours: the scale is the one accent at four strengths.
 */
const LEVEL_OPACITY = [0, 0.3, 0.5, 0.75, 1];

function dayLabel(date: string, lang: Lang): string {
  const local = parseLocalDate(date);
  // The grid spans two calendar years, so the year is always spelled out.
  return `${fmtDayMonth(local, lang)} ${local.getFullYear()}`;
}

/** "24 Jul 2026 · 62 TSS · 2 sessions", or the rest-day form for an empty day. */
function cellTitle(cell: HeatmapCell, lang: Lang, t: Dict): string {
  const day = dayLabel(cell.date, lang);
  if (cell.load <= 0 && cell.sessions === 0) return `${day} · ${t.fitness.heatmap.rest}`;
  const sessions =
    cell.sessions === 1
      ? t.fitness.heatmap.session
      : fillStr(t.fitness.heatmap.sessions, { n: cell.sessions });
  // A session with no computable load (a strength or soccer session) leaves the
  // cell on --muted, because the grid paints load and the streak counts load. The
  // tooltip therefore says "no load" rather than claiming "0 TSS", so the square
  // and its own label tell the same story.
  const load =
    cell.load <= 0 ? t.fitness.heatmap.noLoad : `${Math.round(cell.load)} ${t.fitness.tssUnit}`;
  return `${day} · ${load} · ${sessions}`;
}

export function ConsistencyHeatmapCard({
  heatmap,
  lang,
  t,
}: {
  heatmap: ConsistencyHeatmap;
  lang: Lang;
  t: Dict;
}) {
  const width = heatmap.columns * STEP - GAP;
  const height = MONTH_BAND + heatmap.rows * STEP - GAP;
  // A month whose 1st lands in one of the last columns starts too far right for
  // its label to fit inside the viewBox, and the SVG clips it to a stub ("Au").
  // Such a label is dropped rather than nudged left: a nudged label would sit
  // above the wrong week, and the grid already leaves the partial month it opens
  // with unlabeled, so this is the same choice at the other end. The cells' own
  // titles still name the month.
  const months = heatmap.months.filter((month) => month.column * STEP + MONTH_LABEL <= width);
  const streak =
    heatmap.streak === 0
      ? t.fitness.heatmap.streakNone
      : fillStr(t.fitness.heatmap.streak, { n: heatmap.streak });
  const active = fillStr(t.fitness.heatmap.activeDays, {
    n: heatmap.activeDaysPerWeek.toFixed(1),
  });

  return (
    <details className="group mt-6 rounded-xl border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 select-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <ChevronRightIcon
            aria-hidden
            className="size-3.5 shrink-0 text-muted-foreground/70 transition-transform group-open:rotate-90"
          />
          {t.fitness.heatmap.title}
        </span>
        <span className="text-right font-mono text-xs tabular-nums text-muted-foreground">
          {streak} · {active}
        </span>
      </summary>
      <div className="overflow-x-auto border-t px-4 py-3">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          style={{ height: "auto" }}
          className="block min-w-[620px]"
          role="img"
          aria-label={t.fitness.heatmap.title}
        >
          {months.map((month) => (
            <text
              key={`${month.month}-${month.column}`}
              x={month.column * STEP}
              y={MONTH_FONT}
              fontSize={MONTH_FONT}
              fill="var(--muted-foreground)"
            >
              {monthShort(month.month, lang)}
            </text>
          ))}
          {heatmap.cells.map((cell) => (
            <rect
              key={cell.date}
              x={cell.column * STEP}
              y={MONTH_BAND + cell.row * STEP}
              width={CELL}
              height={CELL}
              rx={RADIUS}
              fill={cell.level === 0 ? "var(--muted)" : "var(--primary)"}
              opacity={cell.level === 0 ? undefined : LEVEL_OPACITY[cell.level]}
            >
              <title>{cellTitle(cell, lang, t)}</title>
            </rect>
          ))}
        </svg>
      </div>
    </details>
  );
}
