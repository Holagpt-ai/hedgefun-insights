#!/usr/bin/env node
/**
 * Read-only verification report (git only). No production API calls.
 * Status: MATCH | DRIFT | UNKNOWN | NOT_APPLICABLE
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { edgeImportClosureSha256Sync } from "./closure-hash.mjs";
import { validateReleaseIntent } from "./validate-release-manifest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function isAncestor(ancestor, descendant) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
      cwd: repoRoot,
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
}

function normalizeTextBuf(buf) {
  let s = buf.toString("utf8");
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function treePrefixHashSync(gitRef, prefix) {
  const out = execFileSync("git", ["ls-tree", "-r", "--name-only", gitRef, prefix], {
    encoding: "utf8",
    cwd: repoRoot,
  });
  const files = out.trim().split("\n").filter(Boolean).sort();
  const lines = [];
  for (const f of files) {
    const raw = execFileSync("git", ["show", `${gitRef}:${f}`], {
      maxBuffer: 128 * 1024 * 1024,
      cwd: repoRoot,
    });
    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    const h = crypto.createHash("sha256").update(normalizeTextBuf(buf), "utf8").digest("hex");
    lines.push(`${f}:${h}`);
  }
  const agg = crypto.createHash("sha256").update(lines.join("\n") + "\n", "utf8").digest("hex");
  return { fileCount: files.length, sha256: agg };
}

function verifyComponent(manifest, c) {
  if (c.applicability === "NOT_APPLICABLE") {
    return {
      component_id: c.id,
      status: "NOT_APPLICABLE",
      detail: c.not_applicable_reason ?? "no reason recorded",
    };
  }
  const mainSha = manifest.github.main.approved_sha;
  const intSha = manifest.github.lovable_integration.commit_sha;

  if (c.class === "supabase_edge") {
    const entry = c.source?.closure?.entry;
    const expected = c.source?.closure?.expected_sha256;
    if (!entry || !expected) {
      return {
        component_id: c.id,
        status: "UNKNOWN",
        detail: "missing closure entry or expected_sha256 on manifest",
      };
    }
    try {
      const computedMain = edgeImportClosureSha256Sync(mainSha, entry);
      const computedInt = edgeImportClosureSha256Sync(intSha, entry);
      const mainMatch = computedMain === expected;
      const intMatch = computedInt === expected;
      const ancestryMainInt = isAncestor(mainSha, intSha);
      if (mainMatch && intMatch && ancestryMainInt) {
        return {
          component_id: c.id,
          status: "MATCH",
          detail: "closure hash matches manifest at both shas; main is ancestor of integration tip",
          computed_sha256: computedMain,
        };
      }
      return {
        component_id: c.id,
        status: "DRIFT",
        detail: "closure or ancestry check failed",
        computed_main_sha256: computedMain,
        computed_integration_sha256: computedInt,
        expected_sha256: expected,
        main_is_ancestor_of_integration: ancestryMainInt,
      };
    } catch (e) {
      return {
        component_id: c.id,
        status: "UNKNOWN",
        detail: `git object read failed: ${e?.message ?? e}`,
      };
    }
  }

  if (c.class === "fly_worker") {
    const paths = c.source?.config_paths;
    const expected = c.source?.expected_sha256;
    if (!paths?.length || !expected) {
      return {
        component_id: c.id,
        status: "UNKNOWN",
        detail: "APPLICABLE fly_worker requires source.config_paths and expected_sha256",
      };
    }
    try {
      const parts = [];
      for (const p of paths) {
        const { sha256, fileCount } = treePrefixHashSync(mainSha, p);
        parts.push({ path_prefix: p, fileCount, sha256 });
      }
      const joined = parts.map((x) => `${x.path_prefix}:${x.sha256}`).sort().join("\n") + "\n";
      const agg = crypto.createHash("sha256").update(joined, "utf8").digest("hex");
      if (agg === expected) {
        return { component_id: c.id, status: "MATCH", detail: "prefix tree hash matches", parts };
      }
      return {
        component_id: c.id,
        status: "DRIFT",
        detail: "prefix aggregate hash mismatch",
        computed_aggregate_sha256: agg,
        expected_sha256: expected,
        parts,
      };
    } catch (e) {
      return {
        component_id: c.id,
        status: "UNKNOWN",
        detail: `tree hash failed: ${e?.message ?? e}`,
      };
    }
  }

  if (c.class === "vercel_frontend") {
    return {
      component_id: c.id,
      status: "UNKNOWN",
      detail:
        "vercel_frontend git-only verification not implemented in V1 (no deployment credentials in workflow)",
    };
  }

  return {
    component_id: c.id,
    status: "UNKNOWN",
    detail: `unsupported class ${c.class}`,
  };
}

function loadAttestations(manifestId) {
  const attestationDir = path.join(repoRoot, "docs/release/manifests/attestations");
  if (!fs.existsSync(attestationDir)) return [];
  return fs
    .readdirSync(attestationDir)
    .filter((f) => f.startsWith(`${manifestId}.`) && f.endsWith(".json"))
    .map((f) => {
      const p = path.join(attestationDir, f);
      return { file: `docs/release/manifests/attestations/${f}`, ...JSON.parse(fs.readFileSync(p, "utf8")) };
    })
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
}

function compareAttestationToExpectation(component, att) {
  if (!component.deployment_expectation || !att?.observed) {
    return { status: "UNKNOWN", detail: "no deployment_expectation or attestation observed block" };
  }
  const exp = component.deployment_expectation;
  const obs = att.observed;
  if (exp.reported_edge_version != null && obs.edge_function_version != null) {
    if (Number(exp.reported_edge_version) === Number(obs.edge_function_version)) {
      return {
        status: "MATCH",
        detail: "attestation edge_function_version matches manifest deployment_expectation",
      };
    }
    return {
      status: "DRIFT",
      detail: "edge_function_version mismatch between manifest expectation and attestation",
    };
  }
  return {
    status: "UNKNOWN",
    detail: "no comparable numeric fields between manifest and attestation",
  };
}

function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath) {
    console.error("Usage: verify-release.mjs <path/to/release_intent.json>");
    process.exit(2);
  }
  const abs = path.isAbsolute(manifestPath)
    ? manifestPath
    : path.join(repoRoot, manifestPath);
  const manifest = JSON.parse(fs.readFileSync(abs, "utf8"));
  const val = validateReleaseIntent(manifest);
  if (!val.ok) {
    console.error(JSON.stringify({ ok: false, errors: val.errors }, null, 2));
    process.exit(1);
  }

  const mainSha = manifest.github.main.approved_sha;
  const intSha = manifest.github.lovable_integration.commit_sha;
  const integrationContainsMain = isAncestor(mainSha, intSha);

  const components = (manifest.components || []).map((c) => verifyComponent(manifest, c));

  const attestations = loadAttestations(manifest.manifest_id);
  const deployment_checks = [];
  for (const c of manifest.components || []) {
    if (c.applicability !== "APPLICABLE") continue;
    const relevant = attestations.filter((a) => a.component_id === c.id);
    if (relevant.length === 0) {
      deployment_checks.push({
        component_id: c.id,
        status: "UNKNOWN",
        detail: "no append-only attestation file for this component",
      });
      continue;
    }
    const last = relevant[relevant.length - 1];
    deployment_checks.push({
      component_id: c.id,
      ...compareAttestationToExpectation(c, last),
      attestation_file: last.file,
    });
  }

  const report = {
    schema_version: "1",
    manifest_id: manifest.manifest_id,
    generated_at: new Date().toISOString(),
    git: {
      main_approved_sha: mainSha,
      integration_commit_sha: intSha,
      integration_contains_main_merge: integrationContainsMain,
    },
    manifest_validation: val,
    components,
    deployment_identity_checks: deployment_checks,
    deployment_attestations_loaded: attestations.map((a) => ({
      file: a.file,
      sequence: a.sequence,
      component_id: a.component_id,
    })),
  };

  const outDir = process.env.URC_OUT_DIR
    ? path.resolve(repoRoot, process.env.URC_OUT_DIR)
    : path.join(repoRoot, ".urc-verify");
  fs.mkdirSync(outDir, { recursive: true });
  const base = `urc-verify-${manifest.manifest_id}`;
  const jsonPath = path.join(outDir, `${base}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");

  const lines = [];
  lines.push(`# Unified Release Control — verification`);
  lines.push("");
  lines.push(`- **Manifest:** \`${manifest.manifest_id}\``);
  lines.push(`- **Main SHA:** \`${mainSha}\``);
  lines.push(`- **Integration SHA:** \`${intSha}\``);
  lines.push(
    `- **Ancestry (main ⊆ integration):** **${integrationContainsMain ? "MATCH" : "DRIFT"}**`,
  );
  lines.push("");
  lines.push(`| Component (source) | Status | Detail |`);
  lines.push(`| --- | --- | --- |`);
  for (const row of components) {
    lines.push(
      `| \`${row.component_id}\` | **${row.status}** | ${String(row.detail).replace(/\|/g, "\\|")} |`,
    );
  }
  lines.push("");
  lines.push(`| Deployment evidence (attestation file) | Status | Detail |`);
  lines.push(`| --- | --- | --- |`);
  for (const row of deployment_checks) {
    lines.push(
      `| \`${row.component_id}\` | **${row.status}** | ${String(row.detail).replace(/\|/g, "\\|")} |`,
    );
  }
  lines.push("");
  lines.push(`Full JSON: \`${path.relative(repoRoot, jsonPath)}\``);

  const mdPath = path.join(outDir, `${base}.md`);
  fs.writeFileSync(mdPath, lines.join("\n"), "utf8");

  console.log(JSON.stringify({ ok: true, json: jsonPath, markdown: mdPath }, null, 2));
}

const __filename = path.resolve(fileURLToPath(import.meta.url));
if (path.resolve(process.argv[1]) === __filename) {
  main();
}
