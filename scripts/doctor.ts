import { summarizeConfiguration } from "../src/server/config/catalog";
import {
  describeConfigurationIssue,
  resolveRuntimeConfiguration,
} from "../src/server/config/runtime";

const configuration = resolveRuntimeConfiguration(process.env);

// Deliberately JSON: it is stable for operators and easy to assert without ever
// interpolating an environment value. Host is the only database detail exposed.
console.log(
  JSON.stringify({
    runtime: configuration.identity,
    database: { kind: configuration.database.kind, host: configuration.database.host },
    registrationEnabled: configuration.registrationEnabled,
    valid: configuration.issues.length === 0,
    issues: configuration.issues.map((code) => ({
      code,
      message: describeConfigurationIssue(code),
    })),
    variables: summarizeConfiguration(process.env, configuration.identity),
  })
);
process.exitCode = configuration.issues.length === 0 ? 0 : 1;
