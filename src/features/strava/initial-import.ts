export type InitialImportClassification = "confirmed" | "pending_review" | "invalid";

/**
 * D-020's provider-independent Review rule. Equality is historical: the
 * instant itself is the server-recorded connection boundary, so only a later
 * start can enter Review.
 */
export function classifyInitialImportStart(
  startedAt: string | undefined,
  reviewAfter: string
): InitialImportClassification {
  if (!startedAt) return "invalid";
  const startedMs = Date.parse(startedAt);
  const cutoffMs = Date.parse(reviewAfter);
  if (!Number.isFinite(startedMs) || !Number.isFinite(cutoffMs)) return "invalid";
  return startedMs <= cutoffMs ? "confirmed" : "pending_review";
}
