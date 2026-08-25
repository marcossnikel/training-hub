import {
  describeConfigurationIssue,
  resolveRuntimeConfiguration,
} from "../src/server/config/runtime";

const configuration = resolveRuntimeConfiguration(process.env);

if (configuration.issues.length > 0) {
  console.error("Environment boundary check failed:");
  for (const issue of configuration.issues) console.error(`- ${describeConfigurationIssue(issue)}`);
  process.exit(1);
}

const stripeKind = process.env.STRIPE_MODE || "unset";
console.log(
  `Environment boundary OK: ${configuration.identity} (database=${configuration.database.kind === "file" ? "file" : "dedicated remote"}, stripe=${stripeKind})`
);
