#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const retiredNames = [
  ["STRAVA", "CLIENT", "ID"].join("_"),
  ["STRAVA", "CLIENT", "SECRET"].join("_"),
];
const trackedFiles = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const violations = [];

for (const file of trackedFiles) {
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
