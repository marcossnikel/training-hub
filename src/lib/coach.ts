// AI coach layer (server-only). Wraps the Claude API: builds compact plain-text
// context blocks from an activity's metrics and the athlete's fitness state, then
// runs a per-activity chat or a weekly digest. Degrades gracefully — the client
// is created lazily and every caller guards with isCoachConfigured().
import Anthropic from "@anthropic-ai/sdk";
import type { DigestActivity, FieldSignals } from "./db";
import type { AthleteThresholds, WeeklyMonotony } from "./fitness";
import type { ActivityStreams } from "./streams";
import type { ActivityWithSplits, Goal } from "./types";
import type { DerivedZones } from "./zones";
import { fmtDateLong, fmtDuration, fmtHr, fmtKm, fmtPace, localStartedAt } from "./format";

export const COACH_MODEL = "claude-opus-4-8";

export function isCoachConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

// Lazily created so importing this module never requires the key to be present.
let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

// ---------------------------------------------------------------------------
// Context inputs
// ---------------------------------------------------------------------------

export interface CoachLoad {
  tss: number;
  method: string | null;
  intensityFactor: number | null;
}

export interface CoachPmc {
  ctl: number;
  atl: number;
  tsb: number;
}

export interface CoachStreamSummary {
  avgHr: number | null;
  maxHr: number | null;
  fastestPaceSPerKm: number | null;
  slowestPaceSPerKm: number | null;
  avgPower: number | null;
  maxPower: number | null;
  avgCadence: number | null;
}

export interface CoachJournal {
  rpe: number | null;
  feeling: string | null;
  workoutNotes: string | null;
  healthNotes: string | null;
}

/** One lap/segment of a session (from Strava lap detail), for the coach. */
export interface LapSummary {
  km: number | null;
  timeS: number | null;
  paceSPerKm: number | null;
  avgHr: number | null;
  maxHr: number | null;
}

/** A recent session the coach can compare the current one against. */
export interface RecentSessionSummary {
  date: string | null;
  name: string | null;
  distanceKm: number | null;
  paceSPerKm: number | null;
  avgHr: number | null;
  maxHr: number | null;
  tss: number | null;
  laps: LapSummary[];
}

function lapLine(lap: LapSummary, index: number): string {
  const bits = [
    lap.km != null ? `${lap.km.toFixed(2)} km` : null,
    lap.timeS != null ? fmtDuration(lap.timeS) : null,
    lap.paceSPerKm ? fmtPace(lap.paceSPerKm) : null,
    lap.avgHr != null
      ? `HR ${Math.round(lap.avgHr)}${lap.maxHr != null ? `/${Math.round(lap.maxHr)}` : ""}`
      : null,
  ].filter(Boolean);
  return `  L${index + 1}: ${bits.join(", ")}`;
}

const METHOD_LABEL: Record<string, string> = {
  power: "power",
  pace: "pace",
  hr: "heart rate",
  rpe: "RPE",
};

function avg(arr: (number | null)[] | null): number | null {
  if (!arr) return null;
  let sum = 0;
  let count = 0;
  for (const v of arr) {
    if (v == null) continue;
    sum += v;
    count += 1;
  }
  return count > 0 ? sum / count : null;
}

function extremum(arr: (number | null)[] | null, kind: "min" | "max"): number | null {
  if (!arr) return null;
  let best: number | null = null;
  for (const v of arr) {
    if (v == null) continue;
    if (best == null || (kind === "min" ? v < best : v > best)) best = v;
  }
  return best;
}

/** Cheap avg/max/range summary of the per-second streams for the context block. */
export function summarizeStreams(s: ActivityStreams): CoachStreamSummary {
  return {
    avgHr: avg(s.heartrate),
    maxHr: extremum(s.heartrate, "max"),
    fastestPaceSPerKm: extremum(s.paceSPerKm, "min"),
    slowestPaceSPerKm: extremum(s.paceSPerKm, "max"),
    avgPower: avg(s.watts),
    maxPower: extremum(s.watts, "max"),
    avgCadence: avg(s.cadence),
  };
}

// ---------------------------------------------------------------------------
// Context builders (compact plain text, metric units, pace as m:ss/km)
// ---------------------------------------------------------------------------

export function buildActivityContext(input: {
  activity: ActivityWithSplits;
  load: CoachLoad | null;
  thresholds: AthleteThresholds;
  pmc: CoachPmc | null;
  streams: CoachStreamSummary | null;
  journal: CoachJournal;
  goals: Goal[];
  zones: DerivedZones | null;
  laps: LapSummary[];
  recent: RecentSessionSummary[];
}): string {
  const { activity, load, thresholds, pmc, streams, journal, goals, zones, laps, recent } = input;
  const lines: string[] = [];

  lines.push("WORKOUT");
  lines.push(`- Name: ${activity.name ?? "Untitled"}`);
  lines.push(`- Sport: ${activity.sport_type ?? "unknown"}`);
  lines.push(`- Date: ${fmtDateLong(localStartedAt(activity))}`);
  if (activity.distance_km != null) lines.push(`- Distance: ${fmtKm(activity.distance_km, 2)}`);
  if (activity.moving_time_s) lines.push(`- Moving time: ${fmtDuration(activity.moving_time_s)}`);
  if (activity.avg_pace_s_per_km) lines.push(`- Avg pace: ${fmtPace(activity.avg_pace_s_per_km)}`);
  if (activity.avg_hr) lines.push(`- Avg HR: ${fmtHr(activity.avg_hr)}`);
  if (activity.elevation_gain_m != null)
    lines.push(`- Elevation gain: ${Math.round(activity.elevation_gain_m)} m`);
  if (activity.is_race) {
    const goal = activity.goal_pace_s_per_km
      ? `, goal pace ${fmtPace(activity.goal_pace_s_per_km)}`
      : "";
    lines.push(`- Marked as a race${goal}`);
  }

  if (load) {
    const method = load.method ? ` (from ${METHOD_LABEL[load.method] ?? load.method})` : "";
    const intensity = load.intensityFactor != null ? `, IF ${load.intensityFactor.toFixed(2)}` : "";
    lines.push(`- Training load: ${load.tss.toFixed(0)} TSS${method}${intensity}`);
  }

  if (streams) {
    const parts: string[] = [];
    if (streams.avgHr != null)
      parts.push(
        `HR avg ${Math.round(streams.avgHr)}${streams.maxHr != null ? ` / max ${Math.round(streams.maxHr)}` : ""} bpm`
      );
    if (streams.fastestPaceSPerKm != null && streams.slowestPaceSPerKm != null)
      parts.push(
        `pace ${fmtPace(streams.fastestPaceSPerKm)} (fastest) to ${fmtPace(streams.slowestPaceSPerKm)} (slowest)`
      );
    if (streams.avgPower != null)
      parts.push(
        `power avg ${Math.round(streams.avgPower)}${streams.maxPower != null ? ` / max ${Math.round(streams.maxPower)}` : ""} W`
      );
    if (streams.avgCadence != null) parts.push(`cadence avg ${Math.round(streams.avgCadence)}`);
    if (parts.length > 0) {
      lines.push("");
      lines.push("STREAM RANGES");
      for (const part of parts) lines.push(`- ${part}`);
    }
  }

  lines.push("");
  lines.push("ATHLETE THRESHOLDS");
  lines.push(`- Max HR: ${thresholds.maxHr} bpm`);
  lines.push(
    `- Resting HR: ${thresholds.restingHr} bpm${thresholds.restingHrEstimated ? " (estimated)" : ""}`
  );
  lines.push(`- LTHR: ${thresholds.lthr} bpm`);
  lines.push(`- Threshold pace: ${fmtPace(thresholds.thresholdPaceSPerKm)}`);
  lines.push(`- FTP: ${thresholds.ftpW} W${thresholds.ftpProvisional ? " (provisional)" : ""}`);

  if (pmc) {
    lines.push("");
    lines.push("FITNESS TODAY (Performance Management Chart)");
    lines.push(`- CTL (fitness): ${pmc.ctl.toFixed(0)}`);
    lines.push(`- ATL (fatigue): ${pmc.atl.toFixed(0)}`);
    lines.push(`- TSB (form): ${pmc.tsb.toFixed(0)}`);
  }

  const journalParts: string[] = [];
  if (journal.rpe != null) journalParts.push(`RPE ${journal.rpe}/10`);
  if (journal.feeling) journalParts.push(`feeling: ${journal.feeling}`);
  if (journal.workoutNotes) journalParts.push(`workout notes: ${journal.workoutNotes}`);
  if (journal.healthNotes) journalParts.push(`health notes: ${journal.healthNotes}`);
  if (journalParts.length > 0) {
    lines.push("");
    lines.push("ATHLETE JOURNAL");
    for (const part of journalParts) lines.push(`- ${part}`);
  }

  if (goals.length > 0) {
    lines.push("");
    lines.push("GOALS");
    for (const g of goals) lines.push(`- ${goalLine(g)}`);
  }

  if (zones) {
    lines.push("");
    lines.push("REAL TRAINING ZONES (field-derived; use these, not age formulas)");
    if (zones.lt2Hr || zones.lt2PaceSPerKm)
      lines.push(
        `- LT2/threshold: ${zones.lt2Hr ?? "?"} bpm, ${zones.lt2PaceSPerKm ? fmtPace(zones.lt2PaceSPerKm) : "?"}`
      );
    for (const z of zones.zones) {
      const hr = z.hrMin != null || z.hrMax != null ? `${z.hrMin ?? ""}-${z.hrMax ?? ""} bpm` : "";
      const pace =
        z.paceMinSPerKm != null || z.paceMaxSPerKm != null
          ? `${z.paceMinSPerKm ? fmtPace(z.paceMinSPerKm) : ""}-${z.paceMaxSPerKm ? fmtPace(z.paceMaxSPerKm) : ""}`
          : "";
      lines.push(`- Z${z.zone}: ${[hr, pace].filter(Boolean).join(" · ")}`);
    }
  }

  if (laps.length > 1) {
    lines.push("");
    lines.push("THIS SESSION'S LAPS (per segment)");
    laps.forEach((lap, i) => lines.push(lapLine(lap, i)));
  }

  if (recent.length > 0) {
    lines.push("");
    lines.push("RECENT SESSIONS, SAME SPORT (for comparison; most recent first)");
    for (const s of recent) {
      const meta = [
        s.distanceKm != null ? fmtKm(s.distanceKm, 1) : null,
        s.paceSPerKm ? fmtPace(s.paceSPerKm) : null,
        s.avgHr != null
          ? `avg HR ${Math.round(s.avgHr)}${s.maxHr != null ? `/${Math.round(s.maxHr)} max` : ""}`
          : null,
        s.tss != null ? `${Math.round(s.tss)} TSS` : null,
      ].filter(Boolean);
      lines.push(
        `- ${fmtDateLong(s.date)} · ${s.name ?? "session"}${meta.length ? ` — ${meta.join(", ")}` : ""}`
      );
      s.laps.forEach((lap, i) => lines.push(lapLine(lap, i)));
    }
  }

  return lines.join("\n");
}

export function buildDigestContext(input: {
  activities: DigestActivity[];
  thresholds: AthleteThresholds;
  now: CoachPmc | null;
  weekAgo: CoachPmc | null;
  week: WeeklyMonotony;
}): string {
  const { activities, thresholds, now, weekAgo, week } = input;
  const lines: string[] = [];

  lines.push("LAST 7 DAYS OF TRAINING");
  if (activities.length === 0) {
    lines.push("- No confirmed activities in the last 7 days.");
  } else {
    for (const a of activities) {
      const bits: string[] = [];
      if (a.distance_km != null) bits.push(fmtKm(a.distance_km, 1));
      if (a.moving_time_s) bits.push(fmtDuration(a.moving_time_s));
      if (a.avg_pace_s_per_km) bits.push(fmtPace(a.avg_pace_s_per_km));
      if (a.avg_hr) bits.push(fmtHr(a.avg_hr));
      const meta = bits.length > 0 ? ` — ${bits.join(", ")}` : "";
      lines.push(
        `- ${fmtDateLong(localStartedAt(a))} · ${a.sport_type ?? "activity"}: ${a.name ?? "Untitled"}${meta}`
      );
    }
  }

  if (now && weekAgo) {
    lines.push("");
    lines.push("FITNESS MOVEMENT (today vs 7 days ago)");
    lines.push(`- CTL (fitness): ${weekAgo.ctl.toFixed(0)} → ${now.ctl.toFixed(0)}`);
    lines.push(`- ATL (fatigue): ${weekAgo.atl.toFixed(0)} → ${now.atl.toFixed(0)}`);
    lines.push(`- TSB (form): ${weekAgo.tsb.toFixed(0)} → ${now.tsb.toFixed(0)}`);
  } else if (now) {
    lines.push("");
    lines.push("FITNESS TODAY");
    lines.push(`- CTL ${now.ctl.toFixed(0)}, ATL ${now.atl.toFixed(0)}, TSB ${now.tsb.toFixed(0)}`);
  }

  if (week.monotony != null && week.strain != null) {
    lines.push("");
    lines.push("WEEKLY LOAD SHAPE (last 7 days)");
    lines.push(
      `- Monotony: ${week.monotony.toFixed(1)} (mean/stddev of daily load; above 2.0 is grindy, above 2.5 a warning)`
    );
    lines.push(
      `- Strain: ${Math.round(week.strain)} (7-day load ${Math.round(week.load7d)} x monotony)`
    );
  }

  lines.push("");
  lines.push("ATHLETE THRESHOLDS");
  lines.push(`- Max HR ${thresholds.maxHr} bpm, LTHR ${thresholds.lthr} bpm`);
  lines.push(
    `- Threshold pace ${fmtPace(thresholds.thresholdPaceSPerKm)}, FTP ${thresholds.ftpW} W`
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Morning readiness narrative — reads the GENERIC health model only (readiness
// score/components, recovery hours, resolved metric highlights). No Garmin/Coros
// specifics reach here, so the coach is identical across a device switch.
// ---------------------------------------------------------------------------

export interface CoachReadiness {
  score: number;
  band: string;
  components: { key: string; sub: number }[];
  topNegative: string | null;
  lowConfidence: boolean;
  /** A short reason string when an acute red flag capped the band, else null. */
  redFlag: string | null;
}

export function buildReadinessContext(input: {
  readiness: CoachReadiness;
  recoveryHours: number;
  /** Pre-formatted "Label: value unit" lines for today's resolved signals. */
  signals: string[];
}): string {
  const { readiness, recoveryHours, signals } = input;
  const lines: string[] = [];

  lines.push("READINESS TODAY (app-computed, 0-100)");
  lines.push(
    `- Score: ${readiness.score} / 100 (band: ${readiness.band})${readiness.lowConfidence ? " [low confidence — limited data]" : ""}`
  );
  if (readiness.redFlag) lines.push(`- Red flag: ${readiness.redFlag}`);
  if (readiness.components.length > 0) {
    lines.push(
      `- Components: ${readiness.components.map((c) => `${c.key} ${Math.round(c.sub)}`).join(", ")}`
    );
  }
  if (readiness.topNegative) lines.push(`- Most limiting factor: ${readiness.topNegative}`);

  lines.push("");
  lines.push("RECOVERY");
  lines.push(
    `- Recovery remaining: ${Math.round(recoveryHours)} h (app-computed, intensity-driven)`
  );

  if (signals.length > 0) {
    lines.push("");
    lines.push("TODAY'S SIGNALS");
    for (const signal of signals) lines.push(`- ${signal}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Claude calls
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an experienced endurance coach analyzing ONE specific workout for the athlete you are talking to.

The athlete's message is preceded by a context block with this workout's metrics, the athlete's thresholds, their current fitness (CTL/ATL/TSB), and any journal notes. Ground every answer in those actual numbers — quote the real values rather than speaking in generalities.

Be concise, specific, and actionable. Use metric units. Write pace as m:ss/km. No filler, no motivational fluff, no restating the whole workout back. If a piece of data is missing, say so briefly instead of inventing it.

When goals and real training zones are provided, coach like you know what they are training for: reference which zone the session fell in, judge it against the goal (e.g. "that is 15s/km off your half-marathon target"), and give the next concrete step. Prefer the athlete's field-derived zones over any age-based estimate.

If the athlete attaches an image (for example a screenshot from TrainingPeaks, Garmin or another tool), read the data in it — numbers, charts, splits, plans — and factor it into your answer, tying it back to this workout and their fitness. If the image is unrelated or unreadable, say so briefly.

Write in plain prose and, where helpful, simple hyphen ("- ") bullet lines. Do NOT use Markdown syntax: no "#" headings, no "*"/"**" bold or italics, no backticks, no tables. The reply is shown as plain text, so any Markdown markers would appear literally.`;

const DIGEST_SYSTEM_PROMPT = `You are an experienced endurance coach writing a short weekly training digest for the athlete you are talking to.

You are given the athlete's confirmed activities from the last 7 days, how their fitness moved (CTL/ATL/TSB), and their thresholds. Summarize:
- what the week did to their fitness (CTL/ATL/TSB movement, in plain terms),
- the volume and one or two standout sessions,
- one or two concrete, specific suggestions for the coming week.

Keep it concise. Use metric units and write pace as m:ss/km. Reference the real numbers. If the week was empty or thin, say so plainly.

Write in plain prose with simple hyphen ("- ") bullet lines and plain-text section labels (e.g. a short line ending in a colon). Do NOT use Markdown syntax: no "#" headings, no "*"/"**" bold or italics, no backticks, no tables. The digest is shown as plain text, so any Markdown markers would appear literally.`;

const READINESS_SYSTEM_PROMPT = `You are an experienced endurance coach giving the athlete a short morning "how ready am I to train today" read.

You are given an app-computed readiness score (0-100) with its band and component breakdown, the current recovery-remaining in hours, and today's health signals (sleep, HRV, resting HR, stress, etc.). These are source-agnostic — do not assume any specific device.

Ground every statement in the actual numbers (quote them). In 3-5 sentences or short hyphen bullets: say how ready they are, name the one or two factors driving that most (especially the most-limiting one), and give a concrete recommendation for today's session (intensity and rough duration/type). If a red flag is present, lead with it. If confidence is low, say so briefly.

Be concise and specific. Use metric units. No filler. Write in plain prose and simple hyphen ("- ") bullet lines only — no Markdown (#, *, **, backticks, tables), which would appear literally.`;

/** Concatenates the text blocks of a Claude response into a plain string. */
function extractText(res: Anthropic.Message): string {
  return res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("")
    .trim();
}

/** An image the athlete attached to a coach message (e.g. a TrainingPeaks or
 * Garmin screenshot), for the model to read. Restricted to the types Anthropic
 * vision accepts; the base64 is the raw data (no data: URL prefix). */
export interface CoachImage {
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  dataBase64: string;
}

export async function runCoachChat(
  context: string,
  history: { role: "user" | "assistant"; content: string }[],
  userMessage: string,
  image?: CoachImage | null
): Promise<string> {
  // The latest turn carries the text plus, when present, an image block so the
  // model can interpret a screenshot (splits, a plan, a device screen, etc.).
  const latest: Anthropic.ContentBlockParam[] = [];
  if (image) {
    latest.push({
      type: "image",
      source: { type: "base64", media_type: image.mediaType, data: image.dataBase64 },
    });
  }
  latest.push({ type: "text", text: userMessage });

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: `Context for the workout we are discussing:\n\n${context}` },
    ...history,
    { role: "user", content: latest },
  ];
  const res = await getClient().messages.create({
    model: COACH_MODEL,
    max_tokens: 1500,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    system: SYSTEM_PROMPT,
    messages,
  });
  return extractText(res);
}

export async function runReadinessSummary(context: string, language: string): Promise<string> {
  const res = await getClient().messages.create({
    model: COACH_MODEL,
    max_tokens: 800,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    system: `${READINESS_SYSTEM_PROMPT}\n\nWrite your reply in ${language}.`,
    messages: [{ role: "user", content: context }],
  });
  return extractText(res);
}

export async function runWeeklyDigest(context: string): Promise<string> {
  const res = await getClient().messages.create({
    model: COACH_MODEL,
    max_tokens: 1500,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    system: DIGEST_SYSTEM_PROMPT,
    messages: [{ role: "user", content: context }],
  });
  return extractText(res);
}

// ---------------------------------------------------------------------------
// Training-zones agent — derives HR + pace zones and LT1/LT2 from the athlete's
// REAL field data (not an age formula), estimates VO2max from race times, ties
// it to their goals, and lists what extra info would sharpen it.
// ---------------------------------------------------------------------------

/** Format a goal line for the context. */
function goalLine(g: Goal): string {
  const bits: string[] = [g.name];
  if (g.distance_km != null) bits.push(`${g.distance_km} km`);
  if (g.goal_time_s != null) bits.push(`target ${fmtDuration(g.goal_time_s)}`);
  if (g.race_date) bits.push(`on ${g.race_date}`);
  if (g.priority > 0) bits.push("(primary)");
  if (g.notes) bits.push(`- ${g.notes}`);
  return bits.join(", ");
}

export function buildZonesContext(input: {
  signals: FieldSignals;
  goals: Goal[];
  extraContext: string;
}): string {
  const { signals: s, goals, extraContext } = input;
  const lines: string[] = [];

  lines.push(`ATHLETE FIELD DATA (running, last ${s.windowDays} days, ${s.runCount} runs)`);
  lines.push(
    `- Resting HR: ${s.restingHr} bpm${s.latestHrvMs ? ` · latest overnight HRV ${s.latestHrvMs} ms` : ""}`
  );
  lines.push(
    `- Current stored thresholds: LTHR ${s.thresholds.lthr}, threshold pace ${fmtPace(s.thresholds.thresholdPaceSPerKm)}, max HR ${s.thresholds.maxHr}`
  );

  lines.push("");
  lines.push("OBSERVED MAX HR (highest per-activity peaks; watch for optical spikes)");
  for (const m of s.maxHr) {
    lines.push(
      `- ${m.hr} bpm on ${m.date}${m.isRace ? " [RACE]" : ""} (${m.paceSPerKm ? fmtPace(m.paceSPerKm) : "?"}, avg ${m.avgHr ? Math.round(m.avgHr) : "?"}) ${m.name}`
    );
  }

  lines.push("");
  lines.push("BEST EFFORTS BY DISTANCE (whole-activity; races are the reliable maximal ones)");
  for (const e of s.efforts) {
    lines.push(
      `- ${e.label}: ${e.distanceKm.toFixed(1)} km in ${fmtDuration(e.timeS)} (${fmtPace(e.paceSPerKm)}), avg HR ${e.avgHr ? Math.round(e.avgHr) : "?"}, max ${e.maxHr ?? "?"}, ${e.date}${e.isRace ? " [RACE]" : ""}`
    );
  }

  lines.push("");
  lines.push("HR vs PACE (avg HR at each easy/steady pace bucket)");
  for (const b of s.hrPace) {
    lines.push(`- ~${fmtPace(b.paceSPerKm)}: ${b.avgHr} bpm (n=${b.n})`);
  }

  if (s.decoupling.length > 0) {
    lines.push("");
    lines.push("AEROBIC DECOUPLING on long runs (Pa:Hr, 1st vs 2nd half; <5% = aerobically sound)");
    for (const d of s.decoupling) {
      lines.push(
        `- ${d.date} ${d.distanceKm.toFixed(1)} km${d.paceSPerKm ? ` @${fmtPace(d.paceSPerKm)}` : ""}: HR ${d.firstHalfHr}→${d.secondHalfHr}, drift ${d.driftPct}%`
      );
    }
  }

  lines.push("");
  lines.push("GOALS");
  if (goals.length === 0) lines.push("- (none set)");
  else for (const g of goals) lines.push(`- ${goalLine(g)}`);

  if (extraContext.trim()) {
    lines.push("");
    lines.push("EXTRA CONTEXT FROM THE ATHLETE");
    lines.push(extraContext.trim());
  }

  return lines.join("\n");
}

const ZONES_SYSTEM_PROMPT = `You are a running physiologist deriving an athlete's REAL training zones from their field data, NOT from an age formula.

Rules:
- Anchor everything in the data given: observed max HR (discard implausible optical spikes, e.g. a high peak during an easy run with a much lower average), the HR↔pace relationship, best race efforts, and aerobic decoupling.
- Estimate LT1 (aerobic threshold) and LT2 (lactate/threshold) in BOTH heart rate and pace. LT2 pace/HR ~ recent 10k–HM race effort; LT1 ~ the top of easy running where decoupling stays low.
- Estimate VO2max from the best race times (VDOT/Daniels style). Say if it disagrees with any device/lab number the athlete mentions.
- Give 5 zones (Z1 recovery, Z2 base, Z3 tempo, Z4 threshold, Z5 VO2), each with a HR range and a pace range (s/km). Zones must be contiguous and consistent with the thresholds.
- Set confidence honestly (low/medium/high) based on how much reliable data there is.
- In summary (2-4 sentences), tie the zones to the athlete's goals and flag the single biggest gap (e.g. a target pace far from current threshold).
- In missingInfo, list the specific things the athlete could provide to sharpen this (e.g. a recent flat 5k time trial, chest-strap HR, true resting HR). Empty if data is already strong.

Report ONLY by calling the report_zones tool. Paces are seconds per km (smaller = faster); paceMinSPerKm is the faster bound.`;

const NULLABLE_NUM = { type: ["number", "null"] } as const;
const ZONES_TOOL: Anthropic.Tool = {
  name: "report_zones",
  description: "Return the derived training zones and threshold estimates.",
  input_schema: {
    type: "object",
    properties: {
      maxHr: NULLABLE_NUM,
      restingHr: NULLABLE_NUM,
      lt1Hr: NULLABLE_NUM,
      lt2Hr: NULLABLE_NUM,
      lt1PaceSPerKm: NULLABLE_NUM,
      lt2PaceSPerKm: NULLABLE_NUM,
      vo2maxEstimate: NULLABLE_NUM,
      confidence: { type: "string", enum: ["low", "medium", "high"] },
      summary: { type: "string" },
      missingInfo: { type: "array", items: { type: "string" } },
      zones: {
        type: "array",
        items: {
          type: "object",
          properties: {
            zone: { type: "integer", enum: [1, 2, 3, 4, 5] },
            hrMin: NULLABLE_NUM,
            hrMax: NULLABLE_NUM,
            paceMinSPerKm: NULLABLE_NUM,
            paceMaxSPerKm: NULLABLE_NUM,
          },
          required: ["zone", "hrMin", "hrMax", "paceMinSPerKm", "paceMaxSPerKm"],
        },
      },
    },
    required: [
      "maxHr",
      "restingHr",
      "lt1Hr",
      "lt2Hr",
      "lt1PaceSPerKm",
      "lt2PaceSPerKm",
      "vo2maxEstimate",
      "confidence",
      "summary",
      "missingInfo",
      "zones",
    ],
  },
};

/** Derive zones via a forced tool call, returning the validated structured result. */
export async function deriveZones(context: string): Promise<Omit<DerivedZones, "generatedAt">> {
  const res = await getClient().messages.create({
    model: COACH_MODEL,
    max_tokens: 2000,
    system: ZONES_SYSTEM_PROMPT,
    tools: [ZONES_TOOL],
    tool_choice: { type: "tool", name: "report_zones" },
    messages: [{ role: "user", content: context }],
  });
  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error("zones tool call missing");
  }
  return block.input as Omit<DerivedZones, "generatedAt">;
}

// ---------------------------------------------------------------------------
// Per-activity insight — an upfront coach read on one workout, comparing it to
// similar past sessions and the athlete's health/goals, shown above the chat.
// ---------------------------------------------------------------------------

export function buildInsightContext(input: {
  activityContext: string;
  healthNote: string | null;
}): string {
  // The activity context already carries the recent same-sport sessions (with
  // laps) for comparison; the insight just adds the day's health.
  const { activityContext, healthNote } = input;
  const lines = [activityContext];
  if (healthNote) {
    lines.push("");
    lines.push("HEALTH AROUND THIS DAY");
    lines.push(healthNote);
  }
  return lines.join("\n");
}

const INSIGHT_SYSTEM_PROMPT = `You are an experienced endurance coach giving an UPFRONT read on ONE workout the athlete just logged — the kind of short analysis they see before asking anything.

You are given the workout's metrics, the athlete's thresholds/zones, their goals, similar recent sessions, and any health/readiness data. In 4-6 sentences or short hyphen bullets:
- Say what this session was (which zone/effort) and how it compares to their similar recent sessions (faster/slower, higher/lower HR, more/less load).
- Factor in health/readiness and the goal it serves.
- End with ONE concrete, specific takeaway or next step.

Ground everything in the real numbers; quote them. Be concise and specific, metric units, pace as m:ss/km. If data is missing, say so briefly rather than inventing it.

Write plain prose and simple hyphen ("- ") bullet lines only. No Markdown syntax (no #, *, **, backticks, tables) — it is shown as plain text.`;

export async function runActivityInsight(context: string): Promise<string> {
  const res = await getClient().messages.create({
    model: COACH_MODEL,
    max_tokens: 1200,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    system: INSIGHT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: context }],
  });
  return extractText(res);
}
