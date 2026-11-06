#!/usr/bin/env node
/**
 * Minimal schema validation for release_intent v1 (no external deps).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SHA40 = /^[a-f0-9]{40}$/;
const SHA64 = /^[a-f0-9]{64}$/;
const IDRE = /^[a-z0-9][a-z0-9._-]*$/;

export function validateReleaseIntent(m) {
  const errors = [];
  if (m.schema_version !== "1") errors.push("schema_version must be \"1\"");
  if (!m.batch_id || typeof m.batch_id !== "string") errors.push("batch_id required");
  if (!m.manifest_id || !IDRE.test(m.manifest_id)) errors.push("manifest_id invalid");
  if (m.kind !== "release_intent") errors.push("kind must be release_intent");
  if (!m.recorded_at) errors.push("recorded_at required");
  if (!m.github?.main?.approved_sha || !SHA40.test(m.github.main.approved_sha)) {
    errors.push("github.main.approved_sha invalid");
  }
  if (!m.github?.lovable_integration?.branch || !m.github.lovable_integration.commit_sha) {
    errors.push("github.lovable_integration branch/commit_sha required");
  }
  if (!SHA40.test(m.github?.lovable_integration?.commit_sha || "")) {
    errors.push("github.lovable_integration.commit_sha invalid");
  }
  if (!Array.isArray(m.components) || m.components.length < 1) {
    errors.push("components must be non-empty array");
  }
  for (const c of m.components || []) {
    if (!c.id || !c.class || !c.applicability) {
      errors.push(`component missing id/class/applicability: ${JSON.stringify(c)}`);
      continue;
    }
    if (!["supabase_edge", "fly_worker", "vercel_frontend", "integration_branch_only"].includes(c.class)) {
      errors.push(`component ${c.id}: invalid class`);
    }
    if (!["APPLICABLE", "NOT_APPLICABLE"].includes(c.applicability)) {
      errors.push(`component ${c.id}: invalid applicability`);
    }
    if (c.applicability === "NOT_APPLICABLE") {
      if (!c.not_applicable_reason) {
        errors.push(`component ${c.id}: NOT_APPLICABLE requires not_applicable_reason`);
      }
      continue;
    }
    if (c.class === "supabase_edge" && c.source?.closure) {
      const cl = c.source.closure;
      if (cl.algorithm !== "repo_edge_import_closure_v1") {
        errors.push(`component ${c.id}: unknown closure algorithm`);
      }
      if (!cl.entry || !SHA64.test(cl.expected_sha256 || "")) {
        errors.push(`component ${c.id}: closure entry or expected_sha256 invalid`);
      }
    }
  }
  if (!Array.isArray(m.approvals) || m.approvals.length < 1) {
    errors.push("approvals must be non-empty array");
  }
  return { ok: errors.length === 0, errors };
}

export function validateAttestation(a) {
  const errors = [];
  if (a.schema_version !== "1") errors.push("schema_version must be \"1\"");
  if (a.kind !== "deployment_attestation") errors.push("kind must be deployment_attestation");
  if (!a.manifest_id) errors.push("manifest_id required");
  if (typeof a.sequence !== "number" || a.sequence < 1) errors.push("sequence invalid");
  if (!a.component_id) errors.push("component_id required");
  if (!a.recorded_at) errors.push("recorded_at required");
  if (!["owner", "lovable_cloud", "cursor_ci", "manual_import"].includes(a.observer)) {
    errors.push("observer invalid");
  }
  if (!a.observed || typeof a.observed !== "object") errors.push("observed required object");
  return { ok: errors.length === 0, errors };
}

function main() {
  const p = process.argv[2];
  if (!p) {
    console.error("Usage: validate-release-manifest.mjs <path/to/manifest.json>");
    process.exit(2);
  }
  const m = JSON.parse(fs.readFileSync(p, "utf8"));
  const r = validateReleaseIntent(m);
  if (!r.ok) {
    console.error(JSON.stringify({ ok: false, errors: r.errors }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true }, null, 0));
}

const __filename = fileURLToPath(import.meta.url);
if (path.resolve(process.argv[1]) === __filename) {
  main();
}
