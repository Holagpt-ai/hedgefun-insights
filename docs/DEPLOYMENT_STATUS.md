> **Current Git state (2026-10-28, Master Continuity Sync V4):** GitHub `main` **`1398d16ad0041c34661e4bc76487c5a3757c207e`** (PR **#194** merged). Lovable integration **`cursor/lovable-sync-from-main-20261024`** @ **`04da6d7f87994c93a0c5fc64492654df2424fe0b`**. Git merge does **not** prove Vercel, Fly, or every Edge revision. Owner-reported Lovable **`sync-screener-data`** deploy times below; Cursor did not deploy in the continuity sync.

# Deployment status

Checked against owner-reported production evidence **2026-10-28** and git **`1398d16a`**. **Supabase production is managed in Lovable Cloud** (project `zcjptaolpumhtlwhlemq`). Edge deploy safety: `docs/release/edge-function-release-lovable.md`. **Git SHA on `main` is not the live Supabase Edge revision** until Lovable Cloud records a deploy.

## GitHub `main` (2026-10-28)

| Field | Value |
| --- | --- |
| HEAD | **`1398d16ad0041c34661e4bc76487c5a3757c207e`** |
| Last merge | PR **#194** — P0 screener CPU mitigation (ISS-034) |
| Prior | PR **#193** → **`4f7c10db`** (P0 D1 volume); Batch **189** → **`68092518`** |

## Lovable integration branch (2026-10-28)

| Field | Value |
| --- | --- |
| Branch | `cursor/lovable-sync-from-main-20261024` |
| Tip | **`04da6d7f87994c93a0c5fc64492654df2424fe0b`** |
| Notes | Forward-merge of **`1398d16a`**; preserves Lovable `bun.lock`, Lovable `deno.lock`, generated `mcp/index.ts`, `handler_test.ts` typing |

## `sync-screener-data` (owner-reported, 2026-10-28)

| Field | Value |
| --- | --- |
| PR **#193** D1 deploy fingerprint | `23980c312052a4cb5de5be12e3a32b178e1d1fa8104c39f384e02f13845e6f03` |
| PR **#194** mitigation deploy | **2026-10-28 17:29:52 UTC** (reported) — **not** production acceptance |
| Post-deploy CPU failures | **17:30** and **17:35 UTC** — **CPU Time exceeded**, ~13,262 symbols |
| Last confirmed DB publication | **16:15:04 UTC**, **108 rows** |
| Cron job 25 | Active |
| ISS-034 | **Open** — Batch **190** authorized |

## Open PR (GitHub)

| PR | State | Notes |
| --- | --- | --- |
| **#174** | **CLOSED**, not merged | Superseded; Batch **174** verification continues under master batch **191** |

## Vercel SPA

| Field | Value |
| --- | --- |
| Batch **189** merge | **`68092518`** — homepage cleanup |
| Manifest git SHA | **None** — hash-only parity checks via `npm run integrity -- --remote` |
| Latest local build (Cursor, 2026-10-28) | Not re-run for this docs-only change set |

## Fly `stocksist-radar-v22-worker` (read-only parity, 2026-10-24)

| Field | Value |
| --- | --- |
| Release | **v45** (complete, 2026-10-20T13:42:08Z) |
| Digest | `sha256:47ff670c6cbefc43ff01cc87c2e1387f20f4c21a734b45558e7b4a35b901979e` |
| Parity vs approved worker logic on `main` | **PASS** (2026-10-24) — verification batch **196** |

## AI Analyst V2 — `chat` Edge activation

| Field | Value |
| --- | --- |
| Result | **BLOCKED** (**ISS-015**) — batch **203** |
| Previous `chat` revision for rollback | **UNKNOWN** |

## Batch 187 earnings Edge activation

| Field | Value |
| --- | --- |
| Git merge | **`d86e0c69`** — Vercel **SUCCESS** |
| Edge deploy (`get-pre-market-workspace`, `sync-earnings-finnhub`, `sync-catalyst-events`) | **NOT APPLIED** — revision ids **UNKNOWN**; master batch **194** |

---

## Historical sections (2026-10-24 – 2026-10-26)

Earlier Vercel manifest observations, Gate I.3 SEC activation record, and integration branch tips before **`04da6d7f`** remain in git history and runbooks (`master-reset-2026-10-27.md`, `batch174-175-monday-acceptance-inbox-v1.md`). Do not treat stale SHA rows in older paragraphs as current without checking the table above.
