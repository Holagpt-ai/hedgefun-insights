import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { edgeImportClosureSha256Sync } from "./closure-hash.mjs";
import { validateReleaseIntent, validateAttestation } from "./validate-release-manifest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

test("closure hash is deterministic for same git ref", () => {
  const sha = "e03ad6ad8f5726be6c0c446a5dfddb5d8db31924";
  const a = edgeImportClosureSha256Sync(sha, "sync-screener-data/index.ts");
  const b = edgeImportClosureSha256Sync(sha, "sync-screener-data/index.ts");
  assert.strictEqual(a, b);
  assert.strictEqual(
    a,
    "f9845326a351ffcb4fae3ac7c1f6a06143241e4dab87cc86dcfec02402a32864",
  );
});

test("release intent example manifest validates", () => {
  const p = path.join(
    root,
    "docs/release/manifests/batch210.example-190.16-historical-v1.json",
  );
  const m = JSON.parse(fs.readFileSync(p, "utf8"));
  const r = validateReleaseIntent(m);
  assert.strictEqual(r.ok, true, r.errors?.join("; "));
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
