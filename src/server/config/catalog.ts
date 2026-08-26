import type { Environment, RuntimeIdentity } from "./runtime";

export type ConfigurationVariable = {
  name: string;
  secret: boolean;
  example: boolean;
  consumers: readonly string[];
  requiredFor?: readonly RuntimeIdentity[];
};

/** The supported operator contract. Test harness variables intentionally stay out of .env.example. */
export const CONFIGURATION_CATALOG: readonly ConfigurationVariable[] = [
  { name: "TRAINING_HUB_ENV", secret: false, example: true, consumers: ["runtime"] },
  { name: "DATABASE_URL", secret: false, example: true, consumers: ["database"] },
  { name: "TURSO_DATABASE_URL", secret: false, example: true, consumers: ["database"] },
  { name: "TURSO_AUTH_TOKEN", secret: true, example: true, consumers: ["database"] },
  {
    name: "TRAINING_HUB_TURSO_DATABASE_URL",
    secret: false,
    example: true,
    consumers: ["database"],
  },
  { name: "TRAINING_HUB_TURSO_AUTH_TOKEN", secret: true, example: true, consumers: ["database"] },
  {
    name: "VERCEL_ENV",
    secret: false,
    example: true,
    consumers: ["runtime"],
    requiredFor: ["preview", "production"],
  },
  {
    name: "TRAINING_HUB_PRODUCTION_APPROVED",
    secret: false,
    example: true,
    consumers: ["runtime", "invites"],
    requiredFor: ["production"],
  },
  { name: "ALLOW_REMOTE_DB", secret: false, example: true, consumers: ["operator scripts"] },
  { name: "STRIPE_MODE", secret: false, example: true, consumers: ["runtime"] },
  {
    name: "STRAVA_CONNECTION_ENCRYPTION_KEY",
    secret: true,
    example: true,
    consumers: ["Strava credentials"],
  },
  { name: "BETTER_AUTH_SECRET", secret: true, example: true, consumers: ["authentication"] },
  { name: "BETTER_AUTH_URL", secret: false, example: true, consumers: ["authentication"] },
  {
    name: "TRAINING_HUB_PUBLIC_ORIGIN",
    secret: false,
    example: true,
    consumers: ["Strava BYO", "invites"],
  },
  { name: "BLOB_READ_WRITE_TOKEN", secret: true, example: true, consumers: ["storage"] },
  { name: "BLOB_STORE_ID", secret: false, example: true, consumers: ["storage"] },
  {
    name: "BETA_INVITE_REGISTRATION_ENABLED",
    secret: false,
    example: true,
    consumers: ["invites"],
  },
  {
    name: "TRAINING_HUB_PRODUCTION_INVITES_ENABLED",
    secret: false,
    example: true,
    consumers: ["invites"],
  },
  {
    name: "TRAINING_HUB_INVITE_PRODUCTION_ORIGIN",
    secret: false,
    example: true,
    consumers: ["invites"],
  },
  {
    name: "TRAINING_HUB_INVITE_PREVIEW_ORIGIN",
    secret: false,
    example: true,
    consumers: ["invites"],
  },
  { name: "TRAINING_HUB_INVITE_TARGET", secret: false, example: true, consumers: ["invite CLI"] },
  {
    name: "TRAINING_HUB_DISPOSABLE_DATA",
    secret: false,
    example: true,
    consumers: ["invites", "E2E"],
  },
  { name: "TRAINING_HUB_OWNER_ID", secret: false, example: true, consumers: ["operator scripts"] },
  {
    name: "TRAINING_HUB_INSIGHT_FEEDBACK_ENABLED",
    secret: false,
    example: true,
    consumers: ["insight feedback"],
  },
  {
    name: "TRAINING_ANALYST_ENABLED",
    secret: false,
    example: true,
    consumers: ["Training Analyst kill switch"],
  },
  {
    name: "OPENAI_API_KEY",
    secret: true,
    example: true,
    consumers: ["Training Analyst provider"],
  },
];

export function summarizeConfiguration(env: Environment, identity: RuntimeIdentity) {
  return CONFIGURATION_CATALOG.map((variable) => ({
    name: variable.name,
    configured: Boolean(env[variable.name]),
    required: variable.requiredFor?.includes(identity) ?? false,
  }));
}

export function catalogParityErrors(input: { example: string; documentation: string }): string[] {
  const exampleNames = new Set(
    [...input.example.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1])
  );
  const errors: string[] = [];
  for (const variable of CONFIGURATION_CATALOG) {
    if (variable.example && !exampleNames.has(variable.name)) {
      errors.push(`${variable.name} is missing from .env.example`);
    }
    if (!input.documentation.includes(`\`${variable.name}\``)) {
      errors.push(`${variable.name} is missing from environment documentation`);
    }
  }
  for (const name of exampleNames) {
    if (!CONFIGURATION_CATALOG.some((variable) => variable.name === name)) {
      errors.push(`${name} is present in .env.example but absent from the catalog`);
    }
  }
  return errors;
}
