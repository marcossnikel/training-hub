import type { ComparableActivityResult } from "./comparable-activity";
import type { WeeklyBriefResult } from "./weekly-brief";

export const INSIGHT_FEEDBACK_VERSION = "v1";
export const INSIGHT_NOTE_MAX_LENGTH = 500;

export const INSIGHT_FEEDBACK_KINDS = ["weekly_brief", "comparable_prior_activity"] as const;
export type InsightFeedbackKind = (typeof INSIGHT_FEEDBACK_KINDS)[number];

export const INSIGHT_USEFULNESS = ["useful", "not_useful"] as const;
export type InsightUsefulness = (typeof INSIGHT_USEFULNESS)[number];

/**
 * This is a compact, immutable description of a result the server actually
 * produced. It deliberately contains no activity name, metric, stream, body
 * copy, owner id, or browser-supplied identifier.
 */
export interface InsightReference {
  kind: InsightFeedbackKind;
  key: string;
  version: typeof INSIGHT_FEEDBACK_VERSION;
  evaluatedAt: string;
}

export function weeklyBriefInsightReference(result: WeeklyBriefResult): InsightReference | null {
  const observation = result.observations[0];
  if (result.state !== "observations" || !observation) return null;
  const sourceIds = [...observation.sources.current, ...observation.sources.baseline]
    .map((source) => String(source.id))
    .sort((a, b) => a.localeCompare(b, "en"));
  return {
    kind: "weekly_brief",
    key: [
      "weekly",
      INSIGHT_FEEDBACK_VERSION,
      observation.kind,
      observation.currentWindow.start,
      observation.baselineWindow.start,
      sourceIds.join(","),
    ].join(":"),
    version: INSIGHT_FEEDBACK_VERSION,
    // The completed window's end is the stable, evidence-derived evaluation
    // marker. It avoids creating a new response key on every page render.
    evaluatedAt: `${observation.currentWindow.end}T00:00:00.000Z`,
  };
}

export function comparableActivityInsightReference(
  result: ComparableActivityResult,
  evaluatedAt: string
): InsightReference | null {
  if (result.state !== "match" || !Number.isFinite(Date.parse(evaluatedAt))) return null;
  const { match } = result;
  return {
    kind: "comparable_prior_activity",
    key: [
      "comparable",
      INSIGHT_FEEDBACK_VERSION,
      match.sportFamily,
      String(match.source.id),
      String(match.candidate.id),
    ].join(":"),
    version: INSIGHT_FEEDBACK_VERSION,
    evaluatedAt: new Date(evaluatedAt).toISOString(),
  };
}

export function normalizeInsightNote(value: unknown): string | null | "invalid" {
  if (value == null) return null;
  if (typeof value !== "string") return "invalid";
  const note = value.trim();
  if (note.length > INSIGHT_NOTE_MAX_LENGTH) return "invalid";
  return note || null;
}

export function isInsightUsefulness(value: unknown): value is InsightUsefulness {
  return typeof value === "string" && INSIGHT_USEFULNESS.includes(value as InsightUsefulness);
}
