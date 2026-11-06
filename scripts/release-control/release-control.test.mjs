import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { edgeImportClosureSha256Sync } from "./closure-hash.mjs";
import { collectEdgeTsClosureFromGit } from "./edge-closure.mjs";
import { validateReleaseIntent, validateAttestation } from "./validate-release-manifest.mjs";
import { runtimeCheck } from "./verify-release.mjs";
import { runManifestIntegrityCheck } from "./manifest-integrity-check.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

const EXAMPLE_MANIFEST = path.join(
  root,
  "docs/release/manifests/batch210.example.190.16.historical.v1.json",
);

const PINNED = "e03ad6ad8f5726be6c0c446a5dfddb5d8db31924";
const ENTRY = "sync-screener-data/index.ts";

function runCiVerify(manifestPath) {
  return spawnSync(process.execPath, ["scripts/release-control/ci-verify.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, URC_MANIFEST_PATH: manifestPath },
  });
}

test("closure hash is deterministic for same git ref", () => {
  const a = edgeImportClosureSha256Sync(PINNED, ENTRY);
  const b = edgeImportClosureSha256Sync(PINNED, ENTRY);
  assert.strictEqual(a, b);
  assert.strictEqual(
    a,
    "f9845326a351ffcb4fae3ac7c1f6a06143241e4dab87cc86dcfec02402a32864",
  );
});

test("closure ignores dirty working tree when verifying pinned git ref", () => {
  const before = edgeImportClosureSha256Sync(PINNED, ENTRY);
  const files = collectEdgeTsClosureFromGit(PINNED, ENTRY);
  const victimRel = files.find((f) => f.startsWith("sync-screener-data/") && f.endsWith(".ts"));
  assert.ok(victimRel, "expected at least one .ts file in closure");
  const abs = path.join(root, "supabase/functions", victimRel);
  const original = fs.readFileSync(abs, "utf8");
  try {
    fs.writeFileSync(abs, `${original}\n// __urc_test_dirty_working_tree__\n`, "utf8");
    const after = edgeImportClosureSha256Sync(PINNED, ENTRY);
    assert.strictEqual(
      after,
      before,
      "pinned-ref closure must not read working tree mutations",
    );
  } finally {
    fs.writeFileSync(abs, original, "utf8");
  }
});

test("closure fails closed when entry blob missing at git ref", () => {
  assert.throws(() =>
    edgeImportClosureSha256Sync(PINNED, "__does_not_exist__/index.ts"),
  );
});

test("release intent example manifest validates (schema + rules)", () => {
  const m = JSON.parse(fs.readFileSync(EXAMPLE_MANIFEST, "utf8"));
  const r = validateReleaseIntent(m);
  assert.strictEqual(r.ok, true, r.errors?.join("; "));
});

test("release intent rejects unknown top-level key (JSON Schema)", () => {
  const m = JSON.parse(fs.readFileSync(EXAMPLE_MANIFEST, "utf8"));
  const r = validateReleaseIntent({ ...m, unexpected_top_level: true });
  assert.strictEqual(r.ok, false);
});

test("release intent rejects bad sha length", () => {
  const r = validateReleaseIntent({
    schema_version: "1",
    batch_id: "210",
    manifest_id: "bad",
    kind: "release_intent",
    recorded_at: "2026-01-01T00:00:00Z",
    github: {
      main: { approved_sha: "abc" },
      lovable_integration: {
        branch: "x",
        commit_sha: "e03ad6ad8f5726be6c0c446a5dfddb5d8db31924",
      },
    },
    components: [
      {
        id: "x",
        class: "supabase_edge",
        applicability: "NOT_APPLICABLE",
        not_applicable_reason: "test",
      },
    ],
    approvals: [{ role: "t", description: "t" }],
  });
  assert.strictEqual(r.ok, false);
});

test("attestation example validates", () => {
  const p = path.join(
    root,
    "docs/release/manifests/attestations/batch210.example.190.16.historical.v1.001.json",
  );
  const a = JSON.parse(fs.readFileSync(p, "utf8"));
  const r = validateAttestation(a);
  assert.strictEqual(r.ok, true, r.errors?.join("; "));
});

test("attestation rejects fractional sequence (JSON Schema)", () => {
  const r = validateAttestation({
    schema_version: "1",
    kind: "deployment_attestation",
    manifest_id: "batch210.example.190.16.historical.v1",
    sequence: 1.5,
    component_id: "sync_screener_data_edge",
    recorded_at: "2026-11-06T15:00:00.000Z",
    observer: "manual_import",
    observed: { platform: "x" },
  });
  assert.strictEqual(r.ok, false);
});

test("NOT_APPLICABLE component has reason", () => {
  const r = validateReleaseIntent({
    schema_version: "1",
    batch_id: "210",
    manifest_id: "t.manifest",
    kind: "release_intent",
    recorded_at: "2026-01-01T00:00:00Z",
    github: {
      main: { approved_sha: "e03ad6ad8f5726be6c0c446a5dfddb5d8db31924" },
      lovable_integration: {
        branch: "b",
        commit_sha: "c35d63caeca894e8fde3c663635fd33b241f0346",
      },
    },
    components: [
      {
        id: "fly",
        class: "fly_worker",
        applicability: "NOT_APPLICABLE",
      },
    ],
    approvals: [{ role: "o", description: "d" }],
  });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("not_applicable_reason")));
});

test("runtime: manual observed fields never yield MATCH (UNKNOWN)", () => {
  const c = { id: "sync_screener_data_edge", applicability: "APPLICABLE" };
  const att = {
    file: "docs/release/manifests/attestations/x.json",
    observed: { edge_function_version: 516 },
  };
  const r = runtimeCheck(c, att);
  assert.strictEqual(r.status, "UNKNOWN");
});

test("runtime: independent_evidence flag stays UNKNOWN in V1", () => {
  const c = { id: "sync_screener_data_edge", applicability: "APPLICABLE" };
  const att = {
    file: "docs/release/manifests/attestations/x.json",
    observed: { independent_evidence: true },
  };
  const r = runtimeCheck(c, att);
  assert.strictEqual(r.status, "UNKNOWN");
});

test("ci-verify rejects missing URC_MANIFEST_PATH", () => {
  const env = { ...process.env };
  delete env.URC_MANIFEST_PATH;
  const r = spawnSync(process.execPath, ["scripts/release-control/ci-verify.mjs"], {
    cwd: root,
    encoding: "utf8",
    env,
  });
  assert.strictEqual(r.status, 2);
});

test("ci-verify rejects unsafe or disallowed manifest paths", () => {
  for (const p of [
    "docs/release/manifests/../../../package.json",
    "docs/release/manifests/attestations/batch210.example.190.16.historical.v1.001.json",
    "docs/release/manifests/schema-v1.json",
    "foo.json",
  ]) {
    const r = runCiVerify(p);
    assert.strictEqual(
      r.status,
      2,
      `expected exit 2 for path ${JSON.stringify(p)}, stderr=${r.stderr}`,
    );
  }
});

test("manifest integrity check passes on repo manifests", () => {
  const { ok, errors } = runManifestIntegrityCheck();
  assert.strictEqual(ok, true, errors?.join("; "));
});
