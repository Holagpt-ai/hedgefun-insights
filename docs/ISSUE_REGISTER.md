# Issue register

Keep this list short. Move an item to `docs/CHANGELOG.md` when it is fixed. Labels: **confirmed** (checked this session against `main` or a command), **reported** (owner or older doc, not rechecked in Cursor), **deferred** (intentionally not in progress).

**Baseline:** `origin/main` **`1398d16a`** (2026-10-28). Master backlog: `docs/release/STOCKSIST_MASTER_PENDING_BACKLOG_2026-10-28.md`. Historical batches **171–189** in `docs/CHANGELOG.md`.

Original ten Lovable scanner warnings: `docs/release/lovable-scanner-reliability-warnings.md`. npm/deploy: ISS-015–019.

## Current active triage — immediate priority

| ID | Priority | Open item | Status / next action |
| --- | --- | --- | --- |
| **ISS-034** | **P0** | Full-universe sync CPU timeout blocks publication (~13k symbols) | **Open.** PR **#194** merged + **deployed Lovable 17:29:52 UTC Oct 28**; **17:30 / 17:35 UTC** still **CPU Time exceeded**. Last publish **16:15:04 UTC** (108 rows). **Batch 190** authorized — architectural split may be required. Runbook: `p0-screener-cpu-publication-v1.md`. |
| ISS-033 | P0 | Premarket screener rejects all symbols (`day.v=0`, positive `min.av`) | **Fixed + deployed** (#193 → `4f7c10db`, fingerprint `23980c31…`). **Premarket live acceptance pending** — not full production sign-off. |
| ISS-024 | P0 | Missing scanner gap input and tab-evaluation evidence | **Batch 185 merged** — publication blocked pre-D1 by volume semantics; D1 deployed; CPU publish path still blocked (**ISS-034**). |
| ISS-025 | P0 | AM Inbox continuation loading / display vs large RPC payloads | **Batch 186 merged** — RPC **3,131 rows PASS** (Oct 27); authenticated UI **NOT VERIFIED** → Batch **192** acceptance. |
| ISS-032 | P2 | JournalWorkspace terminal-error loading state | **Fixed on `main`** (Batch **188**) — Batch **193** mobile acceptance **pending**. |
| ISS-026 | P1 | Earnings significance not reflected in surfaced order | **Batch 187 merged** — Batch **194** Edge activation **pending**. |
| ISS-027 | P1 | Risk flags blank height / brief preview text clipping | **Fixed on `main`** (Batch **188**) — Batch **193** re-check **pending**. |
| ISS-028 | P1 | TSLA SpaceX news shown as direct catalyst in deployed UI | Batch **181** tests in git; prod UI **NOT RE-VERIFIED** → Batch **195**. |
| ISS-029 | P2 | Homepage AI Trader banner; session countdown | **Fixed on `main`** (Batch **189** → `68092518`). |
| ISS-030 | P2 | Mobile Carryover Watch repetitive oversized cards | **Fixed on `main`** (Batch **188**) — Batch **193** re-check **pending**. |
| ISS-031 | P1 | Homepage movers populated while authenticated Radar evidence tabs unavailable | Explained — different universes; not a defect. |

**Acceptance (verification, not new dev):** Batch **174** **CONDITIONAL**; Batch **175** persistence **PASS**, AM Inbox UI **NOT VERIFIED**; PR **#174** **CLOSED** unmerged.

## Confirmed

| ID | Item | Evidence |
| --- | --- | --- |
| ISS-002 | Registered navigation has no broken route | `npm run integrity` (2026-10-24). |
| ISS-003 (Fly radar worker) | Live `stocksist-radar-v22-worker` **v45** matches scanner behavior on approved `main` | Read-only Fly check 2026-10-24. **PASS** for ranking parity. |
| ISS-020 | Polygon snapshot `day.v=0` treated as verified zero volume | **Fixed on `main`** (#169). |
| ISS-021 | Premarket tab listed regular-session snapshots | **Fixed on `main`** (Batch **178**). |
| ISS-016 | npm audit advisories | **Partially mitigated** — Batch 171; remainder deferred (**Batch 198** / **209**). |
| ISS-017 | Large production JS entry bundle | **Improved** — Batch 171 lazy routes. |
| ISS-019 | Browserslist / caniuse-lite outdated | **Mitigated** (#170). |
| ISS-015 | Production `chat` not on recovered catalyst delivery | **Blocked** — rollback revision **UNKNOWN**; Batch **203**. |
| ISS-022 | Ticker-specific catalyst/watchlist headline issuer mismatch | **Fixed on `main`** (Batch **181**). |
| ISS-023 | Mobile browser freeze after workflow link taps | **Fixed in git** (Batch **184** / PR **#186**); mobile re-check **NOT VERIFIED**. |

## Reported

| ID | Item | Why it is not confirmed |
| --- | --- | --- |
| ISS-003 (Vercel SPA) | Production manifest vs latest merge | Manifest has no git SHA. |
| ISS-003 (Edge) | Production Edge revision ids | Partial — D1/`sync-screener` fingerprint reported; full function matrix **UNKNOWN**. |
| ISS-005 | Batch 34 migration/Edge status | Not refreshed. |
| ISS-006 | Catalyst intel → public distribution | Bridge on `main`; activation incomplete — Batch **204**. |
| ISS-007 | AI Analyst streaming failures | Not retested. |

## Deferred

| ID | Item | Notes |
| --- | --- | --- |
| ISS-018 | Vercel Edge middleware runtime deprecation | Batch **198** / **209**. |

## Deferred (product)

| ID | Item | Notes |
| --- | --- | --- |
| ISS-008 | Real-time feed upgrades | Batch **205**. |
| ISS-009 | AI Trader | Batch **206**; mode OFF. |
| ISS-010 | Broker integration | Batch **207**. |
| ISS-011 | Billing go-live | Batch **208**. |
| ISS-012 | SEC schedule / write-gate edits | Cron job 52 is production schedule. |
| ISS-013 | Community | Batch **209**. |
| ISS-014 | Sitemap omissions | Batch **209**. |

## Historically verified

| ID | Item | Boundary |
| --- | --- | --- |
| ISS-004 | Gate I.3 SEC activation | Historical PR #163; not re-queried live. |

## Not a defect

- MCP id `hedgefun-mcp` / generated bundle per PR #162.
- `cursor/lovable-sync-from-main-20261024` active integration branch.
