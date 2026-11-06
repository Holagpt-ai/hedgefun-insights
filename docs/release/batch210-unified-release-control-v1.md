# Batch 210 — Unified Release Control V1 (Git-only foundation)

**Repository:** `Holagpt-ai/hedgefun-insights`  
**Scope:** Release intent manifests (immutable), append-only deployment attestations, deterministic **source** hashing, manual read-only CI verification. **No production deploy, no secrets, no schedulers.**

## Ownership (unchanged)

| Surface | Owner |
| --- | --- |
| GitHub `main` + integration branch | Product / Cursor |
| Supabase production (Postgres, Edge deploy, migrations, secrets) | **Lovable Cloud** |
| Public SPA | **Vercel** |
| Fly workers | Approved ops path (repo holds Dockerfiles) |

## Artifacts

| Path | Role |
| --- | --- |
| `docs/release/manifests/schema-v1.json` | JSON Schema for **release_intent** |
| `docs/release/manifests/schema-attestation-v1.json` | JSON Schema for **deployment_attestation** (append-only) |
| `docs/release/manifests/*.json` | **Immutable** release intent records (new file per release; never rewrite) |
| `docs/release/manifests/attestations/<manifest_id>.<sequence>.json` | Post-deploy facts (append-only; never edit prior sequence numbers) |
| `scripts/release-control/*.mjs` | Validators, Edge import-closure hasher, verify report generator |
| `.github/workflows/unified-release-control-verify.yml` | **workflow_dispatch** only |

## Status vocabulary

| Status | Meaning |
| --- | --- |
| **MATCH** | **Source:** git evidence (ancestry, closure tree hash) supports the manifest. **Runtime:** never **MATCH** from manual attestation alone — see **UNKNOWN**. |
| **DRIFT** | Demonstrable disagreement |
| **UNKNOWN** | Insufficient evidence (normal for production **runtime** without independent platform digest/API) |
| **NOT_APPLICABLE** | Component had no deployable delta for this batch |

**Critical:** Git **source** hashes prove **repository** content at a commit, **not** the live Edge binary, Vercel bundle, or Fly image. Repeating the same manually typed version in an attestation as in narrative text **does not** upgrade runtime to **MATCH**; runtime stays **UNKNOWN** until an approved evidence path (e.g. platform-exported digest) exists.

## GitHub Actions (read-only workflow)

- **Token:** `permissions: contents: read` only.
- **Manifest path:** pass **`URC_MANIFEST_PATH`** via workflow `env` (no direct interpolation of `inputs.*` into shell commands). `scripts/release-control/ci-verify.mjs` rejects paths outside `docs/release/manifests/*.json`, `..`, `attestations/`, and `schema*.json`.

## Operational commands (local)

```sh
node --test scripts/release-control/release-control.test.mjs
node scripts/release-control/verify-release.mjs docs/release/manifests/batch210.example.190.16.historical.v1.json
```

Outputs write to **`.urc-verify/`** (gitignored). In CI, download the **urc-verify-report** artifact.

## Historical example (Batch 190.16)

- **Production checkpoint (2026-11-06):** Owner-reported Lovable Cloud activation: **`sync-screener-data`** Edge **version 516**. Recorded under `historical_evidence.production_checkpoint_2026_11_06` in the manifest; automated verification still treats **runtime** as **UNKNOWN** (**ISS-039**).
- `docs/release/manifests/batch210.example.190.16.historical.v1.json` — approved **`main`** `e03ad6ad…`, integration `c35d63ca…`, Edge import-closure hash (`repo_edge_import_closure_v1`).
- `docs/release/manifests/attestations/batch210.example.190.16.historical.v1.001.json` — append-only manual attestation (observed version is **not** a verified digest).

**Validators:** `validate-release-manifest.mjs` applies **JSON Schema** (`ajv` + `docs/release/manifests/schema-*.json`) plus component rules. **`manifest-integrity-check.mjs`** enforces per-file **single-commit** introduction (`git rev-list --count`) and no duplicate `(manifest_id, sequence)` attestation filenames.

## Future activation (not in V1)

- Optional **VERCEL_TOKEN**, **FLY_API_TOKEN**, Lovable/Supabase management exports — gated batches only; **no** scheduled monitoring until approved.
