import type { RuntimeIdentity } from "@/server/config/runtime";

export type EnvironmentIndicatorModel = Readonly<{
  label: "LOCAL" | "E2E" | "PREVIEW" | "PRODUCTION";
  tone: "neutral" | "test" | "info" | "caution";
}>;

const MODELS: Readonly<Record<RuntimeIdentity, EnvironmentIndicatorModel>> = {
  local: { label: "LOCAL", tone: "neutral" },
  e2e: { label: "E2E", tone: "test" },
  preview: { label: "PREVIEW", tone: "info" },
  production: { label: "PRODUCTION", tone: "caution" },
};

/**
 * Converts the server-resolved runtime identity into the only configuration
 * detail that may cross the Header's client boundary. Unknown inputs render
 * nothing rather than guessing from a hostname or an environment variable.
 */
export function environmentIndicatorModel(value: unknown): EnvironmentIndicatorModel | null {
  return typeof value === "string" && Object.hasOwn(MODELS, value)
    ? MODELS[value as RuntimeIdentity]
    : null;
}
