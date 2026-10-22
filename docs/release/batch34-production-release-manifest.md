# Batch 34 — Core Intelligence Integration & Production Release Manifest

**Repository:** `Holagpt-ai/hedgefun-insights`  
**Base:** `origin/main` at `6d659bcc` (Batch 33.8)  
**Branch:** `feature/batch34-core-intelligence-integration-v1`  
**Scope:** Integration verification, one Watchlist catalyst platform wiring fix, release ordering. **No production activation in this batch.**

Legend: **Merged** = on `main`. **Deployed** = confirmed in ops checkpoints unless marked **Unknown**.

---

## 1. Code complete on `main` (no further implementation)

| Area | Batches / PRs | Notes |
|------|---------------|--------|
| VWAP & continuation intelligence | 28 (#136 area) | Volume-first ranking preserved in `morning-opportunity-board` |
| Quiet-feed watchdog & publish decoupling | 28.1 | Scanner publish path independent of enrichment |
| Shared market-data cache & quota | 28.2 | Upstash Redis paths on supported Edge/client routes |
| Progressive Radar historical enrichment | 28.3 (#137) | 20-symbol batches, non-blocking `useScreenerData` |
| Scanner RPC statement timeout | `20261020143000_radar_v22_replace_rpc_statement_timeout_v1.sql` | 120s on replace RPCs |
| Historical catch-up controls | 33–33.8 (#142–#148) | Eligibility, resume-only, bridge identity cache |
| Catalyst client contracts | 29–30 | Platform map, pending/unavailable honesty |
| Episode Explorer & historical UI | 32 | Stored repeat-mover evidence |
| AM continuation priority funnel | Late-session view + `continuation-priority.config` | Qualified fallback when priority pool empty |
| Radar → AI Analyst handoff | `radar-historical-handoff.ts`, `coerce-repeat-mover-context-for-display.ts` | Forward/intraday fields in `historical-memory.ts` |
| Price-alert toast dedupe | Batch 14 + `toast-delivery.ts` | Session + durable seen sets, baseline backlog |
| Continuation RVOL confidence | `continuation-rvol-confidence.ts` (client + Edge shared) | Baseline volume & sample size propagation |

---

## 2. Batch 34 code change (this PR)

| Workstream | Change |
|------------|--------|
| WS4 Watchlist | Consume shared catalyst **platform context** on Watchlist (`buildWatchlistPlatformContextMap`, row-level pending/unavailable copy aligned with Radar / AM Inbox) |
| WS2 / WS4 regression | Focused Vitest contracts for historical memory fields, price-alert dedupe, RVOL baseline |
| WS5 | This manifest + catalyst activation sequence doc |

---

## 3. Required production migrations (apply via approved Supabase process)

| Migration | Purpose | Batch |
|-----------|---------|-------|
| `20261020143000_radar_v22_replace_rpc_statement_timeout_v1.sql` | Scanner replace RPC timeout | 28.3 |
| `20261021183000_historical_catchup_eligibility_v1.sql` | Catch-up eligibility RPC/table | 33 |
| Historical identity / bridge ordering fixes | As listed in Batch 33.4 PR | 33.4 |
| Catalyst intel schema | Per `batch08-lovable-handoff.md` | 08/29 |
| SEC sync state | `20260907180000_sec_edgar_sync_state_v1.sql` | Before SEC writes |

**Status:** **Unknown** which of the above are applied in production DB without a fresh migration inventory query.

---

## 4. Fly worker rollouts

| App | Role | Merged capability | Deployed (ops notes) |
|-----|------|-------------------|----------------------|
| `stocksist-scanner-stream-worker` (or project TOML name in repo) | Live Radar / scanner bridge | Batches 28–28.3, bridge backpressure fixes on branches | **Unknown** vs `main`; ops referenced v42–v45 range |
| `stocksist-historical-backfill-job` | Catch-up one-shot | 33.8 identity cache (`6d659bcc` image) | **Deployed** image digest `sha256:0bd5ffa4…` from C3.3C/D; machines **0** post C3.5 |

Rollout rule: deploy scanner worker from `main` **after** Vercel/Edge paths that consume the same continuation/RVOL shared modules are deployed (shared `_shared/screeners/*`).

---

## 5. Supabase Edge deployments

Deploy bundles that include at minimum:

- `radar-historical-context` (Batch 28.3 batching)
- `market-data` (28.2 cache/quota)
- `_shared/screeners/continuation-rvol-confidence.ts`
- `_shared/catalyst-intelligence/*` (29/30)
- Catalyst sync bots (SEC, IR, news, events) — **binaries deployed; ingestion remains gated**

**Status:** **Unknown** full prod Edge version map; treat **merged ≠ deployed**.

---

## 6. Catalyst source activation (plan only — not executed in Batch 34)

See `docs/catalyst-intelligence/batch34-catalyst-activation-sequence.md`.

Order: **SEC filings → IR announcements → press/news provider → scheduled corporate events**.

Each step: enable one `catalyst_intel_sources` row, manual bot invoke, verify dedupe/telemetry, client shows verified/none/unavailable only.

---

## 7. Evidence-only checks (post-deploy)

- [ ] Day Trade Radar publishes live board under historical Edge outage (28.3)
- [ ] Repeat Movers / Episode Explorer show load status, not fake empty (28.3 classify)
- [ ] AM Inbox shows continuation qualified fallback when priority pool empty
- [ ] Watchlist catalyst row shows pending vs none vs unavailable (Batch 34)
- [ ] Price alerts do not re-popup after dismiss (session + durable)
- [ ] Historical catch-up preflight 150/150 eligibility with entitlement floor (33.5+)

---

## 8. Recommended order of operations

1. Apply pending DB migrations (§3) in dependency order; verify RPC timeouts.
2. Deploy Supabase Edge bundle from `main` (§5).
3. Deploy Vercel frontend from `main` (includes Watchlist platform context).
4. Deploy Fly **scanner** worker from same SHA as Edge shared screener modules.
5. Deploy Fly **historical** job image when authorized for next catch-up checkpoint only.
6. Human-gated catalyst activation (§6), one source at a time.
7. Run evidence checklist (§7); no catch-up until explicit ops checkpoint.

---

## 9. Remaining blockers (not in Batch 34 scope)

- AI Analyst chat **generation/streaming** failures (explicitly deferred).
- Production deployment parity audit (merged SHA vs Fly/Vercel/Edge).
- External API purchases or cron enablement for catalyst sources.
- Further historical catch-up (STRICT STOP after C3.5 unless new authorization).
