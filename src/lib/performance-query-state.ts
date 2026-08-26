import type { TotalsPeriod } from "./totals";

export type PerformanceQuery = Record<string, string | string[] | undefined>;

export function performanceQueryState(params: PerformanceQuery): {
  period: TotalsPeriod;
  window: string | null;
} {
  return {
    period: params.period === "months" ? "months" : "weeks",
    window: typeof params.window === "string" ? params.window : null,
  };
}

/** Builds canonical Performance links without dropping the other control's state. */
export function performanceHref(state: { period: TotalsPeriod; window: string | null }): string {
  const query = new URLSearchParams();
  if (state.period !== "weeks") query.set("period", state.period);
  if (state.window) query.set("window", state.window);
  const suffix = query.toString();
  return suffix ? `/performance?${suffix}` : "/performance";
}
