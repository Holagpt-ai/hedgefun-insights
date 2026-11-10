# Issue register

Keep this list short. Move fixed items to `docs/CHANGELOG.md`. Labels: **confirmed**, **reported**, **deferred**.

**Post-Batch 191 ledger attestation (Nov 10 ~1:30 PM ET, PR #233):** Owner-verified job ledger (Lovable read-only): Nov **6/9/10** PM/RTH/AH publication counts in runbook; Nov **10** RTH **43** pubs (**7/7** + publish RPC), **4** aborts; feed **107** rows, six tabs **`evaluated`**, Gappers **0** unresolved, NHL **available**. **Nov 10 AH not accepted.** **ISS-034** / **ISS-024** **OPEN** — historical per-tab evaluation + authenticated UI not verified (`docs/release/batch191-scanner-acceptance-v1.md`).

**Post-Batch 217 merge, Nov 9 (historical):** PR #230 merged at `main=79260fbb`; Vercel check passed. Preview-auth #231 later merged to `main`. **ISS-040 OPEN**; **ISS-025** authenticated UI **NOT VERIFIED**.

**November 9 evening status supersedes the afternoon narrative below:** GitHub `main=17a31da8` (Batch 216 merged). GitHub → Lovable guarded apply **succeeded** (Actions `42676903219`), integration/editor included main; owner set `STOCKSIST_LOVABLE_SYNC_ACTIVATED=true` for automatic forward-sync. **ISS-040 OPEN only for unattended post-merge acceptance**, not source parity or activation; Edge deployment remains separate. Owner-reported Batches **215/216 Edge deploy completed**. **ISS-034** root cause still **NOT YET VERIFIED** (marker correlation open). **ISS-043** awaits closed-session observation after Edge deploy. **ISS-025:** Nov 9 RPC 3,776 rows / 1,525 symbols; Batch 217 readiness in PR; authenticated UI **NOT VERIFIED**.

**November 9 afternoon status (historical):** GitHub `main=ff81065b`. One-time GitHub → Lovable sync succeeded (integration/editor `fee9ab51`); activation variable returned to **false**. Permanent automatic sync is **not** active (**ISS-040 OPEN**). 09:30 ET 7/7 finalize recorded `http_546` and aborted without publication; Edge v518 logs did not name the stage. Recovered at 11:50 ET with 113 rows across six tabs; 10:55–11:50 ET jobs all published (**ISS-034 OPEN**). Batch 216 records the stage boundary only; root cause **NOT YET VERIFIED**.

**November 9 morning status (historical):** GitHub `main=c7cf47ee`; Lovable integration/editor `a751f7d5`; Batch 211 apply SKIPPED, **ISS-040 OPEN**. Batch 215 PR #227 merged but closed-session Edge activation not verified (**ISS-043 OPEN**). Today 09:30 ET 7/7 finalization recorded `http_546` without publish; 09:05 ET job aborted after a delayed finalize, 09:20/09:25 recovered with 94-row publishes (**ISS-034 P0 OPEN**). Friday Nov 6 RTH 47 published / 26 aborted; AH 48 published. Nov 7 and Nov 8 each 288 weekend aborts. Batch 213 diagnostic RPC exists in production with expected EXECUTE ACL and empty search_path; actual migration ledger remains unverified (**do not blindly reapply**). Admin authenticated UI/role remains unverified. All PRs #220–#227 are merged in GitHub; source merge does not establish Edge deployment.


**Historical baseline (Nov 6):** `origin/main` **`67e3418a`** (2026-11-06, Batch **191.1** PR **#221**; prior baseline **`3c810c4b`**). Batch **190.15** merged (PR **#217**); reported Edge **2026-11-04** + SQL **`supabase/migrations/20261104230000…`** via Lovable Drizzle **ledger idx 68** (`schema_migrations` **no** matching row — record only). **Nov 6 2026 (reported):** Batch **190.16** owner checkpoint — **`sync-screener-data`** Edge **v516**, six consecutive natural premarket generations (narrow window); recorded under Batch **210** example manifest `historical_evidence.production_checkpoint_2026_11_06` — **does not close ISS-034**. Batch **195** merged (PR **#212** → **`5d6399de`**); **ISS-037** merged (PR **#215** → **`3bd3ee68`**) — production verification **NOT VERIFIED** for either. Batch **196.2** (**#211**); **196.1** Fly v46 (**#209**/**#210**). Batch **192** (**#208**); Batch **191** docs (**#207**). Nov 2 premarket PASS (60/62/63). Master backlog: `docs/release/STOCKSIST_MASTER_PENDING_BACKLOG_2026-10-28.md`.

Original ten Lovable scanner warnings: `docs/release/lovable-scanner-reliability-warnings.md` — disposition in master backlog §4; do not reassign all ten wholesale.

**09:42 ET log/source follow-up:** Lovable's diagnostic read found Edge runtime **version 518**, a **09:35 ET HTTP 409** for `sync-screener-data`, but no matching 09:30 HTTP 546 request record, stage-enter/exit evidence, or explicit `CPU Time exceeded` message in its sampled 14:25–14:40 UTC log window. The **database** `continue_last_error=http_546` on the 09:30 job remains confirmed. Exact runtime failure stage and CPU-vs-other-resource cause remain **UNVERIFIED**; prioritize correlating logs and bounded stage tracing, not speculative infrastructure changes. During this Lovable **plan-mode** log review, Lovable created **two Git commits altering only `.lovable/plan.md`**; the new integration **and editor** tip is `a751f7d5854114fab651f0fbd29214c3da5bff0d`, **86 commits ahead** of main and still **5 behind**. GitHub compare verified no other path changed between the previous and new integration tips. The plan artifact is a Lovable-only overlay, not a backend deployment.

## Current active triage

| ID | Priority | Open item | Status / next action |
| --- | --- | --- | --- |
| **ISS-034** | **P0** | Scanner repeated-session acceptance / finalize resource limits | **CONFIRMED OPEN.** Batch **191** ledger **partial** — PM/AH Nov 6/9 **verified**; Nov **10** RTH-to-1:30 **7/7** pubs verified; **Nov 10 AH not accepted**; Nov **9 `http_546`**; RTH retention on Nov **6/10**. Runbooks: `docs/release/batch191-scanner-acceptance-v1.md`, `docs/release/batch218-iss034-root-cause-closure-gate-v1.md`. |
| ISS-033 | P0 | Premarket `day.v=0` vs `min.av` | **Fixed in git + Edge D1 deployed** (`23980c31…`). November 2 premarket acceptance window reported **PASS**. Keep broader Batch 191 matrix open until regular and after-hours checks are verified. |
| ISS-024 | P0 | Tab evidence / Gappers inputs | **Current feed** (Nov 10 ~1:30 PM): all tabs **`evaluated`**, Gappers **0** unresolved, NHL **available**. **Per-generation tab evidence history** and authenticated UI **NOT VERIFIED** (distinct from publication ledger). **OPEN** until Batch **191** Layer C/D complete. |
| **ISS-025** | **P0** | AM Inbox continuation loading | **OPEN for authenticated UI.** Backend RPC Nov 9: 3,776 rows / 1,525 symbols / ~4.1 MB. Batch **192** metadata deployed. Batch **217** adds Nov 9 scale fixtures/tests and symbol-aware Screeners handoffs (client map+build ~424 ms). Authenticated visual acceptance **NOT VERIFIED**. |
| ISS-036 | P1 | Extreme / unreliable volume acceleration display | Batch **196.1** merged (`797cc615`) and Fly **v46** deployed 2026-11-04. Worker `/health` **running**, Polygon subscribed. Live acceleration-value acceptance **NOT VERIFIED** (no sampled rows this window). |
| ISS-032 | P2 | Journal terminal-error loading | Fixed on `main` (Batch **188**) → **Batch 193** acceptance. |
| ISS-026 | P1 | Earnings ranking / Edge | Batch **187** merged; Edge activation **UNVERIFIED** → **Batch 194**. |
| ISS-027 | P1 | Risk / AI Brief mobile layout | Fixed on `main` (Batch **188**) → **Batch 193**. |
| ISS-028 | P1 | TSLA/SpaceX direct catalyst in UI | Batch **195** merged (**#212** → **`5d6399de`**): Radar recent-news SpaceX-primary slip **fixed in git**. **Batch 195.1 (PR #222, `dad9afac` + trust-safety `4f699897`, not merged):** confirmed code defect — shared identity tokens and later mentions were labeled as the row symbol's own earnings, and `company_news` rendered **Press Release** (uppercase **PRESS RELEASE**), including Motley Fool SpaceX copy on GOOGM, GOOGN, and SPCX. The Polygon source badge now follows the same wire-versus-editorial rule as the category label. Read-path frontend correction only; Edge activation is not deployed. Authenticated production **NOT VERIFIED** — **cannot close**. |
| ISS-029 | P2 | Homepage AI Trader / countdown | **Fixed** (Batch **189**). |
| ISS-030 | P2 | Carryover mobile cards | Fixed on `main` (Batch **188**) → **Batch 193**. |
| ISS-031 | P1 | Homepage movers vs Radar tabs | Explained — different universes. **Nov 5 reported:** homepage pricing copy read as **real-time** while delayed-feed disclosures apply elsewhere — see **ISS-038**. |
| **ISS-038** | P2 | Homepage delayed-data copy vs real-time wording | **REPORTED (Nov 5 screenshots).** Marketing/session copy on the homepage appears to conflict with the product’s **delayed** market-feed disclosure. No backend cause asserted; copy/UX acceptance under **Batch 189** follow-up or **Batch 202** launch matrix. |
| **ISS-039** | P2 | Cross-platform release provenance vs live deployment identity | **CONFIRMED OPEN.** Git **Batch 210** adds immutable release manifests and read-only verification; **MATCH** on git ancestry and source closure hashes does **not** prove Edge/Vercel/Fly runtime binaries without platform-attested digests. Populate append-only attestations under `docs/release/manifests/attestations/`; authenticated platform API batches stay deferred. |
| **ISS-040** | P2 | GitHub main → Lovable integration automated source sync | **OPEN for unattended monitoring acceptance only.** GitHub Actions guarded apply run `42676903219` succeeded; integration/editor include current main. Owner enabled repository variable `STOCKSIST_LOVABLE_SYNC_ACTIVATED=true` for automatic forward-sync. Verify a subsequent normal main push triggers a safe real apply, handles conflicts fail-closed, and leaves source + editor in parity; never interpret source sync as Edge/DB deploy. |
| **ISS-043** | P1 | Scanner cron starts closed-session generations | **OPEN for closed-session observation.** Batch 215 PR #227 merged; owner-reported Edge deploy **completed** (with Batch 216). Prior weekends recorded 288 aborted jobs/day. Needs post-deploy closed-session skip evidence; never disable cron 25. |
| **ISS-042** | P1 | Admin access gate, role verification and diagnostic dashboard | Batch 214 PR #226 **MERGED**. Authenticated owner role/UI **NOT VERIFIED**. Batch 213 RPC is present in production with expected EXECUTE ACL and empty search_path, but migration ledger provenance **NOT VERIFIED**; do not reapply blindly. Verify admin and non-admin behavior; no unsolicited role grants. |
| **ISS-044** | P0 | Radar V2 publication stalled; Operations worker **Healthy** masks stale V2 | **CONFIRMED symptom (Nov 10).** `v2_synced_at` / `session_kind` stuck on Nov 9 AH while checkpoints stay fresh. **Code fixes in Batch 219 PR #234** (failure telemetry, Ops V2 cadence). **Read-only Fly (Nov 10):** V2 **enabled**; `publish_candidates_v2` failing with **HTTP 502 / `rpc_error_code: 23505`** — production stall mechanism **not proven** as `stale_generation`. Worker image **v46** predates PR. **OPEN** until deploy + acceptance. Runbook `docs/release/batch219-radar-v2-recovery-v1.md`. |
| **ISS-041** | P2 | Client `resolveMarketSessionAt(ms)` without a schedule treats weekends as open | **CONFIRMED in code (Nov 6, Batch 212 test):** `scheduleOrFallback` → `fallbackOpenSchedule` returns `marketStatus: "open"` for Saturday/Sunday, so `resolveMarketSessionAt(Sat noon ET)` = `"market"`. Callers without a schedule include `resolveConsumerSessionKind` (`src/lib/screeners/screener-session.ts`) and `movers-observation.ts`. **User-visible impact NOT VERIFIED.** Batch 212 avoids it by resolving via `resolveSessionSchedule(date, null)`. Fix needs a separate reviewed batch (scanner-facing). |
| **ISS-037** | P2 | Screener free-float missing or unreliable | **Fix merged** (PR **#215** → **`3bd3ee68`**): frontend `useRadarFloatForSymbols` on scanner/radar visible rows; Massive `effective_date` / `as_of` mapping; publication path does not call Polygon float. **Production verification NOT VERIFIED** — do not assume Vercel or `market-data` Edge deploy without attestation. |

**Verification (not new implementation):** Batch **174** **CONDITIONAL**; Batch **175** persistence **PASS**, UI **NOT VERIFIED**; PR **#174** **CLOSED** unmerged.

## Confirmed

| ID | Item | Evidence |
| --- | --- | --- |
| ISS-002 | Navigation routes | `npm run integrity` (2026-10-24). |
| ISS-003 (Fly) | Radar worker v45 parity | Read-only 2026-10-24 **PASS**. |
| ISS-020 | `day.v=0` missing volume | Fixed #169. |
| ISS-021 | Premarket session labels | Batch **178**. |
| ISS-016–019 | npm / bundle / browserslist | Partially mitigated; remainder **Batch 202** / **198**. |
| ISS-015 | Production `chat` not on recovered delivery | **Blocked** — batch **204**. |
| ISS-022 | Catalyst headline issuer mismatch | Batch **181**. |
| ISS-023 | Mobile navigation freeze | Fixed git Batch **184**; mobile re-check **Batch 193**. |

## Reported

| ID | Item | Notes |
| --- | --- | --- |
| ISS-003 (Vercel/Edge) | Manifest / revision ids | Partial screener fingerprints recorded Oct 28; full matrix unknown. |
| ISS-005 | Batch 34 status | Not refreshed. |
| ISS-006 | Catalyst distribution | Deferred — **Batch 203**. |
| ISS-007 | AI Analyst streaming | Deferred — **Batch 204**. |
| ISS-037 | Screener free-float reliability | See active triage; **NOT VERIFIED** — investigation deferred post–Batch **196.2**. |
| — | Day Trade Radar qualification counts (Nov 5) | **Reported:** displayed qualification counts require database reconciliation; no inconsistency confirmed — **Batch 196** acceptance. |
| — | Watchlist Analysis pending (Nov 5) | **Reported:** **17** symbols rendered with many **Analysis pending** states — log correlation deferred (**ISS-007** / batch **204** unless reproduced with backend evidence). |

## Deferred (product / platform)

| ID | Item | Master batch |
| --- | --- | --- |
| ISS-008 | Real-time feed | **205** |
| ISS-009 | AI Trader | **208 — POST-LAUNCH PAUSED** |
| ISS-010 | Broker | **207** |
| ISS-011 | Billing | **206** |
| ISS-012 | SEC schedule edits | No new batch unless new evidence |
| ISS-013 | Community | **209** |
| ISS-014 | Sitemap | **202** conditional |
| ISS-018 | Middleware deprecation | **198** / **202** |

## Historically verified

| ID | Item | Boundary |
| --- | --- | --- |
| ISS-004 | Gate I.3 SEC activation | Historical PR #163. |

## Not a defect

- MCP id `hedgefun-mcp` / generated bundle.
- Lovable integration branch role and protected files.
