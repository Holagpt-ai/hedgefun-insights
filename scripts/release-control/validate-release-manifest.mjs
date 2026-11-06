#!/usr/bin/env node
/**
 * Validators aligned with docs/release/manifests/schema-v1.json and schema-attestation-v1.json:
 * JSON Schema (Ajv) plus explicit Batch-210 rules.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(scriptDir, "../..");

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const schemaReleaseIntent = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, "docs/release/manifests/schema-v1.json"), "utf8"),
);
const schemaAttestation = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, "docs/release/manifests/schema-attestation-v1.json"), "utf8"),
);
const validateReleaseIntentSchema = ajv.compile(schemaReleaseIntent);
const validateAttestationSchema = ajv.compile(schemaAttestation);

const SHA40 = /^[a-f0-9]{40}$/;
const SHA64 = /^[a-f0-9]{64}$/;
const MANIFEST_ID_RE = /^[a-z0-9][a-z0-9._-]*$/;
const COMPONENT_ID_RE = /^[a-z][a-z0-9_]*$/;

const COMPONENT_CLASS = new Set([
  "supabase_edge",
  "fly_worker",
  "vercel_frontend",
  "integration_branch_only",
]);

/** Release intent: demonstrably equivalent to schema-v1 + batch-210 rules */
export function validateReleaseIntent(m) {
  const errors = [];
  if (!validateReleaseIntentSchema(m)) {
    for (const e of validateReleaseIntentSchema.errors ?? []) {
      errors.push(`${e.instancePath || "/"} ${e.message}`.trim());
    }
  }
  const extraKeys = Object.keys(m).filter(
    (k) =>
      ![
        "schema_version",
        "batch_id",
        "manifest_id",
        "kind",
        "title",
        "summary",
        "recorded_at",
        "github",
        "components",
        "rollback",
        "compatibility",
        "approvals",
        "historical_evidence",
      ].includes(k),
  );
  if (extraKeys.length) errors.push(`unexpected top-level keys: ${extraKeys.join(", ")}`);

  if (m.schema_version !== "1") errors.push("schema_version must be \"1\"");
  if (!m.batch_id || typeof m.batch_id !== "string") errors.push("batch_id required");
  if (!m.manifest_id || !MANIFEST_ID_RE.test(m.manifest_id)) errors.push("manifest_id invalid");
  if (m.kind !== "release_intent") errors.push("kind must be release_intent");
  if (!m.recorded_at) errors.push("recorded_at required");

  if (!m.github || typeof m.github !== "object") {
    errors.push("github required");
  } else {
    const gk = Object.keys(m.github);
    if (gk.some((k) => !["main", "lovable_integration"].includes(k))) {
      errors.push("github: unexpected keys");
    }
    if (!m.github.main?.approved_sha || !SHA40.test(m.github.main.approved_sha)) {
      errors.push("github.main.approved_sha invalid");
    }
    if (!m.github.lovable_integration?.branch || !m.github.lovable_integration?.commit_sha) {
      errors.push("github.lovable_integration branch/commit_sha required");
    }
    if (!SHA40.test(m.github?.lovable_integration?.commit_sha || "")) {
      errors.push("github.lovable_integration.commit_sha invalid");
    }
  }

  if (!Array.isArray(m.components) || m.components.length < 1) {
    errors.push("components must be non-empty array");
  }

  for (const c of m.components || []) {
    const ck = Object.keys(c).filter(
      (k) =>
        ![
          "id",
          "class",
          "name",
          "applicability",
          "not_applicable_reason",
          "source",
          "deployment_target",
        ].includes(k),
    );
    if (ck.length) errors.push(`component ${c.id ?? "?"}: unexpected keys ${ck.join(", ")}`);

    if (!c.id || !COMPONENT_ID_RE.test(c.id)) {
      errors.push(`component id invalid: ${c.id}`);
    }
    if (!COMPONENT_CLASS.has(c.class)) {
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

    if (c.class === "supabase_edge") {
      const cl = c.source?.closure;
      if (!cl || cl.algorithm !== "repo_edge_import_closure_v1") {
        errors.push(`component ${c.id}: supabase_edge requires source.closure repo_edge_import_closure_v1`);
      }
      if (!cl?.entry || !SHA64.test(cl?.expected_sha256 || "")) {
        errors.push(`component ${c.id}: closure entry or expected_sha256 invalid`);
      }
      if (c.source && Object.keys(c.source).some((k) => k !== "closure")) {
        errors.push(`component ${c.id}: source may only contain closure`);
      }
    } else if (c.class === "fly_worker") {
      const paths = c.source?.config_paths;
      const exp = c.source?.expected_sha256;
      if (!Array.isArray(paths) || paths.length < 1 || !SHA64.test(exp || "")) {
        errors.push(`component ${c.id}: fly_worker APPLICABLE requires source.config_paths and expected_sha256`);
      }
      if (c.source && Object.keys(c.source).some((k) => !["config_paths", "expected_sha256"].includes(k))) {
        errors.push(`component ${c.id}: fly_worker source keys invalid`);
      }
    } else if (c.class === "vercel_frontend") {
      errors.push(`component ${c.id}: vercel_frontend APPLICABLE is not supported in manifest v1`);
    }
  }

  if (!Array.isArray(m.approvals) || m.approvals.length < 1) {
    errors.push("approvals must be non-empty array");
  }
  for (const a of m.approvals || []) {
    if (!a.role || !a.description) errors.push("approval missing role or description");
    const ak = Object.keys(a).filter((k) => !["role", "description", "reference"].includes(k));
    if (ak.length) errors.push(`approval unexpected keys: ${ak.join(", ")}`);
  }

  if (m.rollback) {
    const rk = Object.keys(m.rollback).filter(
      (k) => !["primary_git_sha", "batch_reference", "constraints"].includes(k),
    );
    if (rk.length) errors.push(`rollback unexpected keys: ${rk.join(", ")}`);
    if (m.rollback.primary_git_sha && !SHA40.test(m.rollback.primary_git_sha)) {
      errors.push("rollback.primary_git_sha invalid");
    }
  }

  return { ok: errors.length === 0, errors };
}

export function validateAttestation(a) {
  const errors = [];
  if (!validateAttestationSchema(a)) {
    for (const e of validateAttestationSchema.errors ?? []) {
      errors.push(`${e.instancePath || "/"} ${e.message}`.trim());
    }
  }
  const allowedTop = [
    "schema_version",
    "kind",
    "manifest_id",
    "sequence",
    "component_id",
    "recorded_at",
    "observer",
    "observed",
    "evidence_notes",
    "approval_reference",
  ];
  const extra = Object.keys(a).filter((k) => !allowedTop.includes(k));
  if (extra.length) errors.push(`attestation unexpected keys: ${extra.join(", ")}`);

  if (a.schema_version !== "1") errors.push("schema_version must be \"1\"");
  if (a.kind !== "deployment_attestation") errors.push("kind must be deployment_attestation");
  if (!a.manifest_id) errors.push("manifest_id required");
  if (typeof a.sequence !== "number" || a.sequence < 1 || !Number.isInteger(a.sequence)) {
    errors.push("sequence invalid");
  }
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
