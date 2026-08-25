#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const retiredNames = [
  ["STRAVA", "CLIENT", "ID"].join("_"),
  ["STRAVA", "CLIENT", "SECRET"].join("_"),
];
const trackedFiles = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const violations = [];

for (const file of trackedFiles) {
  // During a behavior-preserving source move, git's index can still list a
  // deleted path until the final commit. There is no source to inspect then.
  if (!existsSync(file)) continue;
  const contents = readFileSync(file, "utf8");
  for (const name of retiredNames) {
    if (contents.includes(name)) violations.push(`${file}: retired ${name} reference`);
  }
}

if (violations.length > 0) {
  console.error("Retired process-wide Strava credential references found:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log("Retired process-wide Strava credential check OK.");
