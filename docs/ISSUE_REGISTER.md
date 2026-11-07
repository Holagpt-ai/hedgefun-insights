# Issue register

Keep this list short. Move fixed items to `docs/CHANGELOG.md`. Labels: **confirmed**, **reported**, **deferred**.

**Baseline:** `origin/main` **`67e3418a`** (2026-11-06, Batch **191.1** PR **#221**; prior baseline **`3c810c4b`**). Batch **190.15** merged (PR **#217**); reported Edge **2026-11-04** + SQL **`supabase/migrations/20261104230000…`** via Lovable Drizzle **ledger idx 68** (`schema_migrations` **no** matching row — record only). **Nov 6 2026 (reported):** Batch **190.16** owner checkpoint — **`sync-screener-data`** Edge **v516**, six consecutive natural premarket generations (narrow window); recorded under Batch **210** example manifest `historical_evidence.production_checkpoint_2026_11_06` — **does not close ISS-034**. Batch **195** merged (PR **#212** → **`5d6399de`**); **ISS-037** merged (PR **#215** → **`3bd3ee68`**) — production verification **NOT VERIFIED** for either. Batch **196.2** (**#211**); **196.1** Fly v46 (**#209**/**#210**). Batch **192** (**#208**); Batch **191** docs (**#207**). Nov 2 premarket PASS (60/62/63). Master backlog: `docs/release/STOCKSIST_MASTER_PENDING_BACKLOG_2026-10-28.md`.

Original ten Lovable scanner warnings: `docs/release/lovable-scanner-reliability-warnings.md` — disposition in master backlog §4; do not reassign all ten wholesale.

## Current active triage

| ID | Priority | Open item | Status / next action |
| --- | --- | --- | --- |
| **ISS-034** | **P0** | Scanner acceptance not complete across all market sessions | **CONFIRMED OPEN.** **Batch 190.15** merged (**#217**) and **reported activated** (Edge **2026-11-04**; Git SQL **`supabase/migrations/20261104230000…`**; Lovable Drizzle **idx 68**; **`schema_migrations`** row **absent**). First natural post-migration generation reported **PASS** (85 rows, six tabs, 7/7 chunks) — **does not close ISS-034**. Nov **4** **HTTP 546** / stranded **`finalizing`** **`09346799…`** preserved. Pending **Batch 191** RTH/AH acceptance. **190.12** / **190.13** already deployed — do not reapply. |
| ISS-033 | P0 | Premarket `day.v=0` vs `min.av` | **Fixed in git + Edge D1 deployed** (`23980c31…`). November 2 premarket acceptance window reported **PASS**. Keep broader Batch 191 matrix open until regular and after-hours checks are verified. |
| ISS-024 | P0 | Tab evidence / Gappers inputs | Batch **185** merged. Premarket publication evidence reported PASS on Nov 2; regular-session and after-hours tab-evidence acceptance remains **NOT VERIFIED** under **Batch 191**. **Nov 6 (git Batch 191.1):** confirmed production defect where **split-scale-suppressed** gap inputs (e.g. SLND.WS / NMZr / CINGW class) were mis-counted as **unresolved**, inflating **`gap_input_coverage_incomplete`** and blocking publish via **`prior_generation_retained`** — fixed in evidence accounting; **ISS-024 stays OPEN** until RTH/AH acceptance. **Nov 5 reported:** Gappers and New Highs/Lows UI looked **stale** while other screener tabs showed **delayed refreshing** data — backend cause **not verified** from screenshots alone. |
| ISS-025 | P0 | AM Inbox continuation loading | Batch **192** merged (**#208**); Vercel + `generate-daily-brief` deploy **reported complete**; authenticated visual acceptance **NOT VERIFIED**. |
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
| **ISS-040** | P2 | GitHub `main` → Lovable integration automatic source-sync verification | **CONFIRMED OPEN.** Batch **211** (PR **#223**) supplies the gated controller and tests; **closes only** after **verified** end-to-end **automatic** forward sync post-owner activation (observed SYNCED apply to integration, failure alerting understood, **Lovable editor/project SHA checked independently**). Per-run evidence stays in **GitHub Actions artifacts**; `docs/DEPLOYMENT_STATUS.md` holds **latest verified** baseline only. **No silent failures**; **no force-push recovery.** Does not assert Vercel/Fly/Edge/SQL. |
| **ISS-042** | P1 | Admin gate redirected every failure to the homepage | **CONFIRMED in code (Nov 7, Batch 214).** `AdminGuard` sent a missing session, a missing `admin` role, and a `has_role` RPC error all to `/`, so the owner could not tell why `/admin/operations` was blocked. Production bundle verified to include the route, so this is not a deploy mismatch. **Fix in git (Batch 214 PR):** login with `next`, an Access Denied page showing the account, and a verify-failed state with retry, all fail closed. **Owner `admin` role: NOT VERIFIED.** No migration grants it; check and grant through Lovable Cloud per `docs/release/batch214-admin-access-states-v1.md`. |
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
