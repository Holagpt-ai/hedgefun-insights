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
| **MATCH** | Claim supported by git evidence (and optional weak attestation field match) |
| **DRIFT** | Demonstrable disagreement |
| **UNKNOWN** | Insufficient evidence (normal for production runtime without platform API) |
| **NOT_APPLICABLE** | Component had no deployable delta for this batch |

**Critical:** Git **source** hashes prove **repository** content at a commit, **not** the live Edge binary, Vercel bundle, or Fly image unless the platform exposes a comparable digest and this batch records it.

## Operational commands (local)

```sh
node --test scripts/release-control/release-control.test.mjs
node scripts/release-control/verify-release.mjs docs/release/manifests/batch210.example-190.16-historical-v1.json
```

Outputs write to **`.urc-verify/`** (gitignored). In CI, download the **urc-verify-report** artifact.

## Historical example (Batch 190.16)

- `docs/release/manifests/batch210.example-190.16-historical-v1.json` — approved **`main`** `e03ad6ad…`, integration `c35d63ca…`, Edge closure hash, optional expected version **516** (weak comparison to attestation).
- `docs/release/manifests/attestations/batch210.example.190.16.historical.v1.001.json` — append-only owner import.

## Future activation (not in V1)

- Optional **VERCEL_TOKEN**, **FLY_API_TOKEN**, Lovable/Supabase management exports — gated batches only; **no** scheduled monitoring until approved.
