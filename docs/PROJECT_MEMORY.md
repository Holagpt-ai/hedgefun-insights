# Project memory

Canonical constraints for Stocksist. Batch runbooks under `docs/` stay the detailed history. This file is the short version agents must keep true.

## Current GitHub source checkpoint — November 11, 2026 ET (Batch 225 merged)

- **Verified canonical GitHub main:** `736831e910b0ca57a8ecdb75f900cce8418b0510` (squash merge of **PR #242**, Batch 225, 20:04 ET November 11). Prior merged batches: **222** spec / PR #239; **223** engine / PR #240 → `3f904970348a11e4fec28e1d86222cbaede2e5e7`; **224** adapter / PR #241 → `8b7082e0a8bef24aa9ccdc5c6ca2fa70473042a2`; **225** handoff / PR #242 → `736831e9`.
- **Batch 225 shipped in Git source:** `penny_continuation_workflow_handoff_v1` projection, optional AM Inbox badge matcher, badge integrity / stale + cross-session guards, symbol-only fallback navigation without cached foreign security ID. Final PR #242 head `02202d5d05b605c68f9a1f78ad9e92db459d89ab`; required GitHub Deno and Vercel checks **passed** before merge. **No active runtime caller, migration, UI, persistent read/write, Fly/Edge deployment or feature activation** was authorized.
- **Next implementation (not started): Batch 226 — Penny Continuation Controlled Persistence & Read Integration V1.** Cursor prompt prepared. Additive Penny-only sidecar + bounded, role-scoped, versioned persistence/read contracts, idempotent and stale-safe semantics, DTO and inactive client adapter; test in source only. **Open PR for owner review; no merge or production SQL/Edge/Fly/cron/secrets/flags.** Do not overload existing `late_session_continuation_handoffs` or change `late_session_handoff_list_active_v1` behavior.
- **Launch prerequisites still unresolved:** ISS-034/ISS-024 repeated-session scanner/tab evidence acceptance, ISS-025 authenticated AM Inbox UI acceptance, ISS-040 GitHub→Lovable unattended source-sync acceptance, ISS-044 closed-snapshot acceptance, plus separate Penny persistence/deployment/read/UI gates. **GitHub main is not proof of Lovable Cloud, Fly or Vercel runtime identity.** November 29 public target remains at risk. Overnight pipeline `OVERNIGHT_SCANNER_PIPELINE_READY` remains **false**; exchange/provider eligibility and owner activation remain mandatory. AI Trader, broker, billing, major feed upgrades remain deferred.


## Verified live checkpoint — November 10, 2026 (~1:30 PM ET, Batch 191 / PR #233)

- **Publication ledger (owner-verified, Lovable read-only DB):** ET session totals Nov **6/9/10** — see `docs/release/batch191-scanner-acceptance-v1.md`. Nov **10** RTH through **1:30 PM:** **43** published (all **7/7** + publish RPC), **4** aborted; **Nov 10 AH not accepted**.
- **Current feed:** **107** rows @ ~1:30 PM; six tabs **`evaluated`**; Gappers unresolved **0**; NHL **available**. Ledger **verified**; historical per-tab evaluation on all jobs + authenticated UI **not verified**. **ISS-034** / **ISS-024** **OPEN**.

## Verified live checkpoint — November 10, 2026 (Batch 218 ISS-034 evidence)

- **GitHub main:** `a23c7474175cde3a044c09dbe35d646c80cdc745` (Batch 217 follow-on preview-auth parity #231).
- **Scanner (owner-reported Nov 10 RTH):** Primary screener publishing normally by **12:35 PM ET** — **106** published rows, six tabs evaluated. **98** successful publications and **4** aborted jobs through 12:35 ET. **32** consecutive successful publications **10:00 AM–12:35 PM ET**. **09:30:** aborted — **mechanism NOT conclusively established** (`abort_reason` / `abort_evidence` **null**; last progress **`finalize_stage:claim_finalize_lease`**; Gappers unresolved **3** does not prove mechanism). **09:45 / 09:50 / 09:55:** **confirmed `prior_generation_retained`** (**no** confirmed new **`http_546`** on those three). Gappers `unresolved_gap_input_count` **3 → 0** by 10:00 supports **transient incomplete gap-input accounting** — **not** symbol-level provider proof. **09:45** abort evidence includes Gainers/Losers **`prerequisite_unavailable`** as **tab status only**, not an independently verified provider failure. Fail-closed preservation safeguards **unchanged**; do not weaken.
- **November 9 09:30 `http_546`:** DB-confirmed Edge resource limit; **finalize stage and CPU-specific cause NOT VERIFIED** (no `finalize_stage:*` on row; sampled Edge logs inconclusive). Batch **216** markers apply to **future** failures after owner-reported deploy — they do not retroactively name Nov 9.
- **ISS-034:** **OPEN** — partial Nov 10 RTH stability does **not** satisfy full **Batch 191** RTH/AH matrix. After-hours and multi-day acceptance still required.
- **ISS-044 (P0):** V2 publication stall — Batch **219.3A** merged (`dc9305f`); Fly worker **v48** deployed 2026-11-11 (`deployment-01M75N75WEW46WCQT8DAP9JFCC`). Closed-session snapshot tables still unaccepted until weekday **20:00 ET** park verification. Rollback **v47** `deployment-01M73Z9VFR2SQ97S92HS9B06XX`.

## November 9, 2026 post-Batch 217 source-sync conflict (historical)

- **Batch 217:** PR #230 squash-merged into GitHub `main` at `79260fbb10673f96ace21bae491c8953c42fe3c4` (AM Inbox symbol-aware Screeners handoff). Vercel PR check passed; authenticated production AM Inbox acceptance remains open (**ISS-025**).
- **GitHub → Lovable source sync:** owner activated `STOCKSIST_LOVABLE_SYNC_ACTIVATED=true`, and push-run `42717914109` triggered automatically but correctly failed closed with `CONFLICT` / `unexpected_paths: [src/integrations/supabase/previewAuthStorage.ts]` on Nov 9. Integration/editor `b54b328ae9745ebad67a888806f19d0013c7f1b1` remain **one main commit behind**. The unapproved path is a generated Lovable preview-auth source change (broader UUID syntax + `live--UUID-thr_*` host parsing); do not add an authentication file to the blanket overlay allowlist, reset the Lovable branch, or force-push. A narrowly scoped review PR backports the exact Lovable version to GitHub main and preserves its behavior. **ISS-040 OPEN until clean subsequent apply plus editor parity is observed.** Source sync never deploys Edge or SQL.

## Verified live checkpoint — November 9, 2026 evening (supersedes afternoon labels below)

- **GitHub main:** `17a31da8fcb22ad89abdb623edc950f2094e849e` (Batch 216 PR #229 merged). GitHub → Lovable one-time apply **passed** in Actions run `42676903219`; integration/editor contained all main commits (`2708cc04`, later `b54b328a`). Owner enabled `STOCKSIST_LOVABLE_SYNC_ACTIVATED=true` for ongoing guarded automatic forward-sync. **ISS-040 remains open solely for unattended post-merge monitoring/acceptance**, not activation or source parity; Edge deploy remains separately gated.
- **Edge (owner-reported):** Batches **215** and **216** Lovable Cloud Edge deployment **completed**. Closed-session observation for **ISS-043** and finalize-stage production correlation for **ISS-034** remain open. HTTP 546 root cause remains **NOT YET VERIFIED**.
- **AM Inbox (ISS-025):** Nov 9 RPC returned **3,776** active rows / **1,525** symbols / ~**4.1 MB**. Batch **217** measures client processing (~**424 ms**) and adds missing symbol-aware Screeners handoffs. Authenticated UI acceptance **NOT VERIFIED**.

## Verified live checkpoint — November 9, 2026 afternoon (historical; superseded above)

- **GitHub main:** `ff81065b8edf5a02c54ba356105965f23466c2ae`. **One-time** GitHub → Lovable source sync succeeded. Integration and editor are `fee9ab51`. The repository activation variable was returned to **false**. Permanent automatic synchronization is **not** active. **ISS-040 stays OPEN** for ongoing automation.
- **Scanner:** 09:30 ET completed 7/7 chunks, entered finalization, recorded `continue_last_error=http_546`, and aborted without publication. Lovable Edge runtime **v518** was observed. Available logs did not name the failing stage or prove CPU exhaustion. The scanner recovered: 11:50 ET published **113** rows across six tabs. The last 12 observed jobs, 10:55–11:50 ET, all published. **ISS-034 stays OPEN.**
- **Batch 216 / 216.1:** root cause of the 09:30 HTTP 546 is **NOT YET VERIFIED**. Source-only change persists a bounded `finalize_stage:*` marker via one conditional UPDATE (six durable stages; real errors preserved) and keeps it when the parent records `http_546`. Later owner-reported Edge deploy completed with Batch 215.

## Verified live checkpoint — November 9, 2026 morning (historical; superseded above)

- **GitHub main:** `c7cf47eea30a70b86a6edae03b572268d2202b15` (Batch 215, PR #227, merged Nov 7). Batches 210–215 / PRs #220–#227 are merged, including #223 (source-sync controller), #224 (Operations UI), #225 (diagnostics RPC source), #226 (admin guard), #227 (closed-session/23×5-ready session control). Older “PR not merged” paragraphs below are dated historical records, not current Git status.
- **Source-sync not complete:** integration branch `cursor/lovable-sync-from-main-20261024` and Lovable project active SHA both `a751f7d5854114fab651f0fbd29214c3da5bff0d`. GitHub compare `main...integration`: integration **behind by 5** main commits, **ahead by 86** Lovable-overlay commits. Latest Batch 211 push workflow run `42378183167` checked successfully; apply job **SKIPPED**. **ISS-040 OPEN.** Do not bypass guarded workflow, reset, rebase, force-push, or auto-merge the overlay back into main. Owner-approved activation of `STOCKSIST_LOVABLE_SYNC_ACTIVATED=true` must be separately controlled and disabled after a one-shot acceptance unless ongoing automation is separately approved.
- **Scanner live evidence, November 9 ~09:38 ET:** premarket produced **61 published generations** (04:00–09:00 ET). The 09:05 job completed 7/7 chunks but entered finalize and was later **aborted**; fresh 09:20 and 09:25 jobs published **94 rows**. The 09:30 job completed 7/7 but recorded **`continue_last_error=http_546`**, remained `finalizing` at inspection, and did **not** record a publish. The most recent feed row at that inspection was 09:25 ET (94 rows, six tab counts). HTTP 546 indicates an Edge resource-limit event; CPU-specific cause of this new occurrence is **not** independently established by DB records. **ISS-034 P0 remains OPEN**; correlate this job with Lovable Cloud Edge logs.
- **Session matrix:** Friday Nov 6 RTH 47 published, 26 aborted (09:30–16:00 ET). Friday after-hours 48 published. Saturday Nov 7 and Sunday Nov 8 each had **288 aborted generation jobs** across the day. These weekend classifications are closed-session jobs, regardless of wall-clock hour. **Batch 215 git fix is merged, but its Edge activation is NOT VERIFIED; ISS-043 remains OPEN.** Do not disable cron 25 or confuse cron invocation with new-generation eligibility.
- **Operations RPC:** live Lovable Cloud query confirmed `get_ops_scanner_diagnostics_v1(integer)` exists, `authenticated` can EXECUTE, `anon` and `service_role` cannot, and function `search_path` is empty. The earlier “Batch 213 migration not applied” statement is **superseded as an assertion about function existence**, but **migration ledger/DDL provenance remains UNVERIFIED**. Do not reapply SQL without ledger reconciliation; authenticated UI/admin-role acceptance remains unverified (ISS-042).
- **Launch gate:** November 29 target remains **AT RISK**, pending repeated RTH/AH scanner acceptance, source-sync acceptance, targeted release activations, 23×5 provider/pipeline prerequisites, and final truthful delayed-feed/SEO/UX verification. Do not present Git parity as runtime parity. Keep AI Trader, broker, billing, and major real-time feed upgrades deferred.


**09:42 ET log/source follow-up:** Lovable's diagnostic read found Edge runtime **version 518**, a **09:35 ET HTTP 409** for `sync-screener-data`, but no matching 09:30 HTTP 546 request record, stage-enter/exit evidence, or explicit `CPU Time exceeded` message in its sampled 14:25–14:40 UTC log window. The **database** `continue_last_error=http_546` on the 09:30 job remains confirmed. Exact runtime failure stage and CPU-vs-other-resource cause remain **UNVERIFIED**; prioritize correlating logs and bounded stage tracing, not speculative infrastructure changes. During this Lovable **plan-mode** log review, Lovable created **two Git commits altering only `.lovable/plan.md`**; the new integration **and editor** tip is `a751f7d5854114fab651f0fbd29214c3da5bff0d`, **86 commits ahead** of main and still **5 behind**. GitHub compare verified no other path changed between the previous and new integration tips. The plan artifact is a Lovable-only overlay, not a backend deployment.

## Current source-sync checkpoint — November 6, 2026 (Batch 211 PR under review)

- **GitHub main:** `88de3533da1a8fad64e0664cb810b322ee424719` (Batch 195.1 PR #222 merged). **Lovable integration:** `cursor/lovable-sync-from-main-20261024` @ `3ec5f7cd193ff49d03782781421fcbae3bd4678e`, verified to contain main; Lovable editor reported same integration commit. Later dated sections remain historical snapshots, not the current Git tip.
- **Batch 211:** source-only forward-sync controller proposed in `.github/workflows/lovable-source-forward-sync.yml` and `scripts/lovable-sync/`. Read-only check is default. Automatic writes to the Lovable integration branch **MUST remain disabled** until owner explicitly approves activation of `STOCKSIST_LOVABLE_SYNC_ACTIVATED=true`; no branch writes are authorized by the PR alone. No Edge, Fly, Vercel, migration or production job deployment is implied. Runbook: `docs/release/batch211-lovable-source-forward-sync-v1.md`.
- **Production acceptance remains open:** ISS-028 (Catalyst frontend/backend rollout), ISS-034 and ISS-024 (RTH/AH scanner), ISS-036 (Radar numerical acceptance), ISS-039 (live binary provenance). Git source sync is NOT a production release attestation.


## Operations Control Center (Batch 212, read-only)

- `/admin/operations` observes; it never repairs, replays, deploys, restarts, or activates. Runbook `docs/release/batch212-operations-control-center-v1.md`.
- Missing evidence is **Unknown**, never green. Overall health is driven by scanner publication, provider freshness and the Fly worker first; source sync and provenance are reported separately.
- Source parity (integration contains main) is not runtime identity. Owner-reported versions (e.g. Edge v516) stay Unknown without a platform digest (**ISS-039**).
- Generation job rows, leases and Edge logs are service-role / Lovable Cloud only, so V1 shows them as Unknown. Exposing them needs a separately approved admin-only read RPC; do not add direct table grants.
- **Batch 213** supplies that RPC: `get_ops_scanner_diagnostics_v1`. It is `SECURITY DEFINER`, uses `search_path=''`, checks `has_role(auth.uid(),'admin')` inside the function, grants EXECUTE to `authenticated` only, and returns a redacted, bounded projection (at most 20 jobs and a ±2-week exception calendar). It never returns ticker universes or payload columns. Migration `20261106200000` is **not applied** until the owner approves it in Lovable Cloud (`docs/release/batch213-secure-scanner-diagnostics-v1.md`).
- Only explicit CPU-limit wording counts as confirmed CPU exhaustion; HTTP 546 is an Edge resource limit; generic 500s and wall-clock timeouts are not CPU evidence.

### Unified equity session control (Batch 215)

- One unified equities scanner. `_shared/markets/equity-session-control.ts` is the schedule contract. The staged `cron` action skips **new** generations when the session is not scan-eligible: weekend, calendar holiday, weekday nights, and the maintenance pause. Cleanup, reconcile, resume, `continue`, and `finalize` always run. Do not disable cron job 25 to save closed-session work.
- 23×5 overnight (Sun–Thu 21:00–04:00 ET, belonging to the next trading day) is built in but **off**. It needs an exchange effective date, provider confirmation, and owner authorization env flags, **plus** an overnight pipeline batch that flips `OVERNIGHT_SCANNER_PIPELINE_READY`. The calendar date alone never activates it. CME futures hours never drive the equities scanner.
- An unreadable exception calendar fails open on weekdays (scan), so a missing calendar can never silence a trading day.

### Admin access (Batch 214)

- `AdminGuard` fails closed and makes the cause visible. No session goes to `/login?next=…`. A signed-in non-admin sees Access Denied with their email and user id. A `has_role` error shows "Could not verify" with retry. Only `has_role` → `true` renders admin pages.
- The `admin` role lives only in `public.user_roles`, and client writes to it are blocked by RLS. No migration grants it. Grant it per user through Lovable Cloud with owner approval, never as a git migration (that would commit user ids). Procedure: `docs/release/batch214-admin-access-states-v1.md`.

## Historical operating baseline — 2026-11-05 (post Batch 190.15 activation)

**GitHub `main`:** `3c810c4bafa36bf547d2235451a7643d9e1f7cbe` (Batch **190.15** PR **#217** merged atop Batch **190.14** / **196.2** continuity). Preserve Lovable-specific generated files and migrations.

**Batch 190.15 (reported production activation):** PR **#217** merged. Lovable Cloud **`sync-screener-data`** Edge deployed **2026-11-04** (dual-read before SQL). SQL source on GitHub: **`supabase/migrations/20261104230000_screener_sync_slim_control_json_v1.sql`**. Lovable Cloud reported apply via **Lovable-native Drizzle** (**ledger idx 68**). **`supabase_migrations.schema_migrations`** has **no** row for `20261104230000` — record only; **do not edit or backfill either ledger** from docs. Reported RPC JSON sizes: full job ~**8.60 MB**; **`control`** **407 bytes**. First natural post-migration generation: **85** rows, six tabs evaluated, **7/7** chunks, publication reported for that run. Coordinated rollback requires a new approved SQL change if Edge is reverted after apply (see `docs/migration-drizzle-supabase-notes.md`).

**Batch 192 (reported production activation):** Vercel frontend + Lovable Cloud **`generate-daily-brief`** Edge deploy recorded for AM Inbox / brief evidence-cutoff scope. **ISS-025** authenticated visual acceptance remains **NOT VERIFIED**.

**Lovable Cloud `sync-screener-data` (historical acceptance):** November 1 deployment/integration source reported as `ccb4055b3f8b84c46fa38529844150c140638705`. November 2 naturally scheduled premarket acceptance reported **PASS** with seven consecutive successful publications (04:00–04:30 ET), no new recorded `http_409` publication failures, and latest publication row counts of 60, 62, and 63. Treat these as acceptance evidence for the covered premarket window only.

**PR #193 D1:** merged `4f7c10db`; deployed fingerprint `23980c312052a4cb5de5be12e3a32b178e1d1fa8104c39f384e02f13845e6f03`. November 2 premarket acceptance for that window is reported PASS.

**ISS-034 P0** remains **OPEN** until Batch **191** regular-session and after-hours acceptance criteria are verified across **repeated** production windows. Do not claim permanent CPU reliability from a single post-**190.15** publication or from premarket-only evidence.

**Nov 4 2026 publication failures (confirmed, preserved):** `sync-screener-data` **v506** finalize **HTTP 546** after 7/7 chunks; stranded **`finalizing`** job / generation **`09346799…`**. **Batch 190.12** SQL and **Batch 190.13** cron `{}` normalization are **already deployed** on Lovable Cloud. Do not reapply either. Never hand-edit the production job row.

Deferred product/platform work is batched **203–209** in the master register (not active implementation). **Batch 210** (Unified Release Control V1) adds **git-only** immutable manifests and read-only verification — see `docs/release/batch210-unified-release-control-v1.md` and **ISS-039**; it does **not** replace Batch **191** acceptance or close **ISS-034**.

### Batch 190.16 production checkpoint (2026-11-06, reported)

Owner-reported Lovable Cloud **`sync-screener-data`** Edge **version 516** and six consecutive successful natural premarket generations (narrow premarket window only). Git-recorded narrative: `docs/release/manifests/batch210.example.190.16.historical.v1.json` → `historical_evidence.production_checkpoint_2026_11_06`. **ISS-034** remains **OPEN** until **Batch 191** regular-session and after-hours acceptance; the Batch 210 verifier keeps **runtime** as **UNKNOWN** without platform-attested digests (**ISS-039**).

### Batch 191.1 — Gappers split-scale evidence (2026-11-06, git)

**Merged:** PR **#221** → `67e3418a` on `main`.

**Confirmed:** Some regular-session runs completed **7/7** staged chunks but skipped publication because Gappers tab evidence degraded to **`prerequisite_unavailable`** (`gap_input_coverage_incomplete`) when the **only** remaining “unresolved” volume-active symbols were **intentionally** ungapped under the existing **`impliesSplitScale`** guard (sub-penny / CA mismatch). That path must not count as missing prior-close inputs.

**Fix:** New counter **`split_scale_suppressed_count`** + helper **`gapSuppressedOnlyBySplitScaleGuard`** — see `docs/release/batch191-1-gappers-split-scale-evidence-v1.md`. **ISS-024** / **ISS-034** remain **OPEN** until Batch **191** session acceptance.

### Session recovery note (unrelated client file)

During a prior session recovery, uncommitted work on `src/lib/screeners/screener-radar-intraday-overlay.ts` was **reverted** to match `main`. That change was **not** tied to Batch 210 / release-control scope in this thread. **Do not restore or modify** that file here without a separate review and task.

## Product

- Public name, domain, and canonical origin: Stocksist, `stocksist.com`, `https://stocksist.com`.
- Repository and several internal ids still say Hedgefun (`hedgefun-insights`, MCP server id `hedgefun-mcp`). Those ids are not the public brand.
- Legacy hostname redirects are declared in `vercel.json`. Do not advertise that host as a canonical origin.
- Lovable preview hosts are not production. `src/integrations/supabase/previewAuthStorage.ts` may list them for preview auth only.

## Screener sync — Edge CPU is a hard constraint

Lovable Cloud runs Supabase Edge Functions; **`sync-screener-data` billed CPU (~2s per invocation) is a hard budget**, not a tuning target. Staged sync (Batch 190) exists because a single monolithic pass at ~13k symbols exceeded that limit before atomic publish (**ISS-034**, HTTP **546**).

**Order of operations:**

1. **Optimize on Edge first** — remove duplicate full-universe scans, reuse chunk accumulators, split finalize stages with enter/exit logs, keep atomic publish + lease/idempotency on Edge (Batch **190.14** and follow-on Edge-only batches).
2. **Prove in production** — stage logs and successful `published` generations; local wall-clock benchmarks are regression hints only, not proof of Edge CPU headroom.
3. **Fly offload only if Edge still cannot reliably finalize** — move **CPU-heavy, pure computation** (selection merge, G/L rank on full snapshot, row/evidence assembly) to **`stocksist-radar-v22-worker`**, which already ships shared `selection.ts` and is not Edge-bound. **Do not migrate Supabase off Lovable**, change Fly machines/scaling, or deploy worker/bridge/Edge changes without an **approved batch**. Edge remains orchestrator: cron/chunks, lease CAS, **`publish_screener_sync_staged_generation_v1`**, and Postgres truth. Worker writes prepared artifacts via existing **`radar-worker-bridge`** pattern (`RADAR_WORKER_SECRET`), not `SUPABASE_SERVICE_ROLE_KEY` on Fly.

Batch 190 explicitly chose Architecture A (Edge staging) over Fly; that choice stands until production proves finalize still exceeds Edge CPU after 190.14-class fixes.

## Platform ownership

**Supabase is managed within Lovable Cloud.** Project id: `zcjptaolpumhtlwhlemq`.

| Surface | Owner | Role |
| --- | --- | --- |
| Application source | **GitHub `main`** | Authoritative code, migrations in git, Edge Function source, tests, PRs |
| Supabase production | **Lovable Cloud** | Managed Postgres, Auth, Edge deploy execution, migration apply, secrets, logs, backend configuration |
| Public web | **Vercel** | `https://stocksist.com` SPA hosting |
| Backend implementation | **Cursor** (in repo) | Write and review `supabase/migrations/`, `supabase/functions/`, shared modules, and tests; merge to `main` |

Route production Supabase operations through **Lovable Cloud first**. Do not instruct the user to create or use a separate Supabase account or obtain a personal **`SUPABASE_ACCESS_TOKEN`** by default. If Lovable lacks a needed management capability, report the exact limitation instead of assuming direct Supabase dashboard or CLI access.

Merging to `main` updates git only. Production Supabase state changes when Lovable Cloud (or an explicitly approved ops path) deploys or applies work from `main`. Never publish the production frontend through Lovable; Vercel deploys from GitHub.

## Source of truth

- GitHub `main` is the authoritative **application** source. Lovable preview hosts are not a second production line.
- **Active Lovable integration branch:** `cursor/lovable-sync-from-main-20261024`. After each `main` merge, **forward-sync** the integration branch from `main` without merging the whole integration branch into `main`. Do not merge `cursor/chat-single-pass-v1`.
- **Archived recovery branch:** `cursor/chat-single-pass-v1`. Source of analyst commits below; large divergence is historical — not current Lovable sync state. Do not merge it.
- `origin/cursor/catalyst-evidence-depth-v2` (`c3bb034a`) is a narrower parallel of the same analyst work. Recovery used archived-branch versions.

## GitHub ↔ Lovable Source Synchronization

- **Authoritative source:** GitHub `main` is the authoritative application history. Lovable does not replace `main`; the integration branch carries Lovable-native overlays on top of forwarded `main` commits.
- **Integration branch:** `cursor/lovable-sync-from-main-20261024`. Preserve Lovable-only paths there; never merge that branch wholesale into `main` as a substitute for review.
- **Batch 211 controller:** `.github/workflows/lovable-source-forward-sync.yml` plus `scripts/lovable-sync/forward-sync.mjs`. Default runs are **read-only** (`check`). **Apply** (push to integration) requires repository variable `STOCKSIST_LOVABLE_SYNC_ACTIVATED=true` and owner-approved configuration; PR runs never apply.
- **Trigger and conflict protection:** When activated, pushes to `main` can run check then apply. The controller fetches fresh tips, validates overlay allowlists and ancestry, merges only in a disposable worktree, and **never** force-pushes, rebases, or resets protected refs. **CONFLICT** or **UNKNOWN** ends the run without overwriting the integration branch. Bounded retries handle normal concurrent push rejection only.
- **Separation from deploy:** Source sync does **not** deploy Vercel, Fly, Lovable Edge Functions, or apply SQL. Those stay separate owner-approved batches and Lovable Cloud operations.
- **Recovery, disable, rollback:** Remove or set `STOCKSIST_LOVABLE_SYNC_ACTIVATED` to non-`true` to keep all runs check-only. On conflicts or bad merges, fix on a reviewed branch and fast-forward only after human verification — see `docs/release/batch211-lovable-source-forward-sync-v1.md`. Do not “recover” with `--force` on integration or `main`.
- **Lovable editor SHA:** Remote Git integration tip **≠** guaranteed Lovable editor loaded commit. Independently verify the Lovable project’s reported active SHA or supported Git re-check after a sync.

**Monitoring (ongoing):**

- Compare **`origin/main`** and **remote integration** tip SHAs; record last **SYNCED** / successful apply from workflow artifacts.
- Capture **Lovable editor / project active SHA** when the product exposes it; treat absence as unknown for editor parity.
- Track **last successful synchronization** (artifact timestamp + integration `integration_sha_after` from `status.json`).
- **Failed runs** (FAILED job, or `status` not SYNCED on apply): alert owners; **CONFLICT** / **UNKNOWN** require human triage — no silent ignore.
- **Escalation:** CONFLICT or UNKNOWN means automatic forward-merge stopped; do not bypass with force-push or unapproved shortcuts.
- **No silent failures** and **no automatic force-push recovery** — ever.

**Issue tracking:** **ISS-040** stays **OPEN** until real **GitHub `main` → Lovable integration** automatic synchronization is **verified** in production (not merely merged). Latest human-verified numbers belong in `docs/DEPLOYMENT_STATUS.md`; **per-run** evidence stays in **GitHub Actions artifacts**, not a new doc commit on every sync.

## Master roadmap (2026-10-28)

- **Active register:** `docs/release/STOCKSIST_MASTER_PENDING_BACKLOG_2026-10-28.md` (batches **190–209**).
- **Current continuity state:** Batches **190.9–190.15** are merged on `main`; Batch **190.15** Edge + migration activation is reported complete. November 2 premarket acceptance is recorded. Batch **191** remains **PARTIAL** until regular-session and after-hours evidence is verified (**ISS-034 OPEN**).
- **Historical batches 171–189:** complete in git; open work is **acceptance/ops** under **191–198**, not reimplementation.
- **Batch 174 / 175:** unfinished **verification** (batches **191–192**). PR **#174** closed without merge.

## Recovered analyst catalyst evidence

Ported from `cursor/chat-single-pass-v1` onto current `main` by cherry-pick, then tightened so a wrong ticker, a stale event, or a missing source cannot become a confirmed catalyst.

| Source commit | Subject |
| --- | --- |
| `68c88114` | feat(ai-analyst): catalyst evidence depth v2 for CURRENT_CATALYST |
| `2f22387b` | fix(chat): prioritize catalyst evidence in bounded analyst intelligence delivery |
| `ed75aa71` | fix(ai-analyst): improve catalyst source recovery and financial fact extraction |

Decisions kept with the port:

- Client modules in `src/lib/ai-analyst/` and the Deno copies in `supabase/functions/_shared/ai-analyst/` stay separate. Change both when the evidence rules change.
- `supabase/functions/chat/analyst-intelligence-delivery.ts` bounds the chat packet at 4500 characters. Priority facts need a source URL and a statement. Lower-priority rows shrink first. If even the minimal packet exceeds the budget, chat omits the intelligence block.
- An official or ticker-specific web hit must name the asked symbol or its known company in the title, snippet, or a non-SEC host. A `sec.gov` URL counts only when the title or snippet names that symbol or company.
- Events older than 45 days versus the date named in the question, or the radar trading date when the question names none, are historical context. They are not the current primary.
- Known company names used for that match are Marvell, NVIDIA, Apple, Tesla, and AMD, plus host and title text.
- Scanner ranking, database schema, the MCP bundle, and SEC ingestion were not changed.

Remaining limits:

- This change does not deploy `chat`. Production chat keeps the previously deployed function until an approved Edge deploy (**ISS-015**, master batch **204**).
- Dollar figures are extracted only from explicit text near a fiscal-year token. Headline-only evidence is not verified guidance.
- The prompt tells the model the packet is not a live quote or a real-time feed.

Do not restore that branch's copy of `supabase/functions/mcp/index.ts`. PR #162 on `main` is the canonical generated bundle.

## Data and deploy ownership

- Production schema history is `supabase/migrations/`. **Apply** migrations through Lovable Cloud (managed Supabase), not by ad hoc Cursor CLI against production. `drizzle/migrations/` is a mirror, not a second production log. See `docs/migration-drizzle-supabase-notes.md`.
- Vercel production follows GitHub `main` via the normal Vercel Git integration. Fly workers, SEC cron, and non-Supabase infra move only in an approved ops step.
- Edge Function **source** lives in git; **production deploy** of those functions is a Lovable Cloud responsibility unless a batch explicitly assigns another approved executor.
- Never delete or rewrite an applied Supabase migration. Add a corrective migration.
- Generated MCP output stays generator-owned (`scripts/mcp-edge-validate.mjs`). Do not hand-edit `supabase/functions/mcp/index.ts` except via the emitter on the Lovable integration branch workflow.

## Deferred until a later approved batch

Product and platform items below remain deferred; master batches **203–209** own sequencing detail.

- Real-time feed upgrades (**ISS-008**, batch **205**)
- AI Trader product work (`AI_TRADER_CURRENT_OPERATING_MODE` is `OFF`; batch **208**)
- Broker integration (**ISS-010**, batch **207**)
- Billing go-live (**ISS-011**, batch **206**)
- Further SEC schedule, write-gate, or function changes. **Gate I.3 activation already happened** (see `docs/DEPLOYMENT_STATUS.md`). `docs/sec-edgar/unapplied-cron.sql` is a leftover draft, not the live schedule. **Do not rerun** Gate I.3 activation or rewrite applied migration history.
- Catalyst source enablement / distribution activation (**ISS-006**, batch **203** — `docs/catalyst-intelligence/batch34-catalyst-activation-sequence.md`)
- AI Analyst / `chat` Edge regression cleanup (**ISS-007**, **ISS-015**, batch **204**)

## Catalyst attribution (client, Batch 181, Batch 195.1)

Persisted `attribution_class` on stored rows is not trusted over live headline evidence for generic news providers. SEC / earnings calendar / company IR rows keep authoritative persisted classes. A related headline stays on `related_symbols` and in the attribution result, and must not be labeled as the row symbol's own earnings or press release. Editorial news (Motley Fool, Zacks, and the other editorial publishers) is News. Press Release is only a direct issuer wire or company IR item. The Polygon source badge follows that same rule. For non-authoritative providers, unknown issuer attribution does not default to Press Release from the wire name alone. A related or unverified association is not labeled as that symbol's earnings or press release; `CatalystDetailPanel` does not show EPS or surprise Market Facts for those rows. Cross-surface copy uses `catalyst-attribution-presentation.ts` and `presentation.ts`; do not imply price causation without evidence. Do not rewrite production `catalyst_events` rows from this rule — hydration applies it on read.

## Five Pillars presentation (client, Batch 182)

Qualification UI must not invent RVOL, baselines, or timestamps. Use `buildFivePillarsTransparencyView()` and canonical `RadarRankedRow` scanner fields; grace and expired lifecycle come from `day_trade_qualification_state`. A historical pass must not read as a current pass in lifecycle copy.

## How to avoid another full audit

Each session reads this file, `docs/SESSION_HANDOFF.md`, and `docs/ISSUE_REGISTER.md`. Update those when a decision, defect, or deploy fact changes. `npm run integrity` covers navigation, sitemap/canonical agreement, brand hosts, MCP artifact agreement, and `origin/main` divergence. It does not replace an ops query of Vercel, Supabase, or Fly.

## Screener session volume (P0 D1) and CPU publication

- Edge qualification uses `sessionQualificationVolume()` in `supabase/functions/_shared/screeners/session-volume.ts`.
- Premarket: positive `min.av` only. Regular: positive `day.v`. After-hours: incremental vs same-snapshot `day.v` baseline when verifiable.
- Do not treat Polygon `day.v=0` as verified zero liquidity during extended sync.
- **PR #194:** per-sync bound session-volume cache and reduced redundant full-universe passes — **deployed**; **ISS-034** publication still blocked (see baseline above).

## Scanner volume contract (movers)

- Polygon snapshot `day.v=0` means **volume unavailable**, not verified zero session liquidity (`polygonSnapshotVolume` in `src/lib/markets/movers-integrity.ts`).
- Verified zero from cache/RPC still ranks **before** unknown volume in volume-first lists.
- Live regular-session acceptance is documented in `docs/release/scanner-live-market-acceptance-v1.md`; do not claim RTH acceptance from weekend or replay-only checks.
- Public `/markets/premarket` may use the same provider snapshot as gainers and losers, but a row with a timestamp is premarket only when that timestamp is inside 4:00–9:30 a.m. ET. Afternoon regular-session prints stay on the regular tabs. Extended volume comes from minute accumulation; missing volume stays blank. The public mover table does not invent RVOL or catalyst.

## Penny Continuation (Batch 222–224)

- **`penny_continuation_v1`** (Batch 223, PR **#240** merged on `main`) is the evaluator; **Batch 224** adds bounded integration only (`evaluateBoundedPennyContinuationV1`) — **not** invoked by live `sync-screener-data`, Fly, Radar publish, or Five Pillars.
- CS1 requires caller-supplied completed `velocityWindows`; Radar participation/tiers alone must not synthesize windows.
- `sharesPerMinute10m` requires `verifiedSharesPerMinute10m` on the candidate — Radar `volume_velocity_5m` is diagnostic-only.
- Combined Polygon+Radar rows require aligned symbols, session kind, and observation clocks; context `observationSessionKind` cannot mask overnight/cross-session truth.
- Batch **225** projects integration output to `penny_continuation_workflow_handoff_v1` and provides a **client-only** AM Inbox badge matcher — not wired to RPC, hooks, or render paths.
- Handoff projection and badge matching **fail closed** on stale evidence, session mismatch, or badge/handoff symbol-date drift; Penny workflow navigation never reads cached `securityId` when the AM Inbox row has none.
- Symbol observation clocks come from Polygon `updated` or Radar `provider_as_of`, never generation sync time.
- Production surfacing (Radar emphasis, Inbox persistence, env flags) remains a **separate activation batch**.

## Scanner tab evaluation evidence (Batch 185)

- Authenticated Screeners tabs require persisted **`tab_evaluation_evidence`** on `screener_feed_state`. When null, client may attach **`publication_confirmed`** evidence (published row counts only) — not a substitute for provider universe evaluation or verified zero-match claims.
- Do not treat homepage **Market Pulse / Polygon snapshot movers** as Radar or Five Pillars qualification.
- Extended-session **Gappers** may restore from verified Radar prior-close overlay via `restoreExtendedSessionGappers` when sync evidence is missing or `prerequisite_unavailable`; do not fabricate opening prints or gap percentages.
- **Lovable Oct 27 read-only:** screener feed **115 rows**, six tabs evaluated, **5-arg RPC** + evidence **PASS**; AM handoff list **3,131** rows for `2026-10-27` **PASS**. Migration ledger / Edge revision id **UNKNOWN** (not failed). No screener migration or Edge redeploy required from those checks alone.
- **AM Inbox continuation:** `resolveAmInboxSessionDate` decouples handoff RPC from workspace `et_date`; server builds disable sessionStorage mirror (Batch 184).

## Lovable preview Edge type parity

- `get-pre-market-workspace`: catalyst row `facts` typed as `Record<string, unknown> | null` (Lovable preview typecheck).
- `radar-historical-context`: `resolveSecurityId` accepts `ReturnType<typeof createClient<any>>`. Type-only; keep in sync with integration branch on forward-sync.

## Homepage market presentation (Batch 189)

- Public homepage does **not** promote AI Trader; the feature route remains for deferred product work.
- `HOME_MARKET_CLOCK_EXCHANGES` is a fixed seven-city order (New York first); local-time card is **last**; mobile shows a horizontal scroll hint.
- Market Pulse session line uses `composeMoversSessionLine()` with a 1s wall-clock tick (not movers `fetchedAtMs`). Provider observation timestamps stay on fetch time. Stock detail headers keep `formatStockHeaderSessionLine()`.

## Evidence labels

Use these words in handoffs and the issue register:

- **Confirmed** — checked against `main` or a command run in that session
- **Reported** — stated in an older runbook or checklist and not rechecked
- **Deferred** — intentionally out of scope

## Historical continuity snapshots (superseded baselines)

Older top-of-file baselines and master-reset paragraphs referenced SHAs such as `03449198`, `d86e0c69`, `a03407c2`, and pre–Oct 28 handoff states. **Do not use those for current production decisions.** Detailed triage history: `docs/release/master-reset-2026-10-27.md`. Batch **171–189** completion map: `docs/CHANGELOG.md` and `docs/release/next-approved-batches.md`.
