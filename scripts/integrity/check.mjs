#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runIntegrity } from "./run.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = new Set(process.argv.slice(2));
const verbose = args.has("--verbose") || args.has("--json");

const report = await runIntegrity(root, {
  remote: args.has("--remote"),
  withTypecheck: args.has("--with-typecheck"),
  withBuild: args.has("--with-build"),
});

if (args.has("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Project integrity: ${report.summary.errors} error(s), ${report.summary.warnings} warning(s), ${report.routeCount} routes`);
  for (const finding of report.findings) {
    if (!verbose && finding.severity === "info") continue;
    console.log(`  [${finding.severity}] ${finding.check}: ${finding.message}`);
  }
  if (!verbose && report.summary.info > 0) {
    console.log(`  ${report.summary.info} info note(s); rerun with --verbose`);
  }
}

if (report.summary.errors > 0) process.exit(1);
