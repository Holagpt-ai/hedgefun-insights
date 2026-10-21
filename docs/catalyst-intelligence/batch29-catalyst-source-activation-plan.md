# Batch 29 — Catalyst Source Activation & Verified Event Intelligence

**Base:** `main` (post Batch 28.3 merge)  
**Branch:** `feature/batch29-catalyst-source-activation-v1`  
**Prior art:** Batch 08 / PR #112 — see `batch08-lovable-handoff.md`

## Principle

Reuse `_shared/catalyst-intelligence/*`, `sync-catalyst-*` Edge jobs, `catalyst_events` tables, and client enrichment (`src/lib/catalyst/*`). No greenfield rebuild. No synthetic market data. No real-time feed upgrades.

---

## Workstream 1 — Activate existing source infrastructure

| Source | Existing code | Activation gap |
|--------|---------------|----------------|
| SEC EDGAR | `sync-sec-edgar-filings`, `sec-intel-*`, accession dedupe | Migration `sec_edgar_sync_state`, runbook-gated writes, `SEC_EDGAR_WRITE_ENABLED` |
| Company IR | `adapters/company-ir.ts`, `ir-announcement-semantics.ts` | Source `enabled` in DB registry + poll cadence |
| NEWS / GlobeNewswire | `globenewswire-ticker.ts`, NEWS continuation migration | Drain due-sources; monitor dedupe |
| Earnings / corporate events | `sync-catalyst-events`, earnings calendar provider | Schedule vs announcement lifecycle (WS2) |

**Ops sequence:** intel migrations confirmed → deploy Edge bundle → per-source `enabled=true` with allowlist → dry-run SEC → single-write idempotency (runbook).

---

## Workstream 2 — Verification & classification

**Server (already partial):** `classification.ts`, `lifecycle.ts`, `precedence.ts`, facts JSON (`attribution_class`, materiality, intel lifecycle).

**Client alignment targets:**

- `hydrateCatalystEventVerification` / `classifyEnrichmentEvent` — read intel facts; never treat `scheduled` lifecycle as completed announcement.
- `selectRecentEnrichmentEntries` vs `selectEnrichmentEntries` — preserve “upcoming ≠ announced” split (Market Pulse already uses recent-only).
- Routine Form 4 / commentary — keep `UNVERIFIED` / low materiality (Batch 08 NEWS_PR rules).

**Required event fields (display contract):** symbol, `source_name`, `source_url`, `published_at`, ingestion/sync heartbeat, category (`event_type` + taxonomy v2), verification/materiality from facts.

---

## Workstream 3 — Catalyst Graph intelligence

No standalone `CatalystGraph` module today. Graph = composed edges:

- **Company** → `catalyst_events.symbol` / `securityId` in facts  
- **Event** → `CatalystEvent` row + lifecycle in facts  
- **Source** → `provider`, `source_url`, precedence (`precedence.ts`)  
- **Market reaction** → optional edge only when stored observations exist (WS4); never infer causation from price alone (`market-pulse-catalyst.ts` disclaimer pattern)

**Implementation:** add `src/lib/catalyst/catalyst-evidence-graph.ts` (pure) building typed nodes/edges from event + optional reaction snapshot; reuse `reference-provenance.ts` semantics on Edge where possible.

---

## Workstream 4 — Market reaction intelligence

**Existing:** `_shared/catalyst-intelligence/reaction-*`, `event-bars.ts`, delayed bar references.

**Client:** attach reaction blocks only when Edge persisted observation IDs / bar summaries exist in facts; mirror Batch 23 “timing window ≠ causation”.

---

## Workstream 5 — Cross-platform distribution

| Surface | Hook / module |
|---------|----------------|
| Screeners / Radar | screener enrichment via `useCatalystEnrichmentForSymbols`, continuation weights |
| Catalyst workspace | `useCatalystEvents`, `CatalystTab` |
| Watchlist | `useWatchlistMarketIntelligence`, `watchlist-catalyst-context.ts` |
| AM/PM Inbox | `useActionCenter`, `catalyst_watch` sections |
| Market Pulse | `market-pulse-catalyst.ts`, `resolveVerifiedCatalystForPulse` |
| Alerts / workflow | existing alert consumers — extend payload with verification availability enum |

**Rule:** propagate `CatalystAvailability` (`verified` \| `none` \| `unavailable`) — never fabricate copy when intel is missing.

---

## Workstream 6 — Source reliability & operational controls

*(Spec truncated in kickoff prompt — confirm rate limits, backoff, circuit breakers, and admin toggles.)*

**Existing:** `source-registry.ts` (`selectDueSources`, backoff, poll intervals), telemetry in `telemetry.ts`, source `enabled` flags.

**Likely additions:** client-safe read-only source health summary; document env gates in one ops sheet; align with Batch 08 rollback (`enabled=false`, `SEC_EDGAR_WRITE_ENABLED=false`).

---

## Suggested PR slices (single batch, multiple reviewable PRs)

1. **29.1** — Client verification + graph types; enrichment scheduled/announced guards; tests.  
2. **29.2** — Distribution contract unification (`CatalystAvailability` on radar/watchlist/inbox).  
3. **29.3** — Reaction presentation from stored observations only.  
4. **29.4** — Ops: source enablement docs + dry-run checklists (no prod cron from Cursor).  
5. **29.5** — Edge deploy bundle + SEC runbook execution (human-gated).

---

## Out of scope (Batch 29)

- Real-time market feeds, Fly worker changes unrelated to catalyst, scanner ranking redesign, UI redesign, new DB schemas without approved migration process.
