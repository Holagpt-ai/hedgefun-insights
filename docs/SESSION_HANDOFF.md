# Session handoff — current 2026-11-06 ET

**CURRENT (Nov 6, Batch 211 PR #223 under review):** GitHub `main` **`88de3533`** (Batch **195.1 PR #222 merged**); Lovable integration and editor **`3ec5f7cd`** contain that main. PR **#223** adds forward-sync with **apply authorization inside `synchronize()`** and safer disposable E2E ref handling; **still no automatic integration writes** until separate owner activation (`STOCKSIST_LOVABLE_SYNC_ACTIVATED=true`). Read-only check, merge-safety tests and runbook under `scripts/lovable-sync/`, `.github/workflows/lovable-source-forward-sync.yml`, `docs/release/batch211-lovable-source-forward-sync-v1.md`. **No Edge/SQL/Fly/Vercel actions.** ISS-028, ISS-024, ISS-034, ISS-036, ISS-039 remain subject to separate acceptance. Earlier PR #222 pending wording below is historical at its authoring point.


**Batch 195.1 (PR #222, not merged; badge `dad9afac`; trust-safety `4f699897`):** Catalyst issuer-headline attribution, plus the Polygon source-badge correction on the same branch. An ACAD row no longer takes an RXRX/Viatris earnings headline from a shared word such as "pharmaceuticals", and a related headline is not labeled as that symbol's earnings or press release. `provider="polygon"` now uses one wire-versus-editorial rule for both `catalystSourceBadge` and the event-category label: GlobeNewswire and Business Wire are Press Release only for a direct issuer row; Motley Fool, Zacks, and other editorial publishers stay News. Unknown issuer attribution on non-authoritative providers does not default to Press Release from the wire name alone; company IR stays authoritative. `CatalystDetailPanel` hides EPS and surprise Market Facts for related or unverified issuer associations. The frontend correction is the Vercel bundle. Backend activation is a later Lovable Cloud deploy of the Edge Functions listed in the runbook; this PR does not deploy them. No production row rewrite, migration, cron, Fly, or Vercel operation. Runbook `docs/release/batch195-1-issuer-headline-attribution-v1.md`. **ISS-028** stays **OPEN** until authenticated production is checked.

**Batch 191.1 (merged):** PR **#221** → `67e3418a`. Gappers evidence — **`split_scale_suppressed_count`** so **`impliesSplitScale`** gap suppression is not counted as **unresolved** inputs. Runbook `docs/release/batch191-1-gappers-split-scale-evidence-v1.md`. **ISS-024** / **ISS-034** stay **OPEN**.

**Batch 210 / PR #220 (branch):** `cursor/batch210-unified-release-control-v1` — CI verify workflow now runs **`npm ci --ignore-scripts`** after **`actions/setup-node@v4`** (Node **24**) so release-control scripts have locked deps on clean runners.

**Code:** GitHub `main` **`67e3418a`** (Batch **191.1** PR **#221** on top of Batch **190.15** / **`3c810c4b`**).

**Batch 190.16 production checkpoint (2026-11-06, reported):** Owner-reported Lovable Cloud **`sync-screener-data`** Edge **version 516**; six consecutive natural premarket generations (narrow window). Git narrative: `docs/release/manifests/batch210.example.190.16.historical.v1.json` (`historical_evidence.production_checkpoint_2026_11_06`). **ISS-034 OPEN** — **Batch 191** RTH/AH still required. **ISS-039** remains the release-provenance tracking issue; git-only verification does not prove live Edge binary equivalence.

**Session recovery (unrelated):** Uncommitted edits to `src/lib/screeners/screener-radar-intraday-overlay.ts` were reverted during recovery to match `main`; not part of Batch 210. **No restore** without separate review.

**Production activation (Batch 190.15 — reported complete):** Lovable Cloud Edge **`sync-screener-data`** deployed **2026-11-04** (before migration apply). Canonical SQL: **`supabase/migrations/20261104230000_screener_sync_slim_control_json_v1.sql`**. Lovable reported apply via **Drizzle ledger idx 68**; **`supabase_migrations.schema_migrations`** has **no** matching row — do not backfill either ledger. Observed RPC payload sizes: full-job response ~**8.60 MB**; slim **`control`** response **407 bytes**. First natural post-migration generation: **85** persisted rows, **six** evaluated tabs, **7/7** chunks completed, publication reported **PASS** for that run only.

**ISS-034:** **OPEN.** One successful post-**190.15** generation does **not** prove durable Edge CPU headroom across repeated regular-session and after-hours cron windows. Nov **4** **HTTP 546** finalize failures and stranded **`finalizing`** job evidence remain on record. Complete **Batch 191** RTH and AH acceptance before closing.

**November 5 screenshot observations (reported — backend causes not verified):**
- **Catalyst:** ACAD row shown alongside an **RXRX**-specific headline → **ISS-028** / **Batch 195** issuer-trust acceptance.
- **Screeners:** **Gappers** and **New Highs / Lows** appear as **stale snapshots** while other screener tabs show **delayed but refreshing** data → **ISS-024** / **Batch 191**.
- **Day Trade Radar:** displayed qualification counts require database reconciliation; no inconsistency confirmed → **Batch 196** acceptance.
- **Watchlist:** **17** rendered symbols with numerous **Analysis pending** indicators → reported; **Batch 204** / **ISS-007** deferred unless reproduced with logs.
- **Homepage:** copy implies **real-time** pricing while product disclosures describe a **delayed** market feed → **ISS-038** (reported copy mismatch).

**Merged on `main` (production verification outstanding):** **Batch 195** PR **#212** → **`5d6399de`**; **ISS-037** PR **#215** → **`3bd3ee68`**. Do not assume Vercel or Edge deploy parity until verified.

**Deployment evidence preserved:**
- November 1 `sync-screener-data` integration source **`ccb4055b3f8b84c46fa38529844150c140638705`**.
- November 2 premarket acceptance **PASS** (seven consecutive publications, 04:00–04:30 ET; row counts 60/62/63).
- **Batch 190.12** SQL and **190.13** cron `{}` normalization **already deployed** — do not reapply.
- **Batch 192:** Vercel + **`generate-daily-brief`** deploy reported; **ISS-025** visual acceptance **NOT VERIFIED**.
- **Batch 196.1:** Fly **`stocksist-radar-v22-worker` v46** from **`797cc615`**; **ISS-036** live value acceptance **NOT VERIFIED**.

**Next approved sequence:**
1. Review and merge **Batch 195.1** only after review. Do not deploy Edge or rewrite catalyst rows from this PR.
2. **Batch 191** — timed regular-session and after-hours scanner acceptance (**ISS-034** gate).
3. **Batch 195** — authenticated Catalyst/Watchlist/Radar issuer-trust walkthrough (**ISS-028**, including the ACAD/Viatris and SpaceX press-release cases).
4. **Batch 192** — AM Inbox authenticated visual acceptance (**ISS-025**).
5. **Batch 193** — mobile/Journal acceptance.
6. **ISS-037** — production verification after PR **#215** merge (**NOT VERIFIED**; no new merge requested).
7. Narrow follow-ups from Nov 5 reports: **ISS-038** homepage delayed-data copy; **ISS-024** tab freshness parity (Gappers/NHL vs other tabs); Day Trade displayed qualification counts (**Batch 196** reconciliation).

**Deferred:** AI Trader (**POST-LAUNCH PAUSED**), brokers, billing, real-time-feed upgrades (**ISS-008** / batch **205**).

---

**Historical continuity snapshots (preserved):**

See `docs/CHANGELOG.md`, `docs/DEPLOYMENT_STATUS.md`, and `docs/release/` runbooks for Batch 190–191 history, Gate 4 pass/regression, and ISS-034 criteria.

**Batch 210 (when merged):** Unified Release Control V1 — manifests under `docs/release/manifests/`, runbook `docs/release/batch210-unified-release-control-v1.md`, **ISS-039** (git provenance vs live platform identity).

# Session handoff (archive)

See `docs/CHANGELOG.md` and `docs/release/` runbooks.
