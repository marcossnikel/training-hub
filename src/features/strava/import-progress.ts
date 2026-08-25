export const importStatuses = ["queued", "running", "partial", "completed", "failed"] as const;
export type ImportStatus = (typeof importStatuses)[number];

export const importStages = [
  "fetching_activities",
  "classifying_history",
  "materializing_gear",
  "aggregating_summary",
  "completed",
] as const;
export type ImportStage = (typeof importStages)[number];

export const importOutcomes = [
  "historical_confirmed_created",
  "new_pending_created",
  "already_present",
  "skipped_invalid",
] as const;
export type ImportOutcome = (typeof importOutcomes)[number];
export type SportFamily = "run" | "ride" | "other" | "unknown";
export type ImportErrorCategory = "provider_unavailable" | "provider_auth" | "unexpected";

export function canAdvanceImport(status: ImportStatus): boolean {
  return status !== "completed";
}

export function classifyImportError(error: unknown): ImportErrorCategory {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("reconnect") || message.includes("rejected the token"))
    return "provider_auth";
  if (
    message.includes("api error") ||
    message.includes("rate limit") ||
    message.includes("timeout")
  ) {
    return "provider_unavailable";
  }
  return "unexpected";
}

export function sportFamily(sport: string | null | undefined): SportFamily {
  const normalized = sport?.toLowerCase() ?? "";
  if (normalized.includes("run")) return "run";
  if (normalized.includes("ride") || normalized.includes("cycl")) return "ride";
  return normalized ? "other" : "unknown";
}
